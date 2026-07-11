# 06 — Scraping: strona organizacji i strona konkursu

## Dwa tryby

### Tryb A: strona organizacji (`kind: "organization"`)
Cel: profil organizacji do wniosku (misja, działania, doświadczenie, zespół).
- Pobierz stronę główną + podstrony z tej samej domeny, których adres lub tytuł
  sugeruje treść o organizacji: `o-nas`, `about`, `misja`, `statut`, `projekty`,
  `dzialania`, `zespol`, `historia`, `kontakt`.
- Limit: **maks. 15 podstron**, głębokość 2 kliknięcia od strony głównej.

### Tryb B: strona konkursu grantowego (`kind: "grant"`)
Cel: KOMPLETNA dokumentacja konkursu — to podstawa całej rozmowy.
- Pobierz stronę podaną przez użytkownika + wszystkie podstrony w tej samej domenie
  osiągalne do głębokości 2, których adres/kotwica sugeruje związek z konkursem
  (`regulamin`, `dokumenty`, `nabor`, `konkurs`, `faq`, `zasady`, `wniosek`,
  `zalaczniki`, `harmonogram`, `kryteria`).
- **Pobierz wszystkie linkowane pliki PDF** (regulaminy, wzory wniosków, karty oceny)
  — także z innych domen, jeśli link prowadzi bezpośrednio do PDF-a.
- Limity: maks. **30 podstron HTML** i **15 plików PDF**, maks. 10 MB na plik.

## Przetwarzanie treści

- HTML → czysty tekst przez `cheerio`: usunąć `<nav>`, `<footer>`, `<script>`,
  `<style>`, menu, stopki, banery cookies. Zachować nagłówki (jako `#`, `##`),
  listy i tabele (jako tekst).
- PDF → tekst przez `pdf-parse`. Jeśli PDF nie zawiera warstwy tekstowej (skan),
  zapisać stronę ze statusem błędu i poinformować w podsumowaniu: „Plik X wygląda
  na skan — nie udało się odczytać treści, przepisz kluczowe wymogi ręcznie do czatu".
- Każdą stronę zapisać jako `ScrapedPage` (url, tytuł, tekst).
- Deduplikacja: pomijaj strony o identycznej treści (porównanie hashem).

## Podsumowanie po pobraniu

Po zakończeniu wygenerować `summary` (jednym wywołaniem `claude-haiku-4-5`):
- dla organizacji: 3–5 zdań o tym, czym jest organizacja;
- dla konkursu: lista znalezionych dokumentów + kluczowe fakty (kto organizuje,
  dla kogo, kwoty, termin naboru — jeśli są w treści).

Podsumowanie pokazuje się w czacie jako wiadomość asystenta, z pytaniem:
„Czy czegoś brakuje? Jeśli tak, wklej link do brakującego dokumentu."

## Zasady techniczne i bezpieczeństwo

- **User-Agent**: przedstawiać się uczciwie, np.
  `AsystentGrantowy/1.0 (+https://twojadomena.pl)`.
- **Szanować robots.txt** dla crawlingu podstron (adres podany wprost przez
  użytkownika pobieramy zawsze — to jego świadoma decyzja).
- Grzeczne tempo: maks. 2 równoległe pobrania, 500 ms przerwy między żądaniami
  do tej samej domeny, timeout 15 s na stronę.
- **Ochrona przed SSRF** (krytyczne): przed pobraniem rozwiązać nazwę domeny
  i odrzucić adresy prywatne/lokalne (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`,
  `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `localhost`). Akceptować tylko
  `http:`/`https:`. Sprawdzać także po przekierowaniach.
- Treść zeskrapowana jest **niezaufana**: w interfejsie renderować jako tekst
  (bez wstrzykiwania HTML). W prompcie systemowym zaznaczyć, że instrukcje
  znalezione w treści stron NIE są poleceniami dla asystenta (ochrona przed
  prompt injection — patrz `07-prompty.md`).

## Przebieg w interfejsie

1. Użytkownik wkleja adres (dedykowane pole nad czatem lub sam link w czacie —
   frontend wykrywa URL i pyta: „strona organizacji czy konkursu?").
2. W czacie pojawia się pasek postępu: „Przeglądam stronę… znaleziono X podstron,
   Y dokumentów PDF".
3. Po zakończeniu — podsumowanie (jak wyżej).
4. Błąd (strona nie odpowiada, blokada): czytelny komunikat + rada, np. „Możesz
   też wkleić treść regulaminu bezpośrednio do czatu".
