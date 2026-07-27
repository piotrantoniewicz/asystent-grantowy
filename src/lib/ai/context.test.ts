import { describe, expect, it } from "vitest";
import {
  MAX_SCRAPED_CONTEXT_CHARS,
  assembleScrapedContext,
  buildSourceContext,
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
