import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { looksLikeWritingTask, needsDeepThinking } from "./router";

describe("looksLikeWritingTask", () => {
  it("rozpoznaje pytania faktograficzne", () => {
    const questions = [
      "Do kiedy trwa nabór wniosków?",
      "Jaka jest maksymalna kwota dofinansowania?",
      "Jakie załączniki są wymagane?",
      "Kto może składać aplikacje w tym konkursie?",
      "Czy wymagany jest wkład własny?",
      "Gdzie wysyła się dokumenty?",
    ];
    for (const question of questions) {
      expect(looksLikeWritingTask(question), question).toBe(false);
    }
  });

  it("rozpoznaje pytania wytwórcze", () => {
    const questions = [
      "Napisz uzasadnienie potrzeby realizacji projektu, ok. 2000 znaków.",
      "Przygotuj harmonogram działań na 12 miesięcy.",
      "Rozpisz budżet projektu na kategorie kosztów.",
      "Zaproponuj cele szczegółowe projektu.",
      "Popraw ten fragment, żeby brzmiał konkretniej.",
      "Sformułuj opis grupy docelowej.",
    ];
    for (const question of questions) {
      expect(looksLikeWritingTask(question), question).toBe(true);
    }
  });

  it("nie zależy od wielkości liter", () => {
    expect(looksLikeWritingTask("NAPISZ WSTĘP DO PROJEKTU")).toBe(true);
  });

  it("traktuje wiadomości dłuższe niż 300 znaków jako wytwórcze", () => {
    expect(looksLikeWritingTask("a".repeat(301))).toBe(true);
    expect(looksLikeWritingTask("a".repeat(300))).toBe(false);
  });
});

describe("needsDeepThinking", () => {
  // Wymuszamy tryb normalny — inaczej ustawione lokalnie `AI_THINKING`
  // (do porównywania jakości odpowiedzi) wywracałoby testy.
  beforeEach(() => vi.stubEnv("AI_THINKING", "auto"));
  afterEach(() => vi.unstubAllEnvs());

  // Decyzja właściciela z 2026-07-28: rozumowanie wyłączone na stałe, bo nie
  // poprawiało jakości, a kosztowało czas i tokeny wyjściowe. Powrót = zmiana
  // stałej THINKING_ENABLED w `router.ts` na `true`.
  it("jest wyłączone niezależnie od treści pytania", () => {
    const questions = [
      "Do kiedy trwa nabór wniosków?",
      "Napisz uzasadnienie potrzeby realizacji projektu, ok. 2000 znaków.",
      "Rozpisz budżet projektu na kategorie kosztów.",
      "a".repeat(1000),
    ];
    for (const question of questions) {
      expect(needsDeepThinking(question), question.slice(0, 40)).toBe(false);
    }
  });

  it("AI_THINKING=on pozwala włączyć rozumowanie do porównań", () => {
    vi.stubEnv("AI_THINKING", "on");
    expect(needsDeepThinking("Do kiedy trwa nabór wniosków?")).toBe(true);
  });

  it("AI_THINKING=off wyłącza rozumowanie", () => {
    vi.stubEnv("AI_THINKING", "off");
    expect(needsDeepThinking("Napisz uzasadnienie projektu.")).toBe(false);
  });

  it("nieznana wartość AI_THINKING nie zmienia zachowania", () => {
    vi.stubEnv("AI_THINKING", "byle co");
    expect(needsDeepThinking("Napisz uzasadnienie projektu.")).toBe(false);
  });
});
