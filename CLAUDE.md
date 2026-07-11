# CLAUDE.md — instrukcje projektu (szablon)

> Skopiuj ten plik do głównego folderu projektu pod nazwą `CLAUDE.md`.
> Narzędzia AI do kodowania czytają go automatycznie na starcie każdej sesji.

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

Next.js 15+ (App Router) + TypeScript, Tailwind CSS, Prisma + SQLite (lokalnie),
Auth.js (magic link przez Resend), Anthropic SDK (`@anthropic-ai/sdk`),
Stripe Checkout. Minimum dodatkowych bibliotek.

## Zasady twarde

1. Klucze API tylko w `.env.local`; ten plik oraz `dev.db` muszą być w `.gitignore`.
2. Limit pytań, ceny pakietów i uprawnienia admina sprawdzane wyłącznie po stronie
   serwera.
3. Modele AI: router wg `dokumentacja-aplikacja-granty/05-router-ai.md`
   (`claude-haiku-4-5` / `claude-sonnet-5`); prompt caching na zeskrapowanych
   treściach obowiązkowy.
4. Prompt systemowy czatu jest w bazie (`AppSetting.system_prompt`), nie w kodzie.
5. Scraper: ochrona przed SSRF wg `06-scraping.md` (blokada adresów prywatnych).
6. Webhook Stripe: weryfikacja podpisu, idempotencja; pytania dolicza tylko webhook.
7. Interfejs użytkownika po polsku; komunikaty błędów czytelne dla laika.
8. Po zakończeniu etapu: zaproponuj zapis w gicie (commit) z opisem po polsku.

## Komendy

- `npm run dev` — uruchomienie lokalne (http://localhost:3000)
- `npx prisma migrate dev` — migracja bazy po zmianie schematu
- `npx prisma studio` — podgląd bazy w przeglądarce
- `stripe listen --forward-to localhost:3000/api/stripe/webhook` — webhooki lokalnie

## Stan projektu

(Aktualizuj po każdym etapie — wpisz datę i co ukończono.)

- [x] Etap 1 — szkielet + baza (2026-07-11)
- [x] Etap 2 — logowanie (2026-07-11, wymaga RESEND_API_KEY do pełnego testu wysyłki maila)
- [x] Etap 3 — czat + router AI (2026-07-11, przetestowano na żywo: SIMPLE→Haiku, COMPLEX→Sonnet, odmowa poza zakresem, blokada po limicie darmowych pytań; poprawiono błędny ID modelu Sonnet w dokumentacji, `claude-sonnet-5-0` → `claude-sonnet-5`)
- [ ] Etap 4 — scraping
- [ ] Etap 5 — płatności
- [ ] Etap 6 — wygląd
- [ ] Etap 7 — panel admina
- [ ] Etap 8 — strony prawne
- [ ] Etap 9 — wdrożenie
