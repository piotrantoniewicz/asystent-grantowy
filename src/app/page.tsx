import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ChatApp from "@/components/chat/ChatApp";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const conversations = await prisma.conversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5">
        <h1 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
          <span aria-hidden>🌱</span>
          <span className="truncate">
            <span className="sm:hidden">Asystent Grantowy</span>
            <span className="hidden sm:inline">Asystent Wniosków Grantowych</span>
          </span>
        </h1>
        <div className="flex flex-shrink-0 items-center gap-3 text-sm text-muted">
          {session.user.isAdmin && (
            <Link href="/admin" className="whitespace-nowrap hover:text-foreground">
              Admin
            </Link>
          )}
          <span className="hidden truncate sm:inline">{session.user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/logowanie" });
            }}
          >
            <button type="submit" className="whitespace-nowrap hover:text-foreground">
              Wyloguj się
            </button>
          </form>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <ChatApp
          initialConversations={conversations.map((c) => ({
            ...c,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
