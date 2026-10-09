# 05 — Router modeli AI

## Cel

Każde pytanie użytkownika trafia najpierw do routera, który decyduje, czy wystarczy
tani, szybki model, czy potrzebny jest model najmocniejszy. Dzięki temu proste pytania
kosztują grosze, a pełną moc płacimy tylko przy pisaniu wniosku.

## Modele (Anthropic API — stan na październik 2026)

| Rola | Model | ID modelu | Cena wejście / wyjście (za 1M tokenów) |
|---|---|---|---|
| Tani — proste pytania, klasyfikacja | Claude Haiku 5.5 | `claude-haiku-5-5` | $0,10 / $0,50 (prompt do 100 tys. tokenów; powyżej $0,50 / $2,50) |
| Mocny — pisanie wniosku, analiza dokumentacji | Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 |

Ceny z oficjalnego cennika Anthropic, sprawdzone 2026-10-08 (Haiku 5.5 zastąpił Haiku 4.5 — $1 / $5 — tego dnia). Do września 2026 mocnym
modelem był Sonnet 5 (`claude-sonnet-5`, obecnie też $2 / $10) — starsze odpowiedzi
w bazie mają tę nazwę w `Message.modelUsed`, więc cennik panelu admina zna obie.
Migracja: `20-migracja-sonnet-5-5.md`.

Używać **oficjalnego SDK** `@anthropic-ai/sdk` (od migracji na Sonnet 5.5 wersja co najmniej 0.129 — starsze nie znają typu `between_tools`). ID modeli wpisywać dokładnie jak
wyżej (bez dopisków dat).

## Zasada nadrzędna: rozmowa z dokumentacją = zawsze Sonnet

Jeśli rozmowa ma wczytaną dokumentację (choć jedno `ScrapedSource` ze statusem
`done`), **wszystkie pytania idą do Sonneta — bez klasyfikacji**. Powód: prompt
caching jest osobny dla każdego modelu. Gdyby pytania w jednej rozmowie skakały
między Haiku a Sonnetem, dokumentacja byłaby zapisywana do dwóch osobnych cache
(zapis kosztuje +25% ceny wejścia, a cache wygasa po 5 minutach) — sumarycznie
drożej niż sam Sonnet z jednym ciepłym cache. Klasyfikator (poniżej) działa
tylko w rozmowach **bez** dokumentacji, gdzie kontekst jest mały i tani.

## Jak działa router (rozmowy bez dokumentacji) — dwa kroki

### Krok 1: klasyfikacja pytania (zawsze Haiku, ~200 tokenów, ułamek grosza)

Przed właściwą odpowiedzią wysyłamy do `claude-haiku-5-5` krótkie zapytanie
klasyfikujące — tylko pytanie użytkownika + ostatnie 2–3 wiadomości dla
kontekstu, **każda przycięta do 500 znaków** (długie odpowiedzi asystenta,
np. całe pole wniosku, niepotrzebnie podbijałyby koszt i czas klasyfikacji):

```
Zaklasyfikuj pytanie użytkownika do jednej kategorii. Odpowiedz wyłącznie jednym słowem.

SIMPLE — proste pytanie faktograficzne, doprecyzowanie, small talk, pytanie o terminy
         lub kwoty wprost zapisane w dokumentacji, pytanie o obsługę aplikacji
COMPLEX — pisanie lub redagowanie treści wniosku, ocena kwalifikowalności,
          wymyślanie i rozwijanie pomysłów na projekt, analiza wymogów konkursu,
          porównywanie opcji, budżet projektu

Pytanie: {treść}
```

Do klasyfikacji użyć **structured outputs** (`output_config.format` z enum
`["SIMPLE", "COMPLEX"]`), żeby odpowiedź była zawsze poprawna. W razie błędu
klasyfikacji (timeout itp.) — domyślnie `COMPLEX` (lepiej przepłacić niż dać słabą
odpowiedź).

### Krok 2: właściwa odpowiedź

| Klasa | Model | Parametry |
|---|---|---|
| SIMPLE | `claude-haiku-5-5` | `max_tokens: 3072` (na Haiku 4.5 było 2048 — nowszy tokenizer liczy ten sam tekst jako ~30% więcej tokenów), bez rozumowania: `thinking: {type: "disabled"}` + `output_config.effort: "medium"` |
| COMPLEX | `claude-sonnet-5-5` | `max_tokens: 32000` (pytanie wytwórcze) albo `4096` (faktograficzne), streaming, **bez rozumowania**: `thinking: {type: "between_tools"}` + `output_config.effort: "medium"` |

Oba wywołania dostają **ten sam pełny kontekst**: prompt systemowy + zeskrapowane
treści + historia rozmowy.

### Rozumowanie (`thinking`) — wyłączone od 2026-07-28

Pierwotnie każde pytanie klasy COMPLEX szło z `thinking: {type: "adaptive"}`.
Decyzją właściciela (po porównaniu odpowiedzi na to samo pytanie o uzasadnienie
projektu, z rozumowaniem i bez) rozumowanie jest **wyłączone**: różnicy w jakości
tekstu nie było, a kosztowało ~6 sekund czekania i tokeny wyjściowe po $15/MTok.
W streamie widać tylko `text_delta`, więc czas rozumowania użytkownik odbierał
jako zawieszoną aplikację.

Sterowanie w `src/lib/ai/router.ts`:

- stała `THINKING_ENABLED` (dziś `false`) — powrót to zmiana jednej linijki,
- `looksLikeWritingTask()` — heurystyka tekstowa bez dodatkowego wywołania AI
  (klasyfikator Haiku dokładałby 0,3–0,6 s i własny koszt); rozpoznaje pytania
  wytwórcze i steruje **wyłącznie** limitem `max_tokens`, nie rozumowaniem —
  inaczej wyłączenie rozumowania ucinałoby długie wnioski w pół zdania,
- zmienna środowiskowa `AI_THINKING` (`on` / `off`) — wymusza tryb niezależnie
  od treści pytania, do porównywania jakości odpowiedzi. Na produkcji nieustawiona.

Szczegóły i pomiary: `17-koszty-i-latencja.md`.

### Jak „wyłączone” wygląda w zapytaniu (od migracji na Sonnet 5.5)

Parametr rozumowania wysyłamy **zawsze** — na Sonnecie 5.5 jego pominięcie oznacza
rozumowanie włączone. Wybiera go jedna funkcja, `reasoningParams(model, useThinking)`
w `src/lib/ai/client.ts`, używana w każdej rundzie pętli narzędzi:

| Model | Rozumowanie wyłączone (norma) | Rozumowanie włączone (`AI_THINKING=on`) |
|---|---|---|
| Sonnet 5.5 | `thinking: {type: "between_tools"}` + `output_config.effort: "medium"` | `thinking: {type: "adaptive"}` + `effort: "medium"` |
| Haiku 5.5 | `thinking: {type: "disabled"}` + `output_config.effort: "medium"` (`between_tools` to na Haiku błąd 400) | — (Haiku nie dostaje pytań z rozumowaniem) |

Zasady wynikające z API Sonneta 5.5:

- `thinking: {type: "disabled"}` zwraca błąd 400 — najniższe ustawienie to
  `between_tools`: brak rozumowania przed odpowiedzią, ale model **może** krótko
  pomyśleć między wywołaniami narzędzi (płatne jak tokeny wyjściowe),
- przy `between_tools` `effort` jest obowiązkowy i tylko `low` / `medium` / `high`;
  wybrany `medium` (decyzja właściciela 2026-09-28 — poziom zalecany do pracy
  z narzędziami); effortu nie wolno zmieniać w trakcie rozmowy,
- bez `temperature`, `top_p`, `top_k`, wymuszania narzędzia (`tool_choice` `any`/`tool`)
  i wypełniania odpowiedzi modelu z góry — każde z nich to błąd 400,
- bloki `thinking` z pętli narzędzi oddajemy modelowi w niezmienionej postaci.

## Prompt caching — obowiązkowy

Kontekst rozmowy jest duży (dokumentacja konkursu!). Na ostatnim bloku stałej części
kontekstu (koniec zeskrapowanych treści) ustawić:

```json
"cache_control": { "type": "ephemeral" }
```

Efekt: pierwsze pytanie w rozmowie płaci pełną cenę za wczytanie dokumentacji,
kolejne ok. 10% tej ceny. **Uwaga:** cache jest osobny dla każdego modelu — dlatego
klasyfikator celowo NIE dostaje pełnej dokumentacji, a rozmowy z dokumentacją
w ogóle nie używają Haiku do odpowiedzi (zasada nadrzędna na górze pliku).
Minimalny próg cache'owania zależy od modelu — na Sonnecie 5.5 to 512 tokenów
(wcześniej 1024–2048), więc sam prompt systemowy może się już łapać do cache;
najwięcej `cache_control` daje jednak wtedy, gdy w kontekście jest dokumentacja.

Kolejność bloków w zapytaniu (stałe → zmienne; cache to dopasowanie prefiksu
do znacznika `cache_control`, więc bloki ZA znacznikiem na cache nie wpływają):
1. Prompt systemowy (stały w ramach rozmowy)
2. Treści zeskrapowane / spis dokumentacji (stałe w ramach rozmowy) ← tu `cache_control`
3. Dzisiejsza data (`buildCurrentDatePrompt`) — zmienia się raz na dobę,
   dlatego stoi ZA punktem cache'owania: nie unieważnia cache'u dokumentacji
4. Historia wiadomości (rośnie)
5. Nowe pytanie

## Obsługa błędów API

- `429` (limit zapytań) i `5xx`: SDK sam ponawia (domyślnie 2 razy); jeśli dalej
  błąd — komunikat w czacie: „Chwilowe przeciążenie, spróbuj za minutę" (pytanie
  NIE zostaje zużyte z limitu — zwrot rezerwacji, patrz `03-baza-danych.md`).
  Jeśli błąd wystąpi, gdy część odpowiedzi już dotarła: dopisać informację
  o przerwaniu, zapisać częściową odpowiedź, pytania nie zwracać.
- `refusal` / odmowa modelu: pokazać treść odmowy, zwrócić rezerwację pytania.
- Zapisywać w `Message.modelUsed` faktycznie użyty model oraz tokeny z pola
  `usage` odpowiedzi — panel admina liczy z tego koszty.

## Szacunek kosztów (orientacyjnie)

Typowa rozmowa: dokumentacja konkursu ~30 tys. tokenów w kontekście, 20 pytań
(15 COMPLEX / 5 SIMPLE), z cache: **ok. $1,5–3 za całą rozmowę**. Pakiet 50 pytań
za 25 zł jest przy tych założeniach na granicy opłacalności — panel admina musi
pokazywać realne koszty, żeby skorygować ceny pakietów po pierwszych użytkownikach.
