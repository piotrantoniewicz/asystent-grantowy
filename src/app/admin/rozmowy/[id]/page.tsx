import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function AdminConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      user: { select: { email: true } },
      messages: { orderBy: { createdAt: "asc" } },
      scrapedSources: true,
    },
  });

  if (!conversation) notFound();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {conversation.title}
          </p>
          <p className="text-xs text-muted">{conversation.user.email}</p>
        </div>
        <Link
          href="/admin/rozmowy"
          className="text-sm text-muted hover:text-foreground"
        >
          ← Wróć do listy
        </Link>
      </div>

      {conversation.scrapedSources.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm shadow-sm">
          <p className="mb-2 font-semibold text-foreground">
            Zeskrapowane źródła
          </p>
          <ul className="flex flex-col gap-1 text-muted">
            {conversation.scrapedSources.map((s) => (
              <li key={s.id}>
                [{s.kind}] {s.rootUrl} — {s.status}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {conversation.messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-2xl border border-border p-3 text-sm shadow-sm ${
              m.role === "user" ? "bg-surface" : "bg-primary-soft"
            }`}
          >
            <p className="mb-1 text-xs text-muted">
              {m.role === "user" ? "Użytkownik" : `Asystent${m.modelUsed ? ` (${m.modelUsed})` : ""}`}
              {" · "}
              {m.createdAt.toLocaleString("pl-PL")}
            </p>
            <p className="whitespace-pre-wrap text-foreground">{m.content}</p>
          </div>
        ))}
        {conversation.messages.length === 0 && (
          <p className="text-sm text-muted">Brak wiadomości w tej rozmowie.</p>
        )}
      </div>
    </div>
  );
}
