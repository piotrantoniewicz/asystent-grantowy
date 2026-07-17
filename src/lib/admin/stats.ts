import { prisma } from "@/lib/db";

// Ceny standardowe; do 2026-08-31 Sonnet 5 ma cenę wprowadzającą 2/10 USD za MTok.
const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 3, output: 15 },
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
    assistantMessagesByModel,
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
    prisma.message.groupBy({
      by: ["modelUsed"],
      where: { role: "assistant", modelUsed: { not: null } },
      _count: { _all: true },
      _sum: {
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

  for (const row of assistantMessagesByModel) {
    const model = row.modelUsed!;
    modelUsage[model] = row._count._all;

    const pricing = PRICING_USD_PER_MTOK[model];
    if (!pricing) continue;

    const billedInputTokens =
      (row._sum.inputTokens ?? 0) +
      (row._sum.cacheCreationInputTokens ?? 0) * CACHE_WRITE_MULTIPLIER +
      (row._sum.cacheReadInputTokens ?? 0) * CACHE_READ_MULTIPLIER;

    estimatedAiCostUsd +=
      (billedInputTokens * pricing.input) / 1_000_000 +
      ((row._sum.outputTokens ?? 0) * pricing.output) / 1_000_000;
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
