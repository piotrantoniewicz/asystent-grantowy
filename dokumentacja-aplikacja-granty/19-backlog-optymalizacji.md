# 19 — Backlog optymalizacji (stan na 2026-07-29 wieczór)

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

**Czego brakuje do decyzji:** rozkładu liczby rund. Wyciągnąć z logów
produkcyjnych (`[czat/razem] … rundy narzędzi N`) z kilku dni. **Uwaga: logi
Vercela w tym planie znikają po godzinie** — 29.07 wieczorem nie było już czego
czytać z popołudnia. Żeby zebrać rozkład, trzeba albo czytać logi na bieżąco,
albo zapisywać liczbę rund do bazy przy wiadomości (dziś `Message` trzyma tokeny,
ale nie liczbę rund — to byłaby najmniejsza zmiana, jeden dodatkowy `Int`).

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

## 6. Drobiazgi

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
- **Kopie w `.claude/worktrees/`** powielają pliki testowe, przez co `npm test`
  raportuje te same testy po kilka razy. Sprawdzić, czy worktree są jeszcze
  potrzebne.

---

## Skąd wiadomo, że coś działa

**Dwa źródła pomiarów, do różnych rzeczy.**

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

Jedno zdanie ostrzeżenia na przyszłość: **dwa pomiary, które różnią się modelem
albo liczbą rund, nie porównują tego samego.** Dziś trzykrotnie wyciągnąłem
z takich par wniosek szybszy, niż pozwalały dane — i trzeba było go korygować.
