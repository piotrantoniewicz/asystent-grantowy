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
 */
export function markToolResultsForCache(messages: Anthropic.MessageParam[]) {
  for (const message of messages) {
    if (typeof message.content === "string") continue;
    for (const block of message.content) {
      if (block.type === "tool_result" && block.cache_control) {
        delete block.cache_control;
      }
    }
  }

  const last = messages[messages.length - 1];
  if (!last || typeof last.content === "string") return;
  const lastBlock = last.content[last.content.length - 1];
  if (lastBlock?.type === "tool_result") {
    lastBlock.cache_control = { type: "ephemeral" };
  }
}
