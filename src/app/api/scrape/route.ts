import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSafeUrl, normalizeUrlInput } from "@/lib/scraper/ssrf";
import { crawlSite, type ScrapeKind } from "@/lib/scraper/crawl";
import { summarizeScrape } from "@/lib/scraper/summarize";

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

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentScrapes = await prisma.scrapedSource.count({
    where: {
      createdAt: { gte: oneHourAgo },
      conversation: { userId },
    },
  });
  if (recentScrapes >= MAX_SCRAPES_PER_HOUR) {
    return NextResponse.json(
      { error: "Za dużo analiz stron w krótkim czasie. Odczekaj godzinę." },
      { status: 429 },
    );
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
        // U10: dla organizacji kopiuj ostatnie udane pobranie tego samego adresu
        // zamiast crawlować ponownie — strona konkursu zawsze musi być świeża.
        const reusableSource =
          kind === "organization" && !forceRefresh
            ? await prisma.scrapedSource.findFirst({
                where: {
                  kind: "organization",
                  rootUrl: safeUrl.toString(),
                  status: "done",
                  conversation: { userId },
                },
                orderBy: { createdAt: "desc" },
                include: { pages: true },
              })
            : null;

        if (reusableSource) {
          await prisma.scrapedPage.createMany({
            data: reusableSource.pages.map((p) => ({
              sourceId: source.id,
              url: p.url,
              contentType: p.contentType,
              title: p.title,
              textContent: p.textContent,
            })),
          });
          await prisma.scrapedSource.update({
            where: { id: source.id },
            data: { status: "done", summary: reusableSource.summary },
          });
          await prisma.userOrganization
            .update({
              where: { userId_rootUrl: { userId, rootUrl: safeUrl.toString() } },
              data: { rootUrl: safeUrl.toString() },
            })
            .catch(() => {});
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
            error:
              "Nie udało się pobrać treści z tej strony. Spróbuj wkleić link bezpośrednio do dokumentu z regulaminem (najczęściej plik PDF).",
          });
          return;
        }

        await prisma.scrapedPage.createMany({
          data: result.pages.map((p) => ({
            sourceId: source.id,
            url: p.url,
            contentType: p.contentType,
            title: p.title,
            textContent: p.textContent,
          })),
        });

        const summary = await summarizeScrape(kind, result.pages);

        await prisma.scrapedSource.update({
          where: { id: source.id },
          data: { status: "done", summary },
        });

        if (kind === "organization") {
          const rootTitle = result.pages[0]?.title?.trim();
          const name = (rootTitle || safeUrl.hostname).slice(0, 60);
          await prisma.userOrganization.upsert({
            where: { userId_rootUrl: { userId, rootUrl: safeUrl.toString() } },
            create: { userId, rootUrl: safeUrl.toString(), name },
            update: { name },
          });
        }

        if (kind === "grant") {
          const current = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { title: true },
          });
          if (current?.title === "Nowa rozmowa") {
            const grantTitle = result.pages[0]?.title?.trim();
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
          error: "Wystąpił błąd podczas pobierania strony. Spróbuj ponownie.",
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
