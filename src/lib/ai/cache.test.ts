import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { markToolResultsForCache } from "./cache";

function toolResults(...ids: string[]): Anthropic.MessageParam {
  return {
    role: "user",
    content: ids.map((id) => ({
      type: "tool_result" as const,
      tool_use_id: id,
      content: `wynik ${id}`,
    })),
  };
}

function cacheMarkedIds(messages: Anthropic.MessageParam[]): string[] {
  const marked: string[] = [];
  for (const message of messages) {
    if (typeof message.content === "string") continue;
    for (const block of message.content) {
      if (block.type === "tool_result" && block.cache_control) {
        marked.push(block.tool_use_id);
      }
    }
  }
  return marked;
}

describe("markToolResultsForCache", () => {
  it("stawia znacznik na ostatnim wyniku narzędzia", () => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "Do kiedy nabór?" },
      toolResults("a", "b"),
    ];

    markToolResultsForCache(messages);

    expect(cacheMarkedIds(messages)).toEqual(["b"]);
  });

  it("zostawia dokładnie jeden znacznik po kolejnych rundach", () => {
    const messages: Anthropic.MessageParam[] = [toolResults("a")];
    markToolResultsForCache(messages);

    messages.push(toolResults("b"));
    markToolResultsForCache(messages);

    messages.push(toolResults("c"));
    markToolResultsForCache(messages);

    // Limit API to 4 znaczniki na zapytanie; jeden zajmuje blok systemowy,
    // więc w wiadomościach musi zostać najwyżej jeden — ten najnowszy.
    expect(cacheMarkedIds(messages)).toEqual(["c"]);
  });

  it("nic nie robi, gdy ostatnia wiadomość to zwykły tekst", () => {
    const messages: Anthropic.MessageParam[] = [
      toolResults("a"),
      { role: "user", content: "A ile wynosi wkład własny?" },
    ];

    markToolResultsForCache(messages);

    expect(cacheMarkedIds(messages)).toEqual([]);
  });

  it("nie wywraca się na pustej liście wiadomości", () => {
    expect(() => markToolResultsForCache([])).not.toThrow();
  });
});
