# 09 — Panel administratora

Dostępny pod `/admin`. Widzą go wyłącznie zalogowani użytkownicy, których e-mail
jest na liście `ADMIN_EMAILS` (zmienna środowiskowa) — przy logowaniu takiego
adresu ustawiane jest `User.isAdmin = true`. Pozostali dostają 404 (nie 403 —
nie zdradzamy, że panel istnieje).

## Zakładki

### 1. Pulpit (statystyki)

Karty z liczbami (dane z `GET /api/admin/stats`):
- Użytkownicy: łącznie / nowi w 30 dni
- Zadane pytania: łącznie / w 30 dni
- Przychód: łącznie / w 30 dni (z opłaconych `Purchase`)
- **Szacowany koszt AI** (USD): liczony z zapisanych tokenów × cennik modeli
  (Haiku 4.5: $1/$5 za 1M tokenów wejście/wyjście; Sonnet 5: $5/$25;
  tokeny z cache liczyć ×0,1 dla odczytu)
- Podział pytań na modele (ile poszło do Haiku, ile do Sonneta) — kontrola,
  czy router działa sensownie
- Prosty wykres: pytania dziennie z ostatnich 30 dni

Ta zakładka odpowiada na kluczowe pytanie biznesowe: **czy pakiet 25 zł pokrywa
koszty AI** (porównanie przychodu i kosztu na pulpicie obok siebie).

### 2. Ustawienia

- **Prompt systemowy** — duże pole tekstowe z aktualną treścią (z `AppSetting`),
  przycisk „Zapisz" i przycisk „Przywróć domyślny". Zmiana działa od następnego
  pytania (bez restartu aplikacji).
- **Limit darmowych pytań** — pole liczbowe (domyślnie 10).
- (Ceny pakietów w wersji 1 zmieniamy w kodzie — sekcja tylko wyświetla aktualne
  pakiety dla informacji.)

### 3. Rozmowy

- Lista wszystkich rozmów (stronicowana, najnowsze pierwsze): e-mail użytkownika,
  tytuł, liczba wiadomości, data.
- Kliknięcie otwiera podgląd rozmowy (tylko odczyt) — do kontroli jakości
  odpowiedzi i wyłapywania problemów.
- Filtr po adresie e-mail.

### 4. Użytkownicy

- Lista: e-mail, data rejestracji, zużyte darmowe pytania, pozostałe płatne,
  suma zakupów.
- Akcja „Dodaj pytania" (ręczna korekta — np. rekompensata za błąd) z polem
  liczbowym; zapis w logu (prosty wpis w konsoli serwera wystarczy w wersji 1).

## Uwagi RODO dla panelu

Podgląd rozmów przez administratora musi być ujęty w polityce prywatności
(cel: kontrola jakości i bezpieczeństwa usługi) — patrz `10-prawo-rodo.md`.
