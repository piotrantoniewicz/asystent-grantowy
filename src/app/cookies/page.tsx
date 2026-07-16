import type { Metadata } from "next";
import { readLegalContent } from "@/lib/legal";
import LegalContent from "@/components/legal/LegalContent";
import LegalPageShell from "@/components/legal/LegalPageShell";

export const metadata: Metadata = { title: "Cookies" };

export default async function CookiesPage() {
  const markdown = await readLegalContent("cookies");
  return (
    <LegalPageShell>
      <LegalContent markdown={markdown} />
    </LegalPageShell>
  );
}
