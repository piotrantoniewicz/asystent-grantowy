"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

type ScrapedSource = {
  id: string;
  kind: "organization" | "grant";
  rootUrl: string;
  status: "pending" | "done" | "error";
  summary: string | null;
  createdAt: string;
  pages: { url: string; title: string; contentType: "html" | "pdf" }[];
};

type ScrapeProgress = {
  htmlCount: number;
  pdfCount: number;
  lastUrl: string | null;
  errorMessage: string | null;
};

type TimelineItem =
  | { type: "message"; createdAt: string; message: Message }
  | { type: "scrape"; createdAt: string; source: ScrapedSource };

function buildTimeline(messages: Message[], sources: ScrapedSource[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...messages.map((m) => ({
      type: "message" as const,
      createdAt: m.createdAt ?? new Date(0).toISOString(),
      message: m,
    })),
    ...sources.map((s) => ({
      type: "scrape" as const,
      createdAt: s.createdAt,
      source: s,
    })),
  ];
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function ThinkingDots() {
  return (
    <div className="mr-auto flex max-w-[80%] items-center gap-1 rounded-2xl bg-primary-soft px-4 py-3">
      <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
    </div>
  );
}

export default function ChatApp({
  initialConversations,
}: {
  initialConversations: Conversation[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [sources, setSources] = useState<ScrapedSource[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [limitErrorBuyUrl, setLimitErrorBuyUrl] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<{
    freeQuestionsRemaining: number;
    paidQuestionsRemaining: number;
  } | null>(null);

  const [orgUrlInput, setOrgUrlInput] = useState("");
  const [grantUrlInput, setGrantUrlInput] = useState("");
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState<ScrapeProgress | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setRemaining)
      .catch(() => {});
  }, [messages.length]);

  useEffect(() => {
    if (!activeId) return;
    fetch(`/api/conversations/${activeId}`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data.messages ?? []);
        setSources(data.scrapedSources ?? []);
      });
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sources, scrapeProgress, isThinking]);

  async function handleNewConversation() {
    const res = await fetch("/api/conversations", { method: "POST" });
    const conversation = await res.json();
    setConversations((prev) => [conversation, ...prev]);
    setActiveId(conversation.id);
    setMessages([]);
    setSources([]);
  }

  async function handleDeleteConversation(id: string) {
    if (!confirm("Czy na pewno chcesz usunąć tę rozmowę?")) return;

    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
      setSources([]);
    }
  }

  async function ensureConversationId(firstMessageTitle?: string): Promise<string> {
    if (activeId) return activeId;
    const res = await fetch("/api/conversations", { method: "POST" });
    const conversation = await res.json();
    setConversations((prev) => [conversation, ...prev]);
    setActiveId(conversation.id);
    if (firstMessageTitle) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversation.id ? { ...c, title: firstMessageTitle } : c,
        ),
      );
    }
    return conversation.id;
  }

  async function handleScrape(url: string, kind: "organization" | "grant") {
    if (!url.trim() || isScraping) return;

    setLimitError(null);
    setIsScraping(true);
    setScrapeProgress({ htmlCount: 0, pdfCount: 0, lastUrl: null, errorMessage: null });

    try {
      const conversationId = await ensureConversationId();

      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, url: url.trim(), kind }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setScrapeProgress((prev) => ({
          htmlCount: prev?.htmlCount ?? 0,
          pdfCount: prev?.pdfCount ?? 0,
          lastUrl: prev?.lastUrl ?? null,
          errorMessage: data?.error ?? "Nie udało się przeanalizować strony.",
        }));
        return;
      }

      if (kind === "organization") setOrgUrlInput("");
      else setGrantUrlInput("");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as
            | { event: "page"; url: string; contentType: "html" | "pdf" }
            | { event: "skip"; url: string; reason: string }
            | { event: "done"; sourceId: string; summary: string; trimmed: boolean }
            | { event: "error"; error: string };

          if (event.event === "page") {
            setScrapeProgress((prev) => ({
              htmlCount: (prev?.htmlCount ?? 0) + (event.contentType === "html" ? 1 : 0),
              pdfCount: (prev?.pdfCount ?? 0) + (event.contentType === "pdf" ? 1 : 0),
              lastUrl: event.url,
              errorMessage: null,
            }));
          } else if (event.event === "done") {
            const conversationRes = await fetch(`/api/conversations/${conversationId}`);
            const conversationData = await conversationRes.json();
            setMessages(conversationData.messages ?? []);
            setSources(conversationData.scrapedSources ?? []);
          } else if (event.event === "error") {
            setScrapeProgress((prev) => ({
              htmlCount: prev?.htmlCount ?? 0,
              pdfCount: prev?.pdfCount ?? 0,
              lastUrl: prev?.lastUrl ?? null,
              errorMessage: event.error,
            }));
          }
        }
      }
    } finally {
      setIsScraping(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isSending) return;

    setLimitError(null);
    setLimitErrorBuyUrl(null);
    const conversationId = await ensureConversationId(
      messages.length === 0 ? text.slice(0, 60) : undefined,
    );

    const userMessage: Message = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);
    setIsThinking(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });

      if (res.status === 403 || res.status === 429 || res.status === 400) {
        const data = await res.json().catch(() => null);
        setLimitError(data?.error ?? "Nie można wysłać wiadomości.");
        setLimitErrorBuyUrl(data?.buyUrl ?? null);
        return;
      }

      if (!res.ok || !res.body) {
        setLimitError("Wystąpił błąd. Spróbuj ponownie.");
        return;
      }

      let assistantId: string | null = null;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        fullText += chunk;

        if (assistantId === null) {
          assistantId = `tmp-assistant-${Date.now()}`;
          setIsThinking(false);
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId!,
              role: "assistant",
              content: fullText,
              createdAt: new Date().toISOString(),
            },
          ]);
        } else {
          const id = assistantId;
          setMessages((prev) =>
            prev.map((m) => (m.id === id ? { ...m, content: fullText } : m)),
          );
        }
      }
    } finally {
      setIsSending(false);
      setIsThinking(false);
    }
  }

  const timeline = buildTimeline(messages, sources);

  return (
    <div className="flex h-full bg-background">
      <aside className="hidden w-72 flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface p-3 sm:flex">
        <button
          onClick={handleNewConversation}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
        >
          + Nowa rozmowa
        </button>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted">Strona organizacji</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleScrape(orgUrlInput, "organization");
            }}
            className="flex gap-1"
          >
            <input
              value={orgUrlInput}
              onChange={(e) => setOrgUrlInput(e.target.value)}
              placeholder="https://…"
              disabled={isScraping}
              className="w-full min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={isScraping || !orgUrlInput.trim()}
              className="flex-shrink-0 rounded-lg bg-accent-soft px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:brightness-95 disabled:opacity-50"
            >
              Analizuj
            </button>
          </form>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted">Strona konkursu</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleScrape(grantUrlInput, "grant");
            }}
            className="flex gap-1"
          >
            <input
              value={grantUrlInput}
              onChange={(e) => setGrantUrlInput(e.target.value)}
              placeholder="https://…"
              disabled={isScraping}
              className="w-full min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={isScraping || !grantUrlInput.trim()}
              className="flex-shrink-0 rounded-lg bg-accent-soft px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:brightness-95 disabled:opacity-50"
            >
              Analizuj
            </button>
          </form>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto border-t border-border pt-2">
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center rounded-lg hover:bg-primary-soft ${
                c.id === activeId ? "bg-primary-soft" : ""
              }`}
            >
              <button
                onClick={() => setActiveId(c.id)}
                className={`flex-1 truncate px-3 py-2 text-left text-sm text-foreground ${
                  c.id === activeId ? "font-medium" : ""
                }`}
              >
                {c.title}
              </button>
              <button
                onClick={() => handleDeleteConversation(c.id)}
                aria-label="Usuń rozmowę"
                className="px-2 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {remaining && (
          <p className="border-t border-border pt-2 text-xs text-muted">
            Pytania: {remaining.freeQuestionsRemaining} darmowych +{" "}
            {remaining.paidQuestionsRemaining} kupionych ·{" "}
            <Link href="/pakiety" className="text-primary underline hover:no-underline">
              Kup pakiet
            </Link>
          </p>
        )}
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          {timeline.length === 0 && !isScraping && (
            <p className="mt-10 text-center text-sm text-muted">
              W panelu po lewej wklej link do strony twojej organizacji oraz
              konkursu, który ciebie interesuje. Później możesz zacząć rozmowę.
            </p>
          )}
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {timeline.map((item) =>
              item.type === "message" ? (
                <div
                  key={item.message.id}
                  className={`whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                    item.message.role === "user"
                      ? "ml-auto max-w-[80%] bg-primary text-white"
                      : "mr-auto max-w-[80%] bg-primary-soft text-foreground"
                  }`}
                >
                  {item.message.content}
                </div>
              ) : (
                <div
                  key={item.source.id}
                  className="mr-auto max-w-[80%] rounded-2xl border border-border bg-surface px-4 py-2 text-sm shadow-sm"
                >
                  <p className="mb-1 text-xs font-medium text-muted">
                    {item.source.kind === "organization"
                      ? "Strona organizacji"
                      : "Strona konkursu"}{" "}
                    — {item.source.rootUrl}
                  </p>
                  {item.source.status === "done" && (
                    <>
                      <p className="whitespace-pre-wrap text-foreground">
                        {item.source.summary}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        Pobrano {item.source.pages.length} dokumentów. Czy czegoś
                        brakuje? Jeśli tak, wklej link do brakującego dokumentu.
                      </p>
                    </>
                  )}
                  {item.source.status === "error" && (
                    <p className="text-danger">
                      Nie udało się pobrać treści tej strony. Możesz wkleić treść
                      regulaminu bezpośrednio do czatu.
                    </p>
                  )}
                </div>
              ),
            )}

            {isScraping && scrapeProgress && (
              <div className="mr-auto max-w-[80%] rounded-2xl border border-border bg-surface px-4 py-2 text-sm text-muted shadow-sm">
                {scrapeProgress.errorMessage ? (
                  <p className="text-danger">{scrapeProgress.errorMessage}</p>
                ) : (
                  <p>
                    Przeglądam stronę… znaleziono {scrapeProgress.htmlCount} podstron,{" "}
                    {scrapeProgress.pdfCount} dokumentów PDF
                    {scrapeProgress.lastUrl ? ` (${scrapeProgress.lastUrl})` : ""}
                  </p>
                )}
              </div>
            )}

            {isThinking && <ThinkingDots />}

            <div ref={bottomRef} />
          </div>
        </div>

        {limitError && (
          <p className="mx-auto mb-2 max-w-2xl rounded-lg bg-danger-soft px-3 py-2 text-center text-sm text-danger">
            {limitError}
            {limitErrorBuyUrl && (
              <>
                {" "}
                <Link href={limitErrorBuyUrl} className="underline hover:no-underline">
                  Kup pakiet pytań
                </Link>
              </>
            )}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="mx-auto mb-4 flex w-full max-w-2xl gap-2 px-4"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Napisz wiadomość…"
            disabled={isSending}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            Wyślij
          </button>
        </form>
        <p className="mx-auto mb-3 max-w-2xl px-4 text-center text-xs text-muted">
          Nie wpisuj danych osobowych osób trzecich. Odpowiedzi generuje AI —
          zweryfikuj treść przed złożeniem wniosku.
        </p>
      </div>
    </div>
  );
}
