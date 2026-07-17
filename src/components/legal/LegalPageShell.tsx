import Link from "next/link";
import Brand from "@/components/layout/Brand";

export default function LegalPageShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <Brand />
          <Link href="/" className="text-sm text-muted hover:text-foreground">
            ← Powrót do czatu
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
