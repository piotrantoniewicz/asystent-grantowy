# 12 — Etap 3.5: poprawki i zabezpieczenia (instrukcja wykonawcza)

> **Dla narzędzia AI wykonującego ten etap:** wykonuj kroki PO KOLEI, dokładnie
> tak, jak opisano. Po każdym kroku uruchom test z sekcji „Test kroku". Nie dodawaj
> bibliotek spoza tej instrukcji. Nie zmieniaj niczego, czego instrukcja nie każe
> zmieniać. Nie przebudowuj istniejących plików „od zera" — wprowadzaj punktowe
> zmiany. Jeśli coś nie działa, zatrzymaj się i opisz problem właścicielowi
> prostym językiem, zamiast improwizować.

Ten etap naprawia błędy z Etapów 1–3 i dodaje zabezpieczenia przed nadużyciami,
ZANIM powstanie scraping i płatności. Dokumentacja w plikach 02–05 i 08 jest już
zaktualizowana do stanu docelowego — w razie wątpliwości ona jest źródłem prawdy.

---

## Krok 0 — działanie WŁAŚCICIELA (zanim AI zacznie)

Właściciel zakłada darmowe konto na **neon.tech** (PostgreSQL w chmurze):
1. Zarejestruj się na https://neon.tech (plan Free wystarczy, nie podajesz karty).
2. Utwórz projekt np. `asystent-grantowy`.
3. Skopiuj **connection string** (zaczyna się od `postgresql://...`) i podaj go
   narzędziu AI, gdy o niego poprosi. Trafi do `.env.local` jako `DATABASE_URL`.

Neon Free ma limity (0,5 GB), które na długo wystarczą. Żadnych opłat bez
świadomej zmiany planu.

---

## Krok 1 — przejście z SQLite na PostgreSQL (Neon)

Powód: historia migracji Prisma jest zależna od typu bazy — im później zmiana,
tym boleśniejsza. Robimy to teraz, póki w bazie nie ma ważnych danych.

1. `npm uninstall @prisma/adapter-better-sqlite3` oraz
   `npm install @prisma/adapter-pg pg` i `npm install -D @types/pg`.
2. W `prisma/schema.prisma`: `datasource db { provider = "postgresql" }`
   (generator bez zmian).
3. W `src/lib/db.ts`: zamień adapter na `PrismaPg` z `@prisma/adapter-pg`,
   z `connectionString: process.env.DATABASE_URL`. Wzorzec singletona przez
   `globalThis` zostaje bez zmian.
4. W `.env.local` i `.env.local.example`: `DATABASE_URL` = adres z Neona
   (w example zostaw pusty z komentarzem „connection string z neon.tech").
   Do `.env.local.example` dopisz też `NEXT_PUBLIC_APP_URL="http://localhost:3000"`.
5. Usuń pliki lokalnej bazy SQLite (`dev.db` w katalogu głównym i w `prisma/`,
   jeśli są) oraz CAŁY folder `prisma/migrations` (stare migracje są w dialekcie
   SQLite — do Postgresa nie pasują).
6. Wykonaj pozostałe zmiany schematu z Kroku 2 i 3 (żeby zrobić JEDNĄ migrację),
   po czym: `npx prisma migrate dev --name init-postgres`.
7. W `package.json` dodaj skrypt: `"postinstall": "prisma generate"`
   (bez tego świeża instalacja i build na hostingu się wywalą, bo wygenerowany
   klient Prisma jest w `.gitignore`).

**Test kroku:** `npm run dev` działa; logowanie magic linkiem działa (tworzy
użytkownika w Neonie — sprawdź w `npx prisma studio`).

## Krok 2 — porządki w schemacie bazy

W `prisma/schema.prisma` (razem z migracją z Kroku 1):

1. **Usuń pole `isAdmin` z modelu `User`.** Jedynym źródłem uprawnień admina jest
   zmienna `ADMIN_EMAILS` (tak już działa `src/lib/auth.ts` — kodu auth nie ruszaj).
2. **`Purchase.stripeSessionId`** zmień na opcjonalne: `String? @unique`
   (rekord Purchase powstaje PRZED sesją Stripe, więc pole musi móc być puste).
3. **Dodaj model `FreeQuota`** (ochrona darmowego limitu przed nadużyciami):

```prisma
model FreeQuota {
  id        String   @id            // "device:<uuid>" lub "ip:<hash>:<RRRR-MM-DD>"
  used      Int      @default(0)
  updatedAt DateTime @updatedAt
}
```

**Test kroku:** `npx prisma migrate dev` przechodzi bez błędów; `npm run dev` działa.

## Krok 3 — ciasteczko urządzenia w `src/proxy.ts`

Cel: rozpoznawać komputer niezależnie od konta e-mail (wiele kont z jednego
komputera nie pomnoży darmowych pytań).

Przebuduj `src/proxy.ts` tak, żeby:
1. **Żądania do `/api/...` przepuszczał bez przekierowań** (`NextResponse.next()`)
   — każdy endpoint sam sprawdza sesję i zwraca 401 JSON. (Dotychczasowe
   przekierowanie API na stronę logowania było błędem i zepsułoby webhook Stripe
   w Etapie 5.)
2. Dla stron (nie-API) logika zostaje jak była: publiczne `/logowanie`,
   `/polityka-prywatnosci`, `/regulamin`, `/cookies`; reszta wymaga sesji,
   inaczej przekierowanie na `/logowanie` z `callbackUrl`.
3. **Na każdej odpowiedzi**: jeśli żądanie nie ma ciasteczka `ag_device`, ustaw je:
   wartość `crypto.randomUUID()`, `httpOnly: true`, `sameSite: "lax"`,
   `secure: process.env.NODE_ENV === "production"`, `path: "/"`,
   `maxAge: 60 * 60 * 24 * 400` (400 dni).

**Test kroku:** po otwarciu strony w przeglądarce w DevTools → Application →
Cookies widać `ag_device`. Wywołanie `curl -i localhost:3000/api/me` zwraca
401 JSON (nie przekierowanie 302).

## Krok 4 — moduł limitów `src/lib/quota.ts` (nowy plik)

Utwórz plik z logiką limitów. Eksportuj:

1. `export const MESSAGE_MAX_LENGTH = 50_000;` (znaków)
2. `export const RATE_LIMIT_PER_MINUTE = 4;`
3. `export const IP_FREE_QUESTIONS_PER_DAY = 30;`
4. `deviceQuotaKey(deviceId: string)` → `"device:" + deviceId`
5. `ipQuotaKey(ip: string, date: Date)` → `"ip:" + hash + ":" + RRRR-MM-DD`,
   gdzie `hash` to pierwsze 16 znaków hex z SHA-256 ciągu `ip + AUTH_SECRET`
   (moduł `node:crypto`; solimy sekretem, żeby nie przechowywać surowych IP — RODO).
6. `getClientIp(request: Request)` → pierwszy adres z nagłówka `x-forwarded-for`
   (przyciąć spacje), a gdy go brak — `"local"`.
7. `truncateForClassifier(text: string)` → pierwsze 500 znaków tekstu.
8. **`reserveQuestion(...)`** — serce etapu. Sygnatura:

```ts
export async function reserveQuestion(params: {
  userId: string;
  deviceId: string | null;   // z ciasteczka ag_device (null gdy brak)
  ip: string;
  freeLimit: number;         // z AppSetting free_questions_limit
}): Promise<"free" | "paid" | "no-quota" | "no-cookie">
```

Działanie — w JEDNEJ transakcji interaktywnej `prisma.$transaction(async (tx) => ...)`:

- **Ścieżka darmowa** (próbuj najpierw; wymaga `deviceId !== null`):
  1. `tx.user.updateMany({ where: { id: userId, freeQuestionsUsed: { lt: freeLimit } }, data: { freeQuestionsUsed: { increment: 1 } } })` — jeśli `count === 0`, darmowa pula użytkownika wyczerpana → przejdź do ścieżki płatnej.
  2. Upsert `FreeQuota` dla klucza urządzenia (`used: 0` przy tworzeniu), potem
     `tx.freeQuota.updateMany({ where: { id: deviceKey, used: { lt: freeLimit } }, data: { used: { increment: 1 } } })` — jeśli `count === 0`, urządzenie wyczerpało wspólną pulę → **rzuć wyjątek wycofujący transakcję** i przejdź do ścieżki płatnej (w osobnej transakcji).
  3. Analogicznie klucz IP na dziś z limitem `IP_FREE_QUESTIONS_PER_DAY`.
  4. Wszystko przeszło → zwróć `"free"`.
- **Ścieżka płatna**: `updateMany({ where: { id: userId, paidQuestionsRemaining: { gt: 0 } }, data: { paidQuestionsRemaining: { decrement: 1 } } })` — `count === 1` → `"paid"`; inaczej:
- gdy nic nie przeszło: `"no-cookie"` jeśli darmowa pula użytkownika była dostępna,
  ale `deviceId === null` (użytkownik ma zablokowane cookies); w pozostałych
  przypadkach `"no-quota"`.

9. **`refundQuestion(params: { userId, deviceId, ip, kind: "free" | "paid" })`** —
   odwrotność rezerwacji: dla `"free"` dekrementy `freeQuestionsUsed`, kluczy
   urządzenia i IP (nie schodzić poniżej 0 — warunek `gt: 0` w `updateMany`);
   dla `"paid"` increment `paidQuestionsRemaining`.

Dlaczego `updateMany` z warunkiem w `where`: to atomowe „sprawdź i zmień" —
dwa równoległe żądania nie przejdą obie kontroli limitu (dotychczasowy kod miał
taki wyścig).

**Test kroku:** patrz Krok 7 (testy jednostkowe) — na razie wystarczy, że
`npx tsc --noEmit` przechodzi.

## Krok 5 — przebudowa `src/app/api/chat/route.ts`

Kolejność działań w handlerze (zastąp obecną logikę, zachowując co się da):

1. Sesja → 401 (bez zmian).
2. Walidacja body; **dodatkowo**: gdy `message.length > MESSAGE_MAX_LENGTH` →
   400 `{ error: "Wiadomość jest za długa (maks. 50 000 znaków). Podziel ją na części." }`.
3. Rozmowa istnieje i należy do użytkownika → inaczej 404 (bez zmian).
4. **Rate limit**: policz wiadomości `role: "user"` z ostatnich 60 sekund we
   wszystkich rozmowach użytkownika
   (`prisma.message.count({ where: { role: "user", createdAt: { gte: ... }, conversation: { userId } } })`).
   Jeśli `>= RATE_LIMIT_PER_MINUTE` → 429
   `{ error: "Za dużo pytań w krótkim czasie. Odczekaj minutę." }`.
5. **Rezerwacja pytania**: `deviceId` z ciasteczka `ag_device`
   (`(await cookies()).get("ag_device")?.value ?? null`), IP z `getClientIp(request)`.
   Wynik:
   - `"no-quota"` → 403 `{ error: "Wykorzystano limit pytań.", buyUrl: "/pakiety" }`
   - `"no-cookie"` → 403 `{ error: "Darmowe pytania wymagają włączonych plików cookie. Włącz cookies albo kup pakiet.", buyUrl: "/pakiety" }`
   - `"free"` / `"paid"` → zapamiętaj do ewentualnego zwrotu.
6. Zapis wiadomości użytkownika + tytuł rozmowy przy pierwszej wiadomości (bez zmian).
7. **Router** (zmiana zasady — patrz `05-router-ai.md`):
   - jeśli rozmowa ma choć jedno `ScrapedSource` ze statusem `done` → **zawsze
     Sonnet** (`MODEL_COMPLEX`), bez wywołania klasyfikatora;
   - w przeciwnym razie klasyfikator jak dotąd, ALE każdą wiadomość kontekstu
     przepuść przez `truncateForClassifier` (500 znaków).
8. Streaming — przebuduj obsługę błędów:
   - zbieraj tekst z delt do zmiennej `responseText` i ustaw flagę
     `streamedAnything = true` przy pierwszej delcie;
   - **błąd zanim cokolwiek dotarło**: wyślij do strumienia
     `"Chwilowe przeciążenie, spróbuj za minutę."`, wykonaj `refundQuestion`,
     NIE zapisuj wiadomości asystenta;
   - **błąd w trakcie** (coś już dotarło): dopisz do strumienia
     `"\n\n[Odpowiedź została przerwana — możesz zadać pytanie ponownie.]"`,
     zapisz częściową odpowiedź do bazy, bez zwrotu pytania;
   - **`stop_reason === "refusal"`**: `refundQuestion` (odpowiedź i tak pokazujemy);
   - **zapisy do bazy po zakończeniu streamu ujmij w OSOBNY try/catch**: błąd
     zapisu → `console.error`, ale użytkownik NIE dostaje żadnego komunikatu
     o błędzie (odpowiedź już ma).
9. Usuwamy dotychczasowe zliczanie pytań po odpowiedzi (zastąpione rezerwacją
   z punktu 5).

**Test kroku (ręczny, z uruchomioną aplikacją):**
- zwykłe pytanie działa i licznik darmowych pytań spada o 1;
- wyślij 5 pytań szybko po sobie → piąte dostaje komunikat o odczekaniu;
- wklej > 50 000 znaków → czytelny błąd;
- w trybie incognito zaloguj się NA INNY e-mail → licznik darmowych pytań
  jest wspólny (ciasteczko `ag_device` jest per przeglądarka, więc incognito ma
  własne — do pełnego testu użyj tej samej zwykłej sesji przeglądarki z drugim
  kontem, wylogowując się i logując ponownie);
- usuń ciasteczko `ag_device` w DevTools i wyślij pytanie → proxy nada nowe
  ciasteczko przy wejściu na stronę; test „braku cookie" wykonaj przez `curl`
  z tokenem sesji bez ciasteczka `ag_device` → 403 z komunikatem o cookies.

## Krok 6 — poprawki w interfejsie (`src/components/chat/ChatApp.tsx`)

1. **Tytuł w pasku bocznym**: po wysłaniu pierwszej wiadomości w rozmowie ustaw
   lokalnie tytuł tej rozmowy na `text.slice(0, 60)` (obecnie do przeładowania
   strony wisi „Nowa rozmowa").
2. **Usuwanie rozmowy**: przy każdej pozycji listy przycisk „×"; po `confirm()`
   po polsku wywołaj `DELETE /api/conversations/[id]`, usuń z listy; jeśli
   usunięta była aktywna — wyczyść okno rozmowy.
3. **Obsługa 429 i 400**: pokaż `error` z odpowiedzi serwera w istniejącym
   miejscu na komunikaty (`limitError`), zamiast ogólnego „Wystąpił błąd".

**Test kroku:** pierwsza wiadomość od razu zmienia tytuł w pasku; usunięcie
rozmowy działa i pyta o potwierdzenie.

## Krok 7 — testy jednostkowe (vitest)

1. `npm install -D vitest` i skrypt `"test": "vitest run"` w `package.json`.
2. Plik `src/lib/quota.test.ts` z testami czystych funkcji:
   - `deviceQuotaKey` i `ipQuotaKey` budują oczekiwane klucze; `ipQuotaKey` dla
     tego samego IP i dnia jest stały, dla różnych IP różny, nie zawiera
     surowego IP;
   - `truncateForClassifier` przycina do 500 znaków i nie zmienia krótkich;
   - `getClientIp` bierze pierwszy adres z `x-forwarded-for` i zwraca `"local"`
     bez nagłówka.
   (Funkcji `reserveQuestion`/`refundQuestion` nie testujemy automatycznie w tym
   etapie — wymagają bazy; są sprawdzane ręcznie w Kroku 5.)

**Test kroku:** `npm test` — wszystko zielone.

## Krok 8 — sprzątanie i zapis

1. `npx tsc --noEmit` oraz `npm run lint` — bez błędów.
2. Przejdź ręcznie pełny scenariusz: logowanie → nowa rozmowa → pytanie SIMPLE
   → pytanie COMPLEX → limit/licznik spada → usunięcie rozmowy.
3. Zaktualizuj `STATUS.md` (odhacz Etap 3.5 z datą i notką co przetestowano).
4. Zaproponuj właścicielowi commit:
   „Etap 3.5 — Postgres (Neon), atomowe limity pytań, ochrona przed nadużyciami, poprawki czatu".

---

## Czego w tym etapie NIE robić

- NIE implementować scrapingu, płatności ani panelu admina (to Etapy 4, 5, 7).
- NIE dodawać bibliotek innych niż: `@prisma/adapter-pg`, `pg`, `@types/pg`, `vitest`.
- NIE zmieniać promptów w `src/lib/ai/prompts.ts`.
- NIE zmieniać logiki logowania w `src/lib/auth.ts` (poza tym, że nic z niej nie
  korzysta z usuwanego pola `isAdmin` — upewnij się tylko, że kompilacja przechodzi;
  typ `isAdmin` w `src/types/next-auth.d.ts` i callback sesji zostają, bo działają
  na `ADMIN_EMAILS`).
- NIE wyłączać `cache_control` na prompcie systemowym (dziś nic nie robi, bo prompt
  jest poniżej progu cache'owania, ale zacznie działać w Etapie 4 przy dokumentacji).
