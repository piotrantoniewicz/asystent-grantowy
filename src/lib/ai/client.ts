import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

// W trybie deweloperskim klient jest przechowywany między przeładowaniami kodu.
// Zapamiętujemy też klucz, z którym powstał — inaczej po podmianie klucza
// w `.env.local` serwer dalej używałby starego.
const globalForAnthropic = globalThis as unknown as {
  anthropic?: Anthropic;
  anthropicApiKey?: string;
};

export const anthropic =
  globalForAnthropic.anthropic && globalForAnthropic.anthropicApiKey === apiKey
    ? globalForAnthropic.anthropic
    : new Anthropic({ apiKey });

if (process.env.NODE_ENV !== "production") {
  globalForAnthropic.anthropic = anthropic;
  globalForAnthropic.anthropicApiKey = apiKey;
}

export const MODEL_SIMPLE = "claude-haiku-4-5";
export const MODEL_COMPLEX = "claude-sonnet-5";

// Komunikat pokazywany użytkownikowi, gdy usługa AI odmawia z powodu ustawień
// (zły/wygasły klucz API, brak uprawnień, nieznany model) — czyli czegoś, co
// samo nie minie i wymaga reakcji administratora. Bez technicznych szczegółów.
export const AI_CONFIG_ERROR_MESSAGE =
  "Asystent jest chwilowo niedostępny z powodu błędu ustawień usługi AI. To nie jest wina Twojego pytania — powiadom administratora serwisu.";

/**
 * Czy błąd wynika z ustawień (klucz API, uprawnienia, model), a nie
 * z przejściowego przeciążenia. Przy okazji zostawia w logu serwera wyraźny
 * ślad, po którym widać, co dokładnie naprawić.
 */
export function isAiConfigError(error: unknown): boolean {
  if (!(error instanceof Anthropic.APIError)) return false;

  const status = error.status;
  // 401/403 — zły albo wygasły klucz API, brak uprawnień do modelu.
  // 404 — nieznana nazwa modelu (np. literówka w MODEL_SIMPLE/MODEL_COMPLEX).
  // 400 — źle zbudowane zapytanie, czyli błąd w kodzie, nie przeciążenie.
  const isConfig = status === 400 || status === 401 || status === 403 || status === 404;
  if (!isConfig) return false;

  console.error(
    `[AI — BŁĄD USTAWIEŃ, HTTP ${status}] Sprawdź ANTHROPIC_API_KEY i nazwy modeli.`,
  );
  return true;
}
