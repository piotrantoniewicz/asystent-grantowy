import { describe, expect, it } from "vitest";
import { needsDeepThinking } from "./router";

describe("needsDeepThinking", () => {
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
});
