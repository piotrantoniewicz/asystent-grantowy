import { prisma } from "@/lib/db";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

const DEFAULT_FREE_QUESTIONS_LIMIT = 10;

async function getOrSeedSetting(key: string, defaultValue: string) {
  const existing = await prisma.appSetting.findUnique({ where: { key } });
  if (existing) return existing.value;

  await prisma.appSetting.create({ data: { key, value: defaultValue } });
  return defaultValue;
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
