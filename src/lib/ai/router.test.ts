import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { needsDeepThinking } from "./router";

describe("needsDeepThinking", () => {
  // Testy sprawdzają samą heurystykę, więc wymuszamy tryb `auto` — inaczej
  // ustawione lokalnie `AI_THINKING=off` (do porównania jakości odpowiedzi)
  // wywracałoby testy.
  beforeEach(() => vi.stubEnv("AI_THINKING", "auto"));
  afterEach(() => vi.unstubAllEnvs());

  it("nie włącza rozumowania dla pytań faktograficznych", () => {
    const questions = [
      "Do kiedy trwa nabór wniosków?",
      "Jaka jest maksymalna kwota dofinansowania?",
      "Jakie załączniki są wymagane?",
      "Kto może składać aplikacje w tym konkursie?",
      "Czy wymagany jest wkład własny?",
      "Gdzie wysyła się dokumenty?",
    ];
    for (const question of questions) {
      expect(needsDeepThinking(question), question).toBe(false);
    }
  });

  it("włącza rozumowanie dla pytań wytwórczych", () => {
    const questions = [
      "Napisz uzasadnienie potrzeby realizacji projektu, ok. 2000 znaków.",
      "Przygotuj harmonogram działań na 12 miesięcy.",
      "Rozpisz budżet projektu na kategorie kosztów.",
      "Zaproponuj cele szczegółowe projektu.",
      "Popraw ten fragment, żeby brzmiał konkretniej.",
      "Sformułuj opis grupy docelowej.",
    ];
    for (const question of questions) {
      expect(needsDeepThinking(question), question).toBe(true);
    }
  });

  it("nie zależy od wielkości liter", () => {
    expect(needsDeepThinking("NAPISZ WSTĘP DO PROJEKTU")).toBe(true);
  });

  it("włącza rozumowanie dla długich wiadomości (ponad 300 znaków)", () => {
    expect(needsDeepThinking("a".repeat(301))).toBe(true);
    expect(needsDeepThinking("a".repeat(300))).toBe(false);
  });

  it("AI_THINKING=off wyłącza rozumowanie nawet dla pytań wytwórczych", () => {
    vi.stubEnv("AI_THINKING", "off");
    expect(needsDeepThinking("Napisz uzasadnienie potrzeby realizacji projektu.")).toBe(
      false,
    );
    expect(needsDeepThinking("a".repeat(1000))).toBe(false);
  });

  it("AI_THINKING=on włącza rozumowanie nawet dla pytań faktograficznych", () => {
    vi.stubEnv("AI_THINKING", "on");
    expect(needsDeepThinking("Do kiedy trwa nabór wniosków?")).toBe(true);
  });

  it("nieznana wartość AI_THINKING nie psuje heurystyki", () => {
    vi.stubEnv("AI_THINKING", "byle co");
    expect(needsDeepThinking("Do kiedy trwa nabór wniosków?")).toBe(false);
    expect(needsDeepThinking("Napisz uzasadnienie.")).toBe(true);
  });
});
