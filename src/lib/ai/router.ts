import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { anthropic, MODEL_SIMPLE } from "./client";
import { CLASSIFIER_INSTRUCTIONS } from "./prompts";

export type ModelClass = "SIMPLE" | "COMPLEX";

/**
 * Czy rozumowanie (`thinking`) jest w ogóle włączone.
 *
 * `false` od 2026-07-28 — decyzja właściciela po porównaniu odpowiedzi na to samo
 * pytanie o uzasadnienie projektu, raz z rozumowaniem i raz bez: różnicy w jakości
 * nie było, a rozumowanie kosztowało ~6 sekund czekania i tokeny wyjściowe
 * po $15 za milion.
 *
 * Powrót to zmiana tej stałej na `true` — heurystyka i jej testy zostają na miejscu.
 */
const THINKING_ENABLED = false;

/**
 * Słowa typowe dla pytań „wytwórczych" — takich, w których model ma coś napisać,
 * rozplanować albo przeredagować.
 */
const WRITING_HINTS = [
  "napisz",
  "przygotuj",
  "sformułuj",
  "uzasadnij",
  "uzasadnienie",
  "opisz",
  "rozpisz",
  "harmonogram",
  "budżet",
  "wniosek",
  "streść",
  "przeredaguj",
  "popraw",
  "rozwiń",
  "zaproponuj",
  "plan",
];

/**
 * Czy pytanie jest „wytwórcze" — model ma coś napisać, rozplanować albo
 * przeredagować, a nie wyszukać fakt w dokumentacji.
 *
 * Świadomie BEZ osobnego wywołania AI (klasyfikator Haiku dokłada 0,3–0,6 s
 * czekania i własny koszt) — to ma być czysta heurystyka tekstowa.
 *
 * Steruje limitem długości odpowiedzi (`max_tokens`): przy pisaniu wniosku
 * potrzebny jest duży zapas, przy pytaniu o termin naboru — nie.
 */
export function looksLikeWritingTask(messageText: string): boolean {
  const text = messageText.toLowerCase();
  return (
    messageText.length > 300 || WRITING_HINTS.some((hint) => text.includes(hint))
  );
}

/**
 * Czy dla tego pytania włączyć tryb rozumowania (`thinking`).
 *
 * Dziś zawsze `false` — patrz `THINKING_ENABLED`. Rozumowanie kosztuje jak tokeny
 * wyjściowe ($15/MTok na Sonnecie) i odpowiada za kilka sekund ciszy przed pierwszym
 * słowem odpowiedzi: do streamu trafia tylko `text_delta`, więc użytkownik widzi
 * wtedy pustkę.
 *
 * Zmienna `AI_THINKING` pozwala wymusić odpowiedź niezależnie od treści pytania
 * i od `THINKING_ENABLED`: `off` — nigdy nie rozumuj, `on` — zawsze rozumuj,
 * brak lub `auto` — normalne zachowanie. Służy do porównywania jakości odpowiedzi
 * „z rozumowaniem" i „bez" na TYM SAMYM pytaniu. Na produkcji zostaje nieustawiona.
 */
export function needsDeepThinking(messageText: string): boolean {
  const override = process.env.AI_THINKING?.trim().toLowerCase();
  if (override === "off") return false;
  if (override === "on") return true;

  if (!THINKING_ENABLED) return false;
  return looksLikeWritingTask(messageText);
}

const classificationFormat = jsonSchemaOutputFormat({
  type: "object",
  properties: {
    category: { type: "string", enum: ["SIMPLE", "COMPLEX"] },
  },
  required: ["category"],
  additionalProperties: false,
} as const);

/**
 * Klasyfikuje pytanie użytkownika bez pełnej dokumentacji konkursu w kontekście
 * (osobny cache od właściwej odpowiedzi — patrz 05-router-ai.md).
 * W razie błędu domyślnie COMPLEX (lepiej przepłacić niż dać słabą odpowiedź).
 */
export async function classifyQuestion(
  question: string,
  recentMessages: { role: "user" | "assistant"; content: string }[],
): Promise<ModelClass> {
  try {
    const context = recentMessages
      .slice(-3)
      .map(
        (m) =>
          `${m.role === "user" ? "Użytkownik" : "Asystent"}: ${m.content}`,
      )
      .join("\n");

    const message = await anthropic.messages.parse({
      model: MODEL_SIMPLE,
      max_tokens: 20,
      messages: [
        {
          role: "user",
          content: `${CLASSIFIER_INSTRUCTIONS}${
            context ? `\n\nOstatnie wiadomości:\n${context}` : ""
          }\n\nPytanie: ${question}`,
        },
      ],
      output_config: { format: classificationFormat },
    });

    return message.parsed_output?.category === "SIMPLE" ? "SIMPLE" : "COMPLEX";
  } catch {
    return "COMPLEX";
  }
}
