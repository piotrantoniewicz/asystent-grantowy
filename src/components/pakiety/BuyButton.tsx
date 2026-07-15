"use client";

import { useState } from "react";

export default function BuyButton({ packageId }: { packageId: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
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
    <div className="flex flex-col items-stretch gap-1">
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isLoading ? "Przekierowuję…" : "Kup"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
