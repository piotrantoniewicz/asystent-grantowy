# 05 — Router modeli AI

## Cel

Każde pytanie użytkownika trafia najpierw do routera, który decyduje, czy wystarczy
tani, szybki model, czy potrzebny jest model najmocniejszy. Dzięki temu proste pytania
kosztują grosze, a pełną moc płacimy tylko przy pisaniu wniosku.

## Modele (Anthropic API — stan na lipiec 2026)

| Rola | Model | ID modelu | Cena wejście / wyjście (za 1M tokenów) |
|---|---|---|---|
| Tani — proste pytania, klasyfikacja | Claude Haiku 4.5 | `claude-haiku-4-5` | $1 / $5 |
| Mocny — pisanie wniosku, analiza dokumentacji | Claude Sonnet 5 | `claude-sonnet-5` | $5 / $25 |

Używać **oficjalnego SDK** `@anthropic-ai/sdk`. ID modeli wpisywać dokładnie jak
wyżej (bez dopisków dat).

## Jak działa router — dwa kroki

### Krok 1: klasyfikacja pytania (zawsze Haiku, ~200 tokenów, ułamek grosza)

Przed właściwą odpowiedzią wysyłamy do `claude-haiku-4-5` krótkie zapytanie
klasyfikujące — **bez** pełnej dokumentacji konkursu w kontekście, tylko pytanie
użytkownika + ostatnie 2–3 wiadomości dla kontekstu:

```
Zaklasyfikuj pytanie użytkownika do jednej kategorii. Odpowiedz wyłącznie jednym słowem.

SIMPLE — proste pytanie faktograficzne, doprecyzowanie, small talk, pytanie o terminy
         lub kwoty wprost zapisane w dokumentacji, pytanie o obsługę aplikacji
COMPLEX — pisanie lub redagowanie treści wniosku, ocena kwalifikowalności,
          wymyślanie i rozwijanie pomysłów na projekt, analiza wymogów konkursu,
          porównywanie opcji, budżet projektu

Pytanie: {treść}
```

Do klasyfikacji użyć **structured outputs** (`output_config.format` z enum
`["SIMPLE", "COMPLEX"]`), żeby odpowiedź była zawsze poprawna. W razie błędu
klasyfikacji (timeout itp.) — domyślnie `COMPLEX` (lepiej przepłacić niż dać słabą
odpowiedź).

### Krok 2: właściwa odpowiedź

| Klasa | Model | Parametry |
|---|---|---|
| SIMPLE | `claude-haiku-4-5` | `max_tokens: 2048` |
| COMPLEX | `claude-sonnet-5` | `max_tokens: 64000`, streaming, `thinking: {type: "adaptive"}` |

Oba wywołania dostają **ten sam pełny kontekst**: prompt systemowy + zeskrapowane
treści + historia rozmowy.

## Prompt caching — obowiązkowy

Kontekst rozmowy jest duży (dokumentacja konkursu!). Na ostatnim bloku stałej części
kontekstu (koniec zeskrapowanych treści) ustawić:

```json
"cache_control": { "type": "ephemeral" }
```

Efekt: pierwsze pytanie w rozmowie płaci pełną cenę za wczytanie dokumentacji,
kolejne ok. 10% tej ceny. **Uwaga:** cache jest osobny dla każdego modelu — dlatego
klasyfikator (krok 1) celowo NIE dostaje pełnej dokumentacji, tylko samo pytanie.

Kolejność bloków w zapytaniu (stałe → zmienne, inaczej cache nie działa):
1. Prompt systemowy (stały w ramach rozmowy)
2. Treści zeskrapowane (stałe w ramach rozmowy) ← tu `cache_control`
3. Historia wiadomości (rośnie)
4. Nowe pytanie

## Obsługa błędów API

- `429` (limit zapytań) i `5xx`: SDK sam ponawia (domyślnie 2 razy); jeśli dalej
  błąd — komunikat w czacie: „Chwilowe przeciążenie, spróbuj za minutę" (pytanie
  NIE zostaje zużyte z limitu).
- `refusal` / odmowa modelu: pokazać treść odmowy, pytania nie zliczać.
- Zapisywać w `Message.modelUsed` faktycznie użyty model oraz tokeny z pola
  `usage` odpowiedzi — panel admina liczy z tego koszty.

## Szacunek kosztów (orientacyjnie)

Typowa rozmowa: dokumentacja konkursu ~30 tys. tokenów w kontekście, 20 pytań
(15 COMPLEX / 5 SIMPLE), z cache: **ok. $1,5–3 za całą rozmowę**. Pakiet 50 pytań
za 25 zł jest przy tych założeniach na granicy opłacalności — panel admina musi
pokazywać realne koszty, żeby skorygować ceny pakietów po pierwszych użytkownikach.
