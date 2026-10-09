import { anthropic, MODEL_SIMPLE, reasoningParams } from "@/lib/ai/client";
import { SCRAPE_SUMMARY_PROMPT } from "@/lib/ai/prompts";
import type { ScrapeKind } from "./crawl";

export async function summarizeScrape(
  kind: ScrapeKind,
  pages: { title: string; textContent: string }[],
): Promise<string> {
  const content = pages
    .map((p) => `### ${p.title}\n${p.textContent}`)
    .join("\n\n")
    .slice(0, 60_000);

  const message = await anthropic.messages.create({
    model: MODEL_SIMPLE,
    // 1536, a nie 1024 jak na Haiku 4.5 — nowszy tokenizer Haiku 5.5 liczy ten
    // sam tekst jako ≈ 30% więcej tokenów, więc streszczenie mogłoby się urwać.
    max_tokens: 1536,
    // Haiku 5.5 bez tego rozumowałby domyślnie i zjadał limit `max_tokens`.
    ...reasoningParams(MODEL_SIMPLE, false),
    messages: [
      {
        role: "user",
        content: `${SCRAPE_SUMMARY_PROMPT}\n\nTyp: ${
          kind === "organization" ? "strona organizacji" : "strona konkursu"
        }\n\nTreść:\n${content}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  return textBlock?.text.trim() ?? "Nie udało się wygenerować podsumowania.";
}
