import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSafeUrl, normalizeUrlInput } from "@/lib/scraper/ssrf";
import { crawlSite, type ScrapeKind } from "@/lib/scraper/crawl";
import { SCRAPE_FAILED_MESSAGE } from "@/lib/scraper/messages";
import { summarizeScrape } from "@/lib/scraper/summarize";
import { AI_CONFIG_ERROR_MESSAGE, isAiConfigError } from "@/lib/ai/client";
import { buildSourceContext, buildSourceIndex } from "@/lib/ai/context";

export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz się zalogować." }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await request.json().catch(() => null)) as
    | { conversationId?: string; url?: string; kind?: ScrapeKind; forceRefresh?: boolean }
    | null;
  const { conversationId, url, kind, forceRefresh } = body ?? {};

  if (!conversationId || !url || (kind !== "organization" && kind !== "grant")) {
    return NextResponse.json(
      { error: "Podaj adres strony, jej rodzaj i identyfikator rozmowy." },
      { status: 400 },
    );
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });
  if (!conversation || conversation.userId !== userId) {
    return NextResponse.json({ error: "Nie znaleziono rozmowy." }, { status: 404 });
  }

  let safeUrl: URL;
  try {
    safeUrl = await assertSafeUrl(normalizeUrlInput(url));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const MAX_SOURCES_PER_CONVERSATION = 5;
  const MAX_SCRAPES_PER_HOUR = 10;

  const sourcesInConversation = await prisma.scrapedSource.count({
    where: { conversationId },
  });
  if (sourcesInConversation >= MAX_SOURCES_PER_CONVERSATION) {
    return NextResponse.json(
      {
        error:
          "W tej rozmowie można przeanalizować maksymalnie 5 stron. Zacznij nową rozmowę.",
      },
      { status: 400 },
    );
  }

  // U10: kopiuj ostatnie udane pobranie tego samego adresu zamiast crawlować
  // ponownie. Dla organizacji bez ograniczenia czasowego; strona konkursu ma być
  // w miarę świeża, więc kopiujemy tylko pobrania młodsze niż tydzień — starsze
  // trafiają do pełnego crawla. Ogłoszenia konkursowe zmieniają się rzadko, a
  // sam tydzień to zapas przed typowym terminem naboru. Sprawdzamy to PRZED
  // limitem godzinowym, bo limit chroni cudze serwery przed zalewem zapytań,
  // a kopia z bazy w ogóle nie wychodzi w internet.
  const grantReuseCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const reusableSource = !forceRefresh
    ? await prisma.scrapedSource.findFirst({
        where: {
          kind,
          rootUrl: safeUrl.toString(),
          status: "done",
          conversation: { userId },
          ...(kind === "grant" ? { createdAt: { gte: grantReuseCutoff } } : {}),
        },
        orderBy: { createdAt: "desc" },
        include: { pages: true },
      })
    : null;

  // Limit dotyczy tylko prawdziwych pobrań. Liczymy różne adresy, a nie wpisy:
  // wczytanie tego samego adresu po raz kolejny to kopia z bazy, więc nie ma
  // powodu, żeby zjadało pulę.
  if (!reusableSource) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentRoots = await prisma.scrapedSource.groupBy({
      by: ["rootUrl"],
      where: {
        createdAt: { gte: oneHourAgo },
        conversation: { userId },
      },
    });
    if (recentRoots.length >= MAX_SCRAPES_PER_HOUR) {
      return NextResponse.json(
        { error: "Za dużo analiz stron w krótkim czasie. Odczekaj godzinę." },
        { status: 429 },
      );
    }
  }

  const source = await prisma.scrapedSource.create({
    data: { conversationId, kind, rootUrl: safeUrl.toString(), status: "pending" },
  });

  const encoder = new TextEncoder();

  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
      };

      try {
        if (reusableSource) {
          // `createManyAndReturn` zamiast `createMany`, bo do spisu stron
          // (`indexBlob`) potrzebne są identyfikatory świeżo utworzonych wierszy.
          const copiedPages = await prisma.scrapedPage.createManyAndReturn({
            data: reusableSource.pages.map((p) => ({
              sourceId: source.id,
              url: p.url,
              contentType: p.contentType,
              title: p.title,
              textContent: p.textContent,
            })),
            select: { id: true, url: true, title: true, textContent: true },
          });
          await prisma.scrapedSource.update({
            where: { id: source.id },
            data: {
              status: "done",
              summary: reusableSource.summary,
              contextBlob:
                reusableSource.contextBlob ??
                buildSourceContext({
                  kind,
                  summary: reusableSource.summary,
                  pages: reusableSource.pages,
                }),
              // Spisu NIE kopiujemy ze źródła wzorcowego — wskazywałby na jego
              // strony, a nie na kopie utworzone przed chwilą.
              indexBlob: buildSourceIndex({
                kind,
                summary: reusableSource.summary,
                pages: copiedPages,
              }),
            },
          });

          const reusedTitle = reusableSource.pages[0]?.title?.trim();
          const reusedName = (reusedTitle || safeUrl.hostname).slice(0, 60);
          await prisma.savedSource.upsert({
            where: { userId_kind_rootUrl: { userId, kind, rootUrl: safeUrl.toString() } },
            create: {
              userId,
              kind,
              rootUrl: safeUrl.toString(),
              name: reusedName,
              summary: reusableSource.summary,
            },
            update: { name: reusedName, summary: reusableSource.summary },
          });

          send({
            event: "done",
            sourceId: source.id,
            summary: reusableSource.summary ?? "",
            trimmed: false,
          });
          return;
        }

        const result = await crawlSite(safeUrl.toString(), kind, (event) => send(event));

        if (result.pages.length === 0) {
          await prisma.scrapedSource.update({
            where: { id: source.id },
            data: { status: "error" },
          });
          send({
            event: "error",
            error: SCRAPE_FAILED_MESSAGE,
          });
          return;
        }

        const createdPages = await prisma.scrapedPage.createManyAndReturn({
          data: result.pages.map((p) => ({
            sourceId: source.id,
            url: p.url,
            contentType: p.contentType,
            title: p.title,
            textContent: p.textContent,
          })),
          select: { id: true, url: true, title: true, textContent: true },
        });

        const summary = await summarizeScrape(kind, result.pages);

        await prisma.scrapedSource.update({
          where: { id: source.id },
          data: {
            status: "done",
            summary,
            contextBlob: buildSourceContext({ kind, summary, pages: result.pages }),
            indexBlob: buildSourceIndex({ kind, summary, pages: createdPages }),
          },
        });

        const rootTitle = result.pages[0]?.title?.trim();
        const name = (rootTitle || safeUrl.hostname).slice(0, 60);
        await prisma.savedSource.upsert({
          where: { userId_kind_rootUrl: { userId, kind, rootUrl: safeUrl.toString() } },
          create: { userId, kind, rootUrl: safeUrl.toString(), name, summary },
          update: { name, summary },
        });

        if (kind === "grant") {
          const current = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { title: true },
          });
          if (current?.title === "Nowa rozmowa") {
            const grantTitle = rootTitle;
            if (grantTitle) {
              const orgSource = await prisma.scrapedSource.findFirst({
                where: { conversationId, kind: "organization", status: "done" },
                orderBy: { createdAt: "desc" },
                include: { pages: { orderBy: { createdAt: "asc" }, take: 1 } },
              });
              const orgName = orgSource?.pages[0]?.title?.trim();
              const title = (orgName ? `${grantTitle} — ${orgName}` : grantTitle).slice(0, 60);
              await prisma.conversation.update({
                where: { id: conversationId },
                data: { title },
              });
            }
          }
        }

        send({ event: "done", sourceId: source.id, summary, trimmed: result.trimmed });
      } catch (error) {
        console.error("Błąd scrapingu:", error);
        await prisma.scrapedSource
          .update({ where: { id: source.id }, data: { status: "error" } })
          .catch(() => {});
        send({
          event: "error",
          error: isAiConfigError(error)
            ? AI_CONFIG_ERROR_MESSAGE
            : "Wystąpił błąd podczas pobierania strony. Spróbuj ponownie.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseBody, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
