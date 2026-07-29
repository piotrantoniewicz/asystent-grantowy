import { describe, expect, it } from "vitest";
import {
  MAX_INDEX_ENTRIES_PER_SOURCE,
  MAX_SCRAPED_CONTEXT_CHARS,
  assembleScrapedContext,
  assembleSourceIndex,
  buildSourceContext,
  buildSourceIndex,
  parseSourceIndex,
} from "./context";

describe("buildSourceContext", () => {
  it("składa nagłówek, notatkę i strony", () => {
    const blob = buildSourceContext({
      kind: "grant",
      summary: "Konkurs na projekty lokalne.",
      pages: [
        { url: "https://x.pl/a", title: "Regulamin", textContent: "Treść A" },
        { url: "https://x.pl/b", title: "Wniosek", textContent: "Treść B" },
      ],
    });

    expect(blob).toContain("## STRONA KONKURSU");
    expect(blob).toContain("Notatka (podsumowanie): Konkurs na projekty lokalne.");
    expect(blob).toContain("### Regulamin (https://x.pl/a)\nTreść A");
    expect(blob).toContain("### Wniosek (https://x.pl/b)\nTreść B");
  });

  it("pomija wiersz notatki, gdy podsumowania nie ma", () => {
    const blob = buildSourceContext({ kind: "organization", summary: null, pages: [] });
    expect(blob).toBe("## STRONA ORGANIZACJI (podmiot, który ubiega się o grant)\n");
  });

  it("przycina treść do budżetu znaków", () => {
    const blob = buildSourceContext({
      kind: "grant",
      summary: null,
      pages: [
        { url: "https://x.pl/a", title: "A", textContent: "x".repeat(500_000) },
        { url: "https://x.pl/b", title: "B", textContent: "y".repeat(500_000) },
      ],
    });

    // Separator "\n\n" doliczany jest poza budżetem, stąd niewielki zapas.
    expect(blob.length).toBeLessThanOrEqual(MAX_SCRAPED_CONTEXT_CHARS + 2);
    expect(blob).not.toContain("### B ");
  });
});

describe("assembleScrapedContext", () => {
  it("stawia organizację przed konkursem niezależnie od kolejności wejścia", () => {
    const merged = assembleScrapedContext([
      { kind: "grant", contextBlob: "KONKURS" },
      { kind: "organization", contextBlob: "ORGANIZACJA" },
    ]);
    expect(merged).toBe("ORGANIZACJA\n\nKONKURS");
  });

  it("dzieli budżet sprawiedliwie, gdy oba źródła są ogromne", () => {
    const merged = assembleScrapedContext([
      { kind: "organization", contextBlob: "o".repeat(MAX_SCRAPED_CONTEXT_CHARS) },
      { kind: "grant", contextBlob: "g".repeat(MAX_SCRAPED_CONTEXT_CHARS) },
    ]);

    const orgChars = merged.split("").filter((c) => c === "o").length;
    const grantChars = merged.split("").filter((c) => c === "g").length;
    expect(orgChars).toBe(MAX_SCRAPED_CONTEXT_CHARS / 2);
    expect(grantChars).toBe(MAX_SCRAPED_CONTEXT_CHARS / 2);
  });

  it("oddaje niewykorzystaną resztę budżetu kolejnemu źródłu", () => {
    const merged = assembleScrapedContext([
      { kind: "organization", contextBlob: "o".repeat(1000) },
      { kind: "grant", contextBlob: "g".repeat(MAX_SCRAPED_CONTEXT_CHARS) },
    ]);

    const grantChars = merged.split("").filter((c) => c === "g").length;
    expect(grantChars).toBe(MAX_SCRAPED_CONTEXT_CHARS - 1000);
  });
});

describe("buildSourceIndex", () => {
  it("zapisuje tytuł, adres i początek każdej strony, bez pełnej treści", () => {
    const index = parseSourceIndex(
      buildSourceIndex({
        kind: "grant",
        summary: "Konkurs na projekty lokalne.",
        pages: [
          {
            id: "page-1",
            url: "https://x.pl/a",
            title: "Regulamin",
            textContent: `Nabór trwa do 30 września. ${"x".repeat(50_000)}`,
          },
        ],
      }),
    );

    expect(index).not.toBeNull();
    expect(index!.kind).toBe("grant");
    expect(index!.summary).toBe("Konkurs na projekty lokalne.");
    expect(index!.entries).toHaveLength(1);
    expect(index!.entries[0].pageId).toBe("page-1");
    expect(index!.entries[0].preview).toContain("Nabór trwa do 30 września.");
    expect(index!.entries[0].preview.length).toBeLessThanOrEqual(200);
    expect(index!.truncated).toBe(false);
  });

  it("ucina spis do limitu stron i zaznacza to flagą", () => {
    const pages = Array.from({ length: MAX_INDEX_ENTRIES_PER_SOURCE + 5 }, (_, i) => ({
      id: `page-${i}`,
      url: `https://x.pl/${i}`,
      title: `Strona ${i}`,
      textContent: "treść",
    }));

    const index = parseSourceIndex(buildSourceIndex({ kind: "grant", summary: null, pages }))!;
    expect(index.entries).toHaveLength(MAX_INDEX_ENTRIES_PER_SOURCE);
    expect(index.truncated).toBe(true);
  });

  it("parseSourceIndex zwraca null dla pustego i zepsutego zapisu", () => {
    expect(parseSourceIndex(null)).toBeNull();
    expect(parseSourceIndex("")).toBeNull();
    expect(parseSourceIndex("{to nie json")).toBeNull();
    expect(parseSourceIndex('{"kind":"grant"}')).toBeNull();
  });
});

describe("assembleSourceIndex", () => {
  const orgBlob = buildSourceIndex({
    kind: "organization",
    summary: "Fundacja z Podkarpacia.",
    pages: [
      { id: "o-page", url: "https://o.pl/", title: "O nas", textContent: "Działamy od 2005." },
    ],
  });
  const grantBlob = buildSourceIndex({
    kind: "grant",
    summary: null,
    pages: [
      { id: "g-page-1", url: "https://g.pl/reg", title: "Regulamin", textContent: "Paragraf 1." },
      { id: "g-page-2", url: "https://g.pl/wz", title: "Wzór wniosku", textContent: "Pole A." },
    ],
  });

  it("numeruje strony i buduje mapę etykiet", () => {
    const { text, pages } = assembleSourceIndex([
      { kind: "grant", indexBlob: grantBlob },
      { kind: "organization", indexBlob: orgBlob },
    ]);

    // Organizacja idzie przed konkursem, tak jak w `assembleScrapedContext`.
    expect(text.indexOf("STRONA ORGANIZACJI")).toBeLessThan(
      text.indexOf("STRONA KONKURSU"),
    );
    expect(text).toContain("[o1] O nas — https://o.pl/");
    expect(text).toContain("[g1] Regulamin — https://g.pl/reg");
    expect(text).toContain("[g2] Wzór wniosku — https://g.pl/wz");
    expect(text).toContain("Notatka (podsumowanie): Fundacja z Podkarpacia.");

    expect(pages.get("o1")?.pageId).toBe("o-page");
    expect(pages.get("g1")?.pageId).toBe("g-page-1");
    expect(pages.get("g2")?.pageId).toBe("g-page-2");
    expect(pages.size).toBe(3);
  });

  it("pomija źródła bez spisu, zamiast wywracać całość", () => {
    const { text, pages } = assembleSourceIndex([
      { kind: "grant", indexBlob: null },
      { kind: "organization", indexBlob: orgBlob },
    ]);

    expect(text).toContain("[o1] O nas");
    expect(text).not.toContain("STRONA KONKURSU");
    expect(pages.size).toBe(1);
  });

  it("spis jest o rzędy wielkości mniejszy niż pełna dokumentacja", () => {
    const pages = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      url: `https://g.pl/${i}`,
      title: `Dokument ${i}`,
      textContent: "y".repeat(20_000),
    }));
    const full = buildSourceContext({ kind: "grant", summary: null, pages });
    const { text } = assembleSourceIndex([
      { kind: "grant", indexBlob: buildSourceIndex({ kind: "grant", summary: null, pages }) },
    ]);

    expect(text.length).toBeLessThan(full.length / 20);
  });
});
