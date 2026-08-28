import type Anthropic from "@anthropic-ai/sdk";

/**
 * Przesuwa punkt cache'owania na koniec ostatniej rundy narzędziowej.
 *
 * W trybie „dokumentacja na żądanie" każda runda dokłada do rozmowy prośbę
 * modelu i wyniki narzędzi (bywa 20–30 tys. znaków). Bez tego znacznika model
 * przy każdej kolejnej rundzie przelicza CAŁĄ narosłą historię od nowa — to
 * główny powód, dla którego trudne pytania odpowiadały tak długo. Ze
 * znacznikiem kolejna runda czyta poprzednie z cache: 10% ceny wejścia i bez
 * ponownego przetwarzania.
 *
 * Znacznik zostaje tylko jeden (limit API to 4 na zapytanie, jeden zajmuje już
 * blok systemowy). Wpisy cache z wcześniejszych rund i tak są odnajdywane —
 * API cofa się o 20 bloków w poszukiwaniu pasującego prefiksu.
 *
 * **Znaczymy dopiero od DRUGIEJ rundy** (`roundNumber >= 2`, numeracja od 1) —
 * decyzja z 2026-08-29, zadanie 2 w `19-backlog-optymalizacji.md`. Zapis do
 * cache kosztuje 1,25× ceny wejścia, a po poprawce promptu (zadanie 8)
 * większość pytań kończy się na jednej rundzie — wtedy nikt tego zapisu nie
 * odczyta i dopłata przepada. Stare znaczniki kasujemy zawsze, także w rundzie
 * pierwszej, żeby aktywny został najwyżej jeden.
 *
 * @param roundNumber numer rundy narzędziowej, której wyniki właśnie dopisano
 *   do `messages` (1 = pierwsza runda).
 */
export function markToolResultsForCache(
  messages: Anthropic.MessageParam[],
  roundNumber: number,
) {
  for (const message of messages) {
    if (typeof message.content === "string") continue;
    for (const block of message.content) {
      if (block.type === "tool_result" && block.cache_control) {
        delete block.cache_control;
      }
    }
  }

  // Pierwsza runda: czyścimy stare znaczniki, ale nowego nie stawiamy.
  if (roundNumber < 2) return;

  const last = messages[messages.length - 1];
  if (!last || typeof last.content === "string") return;
  const lastBlock = last.content[last.content.length - 1];
  if (lastBlock?.type === "tool_result") {
    lastBlock.cache_control = { type: "ephemeral" };
  }
}
