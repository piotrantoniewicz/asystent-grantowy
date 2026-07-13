import { anthropic, MODEL_SIMPLE } from "@/lib/ai/client";
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
    max_tokens: 1024,
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
