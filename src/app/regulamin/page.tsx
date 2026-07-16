import type { Metadata } from "next";
import { readLegalContent } from "@/lib/legal";
import LegalContent from "@/components/legal/LegalContent";
import LegalPageShell from "@/components/legal/LegalPageShell";

export const metadata: Metadata = { title: "Regulamin" };

export default async function RegulaminPage() {
  const markdown = await readLegalContent("regulamin");
  return (
    <LegalPageShell>
      <LegalContent markdown={markdown} />
    </LegalPageShell>
  );
}
