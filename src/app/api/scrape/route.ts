import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSafeUrl } from "@/lib/scraper/ssrf";
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
    | { conversationId?: string; url?: string; kind?: ScrapeKind }
    | null;
  const { conversationId, url, kind } = body ?? {};

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
    safeUrl = await assertSafeUrl(url);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
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
        const result = await crawlSite(safeUrl.toString(), kind, (event) => send(event));

        if (result.pages.length === 0) {
          await prisma.scrapedSource.update({
            where: { id: source.id },
            data: { status: "error" },
          });
          send({
            event: "error",
            error:
              "Nie udało się pobrać żadnej treści z tej strony. Możesz wkleić treść regulaminu bezpośrednio do czatu.",
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
