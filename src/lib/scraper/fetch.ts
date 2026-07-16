import { assertSafeUrl } from "./ssrf";

const USER_AGENT = "AsystentGrantowy/1.0 (+https://asystent-grantowy.pl)";
const REQUEST_TIMEOUT_MS = 10_000;
const DOMAIN_DELAY_MS = 300;
const MAX_CONCURRENT = 2;
const MAX_REDIRECTS = 5;

const lastFetchAtByDomain = new Map<string, number>();
let inFlight = 0;
const waiters: (() => void)[] = [];

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  inFlight += 1;
}

function releaseSlot(): void {
  inFlight -= 1;
  const next = waiters.shift();
  if (next) next();
}

async function waitForDomainTurn(hostname: string): Promise<void> {
  const last = lastFetchAtByDomain.get(hostname) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < DOMAIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, DOMAIN_DELAY_MS - elapsed));
  }
  lastFetchAtByDomain.set(hostname, Date.now());
}

export type SafeFetchResult = {
  ok: true;
  url: string;
  status: number;
  contentType: string;
  body: Uint8Array;
};

export type SafeFetchError = {
  ok: false;
  error: string;
};

/**
 * Pobiera URL z ochroną SSRF (także po przekierowaniach), timeoutem,
 * grzecznym tempem (300 ms na domenę, maks. 2 równoległe pobrania) i limitem
 * rozmiaru. Patrz 06-scraping.md.
 */
export async function safeFetch(
  rawUrl: string,
  maxBytes: number,
): Promise<SafeFetchResult | SafeFetchError> {
  await acquireSlot();
  try {
    let currentUrl = rawUrl;
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      let url: URL;
      try {
        url = await assertSafeUrl(currentUrl);
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }

      await waitForDomainTurn(url.hostname);

      const controller = new AbortController();
      // Timeout obejmuje także czytanie treści, nie tylko nagłówki.
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        let response: Response;
        try {
          response = await fetch(url, {
            redirect: "manual",
            signal: controller.signal,
            headers: { "User-Agent": USER_AGENT },
          });
        } catch {
          return {
            ok: false,
            error: "Strona nie odpowiada lub przekroczono czas oczekiwania.",
          };
        }

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) {
            return { ok: false, error: "Przekierowanie bez adresu docelowego." };
          }
          currentUrl = new URL(location, url).toString();
          continue;
        }

        if (!response.ok) {
          return { ok: false, error: `Strona zwróciła błąd HTTP ${response.status}.` };
        }

        const contentLength = response.headers.get("content-length");
        if (contentLength && Number(contentLength) > maxBytes) {
          return { ok: false, error: "Plik jest za duży." };
        }

        if (!response.body) {
          return { ok: false, error: "Pusta odpowiedź serwera." };
        }

        // Czytanie strumieniowe: przerwij, gdy treść przekroczy limit — serwer bez
        // nagłówka content-length mógłby inaczej wysłać dowolnie dużo danych.
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > maxBytes) {
              controller.abort();
              return { ok: false, error: "Plik jest za duży." };
            }
            chunks.push(value);
          }
        } catch {
          return { ok: false, error: "Przerwano pobieranie strony." };
        }

        const body = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }

        return {
          ok: true,
          url: url.toString(),
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          body,
        };
      } finally {
        clearTimeout(timeout);
      }
    }

    return { ok: false, error: "Zbyt wiele przekierowań." };
  } finally {
    releaseSlot();
  }
}

export { USER_AGENT };
