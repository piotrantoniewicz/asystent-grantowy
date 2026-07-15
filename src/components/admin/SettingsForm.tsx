"use client";

import { useState } from "react";

export default function SettingsForm({
  initialSystemPrompt,
  initialFreeQuestionsLimit,
  defaultSystemPrompt,
}: {
  initialSystemPrompt: string;
  initialFreeQuestionsLimit: number;
  defaultSystemPrompt: string;
}) {
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt);
  const [freeQuestionsLimit, setFreeQuestionsLimit] = useState(
    String(initialFreeQuestionsLimit),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt,
          freeQuestionsLimit: Number(freeQuestionsLimit),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Nie udało się zapisać ustawień.");
        return;
      }
      setMessage("Zapisano. Zmiana obowiązuje od kolejnego pytania.");
    } catch {
      setError("Nie udało się zapisać ustawień.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleRestoreDefault() {
    setSystemPrompt(defaultSystemPrompt);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <label className="mb-2 block text-sm font-semibold text-foreground">
          Prompt systemowy
        </label>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={16}
          className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={handleRestoreDefault}
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Przywróć domyślny
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <label className="mb-2 block text-sm font-semibold text-foreground">
          Limit darmowych pytań
        </label>
        <input
          type="number"
          min={0}
          value={freeQuestionsLimit}
          onChange={(e) => setFreeQuestionsLimit(e.target.value)}
          className="w-32 rounded-lg border border-border bg-background p-2 text-sm text-foreground"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {isSaving ? "Zapisuję…" : "Zapisz"}
        </button>
        {message && <p className="text-sm text-primary-hover">{message}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
