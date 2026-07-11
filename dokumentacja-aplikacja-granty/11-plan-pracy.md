# 11 — Plan pracy krok po kroku

Buduj aplikację etapami, w tej kolejności. **Po każdym etapie uruchom aplikację
i przetestuj ręcznie** — dopiero potem następny etap. Każdy etap kończy się
zapisaniem zmian w Git (patrz sekcja o GitHubie na dole).

## Zanim zaczniesz — jednorazowe przygotowania

1. Zainstaluj **Node.js LTS** (nodejs.org) — potrzebne do uruchamiania aplikacji.
2. Załóż konta i zdobądź klucze (zapiszesz je potem w `.env.local`):
   - **Anthropic** (console.anthropic.com) → klucz API + doładowanie kilku dolarów,
   - **Stripe** (stripe.com) → klucze testowe, na razie bez aktywacji firmy,
   - **Resend** (resend.com) → klucz API do wysyłki maili logowania.
3. Przygotuj plik z projektem graficznym (dostarczysz go w Etapie 6).

## Etap 1 — Szkielet projektu i baza danych
Powiedz narzędziu AI: *„Przeczytaj dokumentację w folderze dokumentacja-aplikacja-granty.
Zrealizuj Etap 1: załóż projekt Next.js z TypeScript i Tailwind, skonfiguruj Prisma
z SQLite według 03-baza-danych.md, dodaj plik .env.local.example i upewnij się,
że npm run dev działa."*

**Test:** `npm run dev` → strona otwiera się na http://localhost:3000.

## Etap 2 — Logowanie e-mailem
Auth.js z magic linkiem przez Resend, strona logowania, ochrona stron. Zgodnie
z 02-architektura.md i 04-api.md.

**Test:** podajesz swój e-mail → dostajesz maila → klikasz link → jesteś zalogowany.

## Etap 3 — Czat z routerem AI
Interfejs czatu (lista rozmów + okno rozmowy), `POST /api/chat` ze streamingiem,
router modeli wg 05-router-ai.md, prompt systemowy wg 07-prompty.md, zapisywanie
historii, licznik 10 darmowych pytań.

**Test:** rozmowa działa, odpowiedzi pojawiają się płynnie; pytanie „jaka będzie
pogoda" jest odrzucane; po 10 pytaniach pojawia się blokada.

## Etap 4 — Scraping
Pola na adres organizacji i konkursu, crawler + PDF-y wg 06-scraping.md,
podsumowanie w czacie, treści w kontekście AI z prompt cachingiem.

**Test:** wklej stronę prawdziwej organizacji i prawdziwego konkursu (np.
z funduszy lokalnych) → asystent poprawnie streszcza dokumenty i odpowiada
na pytania o wymogi konkursu, cytując dokumentację.

## Etap 5 — Płatności
Stripe Checkout wg 08-platnosci.md: strona /pakiety, checkout, webhook,
doliczanie pytań. Testy przez Stripe CLI.

**Test:** wyczerp limit → kup pakiet testową kartą 4242… → pytania doliczone.

## Etap 6 — Wygląd
Dostarcz plik graficzny i poproś o odwzorowanie wyglądu w całej aplikacji
(czat, logowanie, pakiety, strony prawne). Sprawdź też widok na telefonie.

## Etap 7 — Panel admina
Wg 09-panel-admina.md. **Test:** statystyki się zgadzają, edycja promptu działa
od kolejnego pytania, konto bez uprawnień dostaje 404.

## Etap 8 — Strony prawne i szlify
Wg 10-prawo-rodo.md: trzy strony, stopka, baner cookies, checkbox przy zakupie,
ostrzeżenie pod czatem. Przejdź całą checklistę z tamtego pliku.

## Etap 9 — Wdrożenie (gdy wszystko działa lokalnie)
Rekomendacja: **Vercel** (hosting Next.js, darmowy start) + **Neon** (PostgreSQL,
darmowy start) — bez własnego VPS. Do tego: domena, produkcyjne klucze Stripe
(wymaga aktywacji konta — dane firmy), webhook produkcyjny, zweryfikowana domena
w Resend. Ten etap zaplanuj z narzędziem AI osobno, gdy przyjdzie czas.

---

## GitHub — minimum, którego potrzebujesz

Git to system zapisywania „migawek" projektu; GitHub to kopia w chmurze. Nie musisz
znać komend — **proś narzędzie AI**, ono wykona je za Ciebie:

- Po każdym udanym etapie: *„Zapisz zmiany w gicie z opisem: Etap X — [co zrobiono]"*.
- Raz, na początku: *„Zainicjuj repozytorium git, dodaj .gitignore (koniecznie
  z .env.local i dev.db) i wypchnij projekt do mojego GitHuba jako prywatne
  repozytorium asystent-grantowy"* (narzędzie poprowadzi Cię przez logowanie).
- Gdy coś się zepsuje: *„Przywróć projekt do stanu z ostatniego zapisu w gicie"*.

**Żelazna zasada:** plik `.env.local` (klucze API!) nigdy nie trafia do GitHuba.

## Rady na współpracę z narzędziem AI

- Jeden etap na raz; w nowej sesji zaczynaj od „Przeczytaj dokumentację w folderze
  dokumentacja-aplikacja-granty i plik CLAUDE.md".
- Gdy coś nie działa: wklej pełną treść błędu i opisz, co robiłeś krok po kroku.
- Proś o wyjaśnienia: „wytłumacz jak osobie nietechnicznej, co zmieniłeś i po co".
- Zanim narzędzie coś usunie lub przerobi „od zera" — zapytaj, czy na pewno trzeba.
