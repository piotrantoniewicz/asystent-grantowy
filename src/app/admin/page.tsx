import { getAdminStats } from "@/lib/admin/stats";

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const stats = await getAdminStats();

  const maxDaily = Math.max(1, ...stats.dailyQuestions.map((d) => d.count));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Użytkownicy"
          value={String(stats.totalUsers)}
          sub={`${stats.usersLast30Days} nowych w 30 dni`}
        />
        <StatCard
          label="Zadane pytania"
          value={String(stats.totalQuestions)}
          sub={`${stats.questionsLast30Days} w 30 dni`}
        />
        <StatCard
          label="Przychód"
          value={`${stats.revenuePlnTotal} zł`}
          sub={`${stats.revenuePlnLast30Days} zł w 30 dni`}
        />
        <StatCard
          label="Szacowany koszt AI"
          value={`$${stats.estimatedAiCostUsd.toFixed(2)}`}
          sub="porównaj z przychodem obok"
        />
        <StatCard
          label="Haiku / Sonnet"
          value={`${stats.modelUsage["claude-haiku-4-5"] ?? 0} / ${stats.modelUsage["claude-sonnet-5"] ?? 0}`}
          sub="podział odpowiedzi na model"
        />
      </div>

      <div className="rounded border border-border bg-surface p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-foreground">
          Pytania dziennie — ostatnie 30 dni
        </p>
        {stats.dailyQuestions.length === 0 ? (
          <p className="text-sm text-muted">Brak danych w tym okresie.</p>
        ) : (
          <div className="flex h-32 items-end gap-1 overflow-x-auto">
            {stats.dailyQuestions.map((d) => (
              <div
                key={d.date}
                className="flex min-w-[10px] flex-1 flex-col items-center gap-1"
                title={`${d.date}: ${d.count}`}
              >
                <div
                  className="w-full rounded-t bg-primary"
                  style={{ height: `${(d.count / maxDaily) * 100}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
