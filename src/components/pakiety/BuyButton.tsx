"use client";

import { useState } from "react";

export default function BuyButton({
  packageId,
  consentChecked,
}: {
  packageId: string;
  consentChecked: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!consentChecked) {
      setError("Zaznacz zgodę powyżej, aby przejść do płatności.");
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Nie udało się rozpocząć płatności.");
        setIsLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Nie udało się rozpocząć płatności.");
      setIsLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-1">
      <button
        onClick={handleClick}
        disabled={isLoading || !consentChecked}
        className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {isLoading ? "Przekierowuję…" : "Kup"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
