import { createHash } from "node:crypto";
import { safeFetch } from "./fetch";
import { isAllowedByRobots } from "./robots";
import { extractHtml, type ExtractedLink } from "./html";
import { extractPdfText } from "./pdf";

export type ScrapeKind = "organization" | "grant";

export type CrawledPage = {
  url: string;
  title: string;
  contentType: "html" | "pdf";
  textContent: string;
};

export type CrawlProgressEvent =
  | { event: "page"; url: string; contentType: "html" | "pdf" }
  | { event: "skip"; url: string; reason: string };

export type CrawlResult = {
  pages: CrawledPage[];
  trimmed: boolean;
};

const MAX_HTML_PAGES: Record<ScrapeKind, number> = { organization: 15, grant: 20 };
const MAX_PDF_PAGES = 10;
const MAX_DEPTH = 2;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const TOKEN_BUDGET_CHARS = 100_000 * 3.5;

const ORG_KEYWORDS = [
  "o-nas",
  "about",
  "misja",
  "statut",
  "projekty",
  "dzialania",
  "zespol",
  "historia",
  "kontakt",
];

const GRANT_KEYWORDS = [
  "regulamin",
  "dokumenty",
  "nabor",
  "konkurs",
  "faq",
  "zasady",
  "wniosek",
  "zalaczniki",
  "harmonogram",
  "kryteria",
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // usuń znaki diakrytyczne
}

function matchesKeywords(link: ExtractedLink, keywords: string[]): boolean {
  const haystack = normalize(`${link.url} ${link.anchorText}`);
  return keywords.some((keyword) => haystack.includes(normalize(keyword)));
}

function isPdfLink(url: string): boolean {
  return /\.pdf($|\?)/i.test(url);
}

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

type QueueItem = { url: string; depth: number };

/**
 * Przeszukuje stronę organizacji lub konkursu wg zasad z 06-scraping.md:
 * limity podstron, głębokość 2, PDF-y (dla konkursu), robots.txt dla
 * podstron odkrytych przez crawler, deduplikacja i budżet tokenów.
 */
export async function crawlSite(
  rootUrl: string,
  kind: ScrapeKind,
  onProgress: (event: CrawlProgressEvent) => void,
): Promise<CrawlResult> {
  const root = new URL(rootUrl);
  const maxHtmlPages = MAX_HTML_PAGES[kind];
  const keywords = kind === "organization" ? ORG_KEYWORDS : GRANT_KEYWORDS;

  const visited = new Set<string>();
  const seenHashes = new Set<string>();
  const pdfUrlsToFetch = new Set<string>();
  const pages: CrawledPage[] = [];

  const queue: QueueItem[] = [{ url: root.toString(), depth: 0 }];
  visited.add(root.toString());

  while (queue.length > 0 && pages.filter((p) => p.contentType === "html").length < maxHtmlPages) {
    const item = queue.shift();
    if (!item) break;

    const isRoot = item.url === root.toString();
    if (!isRoot) {
      let allowed: URL;
      try {
        allowed = new URL(item.url);
      } catch {
        continue;
      }
      if (!(await isAllowedByRobots(allowed))) {
        onProgress({ event: "skip", url: item.url, reason: "zablokowane przez robots.txt" });
        continue;
      }
    }

    const fetched = await safeFetch(item.url, MAX_FILE_BYTES);
    if (!fetched.ok) {
      onProgress({ event: "skip", url: item.url, reason: fetched.error });
      continue;
    }

    if (!fetched.contentType.includes("text/html")) {
      onProgress({ event: "skip", url: item.url, reason: "nieobsługiwany typ treści" });
      continue;
    }

    const html = new TextDecoder().decode(fetched.body);
    const extracted = extractHtml(html, fetched.url);
    const hash = contentHash(extracted.text);
    if (extracted.text && !seenHashes.has(hash)) {
      seenHashes.add(hash);
      pages.push({
        url: fetched.url,
        title: extracted.title,
        contentType: "html",
        textContent: extracted.text,
      });
      onProgress({ event: "page", url: fetched.url, contentType: "html" });
    }

    if (kind === "grant") {
      for (const link of extracted.links) {
        if (isPdfLink(link.url) && pdfUrlsToFetch.size < MAX_PDF_PAGES) {
          pdfUrlsToFetch.add(link.url);
        }
      }
    }

    if (item.depth < MAX_DEPTH) {
      for (const link of extracted.links) {
        if (isPdfLink(link.url)) continue;
        let linkUrl: URL;
        try {
          linkUrl = new URL(link.url);
        } catch {
          continue;
        }
        if (linkUrl.hostname !== root.hostname) continue;
        if (visited.has(linkUrl.toString())) continue;
        if (!matchesKeywords(link, keywords)) continue;

        visited.add(linkUrl.toString());
        queue.push({ url: linkUrl.toString(), depth: item.depth + 1 });
      }
    }
  }

  if (kind === "grant") {
    for (const pdfUrl of pdfUrlsToFetch) {
      if (pages.filter((p) => p.contentType === "pdf").length >= MAX_PDF_PAGES) break;

      const fetched = await safeFetch(pdfUrl, MAX_FILE_BYTES);
      if (!fetched.ok) {
        onProgress({ event: "skip", url: pdfUrl, reason: fetched.error });
        continue;
      }

      const result = await extractPdfText(fetched.body);
      if (!result.ok) {
        onProgress({ event: "skip", url: pdfUrl, reason: result.error });
        continue;
      }

      const hash = contentHash(result.text);
      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);

      const title = decodeURIComponent(pdfUrl.split("/").pop() ?? pdfUrl);
      pages.push({ url: fetched.url, title, contentType: "pdf", textContent: result.text });
      onProgress({ event: "page", url: fetched.url, contentType: "pdf" });
    }
  }

  let totalChars = pages.reduce((sum, p) => sum + p.textContent.length, 0);
  let trimmed = false;
  if (totalChars > TOKEN_BUDGET_CHARS) {
    trimmed = true;
    // Przycinaj od końca, tylko strony HTML (dokumenty PDF zostają) — patrz 06-scraping.md.
    for (let i = pages.length - 1; i >= 0 && totalChars > TOKEN_BUDGET_CHARS; i -= 1) {
      if (pages[i].contentType !== "html") continue;
      totalChars -= pages[i].textContent.length;
      pages.splice(i, 1);
    }
  }

  return { pages, trimmed };
}
