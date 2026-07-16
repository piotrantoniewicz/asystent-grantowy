# Audyt kodu 2026-07-16 — instrukcja poprawek

Instrukcja dla modelu wykonującego poprawki. Wykonuj poprawki **po kolei, jedna na raz**.
Po każdej poprawce uruchom `npx tsc --noEmit` i sprawdź, że nie ma błędów.
**Nie uruchamiaj `npm test` bez zgody właściciela** — test webhooka pisze do prawdziwej bazy (patrz P12).
Nie zmieniaj niczego poza zakresem danej poprawki. Nie zmieniaj stacku ani wersji bibliotek.

---

## KRYTYCZNE

### P1. Webhook Stripe dolicza pytania przed otrzymaniem pieniędzy (płatności asynchroniczne, np. Przelewy24)

**Plik:** `src/app/api/stripe/webhook/route.ts`

Zdarzenie `checkout.session.completed` może przyjść z `payment_status: "unpaid"`, gdy klient
płaci metodą asynchroniczną (Przelewy24, przelew bankowy — w Polsce bardzo częste).
Obecny kod dolicza pytania od razu, nawet jeśli pieniądze nigdy nie dotrą.

**Zmień blok:**

```ts
if (event.type === "checkout.session.completed") {
  await applyCheckoutSessionCompleted(event.data.object);
}
```

**na:**

```ts
if (
  event.type === "checkout.session.completed" ||
  event.type === "checkout.session.async_payment_succeeded"
) {
  const checkoutSession = event.data.object;
  if (checkoutSession.payment_status === "paid") {
    await applyCheckoutSessionCompleted(checkoutSession);
  }
}

if (
  event.type === "checkout.session.async_payment_failed" ||
  event.type === "checkout.session.expired"
) {
  const purchaseId = event.data.object.metadata?.purchaseId;
  if (purchaseId) {
    await prisma.purchase.updateMany({
      where: { id: purchaseId, status: "pending" },
      data: { status: "failed" },
    });
  }
}
```

Dodaj import: `import { prisma } from "@/lib/db";`

Po wdrożeniu właściciel musi w panelu Stripe dopisać do webhooka zdarzenia:
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`.

---

### P2. Brak jakiegokolwiek limitu scrapowania — otwarta furtka kosztowa

**Plik:** `src/app/api/scrape/route.ts`

Każdy zalogowany użytkownik może scrapować nieskończenie wiele stron: każdy scrape to praca
serwera (crawler) + płatne wywołanie AI (podsumowanie na Haiku), a scrapowanie **nie zużywa
pytania**. Dodatkowo im więcej źródeł w rozmowie, tym większy (droższy) kontekst czatu.

Po walidacji `assertSafeUrl`, a **przed** `prisma.scrapedSource.create(...)` dodaj:

```ts
const MAX_SOURCES_PER_CONVERSATION = 5;
const MAX_SCRAPES_PER_HOUR = 10;

const sourcesInConversation = await prisma.scrapedSource.count({
  where: { conversationId },
});
if (sourcesInConversation >= MAX_SOURCES_PER_CONVERSATION) {
  return NextResponse.json(
    {
      error:
        "W tej rozmowie można przeanalizować maksymalnie 5 stron. Zacznij nową rozmowę.",
    },
    { status: 400 },
  );
}

const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
const recentScrapes = await prisma.scrapedSource.count({
  where: {
    createdAt: { gte: oneHourAgo },
    conversation: { userId },
  },
});
if (recentScrapes >= MAX_SCRAPES_PER_HOUR) {
  return NextResponse.json(
    { error: "Za dużo analiz stron w krótkim czasie. Odczekaj godzinę." },
    { status: 429 },
  );
}
```

---

### P3. Zawyżone ceny modelu w statystykach admina

**Plik:** `src/lib/admin/stats.ts`

Cennik `claude-sonnet-5` to **$3 input / $15 output za 1M tokenów** (do 2026-08-31 obowiązuje
cena wprowadzająca $2/$10). W kodzie jest $5/$25 — koszt AI w panelu jest zawyżony ~67%.

Zmień:

```ts
const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 5, output: 25 },
};
```

na:

```ts
// Ceny standardowe; do 2026-08-31 Sonnet 5 ma cenę wprowadzającą 2/10 USD za MTok.
const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 3, output: 15 },
};
```

---

### P4. Pobieranie plików bez limitu w trakcie transferu (ryzyko wyczerpania pamięci)

**Plik:** `src/lib/scraper/fetch.ts`

`await response.arrayBuffer()` wczytuje **całe** body do pamięci zanim sprawdzany jest rozmiar.
Serwer, który nie wysyła nagłówka `content-length`, może wysłać gigabajty i zabić proces.
Dodatkowo timeout jest kasowany zaraz po nagłówkach, więc powolne body może wisieć bez końca.

Zmiany:

1. Usuń `clearTimeout(timeout)` z bloku `finally` po `fetch(...)` — timeout ma obejmować też
   czytanie body.
2. Zastąp fragment od `const contentLength = ...` do `const body = await response.arrayBuffer();`
   czytaniem strumieniowym:

```ts
const contentLength = response.headers.get("content-length");
if (contentLength && Number(contentLength) > maxBytes) {
  clearTimeout(timeout);
  return { ok: false, error: "Plik jest za duży." };
}

if (!response.body) {
  clearTimeout(timeout);
  return { ok: false, error: "Pusta odpowiedź serwera." };
}

const reader = response.body.getReader();
const chunks: Uint8Array[] = [];
let received = 0;
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      controller.abort();
      return { ok: false, error: "Plik jest za duży." };
    }
    chunks.push(value);
  }
} catch {
  return { ok: false, error: "Przerwano pobieranie strony." };
} finally {
  clearTimeout(timeout);
}

const body = new Uint8Array(received);
let offset = 0;
for (const chunk of chunks) {
  body.set(chunk, offset);
  offset += chunk.byteLength;
}
```

3. Zmień typ `body` w `SafeFetchResult` z `ArrayBuffer` na `Uint8Array` i w miejscu zwrotu
   podaj `body` (nowy `Uint8Array`). Następnie popraw miejsca użycia:
   - `src/lib/scraper/crawl.ts`: `new TextDecoder().decode(fetched.body)` działa z `Uint8Array`
     bez zmian; `extractPdfText(fetched.body)` — patrz punkt 4.
   - `src/lib/scraper/robots.ts`: `decode(result.body)` — bez zmian.
   - `src/lib/scraper/pdf.ts`: zmień sygnaturę na
     `export async function extractPdfText(buffer: Uint8Array): Promise<ExtractedPdf>` i
     w środku `getDocumentProxy(new Uint8Array(buffer))` zostaw bez zmian (kopia jest OK).
4. Uruchom `npx tsc --noEmit` i popraw ewentualne pozostałe błędy typów.

---

## WYSOKIE

### P5. Brak łącznego limitu kontekstu w czacie (koszty + ryzyko przepełnienia)

**Plik:** `src/app/api/chat/route.ts`

Do prompta trafiają **wszystkie strony ze wszystkich źródeł** rozmowy. Jedno źródło ma budżet
~350 000 znaków, ale suma źródeł nie jest limitowana. Po P2 (maks. 5 źródeł) to nadal
potencjalnie ~1,75 mln znaków (~500k tokenów) na każde pytanie.

Zastąp budowanie `scrapedContent`:

```ts
const scrapedContent = conversation.scrapedSources
  .flatMap((source) => source.pages)
  .map((page) => `### ${page.title} (${page.url})\n${page.textContent}`)
  .join("\n\n");
```

wersją z twardym budżetem:

```ts
const MAX_SCRAPED_CONTEXT_CHARS = 600_000; // ~170k tokenów

let scrapedBudget = MAX_SCRAPED_CONTEXT_CHARS;
const scrapedParts: string[] = [];
for (const source of conversation.scrapedSources) {
  for (const page of source.pages) {
    if (scrapedBudget <= 0) break;
    const part = `### ${page.title} (${page.url})\n${page.textContent}`;
    if (part.length > scrapedBudget) {
      scrapedParts.push(part.slice(0, scrapedBudget));
      scrapedBudget = 0;
    } else {
      scrapedParts.push(part);
      scrapedBudget -= part.length;
    }
  }
}
const scrapedContent = scrapedParts.join("\n\n");
```

---

### P6. Brak cache'owania historii rozmowy (niepotrzebne koszty przy każdej wiadomości)

**Plik:** `src/app/api/chat/route.ts`

Jest breakpoint cache tylko na zeskrapowanej dokumentacji. Historia wiadomości nie jest
cache'owana, więc przy każdym kolejnym pytaniu cała rozmowa jest liczona po pełnej stawce.
Cache read kosztuje ~10% ceny wejścia.

Zmień wywołanie streamu — ostatnia wiadomość użytkownika ma dostać `cache_control`:

```ts
const stream = anthropic.messages.stream({
  model,
  max_tokens: maxTokens,
  system: systemBlocks,
  messages: [
    ...history,
    {
      role: "user",
      content: [
        {
          type: "text",
          text: messageText,
          cache_control: { type: "ephemeral" },
        },
      ],
    },
  ],
  ...(modelClass === "COMPLEX" ? { thinking: { type: "adaptive" as const } } : {}),
});
```

Typ elementu content: `Anthropic.TextBlockParam`. Nic więcej nie zmieniaj — przy krótkich
rozmowach poniżej minimalnej długości prefiksu cache po prostu (bezszkodowo) się nie utworzy.

---

### P7. Cichy fallback na płatną pulę przy błędzie bazy w rezerwacji pytania

**Plik:** `src/lib/quota.ts`, funkcja `reserveQuestion`

Blok `catch` wokół transakcji darmowej puli łapie **wszystkie** błędy — także awarię bazy —
i w takiej sytuacji po cichu pobiera pytanie z puli **płatnej**. Błąd inny niż wyczerpanie
limitu ma być rzucony dalej.

Zmień `catch {` na:

```ts
} catch (error) {
  const message = error instanceof Error ? error.message : "";
  if (message !== "device-exhausted" && message !== "ip-exhausted") {
    throw error;
  }
  // ścieżka darmowa wyczerpana (urządzenie lub IP) — przejdź do płatnej
}
```

Dodatkowo w `src/app/api/chat/route.ts` owiń wywołanie `reserveQuestion` w try/catch i przy
błędzie zwróć status 500 z komunikatem „Chwilowy problem z serwisem. Spróbuj za chwilę."
(bez pobierania pytania).

---

### P8. Rozszerzenie blokady adresów prywatnych (SSRF)

**Plik:** `src/lib/scraper/ssrf.ts`

Blocklista IPv4 nie obejmuje kilku zakresów specjalnych, a IPv6 nie blokuje wszystkich
adresów mapowanych `::ffff:` na prywatne IPv4.

1. Rozszerz `BLOCKED_V4_RANGES` o:

```ts
["100.64.0.0", 10],  // CGNAT
["192.0.0.0", 24],   // IETF
["192.0.2.0", 24],   // TEST-NET
["198.18.0.0", 15],  // benchmarking
["224.0.0.0", 4],    // multicast
["240.0.0.0", 4],    // reserved + broadcast
```

2. Zastąp ręczną listę prefiksów `::ffff:` w `isBlockedV6` ogólnym mapowaniem — na początku
   funkcji dodaj:

```ts
const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
if (mapped) return isBlockedV4(mapped[1]);
```

   i usuń trzy linie `normalized.startsWith("::ffff:...")`.

3. Znana pozostałość (świadomie akceptowana, wpisz w komentarz w pliku): między `assertSafeUrl`
   a właściwym `fetch` DNS jest rozwiązywany drugi raz (teoretyczny atak DNS-rebinding).
   Pełna ochrona wymaga przypięcia IP w warstwie HTTP — poza zakresem tej poprawki.

---

### P9. Panel boczny czatu w ogóle niewidoczny na telefonie

**Plik:** `src/components/chat/ChatApp.tsx`

`<aside>` ma klasy `hidden ... sm:flex` — na ekranie węższym niż 640px użytkownik **nie ma**
przycisku „Nowa rozmowa", pól do analizy stron, listy rozmów ani licznika pytań. Aplikacja
na telefonie jest praktycznie bezużyteczna.

Zaimplementuj wysuwany panel (drawer):

1. Dodaj stan: `const [sidebarOpen, setSidebarOpen] = useState(false);`
2. Nad `<aside>` dodaj przycisk widoczny tylko na mobile (np. w lewym górnym rogu obszaru
   czatu): `☰ Menu`, klasa `sm:hidden`, `onClick={() => setSidebarOpen(true)}`.
3. Zmień klasy `<aside>` tak, by na mobile był pozycjonowany jako nakładka:
   - gdy `sidebarOpen`: `fixed inset-y-0 left-0 z-40 flex w-72 ...` + półprzezroczyste tło
     za panelem (`<div className="fixed inset-0 z-30 bg-black/30 sm:hidden" onClick={() => setSidebarOpen(false)} />`),
   - gdy zamknięty: obecne `hidden sm:flex`.
4. Po wybraniu rozmowy (`setActiveId`) i po `handleNewConversation()` wywołaj
   `setSidebarOpen(false)`.
5. Sprawdź wizualnie na szerokości ~375px (`npm run dev`, tryb responsywny w przeglądarce).

---

### P10. Odpowiedzi asystenta nie renderują Markdownu

**Plik:** `src/components/chat/ChatApp.tsx`

Biblioteki `react-markdown` i `remark-gfm` są już w projekcie (używane na stronach prawnych),
ale wiadomości asystenta wyświetlają się jako goły tekst z `**gwiazdkami**`, `#` itd.

1. Dodaj importy:

```ts
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
```

2. W renderze wiadomości (`timeline.map(...)`) rozdziel role: wiadomość użytkownika zostaje
   jak jest (`whitespace-pre-wrap` + `{item.message.content}`), a dla asystenta:

```tsx
<div className="mr-auto max-w-[80%] rounded-2xl bg-primary-soft px-4 py-2 text-sm text-foreground [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc">
  <ReactMarkdown remarkPlugins={[remarkGfm]}>
    {item.message.content}
  </ReactMarkdown>
</div>
```

3. Sprawdź w przeglądarce, że listy, pogrubienia i tabele wyglądają sensownie; jeśli
   w projekcie jest plugin typography Tailwinda, można zamiast tego użyć klasy `prose prose-sm`.

---

### P11. Brak `maxDuration` w endpoincie czatu

**Plik:** `src/app/api/chat/route.ts`

Odpowiedź COMPLEX (Sonnet, do 64k tokenów + thinking) może trwać kilka minut. Endpoint scrape
ma już `maxDuration = 300`, czat nie ma — po wdrożeniu na Vercel odpowiedź zostanie ucięta
domyślnym limitem funkcji.

Dodaj pod importami:

```ts
export const maxDuration = 300;
```

---

## ŚREDNIE

### P12. `npm test` pisze do prawdziwej bazy danych

**Plik:** `src/lib/stripe/webhook.test.ts`

Test integracyjny tworzy i kasuje rekordy w bazie wskazanej przez `DATABASE_URL` z `.env.local`
— czyli w bazie deweloperskiej/produkcyjnej. Na początku pliku (przed `describe`) dodaj guard:

```ts
if (!process.env.DATABASE_URL?.includes("test")) {
  throw new Error(
    "Test webhooka wymaga testowej bazy danych. Ustaw DATABASE_URL wskazujący na bazę z 'test' w nazwie (np. osobny branch w Neon).",
  );
}
```

Poinformuj właściciela: trzeba utworzyć w Neon branch/bazę o nazwie zawierającej „test"
i uruchamiać testy z jej connection stringiem (np. `DATABASE_URL=... npm test`).

---

### P13. Nieatomowa korekta pytań w panelu admina

**Plik:** `src/app/api/admin/users/[id]/adjust/route.ts`

Odczyt → obliczenie → zapis może zgubić równoległą zmianę (np. użytkownik właśnie zużywa
pytanie). Owiń logikę w transakcję z poziomem `Serializable`:

```ts
const result = await prisma.$transaction(
  async (tx) => {
    const user = await tx.user.findUnique({
      where: { id },
      select: { email: true, paidQuestionsRemaining: true },
    });
    if (!user) return null;
    const newRemaining = Math.max(0, user.paidQuestionsRemaining + questions);
    await tx.user.update({
      where: { id },
      data: { paidQuestionsRemaining: newRemaining },
    });
    return { email: user.email, newRemaining };
  },
  { isolationLevel: "Serializable" },
);
if (!result) {
  return NextResponse.json({ error: "Nie znaleziono użytkownika." }, { status: 404 });
}
```

Dostosuj `console.log` i odpowiedź do `result`.

---

### P14. Wyścig przy pierwszym zapisie ustawień (`getOrSeedSetting`)

**Plik:** `src/lib/settings.ts`

Dwa równoległe pierwsze requesty mogą oba wejść w `create` — drugi dostanie błąd unikalności.
Zmień `create` na `upsert`:

```ts
async function getOrSeedSetting(key: string, defaultValue: string) {
  const existing = await prisma.appSetting.findUnique({ where: { key } });
  if (existing) return existing.value;

  const setting = await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: defaultValue },
    update: {},
  });
  return setting.value;
}
```

---

### P15. Brak zabezpieczenia przy braku `AUTH_SECRET` w haszu IP

**Plik:** `src/lib/quota.ts`, funkcja `ipQuotaKey`

`ip + process.env.AUTH_SECRET` przy braku zmiennej daje dosłownie `"1.2.3.4undefined"`.
Na początku funkcji dodaj:

```ts
const secret = process.env.AUTH_SECRET;
if (!secret) throw new Error("Brak AUTH_SECRET w zmiennych środowiskowych.");
```

i użyj `ip + secret`.

---

### P16. Brak limitu wysyłki linków logowania (spam mailowy przez Resend)

**Plik:** `src/app/logowanie/page.tsx` (akcja serwerowa formularza)

Formularz logowania można wywoływać w pętli — każdy strzał to mail przez Resend (koszt +
reputacja domeny). W akcji serwerowej, przed `signIn`, dodaj dzienny limit per adres e-mail
oparty o istniejącą tabelę `FreeQuota`:

```ts
"use server";
const email = String(formData.get("email") ?? "").trim().toLowerCase();
if (!email) return;

const { createHash } = await import("node:crypto");
const { prisma } = await import("@/lib/db");
const day = new Date().toISOString().slice(0, 10);
const hash = createHash("sha256").update(email).digest("hex").slice(0, 16);
const key = `login:${hash}:${day}`;

const quota = await prisma.freeQuota.upsert({
  where: { id: key },
  create: { id: key, used: 1 },
  update: { used: { increment: 1 } },
});
if (quota.used > 10) {
  // limit 10 maili dziennie na adres — po prostu nie wysyłaj kolejnego
  return;
}

await signIn("resend", { email, redirectTo: callbackUrl || "/" });
```

---

### P17. `JSON.parse` w streamie scrape bez obsługi błędu

**Plik:** `src/components/chat/ChatApp.tsx`, funkcja `handleScrape`

Jedna zniekształcona linia NDJSON wywali cały odczyt (nieobsłużony wyjątek w promise).
Owiń parsowanie:

```ts
let event;
try {
  event = JSON.parse(line) as /* ...istniejący typ unii... */;
} catch {
  continue;
}
```

---

## NISKIE (do zrobienia przy okazji, nie wymagają natychmiastowej akcji)

### P18. Parser robots.txt jest uproszczony
`src/lib/scraper/robots.ts` — nie obsługuje `Allow:`, wildcardów `*`/`$`, a cache
(`robotsCache`, `lastFetchAtByDomain` w fetch.ts) rośnie bez ograniczeń przez cały czas życia
procesu. Wystarczy dopisać komentarz z tym ograniczeniem; pełna implementacja opcjonalna.

### P19. Deduplikacja URL-i w crawlerze nie ucina fragmentów
`src/lib/scraper/crawl.ts` — `visited` trzyma pełne URL-e, więc `strona#a` i `strona#b`
liczą się jako różne. Przed dodaniem do `visited`/kolejki ustaw `linkUrl.hash = ""`.

### P20. Brak testów najważniejszej logiki
`reserveQuestion` / `refundQuestion` (atomowa rezerwacja — twarda zasada nr 2 z CLAUDE.md)
nie mają żadnego testu; `quota.test.ts` testuje tylko funkcje pomocnicze. Po założeniu
testowej bazy (P12) dopisać testy: rezerwacja darmowa, wyczerpanie urządzenia, wyczerpanie IP,
przejście na płatne, zwrot.

### P21. Komunikaty błędów streamu czatu wyglądają jak odpowiedź AI
`src/app/api/chat/route.ts` wpisuje „Chwilowe przeciążenie..." bezpośrednio w strumień
odpowiedzi (status 200) — klient nie odróżnia tego od odpowiedzi asystenta i tekst znika po
odświeżeniu. Akceptowalne na MVP; docelowo protokół z prefiksem/NDJSON jak w scrape.

### P22. Purchase bez sprzątania stanu `pending`
Porzucone sesje checkout zostają w bazie jako `pending` na zawsze (po P1 `expired` będzie
oznaczane jako `failed`, co w praktyce załatwia problem).

---

## Kolejność wykonania

1. P3 (jedna linia), P11 (jedna linia), P14, P15, P17 — szybkie i bezpieczne.
2. P1 (Stripe) — krytyczne przed wdrożeniem płatności produkcyjnych.
3. P2, P5, P6 — kontrola kosztów AI.
4. P7, P8, P13 — poprawność i bezpieczeństwo.
5. P4 — większa zmiana w scraperze (uważnie, po niej `npx tsc --noEmit`).
6. P9, P10 — UX (wymagają sprawdzenia w przeglądarce).
7. P12, P16 — wymagają decyzji/działań właściciela (baza testowa, limit maili).

Po całości: `npx tsc --noEmit`, `npm run lint`, ręczny test czatu i scrape w przeglądarce,
a testy (`npm test`) dopiero po skonfigurowaniu bazy testowej z P12.
