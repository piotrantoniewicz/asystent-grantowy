# Etap 9 — Wdrożenie na produkcję

Instrukcja dla osoby nietechnicznej: jak wystawić Asystenta Grantowego pod adresem
**asystent.dobryai.pl**, krok po kroku. Kod jest już na GitHubie
(`piotrantoniewicz/asystent-grantowy`), Etap 8 ukończony.

**Ważna decyzja z planowania:** główna strona `dobryai.pl` to statyczne pliki HTML
na współdzielonym hostingu Hostingera (folder `_public_html`) — nie da się tam
uruchomić aplikacji Next.js, a ścieżka typu `dobryai.pl/asystent` wymagałaby reverse
proxy, którego Hostinger na planie współdzielonym nie udostępnia. Dlatego aplikacja
idzie na **Vercel** (hosting dopasowany do Next.js) pod **subdomeną**
`asystent.dobryai.pl`, podpiętą jednym wpisem DNS. Obecna strona na `dobryai.pl`
zostaje całkowicie nietknięta.

---

## Krok 0 — Uzupełnij dane firmy w treściach prawnych (5 min)

W plikach `content/prawne/regulamin.md` i `content/prawne/polityka-prywatnosci.md`
są miejsca oznaczone `[UZUPEŁNIĆ: ...]` — imię/nazwa firmy, adres, e-mail kontaktowy
i dostawca hostingu (wpisz „Vercel"). Otwórz oba pliki w edytorze tekstu i podmień
placeholdery na prawdziwe dane. Do startu wystarczy, że dane są prawdziwe — warto
potem dać treść do przejrzenia prawnikowi.

---

## Krok 1 — Produkcyjna baza danych (Neon)

Lokalnie masz już bazę na Neon, ale produkcja potrzebuje **osobnej** bazy, żeby dane
testowe nie mieszały się z prawdziwymi klientami.

1. Wejdź na **neon.tech**, zaloguj się na to samo konto co lokalnie.
2. Utwórz **nowy projekt** (np. `asystent-grantowy-prod`) — nie nowy branch w tym
   samym projekcie, tylko osobny projekt (osobne limity i backupy).
3. Skopiuj **connection string** (przycisk „Connect" → URL zaczynający się od
   `postgresql://...`). Zapisz go tymczasowo w notatniku — to będzie produkcyjny
   `DATABASE_URL`.



---

## Krok 2 — Załóż konto na Vercel i podłącz repozytorium

1. Wejdź na **vercel.com** → „Sign Up" → zaloguj się przez **GitHub** (to samo
   konto, na którym jest projekt).
2. Kliknij **„Add New..." → „Project"**.
3. Znajdź na liście `piotrantoniewicz/asystent-grantowy` → **„Import"**.
4. Vercel sam wykryje Next.js — nie zmieniaj domyślnych ustawień frameworka.
5. **Zanim klikniesz „Deploy"**, w „Build and Output Settings" zmień pole
   **Build Command** na:
   ```
   npx prisma migrate deploy && next build
   ```
   Dzięki temu baza danych będzie automatycznie aktualizowana przy każdym
   wdrożeniu (bez tego trzeba by odpalać migracje ręcznie za każdym razem).

---

## Krok 3 — Zmienne środowiskowe w Vercel

W ekranie importu (albo później w **Project Settings → Environment Variables**)
dodaj każdą z poniższych zmiennych osobno:

| Nazwa | Wartość |
|---|---|
| `DATABASE_URL` | connection string z Neon (Krok 1) |
| `NEXT_PUBLIC_APP_URL` | `https://asystent.dobryai.pl` |
| `AUTH_SECRET` | losowy ciąg — w Terminalu wpisz `openssl rand -base64 32`, wklej wynik |
| `RESEND_API_KEY` | klucz z panelu Resend (resend.com → API Keys) |
| `EMAIL_FROM` | np. `Asystent Grantowy <kontakt@dobryai.pl>` (patrz Krok 6) |
| `ADMIN_EMAILS` | Twój e-mail (dostęp do panelu `/admin`) |
| `ANTHROPIC_API_KEY` | Twój klucz z console.anthropic.com |
| `STRIPE_SECRET_KEY` | klucz **produkcyjny** ze Stripe (Krok 5 — na razie może być testowy, podmienisz później) |
| `STRIPE_WEBHOOK_SECRET` | uzupełnisz w Kroku 5, po utworzeniu webhooka |
| `DIRECT_URL` | **bezpośredni** (non-pooled) connection string z Neona — patrz uwaga niżej |

**Uwaga o `DIRECT_URL` (dodane 2026-07-25 po realnym problemie na produkcji):**
Neon domyślnie pokazuje **pooled** connection string (host z `-pooler` w nazwie) —
to jest `DATABASE_URL`, dobry dla aplikacji w działaniu. Ale `npx prisma migrate
deploy` (część Build Command z tego kroku) potrzebuje osobnego, **bezpośredniego**
połączenia do bazy, bez poolera — inaczej migracja zawiesza się na 10 sekund i pada
z błędem `P1002: Timed out trying to acquire a postgres advisory lock`. W Neon
dashboardzie → **Connect** → wyłącz przełącznik „Connection pooling", skopiuj ten
drugi string (host **bez** `-pooler`) i dodaj go jako `DIRECT_URL`. Dodaj tę zmienną
dla **obu** środowisk (Production i Preview), inaczej PR-y (które budują się jako
Preview) będą padać tym samym błędem.

Kliknij **Deploy**. Pierwsze wdrożenie się powiedzie nawet z tymczasowymi kluczami —
dostaniesz roboczy adres w stylu `asystent-grantowy-xyz.vercel.app`, potem podepniesz
docelową subdomenę (Krok 4).

---

## Krok 4 — Subdomena asystent.dobryai.pl

1. W Vercel: **Project Settings → Domains** → wpisz `asystent.dobryai.pl` → **Add**.
2. Vercel pokaże wymagany rekord DNS — zwykle typu **CNAME**: nazwa `asystent`,
   wartość `cname.vercel-dns.com` (Vercel wyświetli dokładne wartości — użyj ich).
3. Zaloguj się na **hpanel.hostinger.com** → zarządzanie domeną `dobryai.pl` →
   **DNS / Nameservers** (to ustawienie *domeny*, osobne od hostingu plików —
   nie dotykasz `_public_html`).
4. Dodaj nowy rekord CNAME z danymi pokazanymi przez Vercel (nazwa: `asystent`,
   wartość: `cname.vercel-dns.com`, TTL domyślne). Zapisz.
5. Propagacja DNS trwa od kilku minut do ~kilku godzin. Gdy się zakończy, w Vercel
   przy domenie pojawi się zielony status „Valid" i automatycznie wystawiony
   certyfikat SSL (https) — nic więcej nie trzeba robić.

Obecna strona pod samym `dobryai.pl` (bez subdomeny) zostaje bez zmian.

---

## Krok 5 — Stripe (płatności)

1. Zaloguj się na **dashboard.stripe.com** i przełącz konto z trybu testowego na
   **produkcyjny** (aktywacja może wymagać danych firmy/działalności gospodarczej —
   Stripe przeprowadzi Cię przez ten proces).
2. Skopiuj **produkcyjny Secret Key** (Developers → API keys) → wklej w Vercel jako
   `STRIPE_SECRET_KEY` (nadpisz tymczasowy z Kroku 3).
3. Przejdź do **Workbench → Webhooks** (dashboard.stripe.com/webhooks), upewnij się,
   że jesteś w trybie **produkcyjnym** (przełącznik u góry) → „Add endpoint".
4. Adres endpointu: `https://asystent.dobryai.pl/api/stripe/webhook`
5. Zaznacz dokładnie te **cztery** zdarzenia:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
6. Po utworzeniu webhooka Stripe pokaże **Signing secret** — skopiuj i wklej w
   Vercel jako `STRIPE_WEBHOOK_SECRET`.

---

## Krok 6 — Resend (wysyłka maili logowania)

1. W panelu **resend.com** dodaj domenę `dobryai.pl` w sekcji Domains.
2. Resend pokaże rekordy DNS (TXT/CNAME) do dodania — wklej je w tym samym miejscu
   co w Kroku 4 (hpanel.hostinger.com → DNS domeny). Weryfikacja może potrwać
   do kilku godzin.
3. Bez tego kroku maile logujące mogą trafiać do spamu albo w ogóle się nie wysyłać.
4. Ustaw `EMAIL_FROM` w Vercel na adres z tej zweryfikowanej domeny, np.
   `Asystent Grantowy <kontakt@dobryai.pl>`.

---

## Krok 7 — Redeploy po zmianach

Po każdej zmianie zmiennych środowiskowych w Vercel zrób **redeploy**
(Deployments → „..." przy ostatnim wdrożeniu → „Redeploy"), żeby zmiany zaczęły
działać.

---

## Krok 8 — Sprawdzenie na żywo

Przejdź całą ścieżkę na `https://asystent.dobryai.pl`:

1. Zaloguj się mailem — sprawdź, czy link logujący przyszedł i nie trafił do spamu.
2. Wklej link do organizacji/konkursu grantowego, sprawdź, czy scraping działa.
3. Zadaj pytanie w czacie, sprawdź odpowiedź AI.
4. Kup testowo najmniejszy pakiet pytań prawdziwą kartą (możesz zwrócić z panelu
   Stripe, jeśli to tylko test) — sprawdź, czy liczba pytań się doliczyła.
5. Zaloguj się na `/admin` swoim adminowym e-mailem, sprawdź statystyki i testową
   rozmowę/zakup.

---

## Krok 9 — Walidacja z kilkoma osobami: zmiana limitu darmowych pytań

Zanim podeślesz link testerom, warto tymczasowo podnieść limit darmowych pytań, żeby
nie utknęli po kilku pytaniach. Nie trzeba nic zmieniać w kodzie — panel admina
robi to na żywo.

**Zmiana globalnego limitu (dla wszystkich testerów naraz):**

1. Zaloguj się na `https://asystent.dobryai.pl/admin` swoim adminowym e-mailem.
2. Zakładka **Ustawienia** → pole z limitem darmowych pytań (domyślnie 10).
3. Zmień wartość i zapisz — działa **od razu, od kolejnego pytania**, bez restartu
   aplikacji, dla wszystkich użytkowników.

**Dorzucenie pytań pojedynczej osobie (punktowo):**

1. Zakładka **Użytkownicy** — znajdź osobę po e-mailu (musi się najpierw zalogować,
   żeby konto istniało).
2. Formularz ręcznej korekty płatnych pytań przy tym koncie — wpisz np. `+20`
   i zatwierdź.
3. To dolicza pytania do puli **płatnej** (`paidQuestionsRemaining`), nie do
   darmowego limitu — z perspektywy użytkownika działa identycznie, tylko licznik
   w panelu wygląda inaczej niż darmowy limit.

Najprościej: podnieś globalny limit w Ustawieniach na czas walidacji, a po jej
zakończeniu wróć do docelowej wartości.

---

## Gdy coś nie działa

Wklej pełną treść błędu (z Vercel „Deployments" → wejdź w nieudany deploy → „Build
Logs", albo z konsoli przeglądarki) i opisz, co robiłeś krok po kroku — narzędzie AI
pomoże to zdiagnozować na miejscu.

**Build pada na `prisma migrate deploy` z błędem `P1002` / advisory lock timeout:**
brakuje zmiennej `DIRECT_URL` (patrz Krok 3), jest ustawiona tylko dla jednego
środowiska (np. Production, ale nie Preview) **albo zawiera adres z poolerem**
(host z `-pooler`) — zmienna istnieje, więc na pierwszy rzut oka wygląda dobrze,
ale przez PgBouncera blokada `pg_advisory_lock` nigdy się nie zakłada. Zdarza się
po zmianie hasła do bazy, gdy przy aktualizacji obu zmiennych wklei się w oba pola
ten sam (pooled) string — patrz wpis 2026-07-27 w historii niżej.

Wartości zmiennych w Vercelu są oznaczone jako **Sensitive**: po zapisaniu nie da
się ich podejrzeć, można je tylko **nadpisać**. Nie próbuj więc sprawdzać, co tam
jest — po prostu wklej ponownie non-pooled string z Neona (Production i Preview)
i zrób redeploy. To samo w sobie jest rozstrzygające: jeśli build przechodzi,
przyczyną był pooler.

Czy blokadę trzyma jednak jakieś zawieszone połączenie, sprawdzisz w Neonie
(**SQL Editor**, gałąź produkcyjna):

```sql
SELECT a.pid, a.state, a.state_change, left(a.query, 60) AS zapytanie
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE l.locktype = 'advisory';
```

Pusty wynik = nikt blokady nie trzyma, czyli problem leży w adresie (pooler).
Wiersze w wyniku = zawieszona sesja; zwalnia ją
`SELECT pg_terminate_backend(l.pid) FROM pg_locks l WHERE l.locktype = 'advisory';`.

**Uwaga:** nieudany build **nie podmienia** produkcji — strona przez cały czas
serwuje poprzednią, działającą wersję. Nie ma więc presji czasu przy naprawianiu.

---

## Historia zmian po pierwszym wdrożeniu

- **2026-07-25** — dodano Vercel Web Analytics (`@vercel/analytics`, komponent
  `<Analytics />` w `src/app/layout.tsx`); dodano `DIRECT_URL` po tym, jak pierwszy
  produkcyjny deploy po dłuższej przerwie zaczął padać na advisory lock (patrz wyżej);
  przy tej okazji zrotowano hasło do roli `neondb_owner` w Neonie (stare przeszło przez
  czat z asystentem AI podczas debugowania) — zaktualizowano `DATABASE_URL` i
  `DIRECT_URL` nowym hasłem dla Production i Preview, zweryfikowano na żywo (build +
  logowanie bez błędów runtime).
- **2026-07-27** — pierwsza migracja bazy od czasu rotacji hasła (nowa kolumna
  `ScrapedSource.contextBlob`) ujawniła, że `DIRECT_URL` w Vercelu zawierał adres
  **z poolerem**: prawdopodobnie przy aktualizacji obu zmiennych po rotacji hasła
  wkleiło się w oba pola to samo (pooled) połączenie. Objaw był identyczny jak
  2026-07-25 — `P1002: Timed out trying to acquire a postgres advisory lock` przy
  `npx prisma migrate deploy` w Build Command — mimo że zmienna `DIRECT_URL`
  istniała dla obu środowisk. Trzy kolejne buildy (produkcja, preview, ręczny
  redeploy) padły tak samo, także wtedy gdy nic innego się nie budowało — czyli nie
  była to konkurencja dwóch równoległych buildów o tę samą blokadę. Naprawa:
  nadpisanie `DIRECT_URL` non-pooled stringiem (Production i Preview) i redeploy —
  build przeszedł w ~69 s. To, że wystarczyła sama podmiana adresu, jest zarazem
  potwierdzeniem diagnozy (blokady nie trzymała żadna zawieszona sesja —
  zapytania o `pg_locks` z sekcji „Gdy coś nie działa" ostatecznie nie uruchamiano). Samą migrację uruchomiono wcześniej
  ręcznie z laptopa (`DATABASE_URL="<non-pooled>" npx prisma migrate deploy`),
  więc w buildzie nie było już nic do zastosowania. Wniosek na przyszłość: po
  każdej zmianie hasła do bazy sprawdzić, czy `DATABASE_URL` i `DIRECT_URL` różnią
  się hostem (`-pooler` tylko w tym pierwszym) — wartości są Sensitive i nie da
  się ich podejrzeć, więc jedyną metodą weryfikacji jest nadpisanie ich świeżo
  skopiowanymi stringami z Neona.
