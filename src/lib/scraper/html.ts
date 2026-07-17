import * as cheerio from "cheerio";

export type ExtractedLink = { url: string; anchorText: string };

export type ExtractedHtml = {
  title: string;
  text: string;
  links: ExtractedLink[];
};

const REMOVE_SELECTORS = [
  "nav",
  "footer",
  "script",
  "style",
  "noscript",
  "header",
  "[role=navigation]",
  "[class*=cookie]",
  "[id*=cookie]",
  "[class*=menu]",
];

// Wybierz kontener treści głównej; jeśli go nie ma albo jest pusty, użyj body.
function pickContentRoot($: cheerio.CheerioAPI) {
  for (const selector of ["main", "[role=main]", "article"]) {
    const el = $(selector).first();
    if (el.length && el.text().replace(/\s+/g, " ").trim().length >= 200) {
      return el;
    }
  }
  return $("body");
}

/**
 * Zamienia HTML na czysty tekst zachowując nagłówki, listy i tabele
 * (patrz 06-scraping.md). Usuwa nawigację, stopki, skrypty i banery cookies.
 */
export function extractHtml(html: string, baseUrl: string): ExtractedHtml {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || baseUrl;

  const links: ExtractedLink[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, baseUrl).toString();
      links.push({ url: resolved, anchorText: $(el).text().trim() });
    } catch {
      // ignoruj nieprawidłowe adresy
    }
  });

  REMOVE_SELECTORS.forEach((selector) => $(selector).remove());

  // Zamień tabele na akapity (jeden wiersz = jeden akapit z komórkami
  // rozdzielonymi " | "), żeby uniknąć podwójnego zliczenia treści komórek.
  $("table").each((_, table) => {
    const rowParagraphs: string[] = [];
    $(table)
      .find("tr")
      .each((_, tr) => {
        const cells = $(tr)
          .find("td, th")
          .map((_, cell) => $(cell).text().replace(/\s+/g, " ").trim())
          .get()
          .filter(Boolean);
        if (cells.length) rowParagraphs.push(cells.join(" | "));
      });
    $(table).replaceWith(
      rowParagraphs.map((row) => `<p>${row}</p>`).join(""),
    );
  });

  const lines: string[] = [];
  pickContentRoot($)
    .find("h1, h2, h3, h4, h5, h6, p, li")
    .each((_, el) => {
      // Pomiń kontenery zawierające inne wybrane elementy (unikamy duplikacji
      // treści zagnieżdżonych akapitów/list wewnątrz siebie).
      if ($(el).find("h1, h2, h3, h4, h5, h6, p, li").length > 0) return;

      const tag = (el as { tagName?: string }).tagName?.toLowerCase();
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (!text) return;

      if (tag && /^h[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        lines.push(`${"#".repeat(level)} ${text}`);
      } else if (tag === "li") {
        lines.push(`- ${text}`);
      } else {
        lines.push(text);
      }
    });

  const text = lines.join("\n");
  return { title, text, links };
}
