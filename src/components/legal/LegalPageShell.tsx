import Link from "next/link";

export default function LegalPageShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <Link href="/" className="text-sm text-muted hover:text-foreground">
          ← Powrót do czatu
        </Link>
        {children}
      </div>
    </div>
  );
}
