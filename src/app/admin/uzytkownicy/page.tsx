import Link from "next/link";
import { prisma } from "@/lib/db";
import { getFreeQuestionsLimit } from "@/lib/settings";
import AddQuestionsForm from "@/components/admin/AddQuestionsForm";

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const [users, total, freeQuestionsLimit] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        createdAt: true,
        freeQuestionsUsed: true,
        paidQuestionsRemaining: true,
        purchases: { where: { status: "paid" }, select: { amountPln: true } },
      },
    }),
    prisma.user.count(),
    getFreeQuestionsLimit(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-4 py-2">E-mail</th>
              <th className="px-4 py-2">Rejestracja</th>
              <th className="px-4 py-2">Darmowe zużyte</th>
              <th className="px-4 py-2">Płatne pozostałe</th>
              <th className="px-4 py-2">Suma zakupów</th>
              <th className="px-4 py-2">Korekta</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-foreground">{u.email}</td>
                <td className="px-4 py-2 text-muted">
                  {u.createdAt.toLocaleDateString("pl-PL")}
                </td>
                <td className="px-4 py-2 text-muted">
                  {u.freeQuestionsUsed} / {freeQuestionsLimit}
                </td>
                <td className="px-4 py-2 text-muted">
                  {u.paidQuestionsRemaining}
                </td>
                <td className="px-4 py-2 text-muted">
                  {u.purchases.reduce((sum, p) => sum + p.amountPln, 0)} zł
                </td>
                <td className="px-4 py-2">
                  <AddQuestionsForm userId={u.id} />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">
                  Brak użytkowników.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Strona {page} z {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/uzytkownicy?page=${page - 1}`}
                className="rounded-lg border border-border px-3 py-1.5 hover:text-foreground"
              >
                ← Poprzednia
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/uzytkownicy?page=${page + 1}`}
                className="rounded-lg border border-border px-3 py-1.5 hover:text-foreground"
              >
                Następna →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
