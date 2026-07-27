import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { anthropic, MODEL_SIMPLE } from "./client";
import { CLASSIFIER_INSTRUCTIONS } from "./prompts";

export type ModelClass = "SIMPLE" | "COMPLEX";

/**
 * Słowa typowe dla pytań „wytwórczych" — takich, w których model ma coś napisać,
 * rozplanować albo przeredagować. Tam tryb rozumowania realnie poprawia tekst.
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
 * Czy dla tego pytania włączyć tryb rozumowania (`thinking`).
 *
 * Rozumowanie kosztuje jak tokeny wyjściowe ($15/MTok na Sonnecie) i odpowiada
 * za większość ciszy przed pierwszym słowem odpowiedzi — do stream trafia tylko
 * `text_delta`, więc użytkownik widzi wtedy pustkę. Przy pytaniach faktograficznych
 * („do kiedy nabór?") nic nie wnosi, więc włączamy je tylko dla pytań wytwórczych
 * i dla pytań długich (te niosą zwykle materiał do przetworzenia).
 *
 * Świadomie BEZ osobnego wywołania AI (klasyfikator Haiku dokłada 0,3–0,6 s
 * czekania i własny koszt) — to ma być czysta heurystyka tekstowa.
 */
export function needsDeepThinking(messageText: string): boolean {
  const text = messageText.toLowerCase();
  return (
    messageText.length > 300 || WRITING_HINTS.some((hint) => text.includes(hint))
  );
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
