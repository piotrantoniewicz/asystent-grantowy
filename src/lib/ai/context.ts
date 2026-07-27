import type { ScrapedSourceKind } from "@/generated/prisma/enums";

/**
 * Ile znaków zeskrapowanej dokumentacji trafia do jednego zapytania do AI
 * (~100 tys. tokenów). Razem z historią rozmowy (100k znaków) i odpowiedzią
 * (32k tokenów) mieści się w oknie 200k tokenów — patrz `chat/route.ts`.
 */
export const MAX_SCRAPED_CONTEXT_CHARS = 350_000;

type ContextPage = { url: string; title: string; textContent: string };

function sourceLabel(kind: ScrapedSourceKind): string {
  return kind === "organization"
    ? "STRONA ORGANIZACJI (podmiot, który ubiega się o grant)"
    : "STRONA KONKURSU (grant, o który organizacja się ubiega)";
}

/**
 * Składa treść jednego źródła w gotowy kawałek promptu i przycina go do
 * budżetu. Wywoływane RAZ, po zakończeniu scrapowania — wynik ląduje
 * w `ScrapedSource.contextBlob`, żeby przy każdym pytaniu nie ściągać
 * z bazy wszystkich stron (potrafi to być kilka MB, z czego i tak używamy
 * najwyżej `MAX_SCRAPED_CONTEXT_CHARS` znaków).
 */
export function buildSourceContext(params: {
  kind: ScrapedSourceKind;
  summary: string | null;
  pages: ContextPage[];
}): string {
  const heading =
    `## ${sourceLabel(params.kind)}\n` +
    (params.summary ? `Notatka (podsumowanie): ${params.summary}\n` : "");

  const parts = [heading];
  let budget = MAX_SCRAPED_CONTEXT_CHARS - heading.length;
  for (const page of params.pages) {
    if (budget <= 0) break;
    const part = `### ${page.title} (${page.url})\n${page.textContent}`;
    const sliced = part.slice(0, budget);
    parts.push(sliced);
    budget -= sliced.length;
  }

  return parts.join("\n\n");
}

/**
 * Skleja gotowe kawałki wszystkich źródeł rozmowy w jeden blok dokumentacji.
 *
 * Organizacja idzie przed konkursem, żeby przy wyczerpaniu budżetu to strona
 * konkursu (zwykle obszerniejsza) była ucinana jako pierwsza. Każde źródło
 * dostaje sprawiedliwy udział w pozostałym budżecie (dzielony na tyle części,
 * ile źródeł zostało), a niewykorzystana reszta przechodzi na kolejne źródła
 * — tak duże źródło (np. organizacja) nie może wyprzeć konkursu z kontekstu.
 */
export function assembleScrapedContext(
  sources: { kind: ScrapedSourceKind; contextBlob: string }[],
): string {
  const ordered = [...sources].sort((a, b) =>
    a.kind === b.kind ? 0 : a.kind === "organization" ? -1 : 1,
  );

  let budget = MAX_SCRAPED_CONTEXT_CHARS;
  const parts: string[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    if (budget <= 0) break;
    const sourceBudget = Math.floor(budget / (ordered.length - i));
    const sliced = ordered[i].contextBlob.slice(0, sourceBudget);
    parts.push(sliced);
    budget -= sliced.length;
  }

  return parts.join("\n\n");
}
