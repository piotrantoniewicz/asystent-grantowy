# 10 — Wymogi prawne (RODO, cookies, regulamin — prawo polskie)

> **Zastrzeżenie:** ten dokument to lista wymagań do wdrożenia w aplikacji, nie
> porada prawna. Przed startem produkcyjnym (płatności od prawdziwych osób) warto
> dać regulamin i politykę prywatności do sprawdzenia prawnikowi.

## Strony do zbudowania

Trzy publiczne strony, linkowane w stopce każdej podstrony:
- `/polityka-prywatnosci`
- `/regulamin`
- `/cookies`

Treści stron trzymać jako pliki Markdown w repo (łatwa edycja), renderowane na stronę.

## Polityka prywatności — co musi zawierać (RODO)

1. **Administrator danych**: imię i nazwisko / nazwa, adres, e-mail kontaktowy
   (uzupełni właściciel).
2. **Jakie dane i po co** (cel + podstawa prawna):
   - e-mail — logowanie i prowadzenie konta (art. 6 ust. 1 lit. b RODO — umowa);
   - treść rozmów, w tym dane wpisane do czatu — świadczenie usługi (lit. b);
   - dane płatności — obsługiwane przez Stripe (my nie widzimy numeru karty);
     dane rozliczeniowe: obowiązek prawny (lit. c);
   - adresy IP, logi — bezpieczeństwo (lit. f — uzasadniony interes);
   - podgląd rozmów przez administratora — kontrola jakości i bezpieczeństwa
     (lit. f).
3. **Odbiorcy danych (podmioty przetwarzające)**: Anthropic (przetwarzanie treści
   rozmów przez AI, transfer do USA — standardowe klauzule umowne / DPF), Stripe
   (płatności), Resend (wysyłka maili), dostawca hostingu (uzupełnić po wyborze).
4. **Ostrzeżenie i zasada minimalizacji**: wyraźna informacja, żeby nie wpisywać
   do czatu danych osobowych osób trzecich ani danych wrażliwych; treść rozmów
   jest przekazywana do dostawcy AI.
5. **Okres przechowywania**: konto i rozmowy — do usunięcia konta; dane
   rozliczeniowe — 5 lat (przepisy podatkowe).
6. **Prawa użytkownika**: dostęp, sprostowanie, usunięcie, ograniczenie,
   przenoszenie, sprzeciw, skarga do PUODO (uodo.gov.pl).
7. **Usuwanie konta**: w wersji 1 wystarczy adres e-mail do zgłoszeń + procedura
   ręczna (usunięcie użytkownika kaskadowo usuwa rozmowy); opisać to w polityce.

## Cookies

Aplikacja używa wyłącznie **cookies niezbędnych**:
- sesja logowania Auth.js,
- `ag_device` — identyfikator urządzenia (httpOnly, 400 dni) służący wyłącznie
  zapobieganiu nadużyciom darmowego limitu pytań (bezpieczeństwo usługi —
  uzasadniony interes, art. 6 ust. 1 lit. f RODO; wymienić na `/cookies`
  i w polityce prywatności).

Nie dodajemy analityki ani marketingu w wersji 1 — dzięki temu:
- baner cookies może być prostą informacją („Używamy wyłącznie plików cookie
  niezbędnych do działania serwisu — logowania i bezpieczeństwa.") z przyciskiem
  „Rozumiem", **bez** mechanizmu zgód;
- strona `/cookies` wymienia konkretne cookies (nazwa, cel, czas życia).

**Uwaga na przyszłość:** dodanie Google Analytics itp. wymaga pełnego banera zgód
(zgoda przed załadowaniem skryptu) — wtedy wrócić do tego punktu.

## Regulamin — co musi zawierać

1. Usługodawca (dane właściciela) i definicje.
2. Opis usługi: asystent AI do wniosków grantowych; 10 darmowych pytań; pakiety płatne.
3. **Charakter odpowiedzi AI**: treści generowane automatycznie, mogą zawierać
   błędy; użytkownik odpowiada za weryfikację wniosku przed złożeniem; usługodawca
   nie gwarantuje otrzymania grantu.
4. Zasady płatności: ceny brutto, Stripe, pakiety bez terminu ważności.
5. **Prawo odstąpienia (kluczowe!)**: pakiet pytań = treść/usługa cyfrowa.
   Zgodnie z ustawą o prawach konsumenta, przy zakupie musi być checkbox:
   *„Żądam rozpoczęcia świadczenia usługi przed upływem terminu odstąpienia
   i przyjmuję do wiadomości, że wykorzystanie zakupionych pytań oznacza utratę
   prawa odstąpienia w odpowiednim zakresie"*. Bez tej zgody konsument ma 14 dni
   na zwrot. Zwroty niewykorzystanych pytań: opisać procedurę (proporcjonalny zwrot).
6. Reklamacje: adres e-mail, termin odpowiedzi 14 dni.
7. Zakazane użycia: próby obchodzenia ograniczeń, treści bezprawne.
8. Zmiany regulaminu, prawo właściwe (polskie), sądy.
9. Pozasądowe rozwiązywanie sporów (platforma ODR / rzecznik konsumentów).

## Wdrożenie w aplikacji (checklist)

- [ ] Stopka z linkami do trzech stron na każdej podstronie
- [ ] Przy logowaniu (formularz e-mail): tekst „Logując się akceptujesz Regulamin
      i Politykę prywatności" z linkami
- [ ] Przy zakupie: checkbox zgody na natychmiastowe wykonanie usługi (pkt 5 wyżej)
      — wymagany do przejścia do płatności
- [ ] Baner cookies (prosty, informacyjny)
- [ ] Ostrzeżenie pod oknem czatu: „Nie wpisuj danych osobowych osób trzecich.
      Odpowiedzi generuje AI — zweryfikuj treść przed złożeniem wniosku."
- [ ] Adres e-mail do spraw RODO/reklamacji w stopce
