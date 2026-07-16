"use client";

import { useState } from "react";
import Link from "next/link";
import BuyButton from "@/components/pakiety/BuyButton";
import type { PackageDefinition } from "@/lib/stripe/packages";

export default function PackagesGrid({ packages }: { packages: PackageDefinition[] }) {
  const [consentChecked, setConsentChecked] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-start gap-2 rounded-lg border border-border bg-surface p-3 text-xs text-muted">
        <input
          type="checkbox"
          checked={consentChecked}
          onChange={(e) => setConsentChecked(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Żądam rozpoczęcia świadczenia usługi przed upływem terminu odstąpienia
          i przyjmuję do wiadomości, że wykorzystanie zakupionych pytań oznacza
          utratę prawa odstąpienia w odpowiednim zakresie (zgodnie z{" "}
          <Link href="/regulamin" className="text-primary underline hover:no-underline">
            Regulaminem
          </Link>
          ).
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-5 text-center shadow-sm"
          >
            <p className="text-sm font-semibold text-foreground">{pkg.name}</p>
            <p className="text-3xl font-bold text-primary">{pkg.amountPln} zł</p>
            <p className="text-xs text-muted">{pkg.questions} pytań</p>
            <BuyButton packageId={pkg.id} consentChecked={consentChecked} />
          </div>
        ))}
      </div>
    </div>
  );
}
