import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  looksLikeLookupQuestion,
  looksLikeWritingTask,
  needsDeepThinking,
  pickDocsModelClass,
} from "./router";

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

describe("looksLikeLookupQuestion", () => {
  it("rozpoznaje pytania wyszukujące (mogą iść na Haiku)", () => {
    const questions = [
      "Do kiedy trwa nabór?",
      "Jakie załączniki są wymagane?",
      "Jaka jest maksymalna kwota dofinansowania?",
      "Kto może składać wniosek?",
      "Czy wymagany jest wkład własny?",
      "Gdzie wysyła się dokumenty?",
      "Ile wynosi minimalny wkład własny?",
      "Jaki jest termin rozliczenia dotacji?",
    ];
    for (const question of questions) {
      expect(looksLikeLookupQuestion(question), question).toBe(true);
    }
  });

  it("zostawia na Sonnecie pytania o ocenę i kwalifikowalność", () => {
    const questions = [
      "Czy nasza organizacja spełnia kryteria kwalifikowalności?",
      "Oceń, czy mamy szanse w tym konkursie.",
      "Przeanalizuj, czy nasz projekt pasuje do celów konkursu.",
      "Czy możemy startować, jeśli działamy od roku?",
      "Doradź, na który z tych dwóch konkursów aplikować.",
      "Jakie są dla nas ryzyka w tym naborze?",
    ];
    for (const question of questions) {
      expect(looksLikeLookupQuestion(question), question).toBe(false);
    }
  });

  it("zostawia na Sonnecie pytania o pisanie treści wniosku", () => {
    const questions = [
      "Napisz uzasadnienie potrzeby realizacji projektu.",
      "Przygotuj harmonogram działań na 12 miesięcy.",
      "Rozpisz budżet projektu na kategorie kosztów.",
      "Popraw ten fragment, żeby brzmiał konkretniej.",
    ];
    for (const question of questions) {
      expect(looksLikeLookupQuestion(question), question).toBe(false);
    }
  });

  it("zostawia na Sonnecie pytania o zdolność zespołu, mimo słowa o terminach", () => {
    const questions = [
      // Realne pytanie z produkcji (2026-07-29): poszło na Haiku, bo trafiło
      // w „termin", a w liście analitycznej nie trafiało wtedy w nic.
      "biorąc pod uwagę doświadczenie organizacji, wymogi merytoryczne konkursu i terminy czy 3 osobowy zespol poradzi sobie z aplikacja?",
      "Czy zespół 3 osób zdąży z wnioskiem do terminu naboru?",
      "Czy damy radę w tym terminie?",
      "Czy warto startować, skoro termin jest za dwa tygodnie?",
    ];
    for (const question of questions) {
      expect(looksLikeLookupQuestion(question), question).toBe(false);
    }
  });

  it("nie zależy od wielkości liter", () => {
    expect(looksLikeLookupQuestion("DO KIEDY TRWA NABÓR?")).toBe(true);
  });

  it("długie pytanie nigdy nie jest wyszukujące", () => {
    // Opis sytuacji z prośbą o ocenę — nawet jeśli pada w nim „do kiedy".
    expect(looksLikeLookupQuestion(`Do kiedy? ${"a".repeat(201)}`)).toBe(false);
  });

  it("przy braku dopasowania domyślnie NIE jest wyszukujące", () => {
    expect(looksLikeLookupQuestion("Hmm, a co dalej?")).toBe(false);
  });
});

describe("pickDocsModelClass", () => {
  it("w trybie na żądanie kieruje pytania wyszukujące na Haiku", () => {
    expect(
      pickDocsModelClass({ messageText: "Do kiedy trwa nabór?", onDemandDocs: true }),
    ).toBe("SIMPLE");
  });

  it("w trybie na żądanie zostawia analizę i pisanie na Sonnecie", () => {
    expect(
      pickDocsModelClass({
        messageText: "Czy nasza organizacja spełnia kryteria kwalifikowalności?",
        onDemandDocs: true,
      }),
    ).toBe("COMPLEX");
    expect(
      pickDocsModelClass({
        messageText: "Napisz uzasadnienie potrzeby realizacji projektu.",
        onDemandDocs: true,
      }),
    ).toBe("COMPLEX");
  });

  // Tryb `full` = cała dokumentacja w prompcie; mieszanie modeli mnożyłoby
  // kosztowne zapisy do cache (osobny cache dla każdego modelu).
  it("w trybie full zawsze Sonnet", () => {
    const questions = [
      "Do kiedy trwa nabór?",
      "Jakie załączniki są wymagane?",
      "Napisz uzasadnienie potrzeby realizacji projektu.",
    ];
    for (const question of questions) {
      expect(
        pickDocsModelClass({ messageText: question, onDemandDocs: false }),
        question,
      ).toBe("COMPLEX");
    }
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
