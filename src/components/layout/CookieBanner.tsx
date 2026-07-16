"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "ag_cookie_notice_dismissed";

export default function CookieBanner() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    Promise.resolve().then(() => {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    });
  }, []);

  if (pathname?.startsWith("/admin")) return null;
  if (dismissed) return null;

  return (
    <div className="flex flex-shrink-0 flex-wrap items-center justify-center gap-3 border-t border-border bg-accent-soft px-4 py-2 text-xs text-foreground">
      <p>
        Używamy wyłącznie plików cookie niezbędnych do działania serwisu —
        logowania i bezpieczeństwa.{" "}
        <Link href="/cookies" className="text-primary underline hover:no-underline">
          Dowiedz się więcej
        </Link>
      </p>
      <button
        onClick={() => {
          localStorage.setItem(STORAGE_KEY, "1");
          setDismissed(true);
        }}
        className="flex-shrink-0 rounded-lg bg-primary px-3 py-1 font-medium text-white hover:bg-primary-hover"
      >
        Rozumiem
      </button>
    </div>
  );
}
