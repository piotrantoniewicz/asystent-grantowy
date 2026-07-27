/**
 * Znaczniki statusu w strumieniu odpowiedzi czatu.
 *
 * Odpowiedź `/api/chat` to czysty tekst pisany na żywo. Żeby nie przebudowywać
 * tego na NDJSON (przeglądarka parsuje dziś czysty tekst), status wplatamy jako
 * krótką wstawkę otoczoną znakiem U+001F (ASCII „unit separator"). W tekście
 * pisanym przez model taki znak nie występuje, więc nie da się go pomylić z treścią.
 *
 * Znacznik idzie ZAWSZE przed pierwszym słowem odpowiedzi. Przeglądarka
 * (`ChatApp.tsx`) wycina go ze strumienia i zamienia na napis „Analizuję
 * dokumentację…". Treści rozumowania nigdy nie wysyłamy — to ma być sam
 * wskaźnik, że model pracuje.
 */
export const STATUS_MARK = "\u001f";

/** Model zaczął rozumować — pierwsze słowo odpowiedzi pojawi się za chwilę. */
export const STATUS_THINKING = `${STATUS_MARK}thinking${STATUS_MARK}`;
