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

/* ------------------------------------------------------------------ *
 * Tryb „dokumentacja na żądanie" (Etap 2, wariant B)
 *
 * Zamiast całej treści dokumentów w prompcie zostaje SPIS stron: tytuł,
 * adres i pierwsze kilkaset znaków każdej z nich. Treść model dobiera sobie
 * sam narzędziami (`src/lib/ai/tools.ts`).
 * ------------------------------------------------------------------ */

/** Ile pierwszych znaków strony trafia do spisu jako podpowiedź, o czym jest. */
export const INDEX_PREVIEW_CHARS = 200;

/**
 * Ile stron jednego źródła wchodzi do spisu. Przy 80 stronach spis to ~20 tys.
 * znaków (~5 tys. tokenów) — dwa rzędy wielkości mniej niż pełna dokumentacja.
 * Stron ponad limit model nie zobaczy w spisie, ale znajdzie je wyszukiwarką.
 */
export const MAX_INDEX_ENTRIES_PER_SOURCE = 80;

export type SourceIndexEntry = {
  /** Identyfikator wiersza `ScrapedPage` — po nim narzędzie czyta treść. */
  pageId: string;
  title: string;
  url: string;
  preview: string;
};

export type SourceIndex = {
  kind: ScrapedSourceKind;
  summary: string | null;
  entries: SourceIndexEntry[];
  /** Czy część stron nie zmieściła się w limicie `MAX_INDEX_ENTRIES_PER_SOURCE`. */
  truncated: boolean;
};

/**
 * Składa spis stron jednego źródła. Wywoływane RAZ, po scrapowaniu — wynik
 * (JSON) ląduje w `ScrapedSource.indexBlob`.
 *
 * Zapisujemy JSON, a nie gotowy tekst promptu, bo do wykonania narzędzia
 * `przeczytaj_strone` potrzebny jest identyfikator wiersza w bazie. Krótkie
 * etykiety widoczne dla modelu (`g1`, `o3`) nadaje dopiero `assembleSourceIndex`
 * — dzięki temu są zawsze unikalne w obrębie całej rozmowy, niezależnie od tego,
 * ile źródeł danego rodzaju do niej wpięto.
 */
export function buildSourceIndex(params: {
  kind: ScrapedSourceKind;
  summary: string | null;
  pages: { id: string; url: string; title: string; textContent: string }[];
}): string {
  const index: SourceIndex = {
    kind: params.kind,
    summary: params.summary,
    entries: params.pages.slice(0, MAX_INDEX_ENTRIES_PER_SOURCE).map((page) => ({
      pageId: page.id,
      title: page.title,
      url: page.url,
      preview: page.textContent.slice(0, INDEX_PREVIEW_CHARS).replace(/\s+/g, " ").trim(),
    })),
    truncated: params.pages.length > MAX_INDEX_ENTRIES_PER_SOURCE,
  };
  return JSON.stringify(index);
}

/** Odczytuje spis z `indexBlob`. Zwraca `null`, gdy zapis jest pusty lub zepsuty. */
export function parseSourceIndex(blob: string | null): SourceIndex | null {
  if (!blob) return null;
  try {
    const parsed = JSON.parse(blob) as SourceIndex;
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type AssembledSourceIndex = {
  /** Gotowy kawałek promptu ze spisem stron wszystkich źródeł rozmowy. */
  text: string;
  /** Etykieta widoczna dla modelu (np. `g1`) → dane strony. */
  pages: Map<string, { pageId: string; title: string; url: string }>;
};

/**
 * Skleja spisy wszystkich źródeł rozmowy w jeden blok promptu i przy okazji
 * zwraca mapę etykiet, po której narzędzia rozpoznają, o którą stronę chodzi.
 *
 * Etykiety: `o` dla organizacji, `g` dla konkursu, numerowane od 1 w obrębie
 * rodzaju. Kolejność źródeł jak w `assembleScrapedContext` — organizacja przed
 * konkursem.
 */
export function assembleSourceIndex(
  sources: { kind: ScrapedSourceKind; indexBlob: string | null }[],
): AssembledSourceIndex {
  const ordered = [...sources].sort((a, b) =>
    a.kind === b.kind ? 0 : a.kind === "organization" ? -1 : 1,
  );

  const pages = new Map<string, { pageId: string; title: string; url: string }>();
  const counters: Record<string, number> = { o: 0, g: 0 };
  const parts: string[] = [];

  for (const source of ordered) {
    const index = parseSourceIndex(source.indexBlob);
    if (!index) continue;

    const prefix = index.kind === "organization" ? "o" : "g";
    const lines = [
      `## ${sourceLabel(index.kind)}`,
      ...(index.summary ? [`Notatka (podsumowanie): ${index.summary}`] : []),
      "",
      "Dostępne strony (użyj narzędzia przeczytaj_strone, żeby poznać treść):",
    ];

    for (const entry of index.entries) {
      counters[prefix] += 1;
      const ref = `${prefix}${counters[prefix]}`;
      pages.set(ref, { pageId: entry.pageId, title: entry.title, url: entry.url });
      lines.push(
        `- [${ref}] ${entry.title} — ${entry.url}` +
          (entry.preview ? ` (początek: ${entry.preview})` : ""),
      );
    }

    if (index.entries.length === 0) {
      lines.push("- (brak stron w spisie)");
    }
    if (index.truncated) {
      lines.push(
        "- (spis skrócony — pozostałych stron szukaj narzędziem szukaj_w_dokumentacji)",
      );
    }

    parts.push(lines.join("\n"));
  }

  return { text: parts.join("\n\n"), pages };
}
