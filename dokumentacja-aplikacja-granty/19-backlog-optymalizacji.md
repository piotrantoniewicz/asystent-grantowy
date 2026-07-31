# 19 — Backlog optymalizacji (stan na 2026-07-31)

Kontynuacja `17-koszty-i-latencja.md` i `18-zrownoleglenie-i-haiku.md`.
Ten plik to **lista rzeczy jeszcze niezrobionych**, spisana po sesji pomiarowej
na produkcji. Zaczynając pracę: przeczytaj sekcję „Skąd wiadomo, że coś działa"
i dopiero potem bierz zadanie.

## Co zostało zrobione dziś (żeby nie powtarzać)

| Zmiana | Commit | Efekt zmierzony |
|---|---|---|
| Migracja `ScrapedSource.indexBlob` na produkcji | `30dd6aa` (build) | Odblokowała tryb `ondemand` na produkcji |
| Czytelny komunikat zamiast błędu przy wczytywaniu rozmowy | `30dd6aa` | — (poprawka UX) |
| Cache na wynikach narzędzi (`markToolResultsForCache`) | `2eae99f` | Wejście w rundzie odpowiedzi: 43 606 → **2 tokeny** |
| Wskaźnik „Czytam dokumentację…" w każdej rundzie | `2eae99f` | Potwierdzone na żywo przez właściciela |
| Router: pytania o zdolność zespołu wracają na Sonneta | `503b5d8` | Potwierdzone na żywo (model `claude-sonnet-5`) |

## Pomiary bazowe do porównań

Trzy pytania na produkcyjnej dokumentacji, tryb `ondemand`:

| Kiedy | Model | Rundy narzędzi | Czas całkowity | Pierwsze słowo (runda odpowiedzi) | Cache zapis / odczyt |
|---|---|---|---|---|---|
| 16:11 (przed cache) | Sonnet | 3 | **73,4 s** | 17,2 s | 7 039 / 21 117 |
| 16:37 (po cache) | Haiku | 1 | 22,5 s | 2,0 s | 21 453 / 5 457 |
| 17:17 (po cache + router) | Sonnet | 1 | **62,2 s** | 29,6 s | 31 064 / 8 563 |

**Czego te liczby NIE dowodzą:** żadne dwa wiersze nie różnią się tylko jedną
zmienną (raz inny model, raz inna liczba rund). Efekt samego cache'owania na
czasie **nie został jeszcze zmierzony w czystej postaci** — patrz zadanie 1.

---

## 1. Zmierzyć efekt cache na pytaniu wielorundowym — ZROBIONE 29.07 wieczorem

**Jak zmierzone:** skryptem `scripts/pomiar-cache.pomiar.ts`
(`npm run pomiar:cache`). Skrypt zadaje **to samo pytanie dwa razy** na tym samym
modelu i tej samej dokumentacji — raz z oznaczaniem wyników narzędzi do cache'u,
raz bez. Jedyna różnica między przebiegami to `markToolResultsForCache`.
Przed porównaniem robi „rozgrzewkę", żeby oba przebiegi startowały z blokiem
systemowym już zapisanym w cache. Wynik trafia też do
`scripts/wynik-pomiaru-cache.txt` (plik poza gitem).

**Wynik przy 4 rundach narzędziowych (Sonnet, produkcyjna dokumentacja):**

| | bez cache'owania narzędzi | z cache'owaniem |
|---|---|---|
| Czas całkowity | 50,7 s | 52,5 s |
| Pierwsze słowo w rundzie odpowiedzi | 2 329 ms | 1 835 ms |
| Tokeny wejścia pełną ceną | 68 310 | **311** |
| Odczyt z cache (10% ceny) | 30 415 | 77 985 |
| Zapis do cache (125% ceny) | 0 | 23 270 |

Odczyt z cache **rósł z rundy na rundę** (6 083 → 20 580 → 21 950 → 23 289),
czyli mechanizm działa tak, jak zaprojektowany.

**Co z tego wynika — dwa wnioski, oba ważne:**

1. **Cache oszczędza pieniądze, nie czas.** Koszt wejścia takiego pytania spada
   z ok. 0,21 USD do ok. 0,11 USD (−48%, licząc cenami z panelu admina). Ale czas
   odpowiedzi jest **taki sam** — przygotowanie promptu trwało w obu przebiegach
   ok. 2 s, więc nie było czego skracać. Wcześniejsze przypuszczenie, że cache
   przyspieszy trudne pytania, **było błędne**: czekanie siedzi gdzie indziej
   (patrz zadanie 3 i 4).
2. **Prawdziwe pytania są jednorundowe.** Żeby w ogóle dostać 4 rundy, trzeba
   było kazać modelowi wprost „czytaj jedną stronę na raz". Dwa normalnie
   sformułowane pytania (w tym złożone, dwuczłonowe, z jawnymi krokami) model
   załatwił **jedną** rundą. To bezpośrednio dotyczy zadania 2 niżej.

## 2. Decyzja: czy oznaczać cache już od pierwszej rundy

**Problem:** zapis do cache kosztuje 1,25× ceny wejścia. Przy pytaniu
**jednorundowym** płacimy tę dopłatę bez żadnego odczytu — przy 31 tys. tokenów
zapisu (pomiar 17:17) to ok. **6 groszy na pytanie**. Przy wielorundowym
oszczędność jest kilkukrotnie większa niż dopłata, więc bilans zależy wyłącznie
od tego, jaka część pytań kończy się na jednej rundzie.

**Czego brakuje do decyzji:** rozkładu liczby rund. **Zbieranie danych jest już
włączone (30.07)** — patrz niżej. Teraz trzeba tylko poczekać na ruch.

**Jak teraz zebrać rozkład (zrobione 30.07):** `Message` ma trzy nowe pola —
`toolRounds`, `firstTextMs`, `totalMs` (migracja
`20260730113302_add_message_timing_and_tool_rounds`). Wypełniają się przy każdej
odpowiedzi zapisanej w bazie, więc dane zostają na stałe, w przeciwieństwie do
logów Vercela, które **znikają po godzinie**. Rozkład widać w `/admin` w ramce
„Ile razy AI sięgało do dokumentacji" (ostatnie 30 dni), a przy pojedynczej
odpowiedzi w podglądzie rozmowy. Starsze wiadomości mają te pola puste i są
w statystyce pomijane — licznik „odpowiedzi z pomiarem" mówi, na ilu wierszach
liczony jest rozkład.

**Kiedy decydować:** gdy w `/admin` uzbiera się kilkadziesiąt zmierzonych
odpowiedzi z prawdziwego ruchu. Wcześniej rozkład nic nie znaczy.

**Co już wiadomo (pomiar z zadania 1):** trzy różne pytania na produkcyjnej
dokumentacji, w tym jedno wyraźnie złożone, dały **po jednej rundzie**.
Wielorundowe zachowanie udało się wywołać dopiero instrukcją „czytaj jedną
stronę na raz". Jeśli rozkład z produkcji to potwierdzi, wariant „oznaczaj
dopiero od drugiej rundy" jest wyraźnie lepszy: przy jednej rundzie cache tylko
dopłaca (w pomiarze: 14–23 tys. tokenów zapisu, z których nikt nie skorzystał).

**Warianty:**

- **Zostaw jak jest** — cache od pierwszej rundy. Dobre, jeśli pytania
  wielorundowe są częste.
- **Oznaczaj dopiero od drugiej rundy** — pytania jednorundowe przestają
  dopłacać, wielorundowe korzystają z cache od rundy 2 wzwyż. Kosztuje utratę
  cache dla samej rundy 2 (musi przeliczyć rundę 1). Zmiana to jeden warunek
  przy wywołaniu `markToolResultsForCache` w `src/app/api/chat/route.ts`.

**Nie zgadywać** — najpierw rozkład, potem wybór.

**Uwaga po zadaniu 8 (31.07):** ta decyzja stała się pilniejsza. Po zmianie
promptu pytania wracają do **jednej rundy** (pomiar w zadaniu 8: 5 rund → 1),
a to właśnie przy jednej rundzie cache tylko dopłaca. W zmierzonym przebiegu:
zapis 7 122 tokenów, odczyt 4 433 — czyli zapłacone 1,25× za coś, z czego
skorzystano raz. Rozkład z produkcji rozstrzygnie, ale wariant „oznaczaj dopiero
od drugiej rundy" jest teraz wyraźnie bardziej prawdopodobny niż wczoraj.

## 3. Czas do pierwszego słowa po rundzie narzędzi (29,6 s!)

Największa pozostała pozycja czasowa. W pomiarze 17:17: przygotowanie promptu
892 ms, a pierwsze słowo dopiero po **29,6 s**. Rozumowanie jest wyłączone, więc
to nie ono. Do sprawdzenia:

- czy to stała zmienność po stronie API (porównać kilka pomiarów tego samego
  pytania o różnych porach — 16:11 miało w analogicznym miejscu 17,2 s przy
  **większym** wejściu, więc korelacja z rozmiarem promptu jest słaba);
- **nowy trop z pomiaru z zadania 1:** ten sam kształt zapytania, puszczony
  z laptopa skryptem pomiarowym, dawał pierwsze słowo po **1,1–2,8 s** w każdej
  z kilkunastu zmierzonych rund. Skoro lokalnie jest 2 s, a w logu produkcyjnym
  29,6 s, to różnicy trzeba szukać albo w tym, co robi trasa `/api/chat`
  **poza** wywołaniem AI, albo w samym pomiarze. Ostrożnie: skrypt mierzy czas
  do pierwszego bloku treści, a `roundFirstTextMs` w `route.ts` — do pierwszego
  fragmentu **tekstu**; przy rundzie, która zaczyna się od czegoś innego niż
  tekst, to nie to samo. To trop, nie wniosek;
- czy pomiar `roundFirstTextMs` liczy to, co myślimy (kod: `src/app/api/chat/route.ts`,
  szukaj `roundFirstTextMs`);
- czy dałoby się pokazać użytkownikowi cokolwiek w tym czasie (dziś wisi
  wskaźnik „Czytam dokumentację…", co jest poprawne, ale 30 s to długo).

## 4. Długość odpowiedzi (~24 s pisania)

Sonnet napisał 4047 tokenów (4127 znaków). To druga co do wielkości pozycja
czasowa. **Uwaga: to nie jest jednoznacznie problem** — właściciel ocenił tę
odpowiedź jako lepszą od krótszej z Haiku. Zanim skracać, zdecydować, czy
dłuższa i staranniejsza odpowiedź jest tu wartością (prawdopodobnie tak).

Jeśli skracać, to **przez prompt systemowy w bazie** (`AppSetting.system_prompt`,
zasada 6), nie przez `max_tokens` — obcięcie limitem urwie odpowiedź w pół zdania.

## 5. Router — pozostałe dziury w heurystyce

Naprawiono jeden przypadek (pytanie o zdolność zespołu przechodziło na Haiku,
bo padło w nim słowo „terminy"). Wzorzec błędu jest ogólniejszy: **wystarczy
jedno słowo z `LOOKUP_HINTS`, żeby przeważyć nad resztą pytania**, o ile nic
nie trafi w `ANALYSIS_HINTS`.

Do rozważenia (żadne nie zrobione):

- pytania złożone (dwa człony, „oraz", „a także") → Sonnet;
- obniżenie progu `LOOKUP_MAX_CHARS` z 200 na ~120 znaków;
- zebranie realnych pytań z produkcji i przejrzenie, które poszły na Haiku —
  to jedyny sposób, żeby znaleźć kolejne dziury bez zgadywania.

Każda z tych zmian **podnosi koszty** (więcej pytań na Sonnecie), więc wymaga
świadomej decyzji, a nie automatycznego „na wszelki wypadek".

## 6. Wyszukiwarka w dokumentacji nie znajduje nic — NAPRAWIONE 31.07

**To najdroższa pozycja z dotąd znalezionych**, bo psuje jednocześnie koszt,
czas i jakość odpowiedzi. Zauważone na logach z produkcyjnego ruchu 31.07.

**Objaw.** W jednym pytaniu model wywołał `szukaj_w_dokumentacji` cztery razy
i **ani razu nie dostał trafienia**. Nie widać tego na pierwszy rzut oka, bo log
pokazuje tylko rozmiar wyniku w znakach:

```
runda 1: szukaj_w_dokumentacji({"fraza":"wyniki konkursu terminy ogłoszenie"}) 127 ms, 85 zn.
runda 2: szukaj_w_dokumentacji({"fraza":"harmonogram ocena rezultaty"})        121 ms, 78 zn.
runda 3: szukaj_w_dokumentacji({"fraza":"harmonogram konkursu ocena"})         122 ms, 77 zn.
```

**Jak to rozpoznać w logu.** Komunikat „nic nie znaleziono" ma stałą część
o długości 51 znaków plus sama fraza. 51 + 34 = 85, 51 + 27 = 78, 51 + 26 = 77 —
zgadza się co do znaku we wszystkich trzech przypadkach. **Wynik wyszukiwania
o długości `51 + długość frazy` to zawsze pudło.** Trafienie ma setki znaków
(`SEARCH_CONTEXT_CHARS = 300` na trafienie, do 5 trafień).

**Przyczyna.** `searchDocs` w `src/lib/ai/tools.ts` szuka **dosłownego ciągu
znaków**:

```ts
textContent: { contains: phrase, mode: "insensitive" }
```

Żeby trafić, w dokumencie musiałby wystąpić dokładnie ciąg „wyniki konkursu
terminy ogłoszenie" — słowo w słowo, w tej kolejności. Regulaminów tak się nie
pisze. Model wpisuje frazy opisowe, bo tak brzmi opis narzędzia („Szukane słowo
lub krótka fraza"). Dochodzi polska odmiana: nawet jedno słowo „ogłoszenie" nie
trafi w „ogłoszenia wyników".

**Konsekwencje — cała oszczędność trybu `ondemand` znika.** Po trzech pudłach
model przestał szukać i **zaczął czytać całe strony na ślepo**: `g1` (30 292 zn.)
i `g3` (30 320 zn.), razem 60 612 — powyżej progu `MAX_TOOL_CONTENT_CHARS`
(60 000). Piąte wyszukiwanie dostało `LIMIT`. Bilans jednego pytania:

| | |
|---|---|
| Czas całkowity | **18,9 s** (żądanie 20,1 s) |
| Rundy narzędzi / wywołania | 5 / 6 |
| Znaki z narzędzi | 61 006 |
| Cache zapis / odczyt | 46 855 / 37 579 |

Tryb „na żądanie" miał oszczędzać przez **celne** sięganie po fragmenty. Przy
zepsutym wyszukiwaniu degeneruje się do „czytaj całe strony po kolei" — czyli
dokładnie do tego, czego miał unikać. Najgorsze jest to, że **model odpowiedział
po odcięciu limitem, nigdy nie znalazłszy właściwego fragmentu** — więc to nie
tylko koszt i czas, ale i ryzyko dla trafności odpowiedzi.

**Bezpieczniki zadziałały poprawnie** — `MAX_TOOL_CONTENT_CHARS` uciął czytanie,
a odmowa w rundzie 5 trwała 0 ms (sprawdzenie przed odpytaniem bazy). Tego nie
ruszać.

**Naprawa (31.07, `src/lib/ai/tools.ts`, bez nowych bibliotek):**

- fraza rozbijana na słowa, każde szukane osobno (`toSearchTerms`);
- dopasowanie po **rdzeniu**: słowo bez końcówki (1 znak przy krótkich, 2 przy
  słowach od 7 znaków, minimum 4 znaki), więc „ogłoszen" łapie „ogłoszenie"
  i „ogłoszenia";
- **ranking stron po liczbie trafionych rdzeni**, fragment wokół miejsca, gdzie
  zbiega się ich najwięcej (`bestExcerpt`), a nie wokół pierwszego z brzegu;
- lista słów nieznaczących, żeby „kiedy" czy „jakie" nie ustawiały rankingu;
- zapytanie w dwóch krokach: najpierw same identyfikatory (jedno zapytanie na
  słowo), potem treść **tylko** 5 najlepszych stron — bez tego ranking ściągałby
  z bazy pełne teksty stron, które i tak odpadną;
- opis narzędzia mówi teraz wprost: 1–3 słowa kluczowe, nie całe pytanie.

**Czego NIE zrobiono i dlaczego:** nie sięgnięto po `pg_trgm` ani pełnotekstowy
indeks Postgresa — Postgres nie ma wbudowanego słownika polskiego, więc
`to_tsvector` bez rozszerzeń nie rozwiąże odmiany, a dodałby zależność
i migrację.

**Znane ograniczenie:** wymiana samogłoski w odmianie („nabór" → „naboru")
daje różne rdzenie, więc szukanie po jednej z tych form nie znajdzie drugiej.
Świadomie zostawione — poprawka wymagałaby prawdziwego stemmera.

**Weryfikacja na prawdziwych stronach z bazy** (11 stron źródła
`fundacjapkobp.pl/korzenie-jutra-2`, te same frazy, które padły w logu):

| Fraza z logu | Stara wyszukiwarka | Nowa |
|---|---|---|
| „wyniki konkursu terminy ogłoszenie" | pudło | 10 stron, najlepsza 4/4 słów |
| „harmonogram ocena rezultaty" | pudło | 8 stron, najlepsza 3/3 |
| „harmonogram konkursu ocena" | pudło | 8 stron, najlepsza 3/3 |
| „ogłoszenie wyników oceny" | pudło | 9 stron, najlepsza 3/3 |
| **„termin naboru"** | **pudło** | 8 stron, najlepsza 2/2 |
| „wkład własny" | trafienie | 6 stron, najlepsza 2/2 |

Uwaga wartą zapamiętania: **„termin naboru" to przykład z opisu samego
narzędzia** — i on też nie działał. Ranking rzeczywiście różnicuje strony
(rozkład trafionych słów przy czterech szukanych: 4,4,3,3,3,3,2,2,1,1,0), więc
model nie dostaje wszystkiego jak leci.

**Czego to NIE dowodzi:** że pytania będą krótsze albo tańsze. Zmierzone jest
tylko to, że wyszukiwarka trafia. Czy model przestanie czytać całe strony,
pokaże dopiero produkcja — miarą jest spadek liczby rund i znaków z narzędzi
przy tym samym pytaniu, do sprawdzenia w `/admin` (pole `toolRounds`).

**Jak rozpoznać nawrót w logu:** wynik wyszukiwania o długości dokładnie
`51 + długość frazy` to komunikat „nic nie znaleziono". Ta reguła nadal
obowiązuje — komunikat celowo został bez zmian.

### Poprawka do tej poprawki (31.07, ten sam dzień)

Pierwsza wersja **znajdowała właściwe strony, ale pokazywała z nich zły
fragment** — i przez to nie rozwiązywała problemu. Dwa błędy:

1. Fragment brany był z **pierwszego** wystąpienia każdego słowa (`indexOf`),
   a nie z najlepszego miejsca w dokumencie.
2. O kolejności stron decydowała **obecność słów gdziekolwiek na stronie**,
   a nie ich skupienie.

Skutek na prawdziwym regulaminie, fraza „ogłoszenie wyników oceny": na czele
stawała strona główna konkursu (3 słowa, ale w trzech odległych miejscach),
a pokazywany fragment to była lista załączników. Właściwy akapit — „Po
ogłoszeniu wyników oceny formalnej Wniosków grantowych…" — leżał na innej
stronie, niżej w rankingu. **Model dostawał bezużyteczny fragment i dlatego
i tak czytał całą stronę.** Rozszerzanie okna nic nie dawało: 1200 znaków wokół
złego miejsca to nadal złe miejsce.

Naprawione: `bestCluster` bierze **wszystkie** wystąpienia wszystkich rdzeni
i oknem przesuwanym znajduje odcinek o największej liczbie różnych słów. Ta sama
miara ustawia strony w kolejności (remisy rozstrzyga liczba słów na stronie),
a treść kandydatów ściągana jest dla `MAX_RANK_CANDIDATES = 10` stron, bo
skupienia nie da się ocenić bez treści.

Sprawdzone na tym samym dokumencie: nr 1 dla „ogłoszenie wyników oceny" to teraz
PDF z akapitem o ocenie formalnej (3 słowa w jednym akapicie) zamiast listy
załączników. Dla „termin naboru" wynik był już wcześniej dobry i się nie zmienił.

**Wniosek na przyszłość:** sprawdzenie „czy wyszukiwarka trafia w stronę" było
za słabym testem. Właściwe pytanie brzmi „czy zwrócony **fragment** odpowiada
na pytanie" — bo to fragment decyduje, czy model sięgnie po całą stronę.

## 7. Model czyta tę samą stronę po kilka razy w jednej odpowiedzi — NAPRAWIONE 31.07

Znalezione przy sprawdzaniu efektu naprawy z zadania 6, na tym samym pytaniu.
**To była prawdziwa przyczyna 20 sekund** — nie wyszukiwarka.

**Objaw.** W jednej odpowiedzi:

```
runda 2: przeczytaj_strone({"id":"g1"}) 366 ms, 30292 zn.
runda 4: przeczytaj_strone({"id":"g1"}) 364 ms, 30292 zn.   ← ta sama strona
```

**Rachunek.** `2486 + 30292 + 2503 + 30292 + 154 = 65727` — zgadza się co do
znaku z „65727 znaków z narzędzi" w wierszu `[czat/razem]`. Powtórka to
**30 292 znaki, czyli 46% całego budżetu narzędzi**, wyrzucone.

**Skutek.** Budżet `MAX_TOOL_CONTENT_CHARS` (60 000) pękł na rundzie 5, więc
ostatnie wyszukiwanie dostało `LIMIT` i model odpowiadał odcięty. Bez duplikatu
byłoby 35 435 znaków — z zapasem poniżej progu, z miejscem na jeszcze jedno
szukanie.

**Przyczyna.** Pętla narzędziowa w `src/app/api/chat/route.ts` (szukaj
`runDocsTool`) **nie pamięta, co już przeczytała** w tej odpowiedzi. Każde
`przeczytaj_strone` idzie do bazy i wraca z pełną treścią, choćby model prosił
o to samo dziesiąty raz.

**Naprawa (31.07, `src/lib/ai/tools.ts`).** Zbiór `alreadyRead` w
`DocsToolContext` — kontekst powstaje raz na żądanie (`route.ts:305`), więc
pamięć żyje dokładnie tyle, co jedna odpowiedź. Przy powtórnym wywołaniu wraca
krótka notka („tę stronę już masz wyżej, poszukaj w niej konkretu") zamiast
treści, i to **bez odpytywania bazy**. Strona trafia do zbioru dopiero po
udanym odczycie — gdyby baza zawiodła, model ma prawo spróbować ponownie.

**Przy okazji poprawione: `scripts/pomiar-cache.pomiar.ts`.** Skrypt budował
kontekst RAZ i podawał ten sam obiekt do rozgrzewki i obu porównywanych
przebiegów. Z nową pamięcią drugi i trzeci przebieg dostawałyby „już czytałeś"
zamiast treści — czyli skrypt porównywałby dwie różne rzeczy i cicho zaniżał
wynik. Teraz każdy przebieg dostaje świeży kontekst. **To dokładnie ten wypadek,
przed którym ostrzega sekcja „Skąd wiadomo, że coś działa": pętla w skrypcie
jest przepisana z `route.ts` i zmiana w trasie wymaga zmiany w skrypcie.**

**Czego NIE zrobiono:** nie podniesiono `MAX_TOOL_CONTENT_CHARS` — próg zadziałał
poprawnie, problem był w marnowaniu budżetu, nie w jego wielkości.

**Czego to NIE dowodzi:** że pytanie potrwa krócej. Testy potwierdzają tylko,
że powtórka nie wysyła treści i nie rusza bazy. Efekt na czasie i koszcie
pokaże dopiero produkcja.

**Uwaga do pomiaru.** Naprawa z zadania 6 jest potwierdzona (wyszukiwarka
trafia: 2486 i 2503 znaki zamiast pudeł), ale **nie skróciła odpowiedzi**:
18,9 s → 19,7 s, 5 rund w obu przebiegach. Dopóki ta usterka żyje, efektu
zadania 6 na czasie i koszcie nie da się zmierzyć — dominuje duplikat.

## 8. Prompt kazał modelowi czytać całe strony — NAPRAWIONE 31.07

**Prawdziwa przyczyna 20 sekund.** Zadania 6 i 7 poprawiały narzędzia, podczas
gdy zachowanie modelu wymuszał prompt. Cztery kolejne poprawki nie zmieniły
ani liczby rund, ani czasu — dopiero to wyjaśnia dlaczego.

**Co było w bloku systemowym** (`src/app/api/chat/route.ts`, ~352):

> „Zanim odpowiesz na pytanie o szczegóły konkursu albo o organizację,
> **przeczytaj właściwe strony narzędziem `przeczytaj_strone`**. […] Jeśli nie
> wiesz, na której stronie jest odpowiedź, użyj `szukaj_w_dokumentacji`."

Czytanie całej strony było postawione jako **obowiązkowy krok przed
odpowiedzią**, a wyszukiwarka tylko jako sposób na znalezienie strony. Model
robił dokładnie to, co mu kazano: szukaj → czytaj całą stronę → szukaj → czytaj
całą stronę → `LIMIT`. Trzy przebiegi tego samego pytania, ten sam wzorzec.

**Dlaczego to bolało.** Dwa pełne dokumenty to 60 612 z 65 772 znaków budżetu
(92%). W rundzie 5 model pytał już bardzo celnie („ogłoszenie wyników oceny
merytorycznej 2026 2027") — **wiedział, czego szuka, i był odcinany dokładnie
w tym momencie**. To ryzyko dla trafności odpowiedzi, nie tylko dla czasu.

**Decyzja właściciela (31.07):** odwrócić kolejność — najpierw wyszukiwarka,
całą stronę czytać dopiero, gdy fragmenty nie wystarczą.

**Naprawa:**

- blok systemowy w `route.ts` stawia teraz `szukaj_w_dokumentacji` jako krok
  pierwszy, a `przeczytaj_strone` jako sięganie po szerszy kontekst, gdy
  fragmenty nie wystarczają. **Zakaz zgadywania i opierania się na streszczeniu
  został utrzymany co do joty** — to on chroni trafność i nie był problemem;
- `SEARCH_CONTEXT_CHARS` z 300 na 1000 znaków, żeby z fragmentu dało się
  odpowiedzieć. Pięć trafień to ~5 tys. znaków wobec 30 tys. za jedną stronę,
  więc nawet trzy wyszukiwania są tańsze niż jeden pełny odczyt;
- ta sama zmiana w `scripts/pomiar-cache.pomiar.ts` — skrypt powiela blok
  systemowy z trasy i bez tego mierzyłby nieaktualny prompt.

**Czego NIE zmieniono:** progów `MAX_TOOL_CONTENT_CHARS` i `MAX_PAGE_CHARS`.
Odrzucony wariant „podnieść budżet do 100 tys." leczyłby objaw — model dalej
czytałby całe dokumenty, tylko drożej.

**Czego to NIE dowodzi.** Że odpowiedzi będą lepsze. Zmiana promptu to zmiana
zachowania produktu i **jedyną wiarygodną oceną jest przeczytanie kilku
odpowiedzi** — czy model nadal podaje konkretne terminy i kwoty, czy zaczął
odpowiadać ogólnikami z urwanych fragmentów. Liczba rund i czas to tylko
wskaźniki pomocnicze. Jeśli trafność spadnie, wracamy do wariantu „zostaw
czytanie, podnieś budżet".

### Wynik zmierzony (31.07, to samo pytanie co w czterech wcześniejszych logach)

Pytanie o termin ogłoszenia wyników, Haiku, ta sama dokumentacja:

| | Cztery przebiegi przed zmianą | Po zmianie |
|---|---|---|
| Rundy narzędzi | 5, 5, 5, 5 | **1** |
| Wywołania `przeczytaj_strone` | 2 za każdym razem | **0** |
| Znaki z narzędzi | 61 006 – 65 775 | **5 999** (−91%) |
| Czas całkowity | 18,6 – 23,5 s | **8,6 s** (−55%) |
| Cache zapis | ~50 000 | **7 122** (−86%) |
| `LIMIT` wyczerpania budżetu | za każdym razem | **nie wystąpił** |

**Trafność potwierdzona przez właściciela:** odpowiedź dobra, data poprawna,
a dopytany o źródło model **sam przyznał, że nie przejrzał całej dokumentacji**,
i wskazał, skąd wziął datę. To zachowanie pożądane, nie usterka — zakaz
zgadywania przetrwał zmianę promptu, a użytkownik dostaje sygnał, kiedy warto
sprawdzić samodzielnie.

**Ograniczenie, o którym trzeba pamiętać:** odpowiadanie z fragmentów oznacza,
że model może przeoczyć zastrzeżenie leżące w innym miejscu dokumentu (np.
„termin może ulec zmianie"). Poprawna data nie jest tym samym co pełny obraz.
Dlatego to właśnie ta samodzielna adnotacja modelu jest tu wartością i nie
należy jej tłumić.

**Drugie pytanie tego samego dnia** (Sonnet, trudniejsze): 1 runda, dwa
wyszukiwania naraz, 11 971 znaków z narzędzi, zero `przeczytaj_strone`, 18,4 s.
**Nie jest porównywalne** z tabelą wyżej — inny model i inne pytanie. Niesie
tylko jedną informację: wzorzec „szukaj zamiast czytać wszystko" utrzymuje się
także na Sonnecie.

## 9. Drobiazgi

- **29.07 wieczorem skończyły się środki na koncie Anthropica** — API zwraca
  „Your credit balance is too low". Dotyczy to tego samego klucza, którego używa
  produkcja, więc **aplikacja nie odpowiada, dopóki konto nie zostanie
  zasilone**. Do sprawdzenia przy okazji: czy komunikat, który w tej sytuacji
  widzi użytkownik, jest zrozumiały (błąd 400 idzie ścieżką „błąd ustawień",
  patrz `isAiConfigError`).
- **Ostrzeżenie `pg` o `sslmode`** w logach produkcyjnych: „SSL modes 'prefer',
  'require', 'verify-ca' are treated as aliases for 'verify-full'". Dziś tylko
  ostrzeżenie, ale w `pg` 9.0 zmieni się zachowanie. `DATABASE_URL` ma już
  `sslmode=verify-full`, więc prawdopodobnie chodzi o `DIRECT_URL` albo o inny
  string — sprawdzić przed aktualizacją `pg`.
- **Testy webhooka Stripe** (`src/lib/stripe/webhook.test.ts`) zawsze czerwone
  lokalnie — wymagają bazy z „test" w nazwie. To celowy guard, nie awaria, ale
  psuje sygnał z `npm test`. Rozważyć osobny branch testowy w Neonie.
- ~~**Kopie w `.claude/worktrees/`** powielają pliki testowe~~ — ZROBIONE 30.07:
  `vitest.config.ts` wyklucza `.claude/worktrees/**`, więc `npm test` liczy każdy
  test raz (73 testy, 9 plików; wcześniej raportowało 148 w 21 plikach — te same
  testy po kilka razy). Trzy katalogi robocze (`dapper-dancing-catmull`,
  `gitignore-fix`, `speed-insights-analytics`) usunięte decyzją właściciela przez
  `git worktree remove` — nie miały niezapisanych zmian, a ich gałęzie
  (`worktree-gitignore-fix`, `worktree-speed-insights-analytics`,
  `docs-update-analytics-deploy`) zostały w repozytorium, więc commity są
  do odzyskania. Wykluczenie w `vitest.config.ts` zostaje na przyszłość.

---

## Skąd wiadomo, że coś działa

**Trzy źródła pomiarów, do różnych rzeczy.**

**1. Skrypt `npm run pomiar:cache`** — do porównań „ta sama rzecz z poprawką
i bez". Zadaje to samo pytanie dwa razy i różni się między przebiegami tylko
jedną rzeczą, więc jako jedyny odpowiada na pytanie „ile daje ta konkretna
zmiana". Kosztuje tyle, co trzy pytania w aplikacji, i **nic nie zapisuje**
do bazy. Zmienne: `PYTANIE="..."` i `MODEL=haiku`. Uwaga: pętla narzędziowa
w skrypcie jest przepisana z `route.ts` — po zmianie pętli w trasie trzeba
poprawić też skrypt.

**2. Logi produkcyjne Vercela** (Runtime Logs, filtr `czat`) — do sprawdzania,
co się dzieje naprawdę, na żywym ruchu. **Znikają po godzinie**, więc nadają się
tylko do pomiaru „tu i teraz", nie do zbierania statystyk z kilku dni.
Wiersze, które niosą treść:

- `[czat]` — czas bazy, kontekstu, pierwszego słowa, **wybrany model**;
- `[czat/runda N]` — ile trwała runda, ile tokenów wejścia, **ile z cache**;
- `[czat/runda N — odpowiedź]` — przygotowanie promptu vs pierwsze słowo;
- `[czat/razem]` — czas całkowity, liczba rund, suma tokenów.

**3. Panel `/admin` (od 30.07)** — do statystyk z wielu dni, których logi nie
utrzymają: rozkład liczby rund narzędziowych, mediana czasu odpowiedzi i mediana
czasu do pierwszego słowa (ostatnie 30 dni, tylko odpowiedzi zapisane po 30.07).
Liczone z pól `toolRounds`, `firstTextMs`, `totalMs` w tabeli `Message`. To jest
źródło do odpowiedzi „jak to wygląda zwykle", nie „dlaczego to pytanie trwało
tyle" — na to drugie nadal potrzebne są logi na żywo.

Jedno zdanie ostrzeżenia na przyszłość: **dwa pomiary, które różnią się modelem
albo liczbą rund, nie porównują tego samego.** Dziś trzykrotnie wyciągnąłem
z takich par wniosek szybszy, niż pozwalały dane — i trzeba było go korygować.
