# 03 — Baza danych

Schemat dla Prisma (PostgreSQL — Neon, ta sama baza lokalnie i na produkcji;
od Etapu 3.5, wcześniej było SQLite). Poniżej opis tabel; dokładny plik
`schema.prisma` jest w `prisma/schema.prisma`.

## Tabele

### User — użytkownik
| Pole | Typ | Opis |
|---|---|---|
| id | string (cuid) | klucz główny |
| email | string, unikalny | adres e-mail (login) |
| createdAt | datetime | data rejestracji |
| freeQuestionsUsed | int, domyślnie 0 | ile z 10 darmowych pytań zużyto |
| paidQuestionsRemaining | int, domyślnie 0 | pozostałe pytania z kupionych pakietów |

Uprawnienia admina NIE są w bazie — jedynym źródłem jest zmienna środowiskowa
`ADMIN_EMAILS` (sprawdzana przy każdym żądaniu po stronie serwera).

(+ tabele wymagane przez Auth.js: `Account`, `Session`, `VerificationToken` —
generowane standardowo przez adapter Prisma.)

### Conversation — rozmowa
| Pole | Typ | Opis |
|---|---|---|
| id | string (cuid) | klucz główny |
| userId | string → User | właściciel |
| title | string | tytuł (generowany z pierwszego pytania) |
| createdAt / updatedAt | datetime | |

### Message — wiadomość w rozmowie
| Pole | Typ | Opis |
|---|---|---|
| id | string (cuid) | klucz główny |
| conversationId | string → Conversation | |
| role | enum: `user` / `assistant` | kto napisał |
| content | text | treść |
| modelUsed | string, opcjonalne | który model AI odpowiedział (np. `claude-haiku-4-5`) |
| inputTokens / outputTokens | int, opcjonalne | zużycie tokenów (do statystyk kosztów) |
| createdAt | datetime | |

### ScrapedSource — pobrana strona (organizacji lub konkursu)
| Pole | Typ | Opis |
|---|---|---|
| id | string (cuid) | klucz główny |
| conversationId | string → Conversation | do której rozmowy przypisano |
| kind | enum: `organization` / `grant` | strona organizacji czy konkursu |
| rootUrl | string | adres podany przez użytkownika |
| status | enum: `pending` / `done` / `error` | stan pobierania |
| summary | text, opcjonalne | krótkie streszczenie (pokazywane w czacie) |
| createdAt | datetime | |

### ScrapedPage — pojedyncza pobrana podstrona / PDF
| Pole | Typ | Opis |
|---|---|---|
| id | string (cuid) | klucz główny |
| sourceId | string → ScrapedSource | |
| url | string | adres podstrony lub pliku |
| contentType | enum: `html` / `pdf` | |
| title | string | tytuł strony/dokumentu |
| textContent | text | wyekstrahowany czysty tekst |
| createdAt | datetime | |

### Purchase — zakup pakietu
| Pole | Typ | Opis |
|---|---|---|
| id | string (cuid) | klucz główny |
| userId | string → User | |
| stripeSessionId | string, **opcjonalny**, unikalny | id sesji Stripe Checkout; puste przy tworzeniu rekordu, uzupełniane zaraz po utworzeniu sesji (rekord Purchase powstaje PRZED sesją, bo sesja dostaje `metadata.purchaseId`) |
| packageName | string | np. `pakiet-50` |
| questionsGranted | int | ile pytań dodano |
| amountPln | int | kwota w groszach (2500 = 25 zł) |
| status | enum: `pending` / `paid` / `failed` | |
| createdAt | datetime | |

### FreeQuota — ochrona darmowego limitu przed nadużyciami
| Pole | Typ | Opis |
|---|---|---|
| id | string, klucz główny | `device:<uuid z ciasteczka ag_device>` albo `ip:<solony hash IP>:<RRRR-MM-DD>` |
| used | int, domyślnie 0 | zużyte darmowe pytania dla tego klucza |
| updatedAt | datetime | |

Darmowe pytanie wymaga jednocześnie: wolnej puli użytkownika (`freeQuestionsUsed
< limit`), wolnej puli urządzenia (`device:` — wspólny limit dla wszystkich kont
na tym komputerze, równy limitowi darmowemu) i dziennej puli IP (`ip:` — maks.
30 darmowych pytań dziennie). Płatne pytania omijają tę tabelę. Surowego adresu
IP nie zapisujemy — tylko pierwsze 16 znaków hex SHA-256 z `ip + AUTH_SECRET`.

### AppSetting — ustawienia edytowalne z panelu admina
| Pole | Typ | Opis |
|---|---|---|
| key | string, klucz główny | np. `system_prompt`, `free_questions_limit` |
| value | text | wartość |
| updatedAt | datetime | |

Przy starcie aplikacja czyta `system_prompt` z tej tabeli; jeśli brak — używa
domyślnego z `07-prompty.md` i zapisuje go do tabeli.

## Relacje (skrót)

```
User 1—∞ Conversation 1—∞ Message
              │
              └─1—∞ ScrapedSource 1—∞ ScrapedPage
User 1—∞ Purchase
```

## Zasady

- Usunięcie rozmowy usuwa kaskadowo jej wiadomości i zeskrapowane źródła.
- Zliczanie pytań — model **rezerwacji**: PRZED wywołaniem AI serwer atomowo
  „pobiera" pytanie (warunkowe `updateMany` w jednej transakcji: licznik
  użytkownika + `FreeQuota` urządzenia i IP dla ścieżki darmowej, albo dekrement
  `paidQuestionsRemaining` dla płatnej). Zwykłe „sprawdź, potem zapisz" ma wyścig:
  dwa równoległe żądania przechodzą kontrolę limitu. Zwrot rezerwacji następuje
  tylko przy odmowie modelu (`refusal`) lub błędzie API zanim dotarł pierwszy
  fragment odpowiedzi. Szczegóły implementacji: `12-etap-3-5-poprawki.md`.
- Tokeny (`inputTokens`/`outputTokens`) zapisywane po każdej odpowiedzi — panel
  admina liczy z nich koszty.
