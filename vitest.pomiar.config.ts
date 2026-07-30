import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env.local" });

/**
 * Osobna konfiguracja dla skryptów pomiarowych z `scripts/*.pomiar.ts`.
 * Są w niej dlatego, że NIE mają się uruchamiać przy `npm test` — wołają
 * płatne API i trwają minuty. Uruchamia je `npm run pomiar:cache`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["scripts/**/*.pomiar.ts"],
    // Domyślnie vitest ukrywa wypisany tekst przy teście, który przeszedł —
    // a tu cały wynik pomiaru to właśnie wypisany tekst.
    silent: false,
  },
});
