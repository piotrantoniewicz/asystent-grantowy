import type { Metadata } from "next";
import { readLegalContent } from "@/lib/legal";
import LegalContent from "@/components/legal/LegalContent";
import LegalPageShell from "@/components/legal/LegalPageShell";

export const metadata: Metadata = { title: "Polityka prywatności" };

export default async function PolitykaPrywatnosciPage() {
  const markdown = await readLegalContent("polityka-prywatnosci");
  return (
    <LegalPageShell>
      <LegalContent markdown={markdown} />
    </LegalPageShell>
  );
}
