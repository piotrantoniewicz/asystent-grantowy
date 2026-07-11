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
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <h1 className="text-sm font-semibold">Asystent Wniosków Grantowych</h1>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>{session.user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/logowanie" });
            }}
          >
            <button type="submit" className="hover:text-gray-900">
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
