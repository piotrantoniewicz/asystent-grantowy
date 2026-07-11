# 04 — Specyfikacja API (endpointy)

Wszystkie endpointy to Next.js API routes w `src/app/api/`. Jeśli nie zaznaczono
inaczej — wymagają zalogowanego użytkownika i zwracają JSON. Błędy zawsze w formacie
`{ "error": "czytelny komunikat po polsku" }` z odpowiednim kodem HTTP.

## Autoryzacja

Obsługiwana przez Auth.js (magic link) — standardowe endpointy `/api/auth/*`
generowane automatycznie. Nie pisać własnych.

## Czat

### `POST /api/chat`
Główny endpoint rozmowy. **Odpowiedź strumieniowana** (SSE / ReadableStream).

Żądanie:
```json
{ "conversationId": "…", "message": "treść pytania użytkownika" }
```

Kolejność działań na serwerze:
1. Sprawdź sesję użytkownika (401 jeśli brak).
2. Sprawdź limit pytań (403 + `{ "error": "limit", "buyUrl": "/pakiety" }` jeśli wyczerpany).
3. Zapisz wiadomość użytkownika do bazy.
4. Zbuduj kontekst: prompt systemowy (z `AppSetting`) + zeskrapowane treści rozmowy
   (z cache_control) + historia wiadomości.
5. Router wybiera model (patrz `05-router-ai.md`) i wywołuje Anthropic API ze streamingiem.
6. Strumieniuj tekst do przeglądarki; po zakończeniu zapisz odpowiedź, model,
   tokeny i zaktualizuj licznik pytań (jedna transakcja).

### `GET /api/conversations` — lista rozmów użytkownika (id, tytuł, data).
### `POST /api/conversations` — utwórz nową rozmowę.
### `GET /api/conversations/[id]` — rozmowa z wiadomościami i źródłami (tylko właściciel — 404 dla cudzych).
### `DELETE /api/conversations/[id]` — usuń rozmowę.

## Scraping

### `POST /api/scrape`
Uruchamia pobieranie strony. Nie liczy się jako pytanie.

Żądanie:
```json
{ "conversationId": "…", "url": "https://…", "kind": "organization" | "grant" }
```

Odpowiedź natychmiastowa: `{ "sourceId": "…", "status": "pending" }`.
Pobieranie działa w tle (w ramach tego samego procesu); frontend odpytuje status.

### `GET /api/scrape/[sourceId]`
Status pobierania: `{ "status": "pending" | "done" | "error", "summary": "…",
"pages": [{ "url", "title", "contentType" }] }`.

## Płatności

### `GET /api/packages` — lista pakietów (publiczny):
```json
[
  { "id": "pakiet-50",  "name": "Pakiet 50 pytań",  "questions": 50,  "pricePln": 2500 },
  { "id": "pakiet-120", "name": "Pakiet 120 pytań", "questions": 120, "pricePln": 4900 },
  { "id": "pakiet-300", "name": "Pakiet 300 pytań", "questions": 300, "pricePln": 9900 }
]
```

### `POST /api/checkout`
Żądanie: `{ "packageId": "pakiet-50" }`.
Tworzy sesję Stripe Checkout i rekord `Purchase(status: pending)`.
Odpowiedź: `{ "url": "https://checkout.stripe.com/…" }` — frontend przekierowuje.

### `POST /api/stripe/webhook` (publiczny, bez sesji użytkownika)
Odbiera zdarzenia Stripe. Weryfikuje podpis. Na `checkout.session.completed`:
oznacza `Purchase` jako `paid` i dodaje pytania do `paidQuestionsRemaining`.
Idempotentny — ponowne dostarczenie tego samego zdarzenia nic nie zmienia.

### `GET /api/me` — dane zalogowanego użytkownika:
```json
{ "email": "…", "freeQuestionsRemaining": 4, "paidQuestionsRemaining": 50 }
```

## Panel administratora (wymagają `isAdmin`; 403 dla pozostałych)

### `GET /api/admin/stats`
```json
{
  "totalUsers": 0, "usersLast30Days": 0,
  "totalQuestions": 0, "questionsLast30Days": 0,
  "revenuePlnTotal": 0, "revenuePlnLast30Days": 0,
  "estimatedAiCostUsd": 0.0,
  "modelUsage": { "claude-haiku-4-5": 0, "claude-sonnet-5": 0 }
}
```

### `GET /api/admin/settings` / `PUT /api/admin/settings`
Odczyt i zapis ustawień (`system_prompt`, `free_questions_limit`).

### `GET /api/admin/conversations`
Lista wszystkich rozmów (stronicowana) z możliwością podglądu — do kontroli jakości.
