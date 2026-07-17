# Przegląd kodu 2026-07-17 — instrukcja poprawek

Instrukcja dla modelu wykonującego poprawki. Wykonuj poprawki **po kolei, jedna na raz**,
w podanej kolejności (N1 → N11). Po każdej poprawce uruchom `npx tsc --noEmit` i sprawdź,
że nie ma błędów. Po poprawkach N1, N2 i N7 uruchom dodatkowo testy niezależne od bazy:
`npx vitest run src/lib/quota.test.ts src/lib/scraper/ssrf.test.ts src/lib/scraper/html.test.ts`.

**Zasady twarde:**

- **Nie uruchamiaj `npm test`** — test webhooka ma guard wymagający testowej bazy (P12
  z `13-audyt-poprawki.md`) i będzie padał; to oczekiwane, nie próbuj tego „naprawiać".
- Nie zmieniaj niczego poza zakresem danej poprawki. Nie refaktoryzuj „przy okazji".
- Nie zmieniaj stacku ani wersji bibliotek. Nie dodawaj nowych zależności.
- Migrację bazy (N3) uruchom komendą podaną w poprawce — nie edytuj ręcznie plików w
  `prisma/migrations/`.
- Sekcja „Zadania właściciela" na końcu jest **informacyjna** — nie próbuj wykonywać
  tych punktów w kodzie.
- Na końcu zaproponuj commit z opisem po polsku (nie commituj bez zgody właściciela)
  i dopisz wpis do `STATUS.md` wg tamtejszej konwencji.

Kontekst: te poprawki wynikają z przeglądu kodu z 2026-07-17. Aplikacja działa poprawnie —
to są usprawnienia odporności na błędy, kosztów i porządki, nie naprawa awarii.

---

## KRYTYCZNE

### N1. Budżet kontekstu — rozmowa może przekroczyć okno modelu

**Plik:** `src/app/api/chat/route.ts`

**Problem:** do modelu idzie naraz: zeskrapowana dokumentacja (do 600 000 znaków ≈ 170 tys.
tokenów), **cała** historia rozmowy (bez żadnego limitu) i rezerwacja 64 000 tokenów na
odpowiedź (`max_tokens` też liczy się do okna). Okno Sonneta to 200 tys. tokenów — przy
kilku źródłach i długiej rozmowie API zwróci błąd, a użytkownik straci pytanie.

**Docelowa arytmetyka** (zostaw ją w komentarzach w kodzie): 350 000 znaków dokumentacji
(≈ 100 tys. tokenów) + 100 000 znaków historii (≈ 30 tys. tokenów) + prompt systemowy
i bieżąca wiadomość (≈ 15 tys.) + 32 000 tokenów odpowiedzi = ~180 tys. < 200 tys. okna.

Trzy zmiany w tym pliku:

**a)** Znajdź linię:

```ts
const MAX_SCRAPED_CONTEXT_CHARS = 600_000; // ~170k tokenów
```

zamień na:

```ts
const MAX_SCRAPED_CONTEXT_CHARS = 350_000; // ~100k tokenów
```

**b)** Znajdź linię:

```ts
const maxTokens = modelClass === "SIMPLE" ? 2048 : 64000;
```

zamień na:

```ts
// 32k tokenów ≈ 24 tys. słów — z zapasem starcza na najdłuższy wniosek,
// a razem z kontekstem mieści się w oknie 200k (patrz komentarz przy MAX_HISTORY_CHARS).
const maxTokens = modelClass === "SIMPLE" ? 2048 : 32_000;
```

**c)** Znajdź blok budujący historię:

```ts
const history: Anthropic.MessageParam[] = conversation.messages.map((m) => ({
  role: m.role === "user" ? "user" : "assistant",
  content: m.content,
}));
```

zamień na:

```ts
// Budżet historii: 350k znaków dokumentacji + 100k historii + 32k tokenów odpowiedzi
// mieści się w oknie 200k tokenów. Ucinamy od NAJSTARSZYCH wiadomości.
const MAX_HISTORY_CHARS = 100_000;

let historyCharsLeft = MAX_HISTORY_CHARS;
const recentMessages: typeof conversation.messages = [];
for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
  const m = conversation.messages[i];
  if (m.content.length > historyCharsLeft) break;
  historyCharsLeft -= m.content.length;
  recentMessages.unshift(m);
}
// API wymaga, żeby pierwsza wiadomość w historii była od użytkownika.
while (recentMessages[0]?.role === "assistant") recentMessages.shift();

const history: Anthropic.MessageParam[] = recentMessages.map((m) => ({
  role: m.role === "user" ? "user" : "assistant",
  content: m.content,
}));
```

Uwaga: klasyfikator (`classifyQuestion`) dalej korzysta z `conversation.messages` —
**nie zmieniaj tego**, on i tak bierze tylko 3 ostatnie wiadomości ucięte do 500 znaków.

---

### N2. Utrata pytania przy błędzie po rezerwacji, a przed startem odpowiedzi

**Plik:** `src/app/api/chat/route.ts`

**Problem:** po udanej rezerwacji pytania (`reserveQuestion`) wykonują się jeszcze:
`getSystemPrompt()`, zapis wiadomości użytkownika, klasyfikacja i budowa zapytania.
Żaden z tych kroków nie jest objęty try/catch — jeśli któryś rzuci błąd, żądanie kończy
się 500, a pytanie **zostaje pobrane bez zwrotu**. Zwrot działa dziś tylko dla błędów
samego streamu.

**Zmiana:** obejmij try/catch cały fragment od linii `const systemPrompt = await
getSystemPrompt();` do utworzenia streamu włącznie. Struktura po zmianie (środek bloku
`try` to dotychczasowy kod **bez żadnych zmian** poza wcięciem; w miejscach `// ...bez
zmian...` przenieś istniejący kod):

```ts
let model: string;
let stream: ReturnType<typeof anthropic.messages.stream>;
try {
  const systemPrompt = await getSystemPrompt();

  const isFirstMessage = conversation.messages.length === 0;

  // ...bez zmian: zapis wiadomości użytkownika, tytuł rozmowy,
  // budowa historii (z N1), scrapedContent, classifyQuestion...

  model = modelClass === "SIMPLE" ? MODEL_SIMPLE : MODEL_COMPLEX;
  const maxTokens = modelClass === "SIMPLE" ? 2048 : 32_000;

  // ...bez zmian: systemBlocks...

  stream = anthropic.messages.stream({
    // ...bez zmian: dotychczasowe argumenty...
  });
} catch (error) {
  console.error("Błąd przygotowania odpowiedzi:", error);
  await refundQuestion({ userId, deviceId, ip, kind: reservation }).catch(
    (refundError) => console.error("Błąd zwrotu pytania:", refundError),
  );
  return NextResponse.json(
    { error: "Chwilowy problem z serwisem. Pytanie wróciło do Twojej puli." },
    { status: 500 },
  );
}
```

Ważne szczegóły:

- `const stream = ...` i `const model = ...` zmieniają się w przypisania do `let`
  zadeklarowanych **przed** `try` (patrz wyżej) — bo `stream` i `model` są używane
  później, wewnątrz `ReadableStream`. TypeScript nie zgłosi „used before assigned",
  bo `catch` kończy się `return`.
- **Nie przenoś** do `try` samej rezerwacji ani sprawdzania limitów — one mają zostać
  tam, gdzie są.
- Reszta funkcji (`ReadableStream`, zwrot `Response`) — bez zmian.

**Weryfikacja:** `npx tsc --noEmit` bez błędów.

---

### N3. Brak indeksów w bazie danych

**Plik:** `prisma/schema.prisma`

**Problem:** PostgreSQL **nie tworzy automatycznie** indeksów dla kolumn relacji (robi to
tylko dla `@unique`/`@id`). Bez nich każde wczytanie rozmowy, lista rozmów, rate limit
i statystyki admina to pełny skan tabeli — przy większej liczbie danych aplikacja
wyraźnie zwolni.

**Zmiana:** dodaj linie `@@index` do modeli (każdą na końcu bloku modelu, obok
istniejących `@@unique`, jeśli są):

- model `Conversation`:

  ```prisma
  @@index([userId, updatedAt])
  ```

- model `Message`:

  ```prisma
  @@index([conversationId, createdAt])
  @@index([role, createdAt])
  ```

  (pierwszy: wczytywanie wiadomości rozmowy; drugi: rate limit 4/min i wykres dzienny
  w panelu admina)

- model `ScrapedSource`:

  ```prisma
  @@index([conversationId])
  @@index([rootUrl])
  ```

  (drugi: wyszukiwanie ostatniego udanego pobrania tej samej strony — U10)

- model `ScrapedPage`:

  ```prisma
  @@index([sourceId])
  ```

- model `Purchase`:

  ```prisma
  @@index([userId])
  ```

Niczego innego w schemacie nie zmieniaj. Potem uruchom:

```
npx prisma migrate dev --name add_indexes
```

**Weryfikacja:** migracja przechodzi bez błędów; w nowym pliku w `prisma/migrations/`
są wyłącznie polecenia `CREATE INDEX` (żadnych `ALTER TABLE` zmieniających kolumny —
jeśli są, zatrzymaj się i zgłoś właścicielowi).

---

## WAŻNE

### N4. Tabela `FreeQuota` rośnie w nieskończoność

**Pliki:** `src/lib/quota.ts` i `src/app/api/chat/route.ts`

**Problem:** klucze dzienne (`ip:<hash>:<data>` i `login:<hash>:<data>`) nigdy nie są
kasowane — po roku to dziesiątki tysięcy martwych wierszy.

**UWAGA — najważniejsza rzecz w tej poprawce:** kluczy `device:<uuid>` **nie wolno
kasować nigdy**. To trwała pula darmowych pytań na urządzenie — jej skasowanie
zresetowałoby limit i otworzyło furtkę do nadużyć. Dlatego warunek kasowania musi
filtrować po prefiksie klucza, nie tylko po dacie.

**a)** Na końcu `src/lib/quota.ts` dodaj:

```ts
/**
 * Kasuje przeterminowane klucze DZIENNE (ip:..., login:...) z tabeli FreeQuota.
 * Kluczy device:... NIE kasujemy — to trwała pula na urządzenie.
 */
export async function cleanupOldFreeQuota(): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await prisma.freeQuota.deleteMany({
    where: {
      updatedAt: { lt: cutoff },
      OR: [{ id: { startsWith: "ip:" } }, { id: { startsWith: "login:" } }],
    },
  });
}
```

**b)** W `src/app/api/chat/route.ts`, tuż przed końcowym `return new Response(responseBody, ...)`,
dodaj wywołanie „odpal i zapomnij" (celowo bez `await` — sprzątanie nie może opóźniać
odpowiedzi ani jej wywracać):

```ts
// Sprzątanie starych dziennych limitów — w tle, błędy ignorujemy.
void cleanupOldFreeQuota().catch(() => {});
```

Dodaj `cleanupOldFreeQuota` do istniejącego importu z `@/lib/quota`.

---

### N5. Osierocone zakupy `pending`, gdy Stripe zwróci błąd

**Plik:** `src/app/api/checkout/route.ts`

**Problem:** rekord `Purchase(pending)` powstaje przed utworzeniem sesji Stripe. Jeśli
`stripe.checkout.sessions.create` rzuci błąd (awaria Stripe, zły klucz), użytkownik
dostaje 500, a wpis wisi w bazie jako `pending` na zawsze — zaśmieca statystyki.

**Zmiana:** wywołanie Stripe obejmij try/catch; przy błędzie oznacz zakup jako `failed`
i zwróć czytelny błąd. Znajdź:

```ts
const checkoutSession = await stripe.checkout.sessions.create({
```

i przekształć na (argumenty `create` bez zmian):

```ts
let checkoutSession;
try {
  checkoutSession = await stripe.checkout.sessions.create({
    // ...dotychczasowe argumenty bez zmian...
  });
} catch (error) {
  console.error("Stripe: nie udało się utworzyć sesji płatności", error);
  await prisma.purchase
    .update({ where: { id: purchase.id }, data: { status: "failed" } })
    .catch(() => {});
  return NextResponse.json(
    { error: "Nie udało się rozpocząć płatności. Spróbuj ponownie za chwilę." },
    { status: 502 },
  );
}
```

---

### N6. Licznik darmowych pytań w `/api/me` kłamie

**Plik:** `src/app/api/me/route.ts`

**Problem:** licznik pokazuje tylko pulę konta (`freeQuestionsUsed`), a serwer przy
pytaniu sprawdza jeszcze pulę urządzenia i dzienną pulę IP. Użytkownik widzi „3 darmowe",
klika i dostaje odmowę — mylące.

**Zmiana:** zwracaj minimum ze wszystkich trzech pul. Cały plik po zmianie:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFreeQuestionsLimit } from "@/lib/settings";
import {
  IP_FREE_QUESTIONS_PER_DAY,
  deviceQuotaKey,
  getClientIp,
  ipQuotaKey,
} from "@/lib/quota";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz się zalogować." }, { status: 401 });
  }

  const [user, freeQuestionsLimit] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { email: true, freeQuestionsUsed: true, paidQuestionsRemaining: true },
    }),
    getFreeQuestionsLimit(),
  ]);

  // Darmowe pytania ogranicza najciaśniejsza z trzech pul: konto, urządzenie, IP/dzień.
  // Bez ciasteczka urządzenia ścieżka darmowa jest w ogóle niedostępna (patrz quota.ts).
  const deviceId = (await cookies()).get("ag_device")?.value ?? null;
  let freeQuestionsRemaining = Math.max(
    0,
    freeQuestionsLimit - user.freeQuestionsUsed,
  );
  if (deviceId) {
    const [deviceQuota, ipQuota] = await Promise.all([
      prisma.freeQuota.findUnique({ where: { id: deviceQuotaKey(deviceId) } }),
      prisma.freeQuota.findUnique({
        where: { id: ipQuotaKey(getClientIp(request), new Date()) },
      }),
    ]);
    freeQuestionsRemaining = Math.min(
      freeQuestionsRemaining,
      Math.max(0, freeQuestionsLimit - (deviceQuota?.used ?? 0)),
      Math.max(0, IP_FREE_QUESTIONS_PER_DAY - (ipQuota?.used ?? 0)),
    );
  } else {
    freeQuestionsRemaining = 0;
  }

  return NextResponse.json({
    email: user.email,
    freeQuestionsRemaining,
    paidQuestionsRemaining: user.paidQuestionsRemaining,
  });
}
```

---

## PORZĄDKI

### N7. Martwa logika w parserze robots.txt

**Plik:** `src/lib/scraper/robots.ts`

**Problem:** zmienna `appliesToUs` niczego nie zmienia — oba warianty na końcu funkcji
zwracają dokładnie to samo (`{ disallow }`). To mylący szum.

**Zmiana:** w `parseRobotsTxt` usuń: deklarację `let appliesToUs = false;`, linię
`if (value === "*") appliesToUs = true;` oraz warunek
`if (!appliesToUs && disallow.length === 0) return { disallow: [] };`.
Funkcja ma kończyć się po prostu `return { disallow };`. Zachowanie się nie zmienia.

---

### N8. Zdublowany komunikat błędu scrapowania

**Pliki:** nowy `src/lib/scraper/messages.ts`, `src/app/api/scrape/route.ts`,
`src/components/chat/ChatApp.tsx`

**Problem:** ten sam tekst „Nie udało się pobrać treści z tej strony…" jest zaszyty na
sztywno w dwóch miejscach (serwer i UI). Zmiana w jednym miejscu rozjedzie komunikaty.

**a)** Utwórz `src/lib/scraper/messages.ts` (czysty moduł ze stałą — bez importów,
żeby mógł go używać także komponent kliencki):

```ts
// Wspólny komunikat serwera i UI — zmieniaj tylko tutaj.
export const SCRAPE_FAILED_MESSAGE =
  "Nie udało się pobrać treści z tej strony. Spróbuj wkleić link bezpośrednio do dokumentu z regulaminem (najczęściej plik PDF).";
```

**b)** W `src/app/api/scrape/route.ts` zaimportuj stałą i użyj jej w bloku wysyłającym
`event: "error"` po `result.pages.length === 0` (zamiast literału z tym tekstem).

**c)** W `src/components/chat/ChatApp.tsx` zaimportuj stałą i użyj jej w karcie źródła
przy `item.source.status === "error"` (zamiast literału z tym samym tekstem).

Drugiego komunikatu błędu w `scrape/route.ts` („Wystąpił błąd podczas pobierania
strony…" w bloku `catch`) **nie ruszaj** — to inny przypadek.

---

### N9. Usunięcie resztek po szablonie create-next-app

**Folder:** `public/`

Usuń nieużywane pliki: `public/next.svg`, `public/vercel.svg`, `public/globe.svg`,
`public/file.svg`, `public/window.svg`.

**Weryfikacja przed usunięciem** (obowiązkowa): sprawdź, że żaden z nich nie jest
nigdzie użyty, np. `grep -rn "next.svg\|vercel.svg\|globe.svg\|file.svg\|window.svg" src content`
— wynik ma być pusty. `public/favicon`-a nie ma na tej liście — nie dotykaj niczego
poza pięcioma wymienionymi plikami.

---

## OPCJONALNE (zrób, jeśli poprzednie poszły gładko)

### N10. Statystyki admina liczone w bazie zamiast w pamięci

**Plik:** `src/lib/admin/stats.ts`

**Problem:** `getAdminStats` pobiera **wszystkie** wiadomości asystenta do pamięci, żeby
zsumować tokeny. Przy tysiącach rozmów zrobi się wolne i pamięciożerne.

**Zmiana:** zastąp zapytanie `assistantMessages` (i pętlę po nim) agregacją:

```ts
prisma.message.groupBy({
  by: ["modelUsed"],
  where: { role: "assistant", modelUsed: { not: null } },
  _count: { _all: true },
  _sum: {
    inputTokens: true,
    outputTokens: true,
    cacheCreationInputTokens: true,
    cacheReadInputTokens: true,
  },
}),
```

a liczenie kosztu przenieś na wyniki grupowania (jedna iteracja po modelach zamiast po
wiadomościach):

```ts
const modelUsage: Record<string, number> = {};
let estimatedAiCostUsd = 0;

for (const row of assistantMessagesByModel) {
  const model = row.modelUsed!;
  modelUsage[model] = row._count._all;

  const pricing = PRICING_USD_PER_MTOK[model];
  if (!pricing) continue;

  const billedInputTokens =
    (row._sum.inputTokens ?? 0) +
    (row._sum.cacheCreationInputTokens ?? 0) * CACHE_WRITE_MULTIPLIER +
    (row._sum.cacheReadInputTokens ?? 0) * CACHE_READ_MULTIPLIER;

  estimatedAiCostUsd +=
    (billedInputTokens * pricing.input) / 1_000_000 +
    ((row._sum.outputTokens ?? 0) * pricing.output) / 1_000_000;
}
```

Wynikowa struktura `AdminStats` ma zostać **identyczna** — to czysta optymalizacja.
Zapytania o `dailyQuestions` nie ruszaj (30 dni to bezpiecznie mała próbka).

**Weryfikacja:** wejdź na `/admin` (albo `GET /api/admin/stats` z sesją admina) i
porównaj liczby przed/po zmianie — muszą się zgadzać.

---

### N11. Czego celowo NIE poprawiamy (nie ruszaj)

Żeby nie kusiło — poniższe znane niedoskonałości zostają świadomie:

- **Rate limit 4/min nie jest atomowy** (policz → działaj). Równoległe żądania mogą go
  minimalnie przekroczyć, ale pytania i tak są rezerwowane atomowo — zysk z naprawy
  nie wart ryzyka.
- **Ograniczniki grzeczności scrapera** (2 równoległe pobrania, 300 ms/domenę, cache
  robots.txt) żyją w pamięci procesu — na serverless liczą się per instancja. Znane,
  akceptowane.
- **`ChatApp.tsx` ma ~730 linii** — podział na komponenty przy następnej większej
  pracy nad czatem, nie teraz.
- **DNS-rebinding w SSRF** — świadomie zaakceptowane, komentarz w `ssrf.ts`.

---

## Po wykonaniu wszystkich poprawek

1. `npx tsc --noEmit` — bez błędów.
2. `npm run lint` — bez błędów.
3. `npx vitest run src/lib/quota.test.ts src/lib/scraper/ssrf.test.ts src/lib/scraper/html.test.ts`
   — wszystkie zielone (**nie** `npm test` — patrz zasady na górze).
4. `npm run build` — przechodzi.
5. Test w przeglądarce (`npm run dev`): zadaj pytanie w czacie (odpowiedź streamuje się
   normalnie), sprawdź licznik pytań w panelu bocznym, wejdź na `/admin` i porównaj
   statystyki, kliknij „Kup pakiet" do momentu przekierowania do Stripe (bez płacenia).
6. Dopisz wpis do `STATUS.md` (data, numery N1–N10, co zweryfikowano) i zaproponuj
   właścicielowi commit z opisem po polsku.

## Zadania właściciela (poza kodem — NIE wykonuj ich jako model)

- **Testowa baza:** utworzyć w Neon branch o nazwie zawierającej „test" i podać jego
  connection string do testów — bez tego `npm test` (test webhooka) pozostaje wyłączony
  guardem P12.
- **Monitoring:** po wdrożeniu włączyć powiadomienia o błędach w Vercelu (docelowo
  rozważyć darmowy plan Sentry) — dziś błędy widać tylko w logach.
- **Plan hostingu:** sprawdzić przy wdrożeniu, czy plan Vercela obsługuje
  `maxDuration = 300` w `/api/chat` i `/api/scrape` (na darmowym wymaga włączonego
  „fluid compute").
