import { prisma } from "@/lib/db";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

const DEFAULT_FREE_QUESTIONS_LIMIT = 10;

// Ustawienia zmieniają się rzadko (tylko z panelu admina), a odczytywane są przy
// każdym pytaniu. Trzymamy je przez minutę w pamięci serwera, żeby nie odpytywać
// bazy za każdym razem. Zmiana w panelu czyści pamięć od razu (patrz niżej).
const CACHE_TTL_MS = 60_000;
const settingsCache = new Map<string, { value: string; expiresAt: number }>();

async function getOrSeedSetting(key: string, defaultValue: string) {
  const cached = settingsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const existing = await prisma.appSetting.findUnique({ where: { key } });
  if (existing) {
    settingsCache.set(key, {
      value: existing.value,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return existing.value;
  }

  const setting = await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: defaultValue },
    update: {},
  });
  settingsCache.set(key, {
    value: setting.value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return setting.value;
}

export async function getSystemPrompt(): Promise<string> {
  return getOrSeedSetting("system_prompt", DEFAULT_SYSTEM_PROMPT);
}

export async function getFreeQuestionsLimit(): Promise<number> {
  const value = await getOrSeedSetting(
    "free_questions_limit",
    String(DEFAULT_FREE_QUESTIONS_LIMIT),
  );
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_FREE_QUESTIONS_LIMIT;
}

export async function setSystemPrompt(value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: "system_prompt" },
    create: { key: "system_prompt", value },
    update: { value },
  });
  settingsCache.delete("system_prompt");
}

export async function setFreeQuestionsLimit(value: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: "free_questions_limit" },
    create: { key: "free_questions_limit", value: String(value) },
    update: { value: String(value) },
  });
  settingsCache.delete("free_questions_limit");
}
