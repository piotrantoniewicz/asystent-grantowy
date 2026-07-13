# 08 — Płatności (Stripe)

## Model biznesowy

- **10 darmowych pytań** na konto (limit edytowalny w panelu admina).
- Po wyczerpaniu — zakup pakietu pytań (jednorazowa płatność, bez subskrypcji).
- Pakiety sumują się i nie wygasają.

## Pakiety startowe (ceny brutto; do korekty po pomiarze kosztów AI w panelu admina)

| Pakiet | Pytania | Cena |
|---|---|---|
| Pakiet 50 | 50 | 25 zł |
| Pakiet 120 | 120 | 49 zł |
| Pakiet 300 | 300 | 99 zł |

Definicje pakietów trzymać w jednym pliku `src/lib/stripe/packages.ts` — używa go
`GET /api/packages` i `POST /api/checkout` (nigdy nie ufać cenie przysłanej
z przeglądarki).

## Metody płatności

Używamy **Stripe Checkout** (gotowa, hostowana strona płatności Stripe) — zero
własnego kodu formularza kart, pełna zgodność z wymogami bezpieczeństwa.

Dla klientów z Polski Stripe Checkout obsługuje:
- **BLIK** — włączyć w Stripe Dashboard → Settings → Payment methods,
- **Przelewy24 (P24)** — jw.,
- **Google Pay i Apple Pay** — pojawiają się automatycznie w Checkout, gdy
  urządzenie je obsługuje (nie wymaga kodu),
- karty płatnicze — domyślnie.

W sesji Checkout ustawić `currency: "pln"`. Zalecane: nie wypisywać
`payment_method_types` ręcznie, tylko włączyć metody w Dashboardzie i pozwolić
Stripe dobierać je automatycznie (BLIK pokaże się polskim klientom sam).

## Przepływ płatności

1. Użytkownik klika pakiet na stronie `/pakiety` (lub w komunikacie o wyczerpaniu limitu).
2. `POST /api/checkout` tworzy: rekord `Purchase(status: pending)` (pole
   `stripeSessionId` na razie puste — dlatego w schemacie jest opcjonalne),
   następnie sesję Stripe Checkout z `client_reference_id = userId`,
   `metadata: { purchaseId, packageId }` i adresami powrotu `success_url` /
   `cancel_url`, po czym dopisuje `stripeSessionId` do rekordu `Purchase`.
3. Przeglądarka przechodzi na stronę Stripe → użytkownik płaci (np. BLIK-iem).
4. Stripe wysyła webhook `checkout.session.completed` na `POST /api/stripe/webhook`.
5. Webhook (po weryfikacji podpisu): znajduje `Purchase` po `metadata.purchaseId`,
   oznacza `paid`, dodaje pytania do `paidQuestionsRemaining` — w jednej transakcji,
   idempotentnie (jeśli już `paid`, nic nie rób).
6. Użytkownik wraca na `success_url` → strona odświeża `GET /api/me` i pokazuje
   nowy stan pytań.

**Zasada:** pytania dodaje WYŁĄCZNIE webhook (nigdy strona powrotu — użytkownik
może zamknąć przeglądarkę przed powrotem, a płatność i tak przeszła).

## Testowanie lokalne

1. Konto Stripe w trybie testowym (klucze `sk_test_…` / `pk_test_…`).
2. Webhooki lokalnie przez **Stripe CLI**:
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   (polecenie wypisze `whsec_…` do `.env.local`).
3. Testowe płatności: karta `4242 4242 4242 4242`; BLIK ma w trybie testowym
   przycisk symulacji autoryzacji.
4. **Obowiązkowy test automatyczny (vitest): idempotencja webhooka** — dwukrotne
   dostarczenie tego samego zdarzenia `checkout.session.completed` dodaje pytania
   tylko raz. Błąd w tym miejscu kosztuje realne pieniądze, dlatego jako jedyny
   fragment logiki płatności MUSI mieć test.
5. Uwaga: middleware (`src/proxy.ts`) przepuszcza `/api/*` bez logowania — webhook
   działa bez dodatkowej konfiguracji; jego jedynym zabezpieczeniem jest
   weryfikacja podpisu Stripe.

## Faktury / paragony i podatki

- W Stripe Checkout włączyć zbieranie adresu e-mail (jest domyślnie) i opcjonalnie
  `invoice_creation` — Stripe sam wyśle rachunek.
- **Do wyjaśnienia z księgową przed startem produkcyjnym:** forma działalności,
  VAT (zwolnienie podmiotowe do limitu obrotu?), kasa fiskalna przy sprzedaży
  konsumenckiej online (zwykle zwolnienie przy płatnościach bezgotówkowych
  z ewidencją — ale to musi potwierdzić księgowa).

## Zwroty i prawo konsumenckie

Patrz `10-prawo-rodo.md` — pakiet pytań to treść cyfrowa; regulamin musi zawierać
zgodę konsumenta na natychmiastowe wykonanie usługi i utratę prawa odstąpienia,
inaczej obowiązuje 14-dniowy zwrot.
