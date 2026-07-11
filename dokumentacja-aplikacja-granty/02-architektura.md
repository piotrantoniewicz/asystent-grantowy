# 02 — Architektura i technologie

## Stack technologiczny (decyzje wiążące)

| Warstwa | Technologia | Uzasadnienie |
|---|---|---|
| Framework | **Next.js 15+ (App Router) + TypeScript** | Frontend i backend w jednym projekcie, łatwe uruchamianie lokalne (`npm run dev`), łatwe wdrożenie później |
| Baza danych | **SQLite lokalnie → PostgreSQL na produkcji** | SQLite nie wymaga żadnej instalacji; Prisma pozwala później przełączyć się na Postgres zmianą konfiguracji |
| ORM | **Prisma** | Czytelny schemat bazy, migracje, dobre wsparcie w narzędziach AI |
| Logowanie | **Auth.js (NextAuth v5), provider e-mail (magic link)** | Bez haseł; wysyłka maili przez **Resend** (darmowy plan wystarczy na start) |
| AI | **Anthropic API, oficjalny SDK `@anthropic-ai/sdk`** | Router modeli: Haiku 4.5 / Opus 4.8 — szczegóły w `05-router-ai.md` |
| Scraping | **fetch + cheerio** (HTML), **pdf-parse** (PDF) | Bez zewnętrznych usług płatnych; szczegóły w `06-scraping.md` |
| Płatności | **Stripe Checkout + webhooki** | BLIK, Google Pay, karty, Przelewy24 — szczegóły w `08-platnosci.md` |
| Style | **Tailwind CSS** | Szybkie odwzorowanie projektu graficznego, który dostarczy właściciel |

**Zasada nadrzędna: minimum zależności.** Nie dodawać bibliotek, których dokumentacja
nie wymienia, bez wyraźnej potrzeby.

## Schemat systemu

```
Przeglądarka użytkownika
   │  (czat, logowanie, płatność)
   ▼
Next.js — frontend (React) + backend (API routes)
   │            │              │            │
   ▼            ▼              ▼            ▼
 Baza        Router AI      Scraper      Stripe
(Prisma)   (Anthropic API) (strony+PDF) (Checkout+webhook)
```

Wszystko działa w jednym procesie Next.js — nie ma osobnego serwera backendowego.
Klucze API (Anthropic, Stripe, Resend) trzymane są **wyłącznie po stronie serwera**
w pliku `.env.local` (nigdy w kodzie frontendu, nigdy w repozytorium Git).

## Struktura folderów projektu

```
asystent-grantowy/
├── CLAUDE.md                  # instrukcje dla narzędzia AI (z szablonu)
├── dokumentacja-aplikacja-granty/   # ta dokumentacja
├── prisma/
│   └── schema.prisma          # schemat bazy (wg 03-baza-danych.md)
├── src/
│   ├── app/                   # strony i API routes (Next.js App Router)
│   │   ├── (chat)/            # główny interfejs czatu
│   │   ├── admin/             # panel administratora
│   │   ├── api/               # endpointy (wg 04-api.md)
│   │   ├── polityka-prywatnosci/
│   │   ├── regulamin/
│   │   └── cookies/
│   ├── lib/
│   │   ├── ai/                # router modeli, klient Anthropic, prompty
│   │   ├── scraper/           # pobieranie stron i PDF-ów
│   │   ├── stripe/            # płatności
│   │   └── db.ts              # klient Prisma
│   └── components/            # komponenty interfejsu
└── .env.local                 # klucze API (poza Gitem!)
```

## Jak dane z zeskrapowanych stron trafiają do AI (ważna decyzja)

Nie budujemy bazy wektorowej ani RAG — to niepotrzebna komplikacja przy tej skali.
Zamiast tego:

1. Zeskrapowana treść (organizacja + konkurs) jest zapisywana w bazie danych,
   przypisana do rozmowy.
2. Przy każdym zapytaniu do AI treść ta jest wstawiana do kontekstu rozmowy
   jako stały blok na początku.
3. Blok jest oznaczony **prompt caching** (`cache_control: {type: "ephemeral"}`),
   dzięki czemu Anthropic liczy go wielokrotnie taniej (ok. 10% ceny) przy kolejnych
   pytaniach w tej samej rozmowie. To kluczowe dla kosztów — dokumentacja konkursu
   może mieć dziesiątki stron.
4. Limit bezpieczeństwa: jeśli łączna treść przekracza ~150 000 słów, scraper
   przycina najmniej istotne strony (i informuje o tym w czacie).

## Zmienne środowiskowe (`.env.local`)

```
DATABASE_URL="file:./dev.db"
ANTHROPIC_API_KEY="sk-ant-..."
AUTH_SECRET="(wygenerowany losowy ciąg)"
RESEND_API_KEY="re_..."
EMAIL_FROM="Asystent Grantowy <noreply@twojadomena.pl>"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
ADMIN_EMAILS="piotr.antoniewicz@gmail.com"
```

## Bezpieczeństwo — wymagania minimalne

- Wszystkie endpointy czatu i płatności wymagają zalogowania.
- Panel `/admin` dostępny tylko dla adresów z `ADMIN_EMAILS`.
- Limit pytań sprawdzany **po stronie serwera** przy każdym zapytaniu (nigdy tylko
  w przeglądarce).
- Webhook Stripe weryfikowany podpisem (`STRIPE_WEBHOOK_SECRET`).
- Scraper odwiedza wyłącznie adresy podane przez użytkownika i podstrony w tej samej
  domenie; blokada adresów lokalnych/prywatnych (ochrona przed SSRF — szczegóły
  w `06-scraping.md`).
- Treści od użytkownika i ze stron traktowane jako niezaufane (escapowanie w HTML).
