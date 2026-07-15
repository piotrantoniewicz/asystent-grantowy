import { prisma } from "@/lib/db";

const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 5, output: 25 },
};

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export type AdminStats = {
  totalUsers: number;
  usersLast30Days: number;
  totalQuestions: number;
  questionsLast30Days: number;
  revenuePlnTotal: number;
  revenuePlnLast30Days: number;
  estimatedAiCostUsd: number;
  modelUsage: Record<string, number>;
  dailyQuestions: { date: string; count: number }[];
};

export async function getAdminStats(): Promise<AdminStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    usersLast30Days,
    totalQuestions,
    questionsLast30Days,
    revenueTotal,
    revenueLast30Days,
    assistantMessages,
    recentUserMessages,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.message.count({ where: { role: "user" } }),
    prisma.message.count({
      where: { role: "user", createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.purchase.aggregate({
      where: { status: "paid" },
      _sum: { amountPln: true },
    }),
    prisma.purchase.aggregate({
      where: { status: "paid", createdAt: { gte: thirtyDaysAgo } },
      _sum: { amountPln: true },
    }),
    prisma.message.findMany({
      where: { role: "assistant", modelUsed: { not: null } },
      select: {
        modelUsed: true,
        inputTokens: true,
        outputTokens: true,
        cacheCreationInputTokens: true,
        cacheReadInputTokens: true,
      },
    }),
    prisma.message.findMany({
      where: { role: "user", createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
  ]);

  const modelUsage: Record<string, number> = {};
  let estimatedAiCostUsd = 0;

  for (const message of assistantMessages) {
    const model = message.modelUsed!;
    modelUsage[model] = (modelUsage[model] ?? 0) + 1;

    const pricing = PRICING_USD_PER_MTOK[model];
    if (!pricing) continue;

    const inputTokens = message.inputTokens ?? 0;
    const outputTokens = message.outputTokens ?? 0;
    const cacheWriteTokens = message.cacheCreationInputTokens ?? 0;
    const cacheReadTokens = message.cacheReadInputTokens ?? 0;

    const billedInputTokens =
      inputTokens +
      cacheWriteTokens * CACHE_WRITE_MULTIPLIER +
      cacheReadTokens * CACHE_READ_MULTIPLIER;

    estimatedAiCostUsd +=
      (billedInputTokens * pricing.input) / 1_000_000 +
      (outputTokens * pricing.output) / 1_000_000;
  }

  const dailyCounts = new Map<string, number>();
  for (const { createdAt } of recentUserMessages) {
    const day = createdAt.toISOString().slice(0, 10);
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
  }
  const dailyQuestions = [...dailyCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  return {
    totalUsers,
    usersLast30Days,
    totalQuestions,
    questionsLast30Days,
    revenuePlnTotal: revenueTotal._sum.amountPln ?? 0,
    revenuePlnLast30Days: revenueLast30Days._sum.amountPln ?? 0,
    estimatedAiCostUsd: Math.round(estimatedAiCostUsd * 100) / 100,
    modelUsage,
    dailyQuestions,
  };
}
