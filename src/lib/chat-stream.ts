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

/**
 * Model sięgnął po dokumentację (runda narzędziowa). W trybie „na żądanie"
 * model często najpierw pisze zdanie („Sprawdzę…"), a dopiero potem czyta
 * strony — bez tego znacznika przeglądarka gasiła wskaźnik po pierwszym
 * słowie i przez kilkadziesiąt sekund nie było widać, że cokolwiek się dzieje.
 * Znacznik leci przy KAŻDEJ rundzie, nie tylko pierwszej.
 */
export const STATUS_TOOLS = `${STATUS_MARK}tools${STATUS_MARK}`;

/** Model zaczyna pisać odpowiedź — przeglądarka gasi wskaźnik pracy. */
export const STATUS_WRITING = `${STATUS_MARK}writing${STATUS_MARK}`;
