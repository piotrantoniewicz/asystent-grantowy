# dobryai.pl — asystent grantowy

Aplikacja webowa (chatbot AI po polsku), która pomaga polskim organizacjom
pozarządowym pisać wnioski o granty. Użytkownik podaje link do strony swojej
organizacji i do konkursu grantowego — asystent sam skanuje obie strony (HTML
+ PDF-y, w tym regulaminy i wytyczne), buduje z tego kontekst i na tej
podstawie prowadzi rozmowę pomagającą napisać konkretny wniosek, zamiast dawać
ogólne porady.

**Model biznesowy:** darmowy limit pytań (per urządzenie + dziennie per IP),
potem płatne pakiety pytań przez Stripe Checkout.

**Stack:** Next.js 15 (App Router) + TypeScript, PostgreSQL/Prisma (Neon),
logowanie magic-linkiem (Auth.js + Resend), Claude (Haiku/Sonnet dobierane
routerem wg złożoności pytania, z prompt cachingiem), własny scraper z
ochroną SSRF.

**Stan:** funkcjonalnie kompletna — czat, scraping, płatności, panel admina
(statystyki, ustawienia, podgląd rozmów), strony prawne. Przeszła kilka rund
audytu kodu (bezpieczeństwo, koszty, UX). Zostaje Etap 9: wdrożenie
produkcyjne (Vercel + produkcyjna baza Neon + aktywacja Stripe + uzupełnienie
danych prawnych).

**Dla kogo:** mała organizacja pozarządowa (nie-programiści) pisząca wnioski
o dofinansowanie — asystent ma zdjąć z nich pracę researchu i strukturyzowania
wniosku.
