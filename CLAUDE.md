# Asystent Wniosków Grantowych — instrukcje projektu

## O projekcie

Asystent Wniosków Grantowych — aplikacja webowa (chatbot) pomagająca polskim NGO
pisać wnioski o granty. Pełna dokumentacja: folder `dokumentacja-aplikacja-granty/`
— **przeczytaj odpowiednie pliki przed każdym zadaniem**, a plan budowy realizuj
etapami wg `11-plan-pracy.md`.

## O właścicielu projektu

Właściciel NIE jest programistą. Zawsze:
- wyjaśniaj zmiany prostym językiem, po polsku, bez żargonu;
- po każdym zadaniu podaj dokładne kroki, jak przetestować efekt w przeglądarce;
- przed usunięciem czegokolwiek lub dużą przebudową — zapytaj i wyjaśnij konsekwencje;
- gdy potrzebujesz decyzji (np. wariant wyglądu), przedstaw 2–3 opcje z rekomendacją.

## Stack (wiążący — nie zmieniać bez zgody)

Next.js 15+ (App Router) + TypeScript, Tailwind CSS, Prisma + PostgreSQL (Neon,
także lokalnie — od Etapu 3.5), Auth.js (magic link przez Resend), Anthropic SDK
(`@anthropic-ai/sdk`), Stripe Checkout, scraping: cheerio + `unpdf`.
Minimum dodatkowych bibliotek.

## Zasady twarde

1. Klucze API tylko w `.env.local`; ten plik musi być w `.gitignore`.
2. Limit pytań, ceny pakietów i uprawnienia admina sprawdzane wyłącznie po stronie
   serwera. Zużycie pytania = **atomowa rezerwacja przed wywołaniem AI**
   (warunkowe `updateMany` w transakcji — nigdy „sprawdź, potem zapisz");
   szczegóły w `03-baza-danych.md` i `12-etap-3-5-poprawki.md`.
3. Ochrona darmowego limitu: ciasteczko `ag_device` + tabela `FreeQuota`
   (pula per urządzenie i dzienna per IP) — nie usuwać ani nie osłabiać.
   Limit długości wiadomości 50 000 znaków i rate limit 4 pytania/min — jw.
4. Uprawnienia admina wyłącznie z `ADMIN_EMAILS` (w bazie nie ma pola `isAdmin`);
   nie-admini dostają na `/admin` i `/api/admin/*` — 404.
5. Modele AI: router wg `dokumentacja-aplikacja-granty/05-router-ai.md`
   (`claude-haiku-4-5` / `claude-sonnet-5`); rozmowa z wczytaną dokumentacją →
   zawsze Sonnet; prompt caching na zeskrapowanych treściach obowiązkowy.
6. Prompt systemowy czatu jest w bazie (`AppSetting.system_prompt`), nie w kodzie.
7. Scraper: ochrona przed SSRF wg `06-scraping.md` (blokada adresów prywatnych);
   wykonywany synchronicznie ze strumieniowanym postępem (bez pracy „w tle").
8. Webhook Stripe: weryfikacja podpisu, idempotencja (z testem automatycznym);
   pytania dolicza tylko webhook. Middleware nie może przekierowywać `/api/*`.
9. Interfejs użytkownika po polsku; komunikaty błędów czytelne dla laika.
10. Po zakończeniu etapu: zaproponuj zapis w gicie (commit) z opisem po polsku.

## Komendy

- `npm run dev` — uruchomienie lokalne (http://localhost:3000)
- `npm test` — testy automatyczne (vitest)
- `npx prisma migrate dev` — migracja bazy po zmianie schematu
- `npx prisma studio` — podgląd bazy w przeglądarce
- `stripe listen --forward-to localhost:3000/api/stripe/webhook` — webhooki lokalnie

## Stan projektu

Checklista etapów z datami: **`STATUS.md`** — aktualizuj tam po każdym etapie, nie tutaj.
