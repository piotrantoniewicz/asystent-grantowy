# Dokumentacja projektu: Asystent Wniosków Grantowych

Ten folder zawiera kompletną dokumentację aplikacji webowej — chatbota pomagającego
organizacjom pozarządowym pisać wnioski o granty. Dokumentacja jest przygotowana tak,
żeby pracować z nią przy pomocy narzędzi AI do kodowania (Claude Code, Cursor itp.).

## Jak korzystać z tej dokumentacji (dla osoby nieprogramującej)

1. **Załóż folder projektu** (np. `~/Projekty/asystent-grantowy`) i skopiuj do niego
   cały ten folder dokumentacji oraz plik `CLAUDE-md-szablon.md` (zmień mu nazwę na
   `CLAUDE.md` i umieść w głównym folderze projektu).
2. **Otwórz narzędzie AI w folderze projektu** i pracuj etapami według pliku
   `11-plan-pracy.md`. Nie proś o zbudowanie wszystkiego naraz — po jednym etapie.
3. **Przy każdym etapie** mów narzędziu np.: *„Przeczytaj dokumentację w folderze
   `dokumentacja-aplikacja-granty`, a następnie zrealizuj Etap 2 z pliku 11-plan-pracy.md"*.
4. **Po każdym etapie testuj** — uruchom aplikację lokalnie i sprawdź, czy działa,
   zanim przejdziesz dalej.

## Spis plików

| Plik | Co zawiera |
|---|---|
| `01-wizja-produktu.md` | Co robi aplikacja, dla kogo, pełna lista funkcji |
| `02-architektura.md` | Technologie, struktura systemu, decyzje techniczne |
| `03-baza-danych.md` | Struktura bazy danych (tabele i relacje) |
| `04-api.md` | Lista endpointów (punktów komunikacji frontend–backend) |
| `05-router-ai.md` | Router modeli AI: tani model do prostych pytań, mocny do wniosków |
| `06-scraping.md` | Pobieranie danych ze strony organizacji i strony konkursu |
| `07-prompty.md` | Prompty systemowe, ograniczenie zakresu rozmowy, styl bez „AI-zmów" |
| `08-platnosci.md` | Stripe, pakiety pytań, BLIK / Google Pay / Przelewy24 |
| `09-panel-admina.md` | Panel administratora: statystyki, edycja promptu |
| `10-prawo-rodo.md` | RODO, polityka prywatności, cookies, regulamin — polskie prawo |
| `11-plan-pracy.md` | Plan budowy krok po kroku + podstawy GitHuba |
| `CLAUDE-md-szablon.md` | Szablon pliku CLAUDE.md do głównego folderu projektu |

## Najważniejsze decyzje (podjęte 2026-07-11)

- **Logowanie:** e-mailem, przez link logujący (magic link), bez haseł.
- **Model płatności:** pakiety pytań (od 25 zł), płatność jednorazowa przez Stripe.
- **Modele AI:** Anthropic Claude — Haiku 4.5 (proste pytania), Sonnet 5 (pisanie wniosku).
- **Historia rozmów:** zapisywana — użytkownik może wrócić do pracy nad wnioskiem.
- **Limit darmowy:** 10 pytań na konto.
- **Praca:** najpierw wszystko lokalnie na komputerze; wdrożenie na serwer później.
