import Link from "next/link";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 20;

export default async function AdminConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; email?: string }>;
}) {
  const { page: pageParam, email } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const where = email?.trim()
    ? { user: { email: { contains: email.trim(), mode: "insensitive" as const } } }
    : {};

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        createdAt: true,
        user: { select: { email: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <form className="flex gap-2">
        <input
          type="text"
          name="email"
          defaultValue={email}
          placeholder="Filtruj po adresie e-mail…"
          className="w-full max-w-xs rounded-lg border border-border bg-surface p-2 text-sm text-foreground"
        />
        <button
          type="submit"
          className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-foreground"
        >
          Szukaj
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-4 py-2">Użytkownik</th>
              <th className="px-4 py-2">Tytuł</th>
              <th className="px-4 py-2">Wiadomości</th>
              <th className="px-4 py-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 text-muted">{c.user.email}</td>
                <td className="px-4 py-2">
                  <Link
                    href={`/admin/rozmowy/${c.id}`}
                    className="text-primary hover:text-primary-hover"
                  >
                    {c.title}
                  </Link>
                </td>
                <td className="px-4 py-2 text-muted">{c._count.messages}</td>
                <td className="px-4 py-2 text-muted">
                  {c.createdAt.toLocaleString("pl-PL")}
                </td>
              </tr>
            ))}
            {conversations.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  Brak rozmów.
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
                href={`/admin/rozmowy?page=${page - 1}${email ? `&email=${email}` : ""}`}
                className="rounded-lg border border-border px-3 py-1.5 hover:text-foreground"
              >
                ← Poprzednia
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/rozmowy?page=${page + 1}${email ? `&email=${email}` : ""}`}
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
