"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddQuestionsForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const questions = Number(value);
    if (!Number.isInteger(questions) || questions === 0) {
      setError("Podaj liczbę różną od zera.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Nie udało się zapisać korekty.");
        return;
      }
      setValue("");
      router.refresh();
    } catch {
      setError("Nie udało się zapisać korekty.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="±pytań"
          className="w-20 rounded-lg border border-border bg-background p-1.5 text-xs text-foreground"
        />
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg border border-border px-2 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
        >
          Dodaj
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </form>
  );
}
