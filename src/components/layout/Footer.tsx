"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <footer className="flex flex-shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-[#2c1810] px-4 py-2.5 text-xs text-[#c8b8a8]">
      <span className="font-serif text-[13px] text-white">
        dobry<span className="text-[#a8c4b4]">ai</span>.pl
      </span>
      <span aria-hidden className="opacity-30">
        ·
      </span>
      <Link href="/regulamin" className="hover:text-white">
        Regulamin
      </Link>
      <span aria-hidden className="opacity-30">
        ·
      </span>
      <Link href="/polityka-prywatnosci" className="hover:text-white">
        Polityka prywatności
      </Link>
      <span aria-hidden className="opacity-30">
        ·
      </span>
      <Link href="/cookies" className="hover:text-white">
        Cookies
      </Link>
    </footer>
  );
}
