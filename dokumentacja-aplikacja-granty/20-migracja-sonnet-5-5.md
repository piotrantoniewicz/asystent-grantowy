# 20 — Migracja na Claude Sonnet 5.5 z wyłączonym rozumowaniem

Instrukcja wykonawcza dla agenta (Claude Code). Spisana 2026-09-28 na podstawie
oficjalnego przewodnika migracji Anthropic i przeglądu kodu z tego samego dnia.

---

Cześć. Przenosimy mocny model asystenta z `claude-sonnet-5` na `claude-sonnet-5-5`,
z rozumowaniem nadal wyłączonym. Zmiana jest mała, ale ma dwie pułapki: jedna
rozwali każde zapytanie do Sonneta, a druga każde zapytanie do Haiku. Przeczytaj
całość, zanim dotkniesz kodu. Rób kroki po kolei i po każdym sprawdzaj
kompilację. Jeśli coś się nie zgadza z tym, co tu piszę (numery linii, nazwy,
zachowanie API), zatrzymaj się i opisz to właścicielowi. Nie zgaduj.

Przed startem przeczytaj `CLAUDE.md` i `dokumentacja-aplikacja-granty/05-router-ai.md`.

## Po co to robimy

Sonnet 5.5 to następca Sonneta 5 w tej samej cenie ($2 / $10 za milion tokenów
wejścia / wyjścia). Chcemy lepszej jakości wniosków bez wyższego rachunku.

## Co się zmienia w API (tylko to, co nas dotyczy)

Źródło: https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide

1. **Na Sonnecie 5.5 `thinking: { type: "disabled" }` zwraca błąd 400.** Dziś
   wysyłamy właśnie to (świadomie, patrz komentarz w `chat/route.ts`, linie ~324–331).
   Po samej zmianie nazwy modelu każde pytanie do Sonneta skończyłoby się
   błędem. To pułapka nr 1.
2. **Najniższe ustawienie to `thinking: { type: "between_tools" }`.** Model nie
   rozumuje przed odpowiedzią, ale **może** krótko pomyśleć między wywołaniami
   narzędzi. Pełnego „wyłączone” na tym modelu po prostu nie ma.
3. **Przy `between_tools` trzeba jawnie podać `output_config: { effort: ... }`**,
   i to tylko `"low"`, `"medium"` albo `"high"`. `"xhigh"` i `"max"` dają 400.
   Nie wolno też zmieniać effortu w trakcie rozmowy. U nas oznacza to: każda
   runda pętli narzędziowej dostaje **dokładnie** te same parametry.
4. **`between_tools` nie przyjmuje żadnych innych pól** (`display`,
   `budget_tokens`). Wysyłasz sam `{ type: "between_tools" }`.
5. **Bloki `thinking` trzeba oddawać w pętli narzędzi bez zmian.** Już to robimy
   (`messages.push({ role: "assistant", content: roundMessage.content })`),
   więc nie ruszaj tego miejsca.

**Decyzja właściciela: `effort: "medium"`.** Dokumentacja poleca `medium` do
pracy z narzędziami, a nasz tryb z dokumentacją to właśnie narzędzia
(`szukaj_w_dokumentacji`, `przeczytaj_strone`).

**Pułapka nr 2 — Haiku.** W `chat/route.ts` jedna pętla obsługuje oba modele:
zmienna `model` to raz `MODEL_SIMPLE` (Haiku), raz `MODEL_COMPLEX` (Sonnet),
bo pytania wyszukujące w rozmowie z dokumentacją idą na Haiku (Etap B z `18-…`).
Haiku 4.5 **nie obsługuje `effort`** i nie zna `between_tools`. Jeśli wpiszesz
nowe parametry na sztywno w wywołanie `stream`, zepsujesz wszystkie odpowiedzi
Haiku. Dlatego parametry rozumowania wybiera funkcja zależna od modelu (krok 2).
Haiku ma dostać **dokładnie to, co dostaje dziś**.

## Czego NIE robić

- Nie wysyłaj `thinking: { type: "disabled" }` do Sonneta 5.5.
- Nie wysyłaj `effort` ani `between_tools` do Haiku.
- Nie używaj `effort: "xhigh"` ani `"max"`. Nie zmieniaj effortu między rundami.
- Nie dodawaj `temperature`, `top_p`, `top_k`, `tool_choice: {type: "any" | "tool"}`
  ani wypełniania odpowiedzi modelu z góry (ostatnia wiadomość `assistant`).
  Na 5.5 każda z tych rzeczy to 400. Dziś żadnej nie mamy, niech tak zostanie.
- Nie ruszaj `THINKING_ENABLED`, `needsDeepThinking` ani `AI_THINKING` w `router.ts`.
  Logika „czy rozumować” zostaje, zmieniamy tylko to, **jak** wysyłamy „nie”.
- Nie obchodź typów przez `as any` ani `@ts-ignore`. Jeśli TypeScript protestuje,
  masz złą wersję SDK (krok 1).
- Nie usuwaj wpisu `claude-sonnet-5` z cennika w panelu admina (krok 5).
- Nie ruszaj Haiku, klasyfikatora (`router.ts`) ani streszczania (`summarize.ts`).
  Te miejsca używają `MODEL_SIMPLE` i migracja ich nie dotyczy.

---

## Krok 0 — punkt wyjścia

```bash
git status            # ma być czysto (poza .claude/settings.local.json)
git switch -c sonnet-5-5
npm test              # zapisz wynik; webhook.test.ts bywa czerwony — to znane, patrz CLAUDE.md
npx tsc --noEmit      # ma przejść bez błędów PRZED zmianami
```

Jeśli `tsc` już teraz sypie błędami, zatrzymaj się i zgłoś to. Nie mieszamy
cudzych problemów z migracją.

## Krok 1 — aktualizacja SDK

Mamy `@anthropic-ai/sdk` 0.111.0. W tej wersji typ `ThinkingConfigParam` zna tylko
`enabled | disabled | adaptive`, więc `between_tools` nie przejdzie kompilacji.
Sprawdziłem: 0.129.0 ma `ThinkingConfigBetweenTools` i `output_config.effort`,
a `jsonSchemaOutputFormat` i `messages.parse` (używane w `router.ts`) nadal istnieją.

```bash
npm install @anthropic-ai/sdk@^0.129.0
npx tsc --noEmit
npm test
```

Między 0.111 a 0.129 jest 18 wersji. Jeśli `tsc` albo testy pokażą błędy
niezwiązane z rozumowaniem, **nie naprawiaj ich hurtem**. Wypisz je i zapytaj,
czy robimy to w tej samej zmianie.

## Krok 2 — model i parametry rozumowania w jednym miejscu

Plik: `src/lib/ai/client.ts`.

1. Zmień `MODEL_COMPLEX = "claude-sonnet-5"` na `MODEL_COMPLEX = "claude-sonnet-5-5"`.
2. Pod stałymi modeli dodaj stałą effortu i funkcję, która zwraca parametry
   rozumowania **dla danego modelu**:

```ts
/**
 * Wysiłek Sonneta 5.5 (`output_config.effort`). Decyzja właściciela z 2026-09-28:
 * `medium` — dokumentacja Anthropic poleca go do pracy z narzędziami, a tryb
 * z dokumentacją to właśnie narzędzia. Dozwolone przy `between_tools`: low / medium /
 * high (`xhigh` i `max` zwracają 400). Nie zmieniać w trakcie rozmowy.
 */
export const SONNET_EFFORT = "medium" as const;

/**
 * Parametry rozumowania do `messages.stream` / `messages.create`.
 *
 * Sonnet 5.5 nie ma `thinking: disabled` (400). Najniższe ustawienie to
 * `between_tools`: bez rozumowania przed odpowiedzią, choć model może krótko
 * pomyśleć między wywołaniami narzędzi. Wymaga jawnego `effort`.
 *
 * Haiku 4.5 nie obsługuje `effort` ani `between_tools` — dostaje to samo co
 * przed migracją: `disabled`.
 *
 * Ta sama funkcja musi obsłużyć KAŻDĄ rundę pętli narzędzi — parametry
 * nie mogą się zmieniać w trakcie jednej odpowiedzi.
 */
export function reasoningParams(
  model: string,
  useThinking: boolean,
): Pick<Anthropic.MessageStreamParams, "thinking" | "output_config"> {
  if (model !== MODEL_COMPLEX) {
    return { thinking: { type: "disabled" } };
  }
  return {
    thinking: useThinking ? { type: "adaptive" } : { type: "between_tools" },
    output_config: { effort: SONNET_EFFORT },
  };
}
```

Dlaczego funkcja, a nie `if` w route? Bo to samo trzeba zrobić w dwóch
wywołaniach w `route.ts` i w skrypcie pomiarowym. Trzy kopie tej samej logiki
prędzej czy później się rozjadą. Poza tym czystą funkcję da się przetestować
bez sieci.

3. Dopisz testy w `src/lib/ai/client.test.ts` (styl jak w istniejących testach,
   opisy po polsku):

```ts
describe("reasoningParams", () => {
  it("Sonnet bez rozumowania: between_tools + effort medium", () => {
    expect(reasoningParams(MODEL_COMPLEX, false)).toEqual({
      thinking: { type: "between_tools" },
      output_config: { effort: "medium" },
    });
  });

  it("Sonnet z rozumowaniem (AI_THINKING=on): adaptive + ten sam effort", () => {
    expect(reasoningParams(MODEL_COMPLEX, true)).toEqual({
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
    });
  });

  it("Haiku: bez effort i bez between_tools — jak przed migracją", () => {
    expect(reasoningParams(MODEL_SIMPLE, false)).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it("Sonnet nigdy nie dostaje thinking: disabled (na 5.5 to błąd 400)", () => {
    for (const useThinking of [true, false]) {
      expect(reasoningParams(MODEL_COMPLEX, useThinking).thinking).not.toEqual({
        type: "disabled",
      });
    }
  });
});
```

Zaktualizuj import na górze pliku testów (`MODEL_COMPLEX`, `MODEL_SIMPLE`, `reasoningParams`).

## Krok 3 — czat

Plik: `src/app/api/chat/route.ts`.

1. Dołóż `reasoningParams` do importu z `@/lib/ai/client`.
2. Są **dwa** wywołania `anthropic.messages.stream` (pierwsza runda, ok. linii 416,
   i kolejne rundy w pętli narzędzi, ok. linii 655). W obu zamień blok:

```ts
thinking: useThinking
  ? { type: "adaptive" as const }
  : { type: "disabled" as const },
```

na:

```ts
...reasoningParams(model, useThinking),
```

   Komentarze nad tymi liniami („Parametr jest ZAWSZE wysyłany…”, „Jak wyżej…”)
   przepisz tak, żeby wskazywały na `reasoningParams` w `client.ts`.
3. Przepisz komentarz przy `useThinking` (linie ~324–331). Dziś opisuje Sonneta 5
   i `disabled`. Nowa treść ma mówić, że „wyłączone” oznacza `between_tools`
   na Sonnecie 5.5 i `disabled` na Haiku, że szczegóły są w `reasoningParams`
   i że pominięcie parametru dalej jest błędem (na 5.5 domyślnie rozumowanie
   jest włączone).
4. Kontrola:

```bash
grep -n '"disabled"' src/app/api/chat/route.ts   # ma nic nie znaleźć
grep -n "reasoningParams" src/app/api/chat/route.ts   # import + 2 wywołania
```

Nic więcej w route nie zmieniasz. Pętla narzędzi, cache, obsługa `refusal`
i przekazywanie bloków `thinking` już są zgodne z 5.5.

## Krok 4 — skrypt pomiarowy

Plik: `scripts/pomiar-cache.pomiar.ts`. Oba wywołania `anthropic.messages.stream`
(ok. linii 135 i 214) nie wysyłają dziś `thinking` w ogóle. Na 5.5 oznacza to
rozumowanie włączone, więc pomiar mierzyłby coś innego niż produkcja. Dopisz do
obu wywołań:

```ts
...reasoningParams(MODEL, false),
```

(`reasoningParams` importujesz z `@/lib/ai/client`, tak jak `MODEL_COMPLEX`).
Samego pomiaru **nie uruchamiaj** bez zgody właściciela: kosztuje i trwa minuty.

## Krok 5 — cennik w panelu admina

Plik: `src/lib/admin/stats.ts`. Ceny sprawdziłem 2026-09-28 na oficjalnej stronie
https://platform.claude.com/docs/en/about-claude/pricing. Sonnet 5.5 i Sonnet 5
kosztują tyle samo: **$2 wejście / $10 wyjście za 1M tokenów**, cache zapis
(5 min) 1,25×, odczyt 0,1×, bez żadnej ceny promocyjnej.

```ts
// Ceny z oficjalnego cennika Anthropic, sprawdzone 2026-09-28.
// `claude-sonnet-5` zostaje: starsze odpowiedzi w bazie mają tę nazwę w `modelUsed`.
const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};
```

Dwie rzeczy, które musisz rozumieć:

- **Wpisu `claude-sonnet-5` nie kasuj.** Pętla w `getAdminStats` robi
  `if (!pricing) continue;`, więc odpowiedzi bez ceny liczą się jako $0 i panel
  zaniżyłby historyczny koszt.
- **Poprawiamy też cenę Sonneta 5 z $3/$15 na $2/$10.** Stary komentarz zakładał,
  że cena $2/$10 była promocyjna do 2026-08-31, a potem wróci $3/$15. Oficjalny
  cennik z dziś podaje $2/$10 bez żadnej promocji. Usuń ten nieaktualny
  komentarz. W opisie commita napisz wprost, że to zmienia historyczny szacunek
  kosztów w panelu (w dół o ~1/3).

`CACHE_WRITE_MULTIPLIER` (1.25) i `CACHE_READ_MULTIPLIER` (0.1) zostają bez zmian.

## Krok 6 — licznik „Haiku / Sonnet” na pulpicie admina

Plik: `src/app/admin/page.tsx`, ok. linii 65. Dziś liczy tylko
`modelUsage["claude-sonnet-5"]`, więc po migracji pokazałby wyłącznie stare
odpowiedzi. Policz wszystkie wersje Sonneta razem. Po pobraniu `stats`, przed
`return`:

```ts
const sonnetCount = Object.entries(stats.modelUsage)
  .filter(([model]) => model.startsWith("claude-sonnet"))
  .reduce((sum, [, count]) => sum + count, 0);
```

i w karcie:

```tsx
value={`${stats.modelUsage["claude-haiku-4-5"] ?? 0} / ${sonnetCount}`}
```

## Krok 7 — sprawdzenie

Automatycznie:

```bash
npx tsc --noEmit
npm run lint
npm test
grep -rn "claude-sonnet-5\"" src scripts   # zostać może TYLKO wpis w cenniku stats.ts
```

Na żywo, lokalnie (`npm run dev`). Obserwuj logi serwera w terminalu:

1. **Rozmowa bez dokumentacji, pytanie wytwórcze**, np. „Napisz krótkie
   uzasadnienie projektu warsztatów cyfrowych dla seniorów”. W logu `[czat]`
   ma być `model claude-sonnet-5-5` i `rozumowanie nie`. Odpowiedź ma się pojawić.
2. **Rozmowa z wczytaną dokumentacją konkursu, pytanie wyszukujące**, np.
   „Do kiedy trwa nabór?”. Ma iść na `claude-haiku-4-5` i działać. To test
   pułapki nr 2.
3. **Ta sama rozmowa, pytanie analityczne**, np. „Czy nasza organizacja się
   kwalifikuje?”. Sonnet 5.5 z narzędziami. W logach `[czat/runda N]` ma nie być
   błędów, a rundy mają przechodzić jedna po drugiej. To test tego, że parametry
   są identyczne w każdej rundzie.
4. **Panel `/admin`**: karta „Haiku / Sonnet” liczy nowe odpowiedzi, a koszt AI
   rośnie po pytaniach z punktów 1–3.
5. Opcjonalnie `AI_THINKING=on npm run dev` i jedno pytanie do Sonneta: ma
   działać (`adaptive` + `medium`). Potem wyłącz zmienną.

Jeśli dostaniesz 400, `isAiConfigError` zaloguje `[AI — BŁĄD USTAWIEŃ, HTTP 400]`,
a użytkownik zobaczy komunikat o błędzie ustawień. Najczęstsze przyczyny:

| Treść błędu z API | Co jest źle |
|---|---|
| `disabled` / „not supported for this model” przy `thinking` | Sonnet dostał `disabled`. Pominięte wywołanie albo zły warunek w `reasoningParams` |
| błąd przy `effort` / `output_config` na Haiku | `effort` poszedł do Haiku. Sprawdź warunek `model !== MODEL_COMPLEX` |
| `effort` przy `between_tools` | Podano `xhigh`/`max` albo brak `effort` |
| „does not support assistant message prefill” | Wiadomości kończą się `assistant`. Nie powinno się zdarzyć; zgłoś |

## Krok 8 — na co patrzeć po wdrożeniu (nie naprawiać teraz)

- **Tokeny wyjściowe w pętli narzędzi.** `between_tools` pozwala modelowi
  pomyśleć między rundami, a te tokeny płacimy jak wyjście ($10/MTok). Porównaj
  `wyjście … tok.` w logach `[czat/runda …]` z tym, co było na Sonnecie 5.
  Jeśli wyraźnie wzrosły, zgłoś właścicielowi. Kolejny ruch to `effort: "low"`,
  ale to jego decyzja.
- **Wskaźnik „model analizuje”.** Wysyłamy go przy pierwszym `thinking_delta`.
  Na 5.5 treść rozumowania jest domyślnie ukryta (`display: "omitted"`), więc
  zdarzeń `thinking_delta` może nie być. Wskaźnik „przeglądam dokumentację”
  (przy `tool_use`) działa jak dotąd. Zanotuj w `STATUS.md`, nie przerabiaj.
- **Tokeny.** Sonnet 5.5 liczy tokeny tak samo jak Sonnet 5, więc koszty
  pytania nie powinny skoczyć z samej tokenizacji.

## Krok 9 — domknięcie

1. W `STATUS.md` odhacz pozycję „Migracja na Sonnet 5.5” z datą i krótkim
   opisem, co zrobione. Dopisz obserwacje z kroku 8.
2. Zaproponuj commit (nie rób go sam bez zgody), np.:

   ```
   Sonnet 5.5 bez rozumowania: between_tools + effort medium

   - MODEL_COMPLEX: claude-sonnet-5 -> claude-sonnet-5-5
   - reasoningParams() w client.ts: Sonnet between_tools/adaptive + effort
     medium, Haiku bez zmian (disabled); testy
   - SDK 0.111 -> 0.129 (typ between_tools)
   - skrypt pomiaru cache wysyła te same parametry co produkcja
   - panel admina: cena Sonneta 5.5 ($2/$10), Sonnet 5 skorygowany z $3/$15
     na $2/$10 wg oficjalnego cennika (zmienia historyczny szacunek kosztów),
     licznik Sonneta sumuje obie wersje
   ```

3. Napisz właścicielowi po polsku, prostym językiem, co się zmieniło i jak to
   sprawdzić w przeglądarce (punkty 1–4 z kroku 7). On nie jest programistą.
4. Wdrożenie na produkcję dopiero po jego zgodzie, zgodnie z `16-wdrozenie.md`.

**Wycofanie:** `git revert` commita migracji. Nie cofaj ręcznie samej nazwy modelu.
`reasoningParams` wysłałby wtedy `between_tools` do Sonneta 5, a tego nie
sprawdzaliśmy.
