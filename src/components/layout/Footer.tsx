"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="flex flex-shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-border bg-surface px-4 py-2 text-xs text-muted">
      <Link href="/regulamin" className="hover:text-foreground">
        Regulamin
      </Link>
      <span aria-hidden>·</span>
      <Link href="/polityka-prywatnosci" className="hover:text-foreground">
        Polityka prywatności
      </Link>
      <span aria-hidden>·</span>
      <Link href="/cookies" className="hover:text-foreground">
        Cookies
      </Link>
    </footer>
  );
}
