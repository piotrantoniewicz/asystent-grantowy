import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env.local" });

export default defineConfig({
  test: {
    // `.claude/worktrees/` to robocze kopie całego projektu. Bez tego wykluczenia
    // vitest uruchamia te same testy po kilka razy (raz z kopii, raz z oryginału)
    // i raport przestaje cokolwiek znaczyć.
    exclude: ["node_modules/**", "dist/**", ".claude/worktrees/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
