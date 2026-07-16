import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminSession } from "@/lib/admin";

const TABS = [
  { href: "/admin", label: "Pulpit" },
  { href: "/admin/ustawienia", label: "Ustawienia" },
  { href: "/admin/rozmowy", label: "Rozmowy" },
  { href: "/admin/uzytkownicy", label: "Użytkownicy" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdminSession();
  if (!session) notFound();

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-foreground">
            Panel administratora
          </h1>
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Powrót do czatu
          </Link>
        </div>

        <nav className="flex gap-1 border-b border-border">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-t-lg px-3 py-2 text-sm text-muted hover:bg-surface hover:text-foreground"
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </div>
  );
}
