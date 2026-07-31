import { describe, expect, it } from "vitest";
import { buildCurrentDatePrompt } from "./prompts";

describe("buildCurrentDatePrompt", () => {
  it("podaje datę słownie i w formacie ISO", () => {
    const text = buildCurrentDatePrompt(new Date("2026-07-31T09:00:00Z"));

    expect(text).toContain("piątek, 31 lipca 2026");
    expect(text).toContain("2026-07-31");
  });

  it("liczy datę w strefie Europe/Warsaw, a nie w UTC", () => {
    // 23:30 czasu polskiego = 21:30 UTC — w UTC to wciąż ten sam dzień,
    // ale odwrotny przypadek (00:30 w Polsce) w UTC byłby jeszcze wczoraj.
    const text = buildCurrentDatePrompt(new Date("2026-07-30T22:30:00Z"));

    expect(text).toContain("2026-07-31");
  });

  it("nie zawiera godziny, żeby nie unieważniać cache promptu co pytanie", () => {
    const rano = buildCurrentDatePrompt(new Date("2026-07-31T06:00:00Z"));
    const wieczorem = buildCurrentDatePrompt(new Date("2026-07-31T18:00:00Z"));

    expect(rano).toBe(wieczorem);
  });
});
