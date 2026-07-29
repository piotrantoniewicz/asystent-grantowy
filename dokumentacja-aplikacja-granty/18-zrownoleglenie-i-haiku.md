# 18 — Zrównoleglenie zapytań i Haiku dla pytań wyszukujących

Instrukcja dla agenta (Claude Code). Napisana 2026-07-29, po zmierzeniu Etapu 2
z `17-koszty-i-latencja.md`. Wykonuj **etapami**, w podanej kolejności, z osobnym
commitem po każdym etapie. Właściciel nie jest programistą — po każdym etapie
podaj kroki do sprawdzenia w przeglądarce, po polsku.

Obowiązują „Zasady twarde" z `CLAUDE.md`. Szczególnie **zasada 2** (atomowa
rezerwacja pytania przed wywołaniem AI), **zasada 5** (dziś: rozmowa
z dokumentacją → zawsze Sonnet — Etap B ją zmienia, patrz niżej) i **zasada 5a**
(oba tryby `ai_docs_mode` mają działać).

**Sesję zaczynaj w katalogu projektu** (`~/Projekty/asystent-grantowy`), inaczej
hooki i agenci nie działają.

---

## Skąd te dwa tematy

Etap 2 zbił koszt pytania z ~2,30 zł do ~0,16 zł, ale celu „pierwsze słowo
poniżej 3 s" nie dowiózł (jest 4,4–7,3 s). Pomiar z 2026-07-29 pokazał, że
wąskie gardło **przestało być po stronie AI**:

```
[czat] baza 653 ms, kontekst 1 ms (6686 znaków), cache zapis 6083 / odczyt 0,
       pierwsze zdarzenie po 2742 ms, pierwsze słowo po 7315 ms, rundy narzędzi 1
[czat/runda 1] model odpowiedział po 1189 ms, narzędzia: przeczytaj_strone 172 ms,
       1660 zn. | przeczytaj_strone 231 ms, 15680 zn.
[czat/runda 1 — odpowiedź] przygotowanie promptu 2862 ms, pierwsze słowo po 2893 ms
[czat/razem] 11971 ms, tokeny: wejście 8700 / wyjście 548 / cache zapis 6083 / odczyt 6083
```

Odczyt strony z bazy to 117–233 ms, przygotowanie promptu 1,1–2,9 s — to jest
w porządku. Natomiast **między startem żądania a wysłaniem pierwszego zapytania
do AI mija ~2,8 s**, których nie widać w żadnej linii `[czat/runda]`, bo dzieją
się wcześniej. Tam idzie Etap A.

Etap B wynika z czegoś innego: decyzja „rozmowa z dokumentacją → zawsze Sonnet"
została podjęta, bo cache promptu jest **osobny dla każdego modelu**, a przy
153 tys. tokenów dokumentacji przełączenie modelu w środku rozmowy oznaczało
drugi zapis do cache (kolejne ~1,30 zł) — czyli stratę zamiast oszczędności.
Po Etapie 2 w prompcie zostało ~6 tys. tokenów i ten argument zniknął.

---

## Etap A — zrównoleglenie zapytań przed wywołaniem AI (pół dnia)

### A.1 Co dziś dzieje się po kolei

W `src/app/api/chat/route.ts`, między `const startedAt = Date.now()`
a `anthropic.messages.stream(...)`, jedno po drugim wykonują się:

1. `prisma.conversation.findUnique` (wiadomości + źródła) — mierzone jako `baza`,
   653–1409 ms w pomiarach,
2. `prisma.message.count` — rate limit 4 pytania/min,
3. `getFreeQuestionsLimit()` i `getSystemPrompt()` / `getAiDocsMode()` —
   ustawienia (mają minutowy cache w pamięci, więc zwykle są darmowe, ale po
   restarcie serwera albo zapisie w panelu idą do bazy),
4. `cookies()` — odczyt ciasteczka `ag_device`,
5. `reserveQuestion(...)` — transakcja rezerwująca pytanie.

Każde z nich to osobna podróż do Neona. Na produkcji (Vercel + Neon) to
kilkadziesiąt–kilkaset ms każda.

### A.2 Co zrównoleglić, a czego nie wolno

**Wolno puścić równolegle** (nic od siebie nie zależą): odczyt rozmowy, licznik
rate limitu, `getFreeQuestionsLimit`, `getSystemPrompt`, `getAiDocsMode`,
`cookies()`.

**NIE WOLNO ruszać kolejności rezerwacji.** `reserveQuestion` musi zostać
**po** sprawdzeniu, że rozmowa istnieje i należy do użytkownika, i **przed**
wywołaniem AI. Zasada 2 z `CLAUDE.md` — atomowa rezerwacja przed wywołaniem AI.
Zrównoleglenie rezerwacji z odczytem rozmowy oznaczałoby pobieranie pytania
z puli za rozmowę, której użytkownik nie jest właścicielem.

Podobnie **nie wolno** zaczynać wywołania AI przed rezerwacją, nawet „na próbę".

### A.3 Jak to zrobić

Zamień sekwencję na jedno `Promise.all` przed sprawdzeniem uprawnień:

```ts
const [conversation, recentUserMessages, freeQuestionsLimit, systemPrompt, docsMode, cookieStore] =
  await Promise.all([
    prisma.conversation.findUnique({ ... }),
    prisma.message.count({ ... }),
    getFreeQuestionsLimit(),
    getSystemPrompt(),
    getAiDocsMode(),
    cookies(),
  ]);
```

Dopiero potem, **w tej kolejności**: sprawdzenie właściciela rozmowy → sprawdzenie
rate limitu → `reserveQuestion` → budowanie promptu → `anthropic.messages.stream`.

Uwaga na dwie rzeczy:

- `getSystemPrompt()` i `getAiDocsMode()` są dziś wywoływane **wewnątrz** bloku
  `try`, po rezerwacji. Przeniesienie ich przed rezerwację jest bezpieczne
  (to odczyty), ale wtedy błąd odczytu ustawień poleci **przed** rezerwacją —
  sprawdź, że użytkownik dostaje wtedy czytelny błąd i **nie traci pytania**.
- Uzupełnianie `contextBlob`/`indexBlob` dla starych źródeł (`legacySources`)
  robi dodatkowe zapytanie — zostaw je tam, gdzie jest; dotyczy tylko rozmów
  sprzed migracji i i tak jest jednorazowe.

### A.4 Pomiar

Dopisz do linii `[czat]` czas od `startedAt` do wysłania pierwszego zapytania
do AI (dziś tego nie widać wprost — trzeba go liczyć z różnicy). Coś w rodzaju
`przygotowanie N ms` obok istniejącego `baza N ms`.

### Weryfikacja Etapu A

- `npx tsc --noEmit`, `npm run lint`, `npm run build` — bez błędów.
- `npx vitest run src/lib` — wszystko zielone poza znanym guardem
  `webhook.test.ts` (wymaga bazy z „test" w nazwie `DATABASE_URL`).
- **Testy ręczne, których nie wolno pominąć** (dotykamy rezerwacji pytań):
  - pytanie w cudzej rozmowie (podmień `conversationId` w narzędziach
    deweloperskich przeglądarki) → 404 i **licznik pytań bez zmian**,
  - wyczerpana pula darmowych pytań → komunikat z linkiem do `/pakiety`,
  - piąte pytanie w ciągu minuty → komunikat o rate limicie i **licznik pytań
    bez zmian**,
  - normalne pytanie → odpowiedź i licznik mniejszy o 1.
- W logu: `przygotowanie` powinno spaść z ~2,8 s do ~1–1,5 s.

**Oczekiwany zysk: ~1–1,5 s na każdym pytaniu.** Jeśli wyjdzie mniej niż 0,5 s,
zamelduj — znaczy, że czas schodzi gdzie indziej i nie ma sensu dłubać dalej.

---

## Etap B — Haiku dla pytań wyszukujących (1–2 dni, PO Etapie A)

### B.1 Dlaczego dopiero teraz

Cache promptu jest osobny dla każdego modelu. Przy 153 tys. tokenów w prompcie
przełączenie się w obrębie jednej rozmowy z Haiku na Sonneta oznaczało drugi
zapis do cache — zamiast oszczędności wychodziła strata. Po Etapie 2 w prompcie
zostaje ~6 tys. tokenów, więc drugi zapis kosztuje grosze i argument znika.

Haiku 4.5 to $1/$5 za MTok wobec $3/$15 Sonneta — trzykrotnie taniej.

### B.2 Co zrobić

1. **Rozszerz routing** tak, żeby w rozmowach z dokumentacją pytania
   **wyszukujące** szły na `MODEL_SIMPLE`:
   - „do kiedy nabór?", „jakie załączniki?", „jaka jest maksymalna kwota
     dofinansowania?", „kto może składać wniosek?"
   - Dziś `chat/route.ts` ma na sztywno `hasScrapedDocumentation → COMPLEX`
     i w ogóle nie woła `classifyQuestion`. Trzeba to odblokować.
2. **Na Sonnecie zostają analiza kwalifikowalności i pisanie treści wniosku.**
   To jest sedno produktu; tam nie oszczędzamy. **Nigdy** nie przenoś na Haiku
   pisania wniosku ani oceny kwalifikowalności, nawet gdyby wyniki wyglądały
   dobrze.
3. **W trybie `ai_docs_mode = "full"` zostaw stare zachowanie: zawsze Sonnet.**
   Tam w prompcie dalej siedzi cała dokumentacja i mieszanie modeli mnoży zapisy
   do cache. Warunek w kodzie ma brzmieć „Haiku wolno tylko w trybie `ondemand`".
4. **Zmień zasadę 5 w `CLAUDE.md`** i decyzję w
   `dokumentacja-aplikacja-granty/README.md` — inaczej kod będzie sprzeczny
   z własną dokumentacją projektu. Nowe brzmienie ma opisywać podział
   „wyszukiwanie → Haiku, analiza i pisanie → Sonnet" **oraz** warunek, że wolno
   to robić wyłącznie przy małym prompcie (tryb `ondemand`).

### B.3 Pułapka, o której trzeba pamiętać

Klasyfikator (`classifyQuestion`) to dodatkowe wywołanie Haiku — dokłada
0,3–0,6 s czekania i własny koszt do **każdego** pytania. Przy pytaniu, które
i tak pójdzie na Sonneta, to czysta strata. Zmierz, czy oszczędność na pytaniach
wyszukujących przewyższa ten narzut; jeśli nie — rozważ heurystykę tekstową bez
wywołania AI (wzorem `looksLikeWritingTask` w `src/lib/ai/router.ts`).

Druga pułapka: narzędzia `przeczytaj_strone` i `szukaj_w_dokumentacji` muszą
działać tak samo na Haiku. Sprawdź, czy Haiku poprawnie wybiera strony ze spisu
— jeśli zaczyna zgadywać identyfikatory albo w ogóle nie sięga po narzędzia,
wróć z tą kategorią pytań na Sonneta i zamelduj.

### Weryfikacja Etapu B

- Testy jednostkowe routingu: pytania wyszukujące → Haiku, pytania o pisanie
  i kwalifikowalność → Sonnet, tryb `full` → zawsze Sonnet.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx vitest run src/lib`.
- Powtórz P1/P2/P3 z Etapu 0 (`17-koszty-i-latencja.md`) i porównaj z pomiarem
  z 2026-07-29 (P1 ≈ 0,16 zł, pierwsze słowo 7,3 s).
- **P1 na Haiku ma być tani (~0,04 zł) i szybki, ale odpowiedź musi być nadal
  konkretna i zgodna z dokumentami.** Jeśli Haiku zaczyna zgadywać terminy albo
  kwoty — wróć z tą kategorią pytań na Sonneta i zamelduj. To jest ważniejsze
  niż oszczędność.

---

## Czego NIE robić

- **Nie ruszaj kolejności rezerwacji pytania** (zasada 2). Zrównoleglenie
  dotyczy odczytów, nie rezerwacji.
- **Nie przenoś na Haiku pisania treści wniosku ani analizy kwalifikowalności** —
  to jest to, za co użytkownicy płacą.
- **Nie włączaj Haiku w trybie `full`** — przy dużym prompcie mieszanie modeli
  podnosi koszt zamiast go obniżać.
- **Nie usuwaj `contextBlob`, `buildSourceContext` ani trybu `full`** — to jest
  droga powrotu (zasada 5a).
- **Nie osłabiaj limitów darmowych pytań ani rate limitu** (zasada 3).
- Nie commituj plików, których treści nie widziałeś (repo jest **publiczne**).

---

## Po zakończeniu

1. Dopisz wpis do `STATUS.md` (data, co zrobione, wyniki pomiarów przed/po,
   co nieprzetestowane) — zgodnie z konwencją pozostałych wpisów.
2. Zaproponuj commit po polsku, osobny dla Etapu A i Etapu B.
3. Podaj właścicielowi kroki testowe w przeglądarce i **liczby**: ile trwało
   pytanie przed zmianą, ile po; ile kosztowało przed, ile po.
4. Jeśli po obu etapach pierwsze słowo nadal przekracza 3 s, **nie kombinuj
   dalej sam** — zamelduj i przedstaw opcje. Kolejnym kandydatem jest sama
   powolność Neona (w pomiarach `/api/me` po 0,5 s, `/api/conversations` po
   1–2,2 s), czyli temat spoza AI.
