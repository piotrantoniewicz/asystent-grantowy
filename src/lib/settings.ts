import { prisma } from "@/lib/db";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

const DEFAULT_FREE_QUESTIONS_LIMIT = 10;

async function getOrSeedSetting(key: string, defaultValue: string) {
  const existing = await prisma.appSetting.findUnique({ where: { key } });
  if (existing) return existing.value;

  const setting = await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: defaultValue },
    update: {},
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
}

export async function setFreeQuestionsLimit(value: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: "free_questions_limit" },
    create: { key: "free_questions_limit", value: String(value) },
    update: { value: String(value) },
  });
}
