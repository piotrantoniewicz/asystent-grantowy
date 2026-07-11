# 01 — Wizja produktu (PRD)

## Czym jest aplikacja

Aplikacja webowa w formie chatbota, która pomaga organizacjom pozarządowym (i innym
podmiotom) w trzech rzeczach — **i tylko w tych trzech**:

1. **Sprawdzenie kwalifikowalności** — czy organizacja spełnia wymogi formalne
   konkretnego konkursu grantowego.
2. **Wypracowanie pomysłu na projekt** — burza mózgów oparta o dokumentację konkursu
   i profil organizacji.
3. **Pomoc w wypełnieniu wniosku** — pisanie treści poszczególnych pól wniosku,
   w stylu formalnym, wolnym od charakterystycznych cech tekstu AI.

Rozmowy poza tym zakresem chatbot grzecznie odmawia (szczegóły: `07-prompty.md`).

## Dla kogo

Osoby piszące wnioski w NGO — często bez doświadczenia grantowego i bez wiedzy
technicznej. Interfejs musi być maksymalnie prosty: okno czatu + dwa pola na adresy
stron internetowych.

## Kluczowy przepływ użytkownika (user flow)

1. Użytkownik wchodzi na stronę → widzi krótkie wyjaśnienie i pole na e-mail.
2. Podaje e-mail → dostaje link logujący → klika → jest zalogowany (bez hasła).
3. Zakłada nową rozmowę. W rozmowie podaje (w dedykowanych polach lub wklejając w czat):
   - **adres strony swojej organizacji** — aplikacja pobiera stamtąd informacje
     o organizacji (misja, działania, doświadczenie),
   - **adres strony konkursu grantowego** — aplikacja przegląda stronę konkursu
     i pobiera całą dostępną dokumentację (podstrony, regulaminy, PDF-y).
4. Aplikacja potwierdza, co udało się pobrać („Znalazłam regulamin konkursu,
   kartę oceny i wzór wniosku…").
5. Użytkownik rozmawia: sprawdza kwalifikowalność → wymyśla projekt → pisze wniosek
   pole po polu.
6. Po wyczerpaniu 10 darmowych pytań aplikacja proponuje wykupienie pakietu
   (od 25 zł) — płatność przez Stripe (BLIK, Google Pay, karta, Przelewy24).
7. Użytkownik może wrócić po dniach/tygodniach — historia rozmów jest zapisana.

## Funkcje — lista kompletna

### Musi być w wersji 1 (MVP)
- [ ] Logowanie e-mailem (magic link), bez haseł
- [ ] Okno czatu ze strumieniowaniem odpowiedzi (tekst pojawia się na bieżąco)
- [ ] Pole/komenda do podania adresu strony organizacji + scraping tej strony
- [ ] Pole/komenda do podania adresu strony konkursu + crawling strony i PDF-ów
- [ ] Router modeli AI (tani model ↔ mocny model, wg złożoności pytania)
- [ ] Ograniczenie zakresu rozmowy (kwalifikowalność / pomysł / wniosek)
- [ ] Styl formalny, bez „AI-zmów" (szczegóły w `07-prompty.md`)
- [ ] Licznik pytań: 10 darmowych na konto, potem blokada z zachętą do zakupu
- [ ] Płatności Stripe: pakiety pytań, BLIK / Google Pay / karta / Przelewy24
- [ ] Historia rozmów (lista rozmów, powrót do rozmowy)
- [ ] Panel administratora: edycja promptu systemowego, statystyki (użytkownicy,
      pytania, przychody), lista rozmów
- [ ] Strony prawne: polityka prywatności, regulamin, polityka cookies, baner cookies
- [ ] Wygląd wg pliku graficznego dostarczonego przez właściciela w trakcie prac

### Wersja 2 (później — nie budować teraz)
- Eksport wniosku do pliku Word/PDF
- Wiele organizacji na jednym koncie
- Powiadomienia e-mail o terminach konkursu
- Konta zespołowe

## Zasady liczenia pytań

- **Pytanie** = jedna wiadomość użytkownika wysłana do czatu, na którą odpowiada AI.
- Podanie adresu strony (organizacji lub konkursu) **nie liczy się** jako pytanie.
- Komunikaty systemowe i błędy nie zużywają pytań.
- Licznik jest per **konto** (nie per rozmowa i nie per przeglądarka).
- Kupione pakiety sumują się i nie wygasają.

## Kryteria sukcesu wersji 1

- Użytkownik od wejścia na stronę do pierwszej odpowiedzi AI: poniżej 2 minut.
- Pobranie dokumentacji typowego konkursu (strona + kilka PDF-ów): poniżej 60 sekund.
- Wygenerowana treść wniosku nie jest rozpoznawalna „na oko" jako tekst AI.
- Płatność BLIK-iem działa od początku do końca (na kluczach testowych Stripe).
