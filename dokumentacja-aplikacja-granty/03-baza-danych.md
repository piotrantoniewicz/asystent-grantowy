# 03 — Baza danych

Schemat dla Prisma (SQLite lokalnie, PostgreSQL na produkcji). Poniżej opis tabel;
dokładny plik `schema.prisma` powstanie w Etapie 1 planu pracy na tej podstawie.

## Tabele

### User — użytkownik
| Pole | Typ | Opis |
|---|---|---|
| id | string (cuid) | klucz główny |
| email | string, unikalny | adres e-mail (login) |
| createdAt | datetime | data rejestracji |
| freeQuestionsUsed | int, domyślnie 0 | ile z 10 darmowych pytań zużyto |
| paidQuestionsRemaining | int, domyślnie 0 | pozostałe pytania z kupionych pakietów |
| isAdmin | boolean, domyślnie false | dostęp do panelu admina |

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
| stripeSessionId | string, unikalny | id sesji Stripe Checkout (chroni przed podwójnym zaliczeniem) |
| packageName | string | np. `pakiet-50` |
| questionsGranted | int | ile pytań dodano |
| amountPln | int | kwota w groszach (2500 = 25 zł) |
| status | enum: `pending` / `paid` / `failed` | |
| createdAt | datetime | |

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
- Zliczanie pytań: przy każdej wiadomości `user` serwer sprawdza
  `freeQuestionsUsed < limit` **lub** `paidQuestionsRemaining > 0`; po odpowiedzi
  zwiększa/zmniejsza odpowiedni licznik w jednej transakcji.
- Tokeny (`inputTokens`/`outputTokens`) zapisywane po każdej odpowiedzi — panel
  admina liczy z nich koszty.
