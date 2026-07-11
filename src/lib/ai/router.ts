import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { anthropic, MODEL_SIMPLE } from "./client";
import { CLASSIFIER_INSTRUCTIONS } from "./prompts";

export type ModelClass = "SIMPLE" | "COMPLEX";

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
