import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { isAiConfigError } from "./client";

// Buduje błąd taki, jaki zwraca SDK Anthropic przy danym kodzie HTTP.
function apiError(status: number) {
  return Anthropic.APIError.generate(
    status,
    { type: "error", error: { type: "authentication_error", message: "test" } },
    "test",
    new Headers(),
  );
}

describe("isAiConfigError", () => {
  it("rozpoznaje błędy ustawień (zły klucz, brak uprawnień, zły model)", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const status of [400, 401, 403, 404]) {
      expect(isAiConfigError(apiError(status))).toBe(true);
    }
  });

  it("nie uznaje przeciążenia ani awarii serwera za błąd ustawień", () => {
    for (const status of [429, 500, 503, 529]) {
      expect(isAiConfigError(apiError(status))).toBe(false);
    }
  });

  it("nie uznaje zwykłych błędów (np. bazy danych) za błąd ustawień AI", () => {
    expect(isAiConfigError(new Error("połączenie z bazą zerwane"))).toBe(false);
    expect(isAiConfigError(null)).toBe(false);
  });
});
