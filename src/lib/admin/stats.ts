import { prisma } from "@/lib/db";

// Ceny z oficjalnego cennika Anthropic, sprawdzone 2026-10-08.
// Starsze nazwy (`claude-sonnet-5`, `claude-haiku-4-5`) zostają: dawne odpowiedzi
// w bazie mają je w `modelUsed`.
// `cacheRead` to mnożnik ceny wejścia przy odczycie z cache — różny dla modeli
// (Sonnet 5.5: 0,05×, pozostałe 0,1×).
// Haiku 5.5 ma dwa cenniki: do 100 tys. tokenów w prompcie (tu) i 5× drożej
// powyżej ($0,50 / $2,50). Liczymy zawsze po tańszym — baza trzyma tylko sumy
// tokenów, więc nie da się wskazać pojedynczych dużych zapytań. Większość zapytań
// do Haiku jest mała, ale próg BYWA przekraczany: długie rozmowy bez dokumentacji
// (do 100 tys. znaków historii + 50 tys. znaków pytania idą na Haiku, gdy
// klasyfikator uzna pytanie za proste) oraz kilka rund narzędzi w trybie
// `ondemand` (wyniki narzędzi kumulują się w prompcie). Dla takich zapytań panel
// ZANIŻA koszt Haiku — traktuj tę kwotę jako dolną granicę.
const PRICING_USD_PER_MTOK: Record<
  string,
  { input: number; output: number; cacheRead: number }
> = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.05 },
};

// 1.25 odpowiada domyślnemu cache'owi 5-minutowemu ustawionemu w
// `src/app/api/chat/route.ts`. Gdyby tam wrócił `ttl: "1h"`, tutaj musi być 2.0 —
// inaczej panel zaniża koszt zapisów do cache o ~60%.
const CACHE_WRITE_MULTIPLIER = 1.25;

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
  // Rozkład liczby rund narzędziowych w odpowiedziach z ostatnich 30 dni.
  // Odpowiada na pytanie z zadania 2 backlogu optymalizacji: czy warto płacić
  // dopłatę za zapis do cache już w pierwszej rundzie.
  toolRounds: { rounds: number; count: number }[];
  // Mediany, nie średnie — jedna bardzo długa odpowiedź nie ma zaburzać obrazu.
  medianFirstTextMs: number | null;
  medianTotalMs: number | null;
  measuredAnswers: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

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
    recentAnswerTimings,
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
    // Tylko odpowiedzi zapisane PO wdrożeniu pomiarów mają te pola wypełnione;
    // starsze wiersze mają `null` i są tu pomijane.
    prisma.message.findMany({
      where: {
        role: "assistant",
        createdAt: { gte: thirtyDaysAgo },
        toolRounds: { not: null },
      },
      select: { toolRounds: true, firstTextMs: true, totalMs: true },
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
      (row._sum.cacheReadInputTokens ?? 0) * pricing.cacheRead;

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

  const roundsCounts = new Map<number, number>();
  for (const { toolRounds } of recentAnswerTimings) {
    const rounds = toolRounds!;
    roundsCounts.set(rounds, (roundsCounts.get(rounds) ?? 0) + 1);
  }
  const toolRoundsDistribution = [...roundsCounts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rounds, count]) => ({ rounds, count }));

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
    toolRounds: toolRoundsDistribution,
    medianFirstTextMs: median(
      recentAnswerTimings.map((m) => m.firstTextMs).filter((v): v is number => v !== null),
    ),
    medianTotalMs: median(
      recentAnswerTimings.map((m) => m.totalMs).filter((v): v is number => v !== null),
    ),
    measuredAnswers: recentAnswerTimings.length,
  };
}
