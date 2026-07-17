# 14 — Poprawki UX „bez tarcia" i trafności scrapingu (U1–U11)

Instrukcja robocza. Wytyczna nadrzędna właściciela: **aplikacja jest dla osób
nietechnicznych, piszących wniosek pierwszy raz — jak najmniej pracy po stronie
użytkownika, jak najwięcej efektu.** Każda zmiana poniżej albo usuwa krok, albo
poprawia trafność bez dokładania kroku.

Przed pracą przeczytaj `CLAUDE.md` (zasady twarde) oraz `06-scraping.md`
i `05-router-ai.md`. Realizuj **w podanej kolejności** — partie są ułożone od
najtańszych i najbardziej blokujących do największych.

## Zasady obowiązujące przy każdym zadaniu

1. **Nie osłabiaj zabezpieczeń.** Nie zmieniaj logiki blokowania adresów
   w `assertSafeUrl` (`src/lib/scraper/ssrf.ts`), rezerwacji pytań
   (`src/lib/quota.ts`), limitów scrapowania ani weryfikacji webhooka Stripe.
   Jeśli wydaje ci się, że zadanie tego wymaga — **zatrzymaj się i zapytaj**.
2. **Interfejs po polsku**, komunikaty błędów zrozumiałe dla laika bez żargonu.
3. **Jedno zadanie = jedna zmiana.** Po każdym zadaniu uruchom:
   `npx tsc --noEmit`, `npm run lint`, `npm test`.
   Uwaga: `npm test` wymaga `DATABASE_URL` wskazującego bazę ze słowem „test"
   w nazwie (guard z audytu P12). Jeśli takiej bazy nie ma, uruchom testy
   niezależne od bazy i **napisz w raporcie, że `npm test` nie był uruchomiony** —
   nie usuwaj guardu, nie obchodź go.
4. **Nie zgaduj przy zmianach schematu bazy.** Zadania U9 i U10 wymagają migracji
   (`npx prisma migrate dev`). Przed migracją napisz właścicielowi, co się zmieni.
5. Po skończonej partii zaproponuj commit z opisem po polsku i dopisz wynik
   do `STATUS.md` (nie do `CLAUDE.md`).
6. Jeśli w trakcie znajdziesz coś, co w instrukcji jest nieprawdą (kod wygląda
   inaczej niż opisano) — **nie improwizuj, zgłoś to.** Instrukcja była pisana
   na stan z 2026-07-17.

---

# PARTIA 1 — ślepe zaułki (zrób najpierw)

Te cztery zadania usuwają sytuacje, w których użytkownik nie może ruszyć dalej
albo nie rozumie, co zrobił źle. Są małe i niezależne od siebie.

## U1 — adres bez `https://` ma działać

**Problem.** `assertSafeUrl` robi `new URL(rawUrl)` (`src/lib/scraper/ssrf.ts:71`).
Gdy użytkownik wpisze `fundacjaxyz.pl` — czyli dokładnie to, co człowiek przepisuje
z pamięci — leci wyjątek i komunikat „Nieprawidłowy adres URL". Cicha porażka
na pierwszym kroku.

**Do zrobienia.**

W `src/lib/scraper/ssrf.ts` dodaj **osobną, nową** funkcję eksportowaną — nie
zmieniaj wnętrza `assertSafeUrl`:

```ts
/**
 * Uzupełnia brakujący protokół w adresie wpisanym przez użytkownika
 * ("fundacja.pl" → "https://fundacja.pl"). Adresy, które już mają protokół,
 * zostawia bez zmian — także niedozwolone (np. "javascript:"), żeby odrzucił
 * je assertSafeUrl, a nie ta funkcja.
 */
export function normalizeUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // ma już protokół
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return `https://${trimmed}`;
}
```

W `src/app/api/scrape/route.ts` w linii 39 zamień
`await assertSafeUrl(url)` na `await assertSafeUrl(normalizeUrlInput(url))`
i dodaj import.

**Uwaga na pułapkę.** Test `/^[a-z][a-z0-9+.-]*:/i` jest tam celowo: gdyby doklejać
`https://` bezwarunkowo, `javascript:alert(1)` zamieniłby się w pozornie poprawny
adres. Zostawiamy takie wejścia bez zmian, żeby odrzucił je istniejący
sprawdzian protokołu w `assertSafeUrl` (linia 76).

**Testy.** Dopisz do `src/lib/scraper/ssrf.test.ts` przypadki dla
`normalizeUrlInput`: `fundacja.pl` → `https://fundacja.pl`;
`http://fundacja.pl` → bez zmian; `https://fundacja.pl` → bez zmian;
`  fundacja.pl  ` → przycięte i z protokołem; `javascript:alert(1)` → bez zmian.

**Jak sprawdzić w przeglądarce.** Wklej w pole „Strona organizacji" adres bez
`https://` — analiza ma ruszyć normalnie.

## U2 — komunikaty błędów nie mogą prosić o niemożliwe

**Problem.** Gdy scraping się nie uda, aplikacja mówi „Możesz wkleić treść
regulaminu bezpośrednio do czatu" (`src/app/api/scrape/route.ts:97`
oraz `src/components/chat/ChatApp.tsx:493`). To prośba do laika o skopiowanie
kilkudziesięciu stron regulaminu.

**Do zrobienia.** Zamień oba komunikaty na prośbę o węższy, wykonalny krok:

> „Nie udało się pobrać treści z tej strony. Spróbuj wkleić link bezpośrednio
> do dokumentu z regulaminem (najczęściej plik PDF)."

Tylko tekst — żadnej logiki.

## U3 — link wklejony w czat ma po prostu zadziałać

**Problem.** `01-wizja-produktu.md` obiecuje, że adres można podać „w dedykowanych
polach **lub wklejając w czat**". W kodzie tego nie ma: link wysłany jako
wiadomość poleci do modelu jako zwykłe pytanie, **zużyje jedno z 10 darmowych
pytań**, a model i tak nie ma jak wejść na stronę. Wklejenie linku w rozmowę to
najbardziej naturalny odruch użytkownika.

**Do zrobienia.** Zmiana wyłącznie w `src/components/chat/ChatApp.tsx`,
w funkcji `handleSend` (linia 240). **Nie zmieniaj `/api/chat`** — chodzi o to,
żeby taka wiadomość w ogóle tam nie trafiła, więc pytanie nie zostanie zużyte.

Zasada wyzwalania — **celowo wąska**, żeby nie było przypadkowych trafień:
reaguj tylko wtedy, gdy **cała przycięta wiadomość jest jednym adresem i niczym
więcej**. Wiadomość „czy pasujemy? https://…" ma nadal iść do czatu jak dziś.

```ts
// Rozpoznaje wiadomość będącą wyłącznie adresem strony.
// Celowo wąskie: "czy pasujemy? https://..." ma trafić do czatu jak dotąd.
function looksLikeBareUrl(text: string): boolean {
  if (/\s/.test(text)) return false;
  return /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(text);
}
```

Logika w `handleSend`, **przed** utworzeniem wiadomości użytkownika i przed
`fetch("/api/chat")`:

- jeśli `looksLikeBareUrl(text)` jest fałszem → dalej bez zmian;
- jeśli prawda, a rozmowa ma już źródło `kind === "organization"` →
  wyczyść pole i wywołaj `handleScrape(text, "grant")`. Nie pytaj o nic:
  organizacja jest znana, więc kolejny link to konkurs;
- jeśli prawda, a rozmowy nie ma jeszcze źródła organizacji → **nie zgaduj.**
  Pokaż pod polem wiadomości dwa przyciski: „To strona mojej organizacji"
  i „To strona konkursu". Kliknięcie wywołuje `handleScrape(text, …)`
  z odpowiednim rodzajem i chowa przyciski. Do przechowania czekającego adresu
  użyj nowego stanu, np. `const [pendingUrl, setPendingUrl] = useState<string | null>(null)`.

**Dlaczego tak.** Domyślnie zero kliknięć; jedno kliknięcie tylko wtedy, gdy
domysł byłby naprawdę niejednoznaczny. Nigdy nie zgadujemy rodzaju źródła,
bo pomyłka zatruwa kontekst na całą rozmowę.

## U4 — pola na adresy mają być widoczne na telefonie

**Problem — najpoważniejszy z partii 1.** Pusty ekran mówi „W panelu po lewej
wklej link do strony twojej organizacji oraz konkursu"
(`src/components/chat/ChatApp.tsx:445`), ale na telefonie **żadnego panelu po
lewej nie ma** — jest schowany za `☰ Menu` (klasa `hidden` w linii 328).
Instrukcja opisuje coś, czego użytkownik nie widzi. Ślepy zaułek na pierwszym
kroku.

**Do zrobienia** (rób po U3 — U3 dostarcza ścieżkę na dodawanie kolejnych linków
później):

1. Wyodrębnij oba formularze (linie 341–391) do komponentu `SourceForms`
   w tym samym pliku. Przyjmuje przez propsy stany pól, `isScraping`
   i `handleScrape`. **Nie zmieniaj przy okazji ich działania** — to ma być
   przeniesienie, nie przepisanie.
2. **Usuń** formularze z panelu bocznego. Panel zostaje z: przyciskiem
   „+ Nowa rozmowa", listą rozmów i licznikiem pytań.
3. Renderuj `SourceForms` w **głównej kolumnie**, w miejscu pustego stanu
   (linie 443–448) — tam, gdzie dziś jest sam tekst. Warunek renderowania:
   `sources.length === 0`.
4. Przepisz tekst pustego stanu tak, żeby był prawdziwy na obu ekranach, np.:
   „Zacznij od wklejenia adresu strony swojej organizacji i strony konkursu.
   Przeanalizuję je, zanim zaczniemy rozmowę."

Po pojawieniu się pierwszego źródła formularze znikają — kolejne linki użytkownik
dodaje wklejając je w czat (U3).

**Jak sprawdzić.** W przeglądarce zwęź okno do 390 px. Pola muszą być widoczne
od razu, bez otwierania menu. Sprawdź też szeroki ekran — układ nie może się
rozjechać.

---

# PARTIA 2 — trafność scrapingu (bez dokładania kroków użytkownikowi)

Wszystkie zmiany po stronie serwera. Cel: żeby do modelu trafiało to, co potrzebne,
bez pytania użytkownika o cokolwiek.

## U5 — filtrowanie PDF-ów (największy zysk w tej partii)

**Problem.** Przy podstronach HTML crawler filtruje linki po słowach kluczowych
(`matchesKeywords`, `src/lib/scraper/crawl.ts:135`). Przy **PDF-ach nie ma
żadnego filtrowania** — bierze pierwszych 10 napotkanych w kodzie strony
(linie 135–141). Do tego lista linków jest zbierana z **całej** strony, zanim
wycięta zostanie nawigacja i stopka (`src/lib/scraper/html.ts:33-44`), więc
„polityka-prywatnosci.pdf" ze stopki zajmuje miejsce w puli dziesięciu. A PDF-y
są dodatkowo **chronione przed przycinaniem** przy przekroczeniu budżetu
(linia 176), więc śmieć wypycha wartościową podstronę.

**Do zrobienia w `src/lib/scraper/crawl.ts`.** Zbieraj kandydatów na PDF-y
z podziałem na pasujące i niepasujące do `GRANT_KEYWORDS`, a pobieraj
**najpierw pasujące, potem niepasujące jako uzupełnienie do limitu 10**:

```ts
// zamiast pojedynczego pdfUrlsToFetch
const matchedPdfUrls = new Set<string>();
const otherPdfUrls = new Set<string>();
```

W pętli zbierania linków (linie 135–141):

```ts
if (kind === "grant") {
  for (const link of extracted.links) {
    if (!isPdfLink(link.url)) continue;
    if (matchesKeywords(link, keywords)) matchedPdfUrls.add(link.url);
    else otherPdfUrls.add(link.url);
  }
}
```

Przy pobieraniu (linia 152) iteruj po
`[...matchedPdfUrls, ...otherPdfUrls.values()]` — istniejący warunek przerywania
po `MAX_PDF_PAGES` zostaje bez zmian i sam utnie listę.

**Dlaczego uzupełniamy niepasującymi, a nie tniemy do samych pasujących.**
Bo część organizatorów nazywa pliki `zal_1.pdf` albo `dokument.pdf` — i to bywa
regulamin. Filtr ma poprawić kolejność, nie odciąć nam ręki. Nie zmieniaj tego
na „tylko pasujące".

**Jak sprawdzić.** Uruchom scraping na stronie konkursu z NIW (`niw.gov.pl`,
sprawdzana już w Etapie 4) i wypisz w konsoli listę pobranych PDF-ów przed i po
zmianie. Regulamin i wzór wniosku mają być wysoko; polityka prywatności ma
wypaść albo trafić na koniec.

## U6 — czytaj treść główną, nie całą stronę

**Problem.** `extractHtml` wycina nawigację, stopkę i cookies, ale potem czyta
z całego `<body>` (`src/lib/scraper/html.ts:66`) — łapie paski boczne, listy
aktualności i widżety.

**Do zrobienia w `src/lib/scraper/html.ts`.** Po `REMOVE_SELECTORS.forEach(...)`
(linia 44) wybierz korzeń treści zamiast sztywnego `body`:

```ts
// Wybierz kontener treści głównej; jeśli go nie ma albo jest pusty, użyj body.
function pickContentRoot($: cheerio.CheerioAPI) {
  for (const selector of ["main", "[role=main]", "article"]) {
    const el = $(selector).first();
    if (el.length && el.text().replace(/\s+/g, " ").trim().length >= 200) {
      return el;
    }
  }
  return $("body");
}
```

W linii 66 zamień `$("body").find(...)` na `pickContentRoot($).find(...)`.

**Uwaga na pułapkę.** Próg 200 znaków jest konieczny: część stron ma `<main>`
puste albo wypełniane dopiero JavaScriptem, a my dostajemy surowy HTML.
Bez progu takie strony zwrócą pustą treść i scraping „uda się" bez zawartości.
Nie usuwaj tego progu.

**Jak sprawdzić.** Dopisz test do `src/lib/scraper/html.test.ts`: (a) HTML
z `<main>` pełnym treści i śmieciami poza nim → w wyniku tylko treść z `main`;
(b) HTML z pustym `<main>` i treścią w `body` → wynik z `body`.

## U7 — to AI ma nazwać brak, nie użytkownik

**Problem.** Po analizie aplikacja pyta „Pobrano N dokumentów. Czy czegoś brakuje?
Jeśli tak, wklej link do brakującego dokumentu"
(`src/components/chat/ChatApp.tsx:485-488`). Osoba pisząca wniosek pierwszy raz
nie wie, że powinna istnieć karta oceny — nie umie odpowiedzieć na to pytanie.
Model podsumowujący widzi całą treść i wie to lepiej.

**Do zrobienia.**

1. W `src/lib/ai/prompts.ts` rozszerz `SCRAPE_SUMMARY_PROMPT` (linia 62) o akapit
   dla konkursu — po istniejącej linii `[dla konkursu]`:

   ```
   [dla konkursu] na końcu dodaj jedno zdanie o brakach: porównaj znalezione
   dokumenty z typowym kompletem dokumentacji konkursowej (regulamin, wzór
   wniosku, kryteria/karta oceny, harmonogram naboru, załączniki) i wymień
   wyłącznie te pozycje z tej listy, których w treści nie ma. Jeśli komplet
   jest pełny — napisz, że wygląda kompletnie. Nie wymyślaj innych dokumentów
   spoza tej listy i nie zgaduj ich treści.
   ```

   **Uwaga na sprzeczność.** Prompt kończy się zdaniem „Nie dodawaj nic od
   siebie". Nazwanie braku nie jest zgadywaniem, ale model musi mieć **zamkniętą
   listę** do porównania — dlatego jest wyliczona wprost. Nie zamieniaj jej na
   ogólne „czego brakuje", bo model zacznie wymyślać dokumenty.

2. W `ChatApp.tsx` (linie 485–488) usuń pytanie „Czy czegoś brakuje?…".
   Zostaw samo „Pobrano N dokumentów." — resztę powie podsumowanie.

3. **Pamiętaj:** prompt systemowy czatu żyje w bazie (`AppSetting.system_prompt`),
   ale `SCRAPE_SUMMARY_PROMPT` jest w kodzie i nie ma go w panelu admina.
   Ta zmiana zadziała od razu po wdrożeniu, bez ruszania ustawień.

**Jak sprawdzić.** Zeskrapuj konkurs, przy którym wiadomo, że karty oceny nie
ma na stronie — podsumowanie ma to nazwać.

---

# PARTIA 3 — pamięć i praca dla wielu organizacji

Kontekst: użytkownik może pisać wnioski dla **kilku różnych organizacji**.
Dziś to działa (źródło organizacji jest przypięte do rozmowy, nic się nie miesza),
ale adres trzeba wklepywać za każdym razem. `01-wizja-produktu.md` wymienia
„Wiele organizacji na jednym koncie" jako funkcję wersji 2 — **to poniżej jest
świadomie mniejsze**: żadnych profili, formularzy ani zarządzania organizacjami.
Tylko pamięć o tym, co użytkownik już raz zrobił.

## U8 — automatyczny tytuł rozmowy (zrób pierwsze w tej partii)

**Problem.** Tytuł rozmowy to pierwsze 60 znaków pierwszej wiadomości
(`src/app/api/chat/route.ts:126`). Na liście robi się „Czy nasza organizacja może
startować w tym konkur…", a gdy ktoś wkleił linki i jeszcze nic nie napisał —
zostaje „Nowa rozmowa" (`src/app/api/conversations/route.ts:28`). Przy kilku
organizacjach i kilku konkursach listy rozmów nie da się używać.

**Do zrobienia w `src/app/api/scrape/route.ts`**, po udanym zapisie źródła
(po linii 117, gdy `status: "done"`):

- jeśli `kind === "grant"` → ustaw tytuł rozmowy na nazwę konkursu wziętą
  z tytułu strony głównej (`result.pages[0].title`), przycięty do 60 znaków;
- jeśli w rozmowie jest już źródło `kind === "organization"`, dopisz jego nazwę
  po myślniku, np. `FIO 2026 — Fundacja XYZ` (całość nadal maks. 60 znaków);
- **nadpisuj tytuł tylko wtedy, gdy jest równy `"Nowa rozmowa"`** — nie kasuj
  tytułu, który już coś znaczy.

**Uwaga na pułapkę — łatwo to przeoczyć.** `src/app/api/chat/route.ts:123-128`
ustawia tytuł z pierwszej wiadomości **bezwarunkowo**, gdy `isFirstMessage`.
Ponieważ scraping zwykle dzieje się przed pierwszym pytaniem, ten kod
**nadpisze** ładny tytuł z konkursu treścią pytania. Musisz dodać tam warunek:
ustawiaj tytuł z wiadomości tylko, jeśli obecny tytuł to `"Nowa rozmowa"`.
Wymaga to pobrania `title` w `findUnique` w linii 50 (dodaj do `include`/`select`
albo skorzystaj z tego, że rekord `conversation` już jest wczytany — sprawdź,
czy pole `title` jest dostępne, bo dziś zapytanie nie ogranicza pól).

**Jak sprawdzić.** Nowa rozmowa → wklej organizację → wklej konkurs → sprawdź
nazwę na liście po lewej **przed** zadaniem pierwszego pytania. Potem zadaj
pytanie i sprawdź, że tytuł się **nie zmienił**.

## U9 — pamiętaj listę organizacji (nie jedną!)

**Problem.** Adres własnej organizacji jest zawsze ten sam, a wklepuje się go
przy każdym nowym konkursie. Ale organizacji może być kilka — dlatego
**nie wolno zapisać jednego adresu na koncie**; trzeba listy.

**Schemat.** W `prisma/schema.prisma` dodaj:

```prisma
model UserOrganization {
  id         String   @id @default(cuid())
  userId     String
  rootUrl    String
  name       String
  createdAt  DateTime @default(now())
  lastUsedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, rootUrl])
}
```

Dodaj `organizations UserOrganization[]` do modelu `User`. Migracja:
`npx prisma migrate dev`. **Napisz właścicielowi przed migracją.**

**Zapis.** W `src/app/api/scrape/route.ts`, po udanym scrapingu z
`kind === "organization"`, zrób `upsert` po `[userId, rootUrl]`. Jako `name`
weź tytuł strony głównej (`result.pages[0].title`) przycięty do ~60 znaków,
a gdy jest pusty — hostname z adresu. **Nie pytaj użytkownika o nazwę.**

**Odczyt i użycie.** Dodaj `GET /api/organizations` (tylko zalogowany, tylko
własne, sortowanie po `lastUsedAt desc`). W `ChatApp.tsx`, w pustym stanie
(przy `SourceForms` z U4):

- **0 zapamiętanych** → jak dziś, puste pole;
- **1 zapamiętana** → podstaw adres i uruchom analizę automatycznie przy
  zakładaniu rozmowy. Zero kliknięć;
- **2 lub więcej** → zamiast pola pokaż przyciski z nazwami organizacji
  + przycisk „inna organizacja" odsłaniający zwykłe pole. Jedno kliknięcie,
  zero pisania.

**Dlaczego tak.** Projekt ma się zwijać do zera kliknięć w typowym przypadku
(jedna organizacja) i rozwijać do jednego tylko wtedy, gdy naprawdę jest wybór.
Nie płacimy tarciem większości za funkcję mniejszości.

## U10 — nie pobieraj drugi raz tej samej organizacji

**Zależy od U9.** Przełączanie między organizacjami kosztuje 30–60 sekund
czekania na ponowny crawling — i to jest realny koszt, nie wklejanie adresu.

**Do zrobienia.** Gdy użytkownik wybierze zapamiętaną organizację, zamiast
crawlować: znajdź **najnowsze** `ScrapedSource` tego użytkownika o
`kind: "organization"`, tym samym `rootUrl` i `status: "done"`, i **skopiuj**
rekord `ScrapedSource` wraz z jego `ScrapedPage` do nowej rozmowy. Nowe wiersze,
nowe `id`, `conversationId` nowej rozmowy.

Pokaż w karcie źródła dyskretny przycisk „odśwież", który wymusza normalny
crawling.

**Zasada, której nie wolno złamać: kopiuj wyłącznie stronę organizacji, nigdy
stronę konkursu.** Strona fundacji zmienia się rzadko i nieistotnie. Regulaminy,
kwoty i terminy konkursu zmieniają się i tam **zawsze** musi być świeże pobranie.

**Dlaczego kopiujemy wiersze zamiast przepinać źródło do użytkownika.** Bo nie
wymaga przebudowy relacji i zachowuje zasadę, że skasowanie rozmowy kasuje jej
dane — co jest wygodne przy RODO (`10-prawo-rodo.md`).

**Pamiętaj:** skopiowane źródło liczy się do `MAX_SOURCES_PER_CONVERSATION` (5).

## U11 — analiza dwóch stron równolegle (najmniej pilne)

**Problem.** Jedna flaga `isScraping` (`ChatApp.tsx:94`) blokuje **oba**
formularze, więc trzeba wkleić organizację, odczekać, potem konkurs i odczekać
znowu.

**Do zrobienia.** Rozdziel stan na osobny per rodzaj źródła, np.
`scrapingKind: "organization" | "grant" | null` zamień na zbiór, albo trzymaj
dwa niezależne stany postępu. Każdy formularz blokuje tylko sam siebie.

**Uwaga.** `scrapeProgress` jest dziś pojedynczy i musi stać się osobny dla
każdego rodzaju, inaczej dwie analizy będą nadpisywać sobie licznik podstron.
Limity serwerowe (5 źródeł/rozmowę, 10/godzinę) zostają bez zmian.

---

## Kolejność w skrócie

| # | Zadanie | Pliki | Migracja |
|---|---------|-------|----------|
| U1 | Adres bez `https://` | `ssrf.ts`, `scrape/route.ts` | nie |
| U2 | Komunikaty błędów | `scrape/route.ts`, `ChatApp.tsx` | nie |
| U3 | Link wklejony w czat | `ChatApp.tsx` | nie |
| U4 | Pola widoczne na telefonie | `ChatApp.tsx` | nie |
| U5 | Filtr PDF-ów | `crawl.ts` | nie |
| U6 | Treść główna (`main`/`article`) | `html.ts` | nie |
| U7 | AI nazywa braki | `prompts.ts`, `ChatApp.tsx` | nie |
| U8 | Automatyczny tytuł rozmowy | `scrape/route.ts`, `chat/route.ts` | nie |
| U9 | Lista organizacji | `schema.prisma`, `scrape/route.ts`, nowe API, `ChatApp.tsx` | **tak** |
| U10 | Kopiowanie strony organizacji | `scrape/route.ts`, `ChatApp.tsx` | nie |
| U11 | Analiza równoległa | `ChatApp.tsx` | nie |

Partie 1 i 2 są od siebie niezależne — można je scalać osobno. Partia 3 ma
zależność: U10 wymaga U9.

## Czego NIE robić

- **Nie dodawaj listy dokumentów z możliwością odznaczania.** Była rozważana
  i **odrzucona**: wymaga od laika oceny, czy brakuje karty oceny — a on nie
  wie, że coś takiego istnieje. Zastępuje ją U7, gdzie brak nazywa AI.
- **Nie proś użytkownika o nazwanie organizacji** — nazwa jest w tytule strony.
- **Nie zgaduj rodzaju źródła** (organizacja vs konkurs), gdy nie da się go
  wywnioskować. Pomyłka zatruwa kontekst całej rozmowy; lepsze jedno kliknięcie.
- **Nie ruszaj** logiki SSRF, limitów pytań, rezerwacji ani webhooka Stripe.
- **Nie zmieniaj** `MAX_HTML_PAGES`, `MAX_PDF_PAGES`, `MAX_DEPTH` ani budżetów
  znaków — nie o objętość tu chodzi, tylko o trafność.
