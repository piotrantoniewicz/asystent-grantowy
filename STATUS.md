# Stan projektu — Asystent Wniosków Grantowych

Aktualizuj po każdym etapie — wpisz datę i co ukończono. Plan etapów: `dokumentacja-aplikacja-granty/11-plan-pracy.md`.

- [x] Etap 1 — szkielet + baza (2026-07-11)
- [x] Etap 2 — logowanie (2026-07-11, wymaga RESEND_API_KEY do pełnego testu wysyłki maila)
- [x] Etap 3 — czat + router AI (2026-07-11, przetestowano na żywo: SIMPLE→Haiku, COMPLEX→Sonnet, odmowa poza zakresem, blokada po limicie darmowych pytań; poprawiono błędny ID modelu Sonnet w dokumentacji, `claude-sonnet-5-0` → `claude-sonnet-5`)
- [x] Etap 3.5 — poprawki i zabezpieczenia (2026-07-13, instrukcja: `dokumentacja-aplikacja-granty/12-etap-3-5-poprawki.md`; przejście na PostgreSQL/Neon zrobione i przetestowane na żywo — logowanie, czat, rate limit 4/min, limit długości wiadomości, blokada bez ciasteczka `ag_device`, wyczerpanie darmowej puli, usuwanie rozmowy, licznik pytań po `/api/me`; `npm test` — 9/9 zielone; `tsc --noEmit` i `npm run lint` bez błędów)
- [ ] Etap 4 — scraping
- [ ] Etap 5 — płatności
- [ ] Etap 6 — wygląd
- [ ] Etap 7 — panel admina
- [ ] Etap 8 — strony prawne
- [ ] Etap 9 — wdrożenie
