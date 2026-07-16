import { extractText, getDocumentProxy } from "unpdf";

export type ExtractedPdf =
  | { ok: true; text: string }
  | { ok: false; error: string };

/**
 * Wyciąga tekst z PDF-a przez `unpdf` (nie `pdf-parse` — patrz 06-scraping.md).
 * Skany bez warstwy tekstowej zwracają błąd, żeby poinformować o tym w podsumowaniu.
 */
export async function extractPdfText(buffer: Uint8Array): Promise<ExtractedPdf> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        ok: false,
        error:
          "Plik wygląda na skan — nie udało się odczytać treści, przepisz kluczowe wymogi ręcznie do czatu.",
      };
    }
    return { ok: true, text: trimmed };
  } catch {
    return { ok: false, error: "Nie udało się odczytać pliku PDF." };
  }
}
