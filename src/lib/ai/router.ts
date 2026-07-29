import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { anthropic, MODEL_SIMPLE } from "./client";
import { CLASSIFIER_INSTRUCTIONS } from "./prompts";

export type ModelClass = "SIMPLE" | "COMPLEX";

/**
 * Czy rozumowanie (`thinking`) jest w ogóle włączone.
 *
 * `false` od 2026-07-28 — decyzja właściciela po porównaniu odpowiedzi na to samo
 * pytanie o uzasadnienie projektu, raz z rozumowaniem i raz bez: różnicy w jakości
 * nie było, a rozumowanie kosztowało ~6 sekund czekania i tokeny wyjściowe
 * po $15 za milion.
 *
 * Powrót to zmiana tej stałej na `true` — heurystyka i jej testy zostają na miejscu.
 */
const THINKING_ENABLED = false;

/**
 * Słowa typowe dla pytań „wytwórczych" — takich, w których model ma coś napisać,
 * rozplanować albo przeredagować.
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
 * Czy pytanie jest „wytwórcze" — model ma coś napisać, rozplanować albo
 * przeredagować, a nie wyszukać fakt w dokumentacji.
 *
 * Świadomie BEZ osobnego wywołania AI (klasyfikator Haiku dokłada 0,3–0,6 s
 * czekania i własny koszt) — to ma być czysta heurystyka tekstowa.
 *
 * Steruje limitem długości odpowiedzi (`max_tokens`): przy pisaniu wniosku
 * potrzebny jest duży zapas, przy pytaniu o termin naboru — nie.
 */
export function looksLikeWritingTask(messageText: string): boolean {
  const text = messageText.toLowerCase();
  return (
    messageText.length > 300 || WRITING_HINTS.some((hint) => text.includes(hint))
  );
}

/**
 * Czy dla tego pytania włączyć tryb rozumowania (`thinking`).
 *
 * Dziś zawsze `false` — patrz `THINKING_ENABLED`. Rozumowanie kosztuje jak tokeny
 * wyjściowe ($15/MTok na Sonnecie) i odpowiada za kilka sekund ciszy przed pierwszym
 * słowem odpowiedzi: do streamu trafia tylko `text_delta`, więc użytkownik widzi
 * wtedy pustkę.
 *
 * Zmienna `AI_THINKING` pozwala wymusić odpowiedź niezależnie od treści pytania
 * i od `THINKING_ENABLED`: `off` — nigdy nie rozumuj, `on` — zawsze rozumuj,
 * brak lub `auto` — normalne zachowanie. Służy do porównywania jakości odpowiedzi
 * „z rozumowaniem" i „bez" na TYM SAMYM pytaniu. Na produkcji zostaje nieustawiona.
 */
export function needsDeepThinking(messageText: string): boolean {
  const override = process.env.AI_THINKING?.trim().toLowerCase();
  if (override === "off") return false;
  if (override === "on") return true;

  if (!THINKING_ENABLED) return false;
  return looksLikeWritingTask(messageText);
}

/**
 * Czasowniki „napisz mi to". Osobna, WĘŻSZA lista niż `WRITING_HINTS`, bo tamta
 * zawiera też rzeczowniki („wniosek", „plan", „budżet"), które padają w zwykłych
 * pytaniach o fakty („kto może składać wniosek?").
 */
const WRITING_VERB_HINTS = [
  "napisz",
  "przygotuj",
  "sformułuj",
  "uzasadnij",
  "opisz",
  "rozpisz",
  "streść",
  "przeredaguj",
  "popraw",
  "rozwiń",
  "zaproponuj",
];

/**
 * Słowa typowe dla pytań o ocenę, analizę i doradztwo — to jest sedno produktu
 * i zostaje na Sonnecie, nawet jeśli pytanie jest krótkie.
 *
 * Lista musi łapać także pytania O NAS (czy damy radę, czy zespół podoła), a nie
 * tylko o konkurs. Bez nich wystarczyło, że użytkownik wymieni „terminy" jako
 * jedną z przesłanek — pytanie „biorąc pod uwagę doświadczenie organizacji (…)
 * i terminy czy 3-osobowy zespół poradzi sobie z aplikacją?" szło na Haiku,
 * bo trafiało w `LOOKUP_HINTS`, a w tej liście nie trafiało w nic (2026-07-29).
 */
const ANALYSIS_HINTS = [
  "kwalifikowal",
  "czy spełnia",
  "czy spełniamy",
  "czy możemy",
  "czy nasza",
  "czy nasz ",
  "czy mamy szans",
  "biorąc pod uwagę",
  "czy zespół",
  "czy zespol",
  "poradzi sobie",
  "poradzimy",
  "damy radę",
  "damy rade",
  "podołamy",
  "podolamy",
  "zdążymy",
  "zdazymy",
  "wystarczy nam",
  "czy warto",
  "oceń",
  "ocena",
  "przeanalizuj",
  "analiz",
  "szanse",
  "doradź",
  "poradź",
  "rekomend",
  "porównaj",
  "strategi",
  "ryzyk",
  "argument",
  "pasuje",
  "nadajemy się",
  "nadaje się",
];

/**
 * Zwroty, po których poznać pytanie „wyszukujące": odpowiedź to fakt do
 * znalezienia w dokumentacji (termin, kwota, lista załączników), nie ocena.
 */
const LOOKUP_HINTS = [
  "do kiedy",
  "od kiedy",
  "kiedy",
  "termin",
  "deadline",
  "ile ",
  "jaka kwota",
  "jaką kwotę",
  "maksymaln",
  "minimaln",
  "jakie załączniki",
  "jakie dokumenty",
  "jakie są",
  "jaki jest",
  "jaka jest",
  "kto może",
  "gdzie",
  "wkład własny",
  "co trzeba",
  "czy trzeba",
  "czy wymagan",
  "czy jest wymagany",
  "adres",
  "kontakt",
];

/** Dłuższe pytanie to prawie zawsze opis sytuacji z prośbą o ocenę, nie wyszukanie faktu. */
const LOOKUP_MAX_CHARS = 200;

/**
 * Czy pytanie jest „wyszukujące" — model ma znaleźć fakt w dokumentacji konkursu
 * (termin naboru, kwota, lista załączników, kto może składać wniosek).
 *
 * Takie pytania mogą iść na Haiku (3× taniej). Analiza kwalifikowalności
 * i pisanie treści wniosku zostają na Sonnecie — patrz zasada 5 w `CLAUDE.md`.
 *
 * Świadomie BEZ osobnego wywołania AI: klasyfikator (`classifyQuestion`) dokłada
 * 0,3–0,6 s czekania i własny koszt do KAŻDEGO pytania, także tych, które i tak
 * pójdą na Sonneta — przy celu „pierwsze słowo poniżej 3 s" to strata.
 *
 * Heurystyka jest celowo zachowawcza: przy jakiejkolwiek wątpliwości zwraca
 * `false`, czyli pytanie idzie na Sonneta. Fałszywy Sonnet kosztuje kilka groszy,
 * fałszywe Haiku kosztuje jakość odpowiedzi.
 */
export function looksLikeLookupQuestion(messageText: string): boolean {
  if (messageText.length > LOOKUP_MAX_CHARS) return false;
  const text = messageText.toLowerCase();
  if (WRITING_VERB_HINTS.some((hint) => text.includes(hint))) return false;
  if (ANALYSIS_HINTS.some((hint) => text.includes(hint))) return false;
  return LOOKUP_HINTS.some((hint) => text.includes(hint));
}

/**
 * Wybór modelu dla rozmowy z wczytaną dokumentacją konkursu.
 *
 * `onDemandDocs` = tryb `ai_docs_mode: "ondemand"` (w prompcie jest sam spis
 * stron, ~6 tys. tokenów). Tylko w nim wolno mieszać modele: cache promptu jest
 * osobny dla każdego z nich, więc w trybie `full` (cała dokumentacja w prompcie,
 * 150+ tys. tokenów) przełączenie modelu w środku rozmowy oznaczałoby drugi
 * kosztowny zapis do cache — stratę zamiast oszczędności.
 */
export function pickDocsModelClass({
  messageText,
  onDemandDocs,
}: {
  messageText: string;
  onDemandDocs: boolean;
}): ModelClass {
  if (!onDemandDocs) return "COMPLEX";
  return looksLikeLookupQuestion(messageText) ? "SIMPLE" : "COMPLEX";
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
