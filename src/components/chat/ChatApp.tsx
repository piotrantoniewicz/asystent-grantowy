"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SCRAPE_FAILED_MESSAGE } from "@/lib/scraper/messages";
import { STATUS_MARK } from "@/lib/chat-stream";

// Stała lista wtyczek — nowa tablica przy każdym renderze kasowałaby pamięć
// podręczną react-markdown.
const REMARK_PLUGINS = [remarkGfm];

// Zamiana tekstu na sformatowaną treść (markdown) jest kosztowna, a w rozmowie
// zmienia się tylko ostatnia wiadomość (ta pisana na żywo). `memo` sprawia, że
// pozostałe wiadomości nie są przeliczane od nowa przy każdej literce.
const Markdown = memo(function Markdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>;
});

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

type ConversationLoad =
  | { ok: true; messages: Message[]; sources: ScrapedSource[] }
  | { ok: false; error: string };

type ScrapeProgress = {
  htmlCount: number;
  pdfCount: number;
  lastUrl: string | null;
  errorMessage: string | null;
};

type ScrapeKind = "organization" | "grant";

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

// Rozpoznaje wiadomość będącą wyłącznie adresem strony.
// Celowo wąskie: "czy pasujemy? https://..." ma trafić do czatu jak dotąd.
function looksLikeBareUrl(text: string): boolean {
  if (/\s/.test(text)) return false;
  return /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(text);
}

type SavedSource = {
  id: string;
  kind: "organization" | "grant";
  rootUrl: string;
  name: string;
  summary: string | null;
};

// Sekcja w menu bocznym: zapisane organizacje albo zapisane konkursy.
// Każda pozycja jest klikalna (wybiera ją), ma rozwijany opis i „×" do usunięcia,
// a pod listą jest pole na dodanie nowego linku.
function SavedSection({
  title,
  emptyLabel,
  items,
  isScraping,
  onSelect,
  onDelete,
  onAdd,
}: {
  title: string;
  emptyLabel: string;
  items: SavedSource[];
  isScraping: boolean;
  onSelect: (url: string) => void;
  onDelete: (id: string) => void;
  onAdd: (url: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  // Dymek z opisem pokazywany po najechaniu na pozycję; pozycjonowany na sztywno
  // względem okna (fixed), by nie był przycinany przez przewijane menu boczne.
  const [hover, setHover] = useState<{ id: string; top: number; left: number } | null>(
    null,
  );
  const hovered = hover ? items.find((i) => i.id === hover.id) : null;
  // Rozwinięcie opisu pod wierszem — ścieżka dotykowa, bo hover nie działa na dotyku.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="border-t border-border pt-2">
      <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      <div className="space-y-0.5">
        {items.length === 0 && (
          <p className="px-1 pb-1 text-xs text-muted">{emptyLabel}</p>
        )}
        {items.map((item) => (
          <div key={item.id}>
            <div
              className="group flex items-center rounded hover:bg-primary-soft"
              onMouseEnter={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setHover({ id: item.id, top: r.top, left: r.right + 8 });
              }}
              onMouseLeave={() => setHover((h) => (h?.id === item.id ? null : h))}
            >
              <button
                onClick={() => onSelect(item.rootUrl)}
                disabled={isScraping}
                className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-foreground disabled:opacity-50"
              >
                {item.name}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedId((prev) => (prev === item.id ? null : item.id));
                }}
                aria-label="Pokaż opis"
                className="flex-shrink-0 px-1.5 text-muted hover:text-foreground"
              >
                ⓘ
              </button>
              <button
                onClick={() => onDelete(item.id)}
                aria-label="Usuń z zapisanych"
                className="flex-shrink-0 px-2 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
              >
                ×
              </button>
            </div>
            {expandedId === item.id && (
              <div className="mx-1 mb-1 rounded border border-border bg-surface p-3 text-xs">
                <p className="mb-1 font-semibold text-foreground">{item.name}</p>
                {item.summary ? (
                  <div className="text-muted [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc">
                    <Markdown content={item.summary} />
                  </div>
                ) : (
                  <p className="break-all text-muted">{item.rootUrl}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {hovered && hover && (
        <div
          style={{ position: "fixed", top: hover.top, left: hover.left }}
          className="pointer-events-none z-50 max-h-[60vh] w-72 overflow-hidden rounded border border-border bg-surface p-3 text-xs shadow-lg"
        >
          <p className="mb-1 font-semibold text-foreground">{hovered.name}</p>
          {hovered.summary ? (
            <div className="text-muted [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-1 [&_p:last-child]:mb-0 [&_ul]:list-disc">
              <Markdown content={hovered.summary} />
            </div>
          ) : (
            <p className="break-all text-muted">{hovered.rootUrl}</p>
          )}
        </div>
      )}
      {showAdd ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onAdd(urlInput);
            setUrlInput("");
          }}
          className="mt-1 flex gap-1 px-1"
        >
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://…"
            disabled={isScraping}
            className="w-full min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={isScraping || !urlInput.trim()}
            className="flex-shrink-0 rounded bg-accent-soft px-2 py-1 text-xs font-medium text-foreground transition-colors hover:brightness-95 disabled:opacity-50"
          >
            Dodaj
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-1 px-2 text-xs font-medium text-primary-hover hover:underline"
        >
          + dodaj link
        </button>
      )}
    </div>
  );
}

function SourceForms({
  orgUrlInput,
  setOrgUrlInput,
  grantUrlInput,
  setGrantUrlInput,
  isOrgScraping,
  isGrantScraping,
  handleScrape,
  organizations,
}: {
  orgUrlInput: string;
  setOrgUrlInput: (value: string) => void;
  grantUrlInput: string;
  setGrantUrlInput: (value: string) => void;
  isOrgScraping: boolean;
  isGrantScraping: boolean;
  handleScrape: (url: string, kind: ScrapeKind, forceRefresh?: boolean) => void;
  organizations: SavedSource[];
}) {
  const [showOtherOrgField, setShowOtherOrgField] = useState(false);

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted">Strona organizacji</label>
        {organizations.length === 1 ? (
          <p className="text-xs text-muted">
            Rozpoznano zapamiętaną organizację „{organizations[0].name}” —
            analizuję automatycznie…
          </p>
        ) : organizations.length >= 2 && !showOtherOrgField ? (
          <div className="flex flex-wrap gap-1">
            {organizations.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => handleScrape(org.rootUrl, "organization")}
                disabled={isOrgScraping}
                className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:brightness-95 disabled:opacity-50"
              >
                {org.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowOtherOrgField(true)}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
            >
              inna organizacja
            </button>
          </div>
        ) : (
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
              disabled={isOrgScraping}
              className="w-full min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={isOrgScraping || !orgUrlInput.trim()}
              className="flex-shrink-0 rounded bg-accent-soft px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:brightness-95 disabled:opacity-50"
            >
              Analizuj
            </button>
          </form>
        )}
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
            disabled={isGrantScraping}
            className="w-full min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={isGrantScraping || !grantUrlInput.trim()}
            className="flex-shrink-0 rounded bg-accent-soft px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:brightness-95 disabled:opacity-50"
          >
            Analizuj
          </button>
        </form>
      </div>
    </>
  );
}

function ThinkingDots({ label }: { label?: string }) {
  return (
    <div className="mr-auto flex max-w-[80%] items-center gap-2 rounded bg-primary-soft px-4 py-3">
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
      </span>
      {label && <span className="text-sm text-muted">{label}</span>}
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
  // Model zaczął rozumować — pokazujemy to pod dymkiem, żeby kilka sekund ciszy
  // nie wyglądało jak zawieszona aplikacja.
  const [isAnalysing, setIsAnalysing] = useState(false);
  // Model czyta dokumentację narzędziami — trwa to kilkanaście sekund i dzieje
  // się także PO tym, jak napisał pierwsze zdanie („Sprawdzę…"), więc wskaźnik
  // musi być niezależny od `isThinking`, który gaśnie przy pierwszym słowie.
  const [isReadingDocs, setIsReadingDocs] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [limitErrorBuyUrl, setLimitErrorBuyUrl] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<{
    freeQuestionsRemaining: number;
    paidQuestionsRemaining: number;
  } | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [orgUrlInput, setOrgUrlInput] = useState("");
  const [grantUrlInput, setGrantUrlInput] = useState("");
  const [scrapingKinds, setScrapingKinds] = useState<Record<ScrapeKind, boolean>>({
    organization: false,
    grant: false,
  });
  const [scrapeProgress, setScrapeProgress] = useState<
    Record<ScrapeKind, ScrapeProgress | null>
  >({ organization: null, grant: null });
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [savedSources, setSavedSources] = useState<SavedSource[]>([]);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const organizations = savedSources.filter((s) => s.kind === "organization");
  const grants = savedSources.filter((s) => s.kind === "grant");

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // Czy użytkownik jest przy dole rozmowy. Jeśli przewinął w górę (żeby coś
  // przeczytać), nie ściągamy go na siłę na dół przy każdej nowej literce.
  const stickToBottomRef = useRef(true);
  const autoScrapedForRef = useRef<string | null>(null);

  function scrollToBottom(smooth: boolean) {
    const el = scrollAreaRef.current;
    if (!el || !stickToBottomRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setRemaining)
      .catch(() => {});
  }, [messages.length]);

  function refreshSavedSources() {
    fetch("/api/saved-sources")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSavedSources(Array.isArray(data) ? data : []))
      .catch(() => {});
  }

  useEffect(() => {
    refreshSavedSources();
  }, []);

  useEffect(() => {
    if (scrapingKinds.organization || sources.length !== 0 || organizations.length !== 1) return;
    const key = activeId ?? "new";
    if (autoScrapedForRef.current === key) return;
    autoScrapedForRef.current = key;
    handleScrape(organizations[0].rootUrl, "organization");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizations, sources, scrapingKinds, activeId]);

  // Pobiera rozmowę z serwera. Odpowiedź błędna albo nie-JSON (np. strona błędu
  // w HTML) kończy się czytelnym komunikatem, a nie nieobsłużonym wyjątkiem
  // w konsoli przeglądarki.
  async function fetchConversation(id: string): Promise<ConversationLoad> {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        return {
          ok: false,
          error: data?.error ?? "Nie udało się wczytać rozmowy. Odśwież stronę.",
        };
      }
      return {
        ok: true,
        messages: data.messages ?? [],
        sources: data.scrapedSources ?? [],
      };
    } catch {
      return { ok: false, error: "Brak połączenia z serwerem. Sprawdź internet i odśwież stronę." };
    }
  }

  function applyConversation(result: ConversationLoad) {
    if (!result.ok) {
      setLoadError(result.error);
      return;
    }
    setLoadError(null);
    setMessages(result.messages);
    setSources(result.sources);
  }

  useEffect(() => {
    if (!activeId) return;
    stickToBottomRef.current = true;
    fetchConversation(activeId).then(applyConversation);
  }, [activeId]);

  // Przewijamy przy nowej wiadomości/źródle — nie przy każdej literce
  // dopisywanej do odpowiedzi (tym zajmuje się już strumień w handleSend).
  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length, sources.length, isThinking, isReadingDocs, scrapeProgress]);

  // Tworzy nową rozmowę: POST, dopisanie na początek listy, ustawienie jako
  // aktywnej i wyczyszczenie widoku wiadomości/źródeł. Zwraca id nowej rozmowy.
  async function createConversation(): Promise<string> {
    const res = await fetch("/api/conversations", { method: "POST" });
    const conversation = await res.json();
    setConversations((prev) => [conversation, ...prev]);
    setActiveId(conversation.id);
    setMessages([]);
    setSources([]);
    return conversation.id;
  }

  async function handleNewConversation() {
    await createConversation();
    setSidebarOpen(false);
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

  // W przeciwieństwie do handleSelectSaved: reużywa aktywną rozmowę, jeśli
  // istnieje (nie tworzy nowej przy każdej wiadomości w toku rozmowy).
  async function ensureConversationId(firstMessageTitle?: string): Promise<string> {
    const id = activeId ?? (await createConversation());
    // Tytuł nadaje serwer przy pierwszym pytaniu (`chat/route.ts`), ale lista
    // rozmów w menu żyje w stanie przeglądarki — bez tego wpisu zostawała na
    // „Nowa rozmowa" aż do przeładowania strony. Podmieniamy tylko wtedy, gdy
    // rozmowa nadal ma tytuł domyślny, żeby nie nadpisać nazwanej rozmowy.
    if (firstMessageTitle) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id && c.title === "Nowa rozmowa" ? { ...c, title: firstMessageTitle } : c,
        ),
      );
    }
    return id;
  }

  async function handleScrape(
    url: string,
    kind: ScrapeKind,
    forceRefresh = false,
    conversationIdOverride?: string,
  ) {
    if (!url.trim() || scrapingKinds[kind]) return;

    setLimitError(null);
    setScrapingKinds((prev) => ({ ...prev, [kind]: true }));
    setScrapeProgress((prev) => ({
      ...prev,
      [kind]: { htmlCount: 0, pdfCount: 0, lastUrl: null, errorMessage: null },
    }));

    try {
      const conversationId = conversationIdOverride ?? (await ensureConversationId());

      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, url: url.trim(), kind, forceRefresh }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setScrapeProgress((prev) => ({
          ...prev,
          [kind]: {
            htmlCount: prev[kind]?.htmlCount ?? 0,
            pdfCount: prev[kind]?.pdfCount ?? 0,
            lastUrl: prev[kind]?.lastUrl ?? null,
            errorMessage: data?.error ?? "Nie udało się przeanalizować strony.",
          },
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

          let event:
            | { event: "page"; url: string; contentType: "html" | "pdf" }
            | { event: "skip"; url: string; reason: string }
            | { event: "done"; sourceId: string; summary: string; trimmed: boolean }
            | { event: "error"; error: string };
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.event === "page") {
            setScrapeProgress((prev) => ({
              ...prev,
              [kind]: {
                htmlCount:
                  (prev[kind]?.htmlCount ?? 0) + (event.contentType === "html" ? 1 : 0),
                pdfCount: (prev[kind]?.pdfCount ?? 0) + (event.contentType === "pdf" ? 1 : 0),
                lastUrl: event.url,
                errorMessage: null,
              },
            }));
          } else if (event.event === "done") {
            applyConversation(await fetchConversation(conversationId));
            refreshSavedSources();
          } else if (event.event === "error") {
            setScrapeProgress((prev) => ({
              ...prev,
              [kind]: {
                htmlCount: prev[kind]?.htmlCount ?? 0,
                pdfCount: prev[kind]?.pdfCount ?? 0,
                lastUrl: prev[kind]?.lastUrl ?? null,
                errorMessage: event.error,
              },
            }));
          }
        }
      }
    } finally {
      setScrapingKinds((prev) => ({ ...prev, [kind]: false }));
    }
  }

  // Klik w zapisaną organizację/konkurs w menu: zaczyna świeżą rozmowę
  // (a jeśli bieżąca jest pusta — używa jej) i analizuje wybrany adres.
  async function handleSelectSaved(url: string, kind: ScrapeKind) {
    if (scrapingKinds[kind]) return;
    const isEmpty = messages.length === 0 && sources.length === 0;
    const conversationId =
      !isEmpty || !activeId ? await createConversation() : activeId;
    setSidebarOpen(false);
    await handleScrape(url, kind, false, conversationId);
  }

  async function handleDeleteSaved(kind: ScrapeKind, id: string) {
    const confirmLabel =
      kind === "organization"
        ? "Usunąć tę organizację z zapisanych? Rozmowy pozostaną nietknięte."
        : "Usunąć ten konkurs z zapisanych? Rozmowy pozostaną nietknięte.";
    if (!confirm(confirmLabel)) return;

    setSavedError(null);
    const res = await fetch(`/api/saved-sources/${id}`, { method: "DELETE" }).catch(() => null);

    if (!res || !res.ok) {
      setSavedError("Nie udało się usunąć. Spróbuj ponownie.");
      return;
    }

    setSavedSources((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isSending) return;

    if (looksLikeBareUrl(text)) {
      const hasOrganization = sources.some((s) => s.kind === "organization");
      setInput("");
      if (hasOrganization) {
        handleScrape(text, "grant");
      } else {
        setPendingUrl(text);
      }
      return;
    }

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
    stickToBottomRef.current = true;
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);
    setIsThinking(true);
    setIsAnalysing(false);

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
      // Odpowiedź przychodzi w setkach malutkich kawałków. Przerysowywanie
      // rozmowy po każdym z nich zamula przeglądarkę, więc odświeżamy widok
      // najwyżej co 80 ms (i zawsze na końcu).
      const FLUSH_INTERVAL_MS = 80;
      let lastFlush = 0;
      let shownText = "";

      function flush(force: boolean) {
        if (assistantId === null || shownText === fullText) return;
        const now = Date.now();
        if (!force && now - lastFlush < FLUSH_INTERVAL_MS) return;
        lastFlush = now;
        shownText = fullText;
        const id = assistantId;
        const text = fullText;
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content: text } : m)),
        );
        scrollToBottom(false);
      }

      // Serwer może wpleść w strumień krótki znacznik statusu (patrz
      // `src/lib/chat-stream.ts`). Wycinamy go z tekstu odpowiedzi; gdyby paczka
      // z sieci urwała się w środku znacznika, resztę trzymamy w `pending`
      // do następnego odczytu.
      let pending = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });

        while (true) {
          const start = pending.indexOf(STATUS_MARK);
          if (start === -1) break;
          const end = pending.indexOf(STATUS_MARK, start + 1);
          if (end === -1) break; // znacznik jeszcze niekompletny — czekamy
          const status = pending.slice(start + 1, end);
          if (status === "thinking") setIsAnalysing(true);
          if (status === "tools") setIsReadingDocs(true);
          if (status === "writing") setIsReadingDocs(false);
          pending = pending.slice(0, start) + pending.slice(end + 1);
        }

        const holdFrom = pending.indexOf(STATUS_MARK);
        const chunk = holdFrom === -1 ? pending : pending.slice(0, holdFrom);
        pending = holdFrom === -1 ? "" : pending.slice(holdFrom);

        if (!chunk) continue;
        fullText += chunk;

        if (assistantId === null) {
          assistantId = `tmp-assistant-${Date.now()}`;
          shownText = fullText;
          lastFlush = Date.now();
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
          flush(false);
        }
      }
      flush(true);
    } finally {
      setIsSending(false);
      setIsThinking(false);
      setIsAnalysing(false);
      setIsReadingDocs(false);
    }
  }

  const timeline = useMemo(() => buildTimeline(messages, sources), [messages, sources]);

  return (
    <div className="flex h-full bg-background">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`w-72 flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface p-3 sm:flex ${
          sidebarOpen
            ? "fixed inset-y-0 left-0 z-40 flex sm:static sm:z-auto"
            : "hidden"
        }`}
      >
        <button
          onClick={handleNewConversation}
          className="rounded-full bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          + Nowa rozmowa
        </button>

        {savedError && (
          <p className="rounded bg-danger-soft px-2 py-1 text-xs text-danger">{savedError}</p>
        )}

        <SavedSection
          title="Moje organizacje"
          emptyLabel="Brak zapisanych. Dodaj adres strony swojej organizacji."
          items={organizations}
          isScraping={scrapingKinds.organization}
          onSelect={(url) => handleSelectSaved(url, "organization")}
          onDelete={(id) => handleDeleteSaved("organization", id)}
          onAdd={(url) => handleSelectSaved(url, "organization")}
        />

        <SavedSection
          title="Konkursy grantowe"
          emptyLabel="Brak zapisanych. Dodaj adres strony konkursu."
          items={grants}
          isScraping={scrapingKinds.grant}
          onSelect={(url) => handleSelectSaved(url, "grant")}
          onDelete={(id) => handleDeleteSaved("grant", id)}
          onAdd={(url) => handleSelectSaved(url, "grant")}
        />

        <div className="flex-1 space-y-1 overflow-y-auto border-t border-border pt-2">
          <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Rozmowy
          </p>
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center rounded hover:bg-primary-soft ${
                c.id === activeId ? "bg-primary-soft" : ""
              }`}
            >
              <button
                onClick={() => {
                  setActiveId(c.id);
                  setSidebarOpen(false);
                }}
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
            <Link href="/pakiety" className="text-primary-hover underline hover:no-underline">
              Kup pakiet
            </Link>
          </p>
        )}
      </aside>

      <div className="flex min-w-0 min-h-0 flex-1 flex-col">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Otwórz menu"
          className="m-3 self-start rounded border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground sm:hidden"
        >
          ☰ Menu
        </button>

        <div
          ref={scrollAreaRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickToBottomRef.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="min-h-0 flex-1 overflow-y-auto p-4"
        >
          {loadError && (
            <p className="mx-auto mb-4 max-w-2xl rounded bg-danger-soft px-3 py-2 text-sm text-danger">
              {loadError}
            </p>
          )}
          {sources.length === 0 && (
            <div className="mx-auto mb-6 max-w-sm space-y-4">
              <p className="text-center text-sm text-muted">
                Zacznij od wklejenia adresu strony swojej organizacji i strony
                konkursu. Przeanalizuję je, zanim zaczniemy rozmowę.
              </p>
              <SourceForms
                orgUrlInput={orgUrlInput}
                setOrgUrlInput={setOrgUrlInput}
                grantUrlInput={grantUrlInput}
                setGrantUrlInput={setGrantUrlInput}
                isOrgScraping={scrapingKinds.organization}
                isGrantScraping={scrapingKinds.grant}
                handleScrape={handleScrape}
                organizations={organizations}
              />
            </div>
          )}
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {timeline.map((item) =>
              item.type === "message" ? (
                item.message.role === "user" ? (
                  <div
                    key={item.message.id}
                    className="ml-auto max-w-[80%] whitespace-pre-wrap rounded bg-primary px-4 py-2 text-sm text-white"
                  >
                    {item.message.content}
                  </div>
                ) : (
                  <div
                    key={item.message.id}
                    className="mr-auto max-w-[80%] rounded bg-primary-soft px-4 py-2 text-sm text-foreground [&_a]:underline [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:list-disc"
                  >
                    <Markdown content={item.message.content} />
                  </div>
                )
              ) : (
                <div
                  key={item.source.id}
                  className="mr-auto max-w-[80%] rounded border border-border bg-surface px-4 py-2 text-sm shadow-sm"
                >
                  <p className="mb-1 text-xs font-medium text-muted">
                    {item.source.kind === "organization"
                      ? "Strona organizacji"
                      : "Strona konkursu"}{" "}
                    — {item.source.rootUrl}
                    {item.source.kind === "organization" &&
                      item.source.status === "done" && (
                        <button
                          onClick={() =>
                            handleScrape(item.source.rootUrl, "organization", true)
                          }
                          disabled={scrapingKinds.organization}
                          className="ml-2 text-muted underline hover:text-foreground disabled:opacity-50"
                        >
                          odśwież
                        </button>
                      )}
                  </p>
                  {item.source.status === "done" && (
                    <p className="text-xs text-muted">
                      Przeanalizowano — pobrano {item.source.pages.length} dokumentów.
                    </p>
                  )}
                  {item.source.status === "error" && (
                    <p className="text-danger">{SCRAPE_FAILED_MESSAGE}</p>
                  )}
                </div>
              ),
            )}

            {(["organization", "grant"] as const).map((kind) => {
              const progress = scrapeProgress[kind];
              // Komunikat o błędzie zostaje na ekranie PO zakończeniu analizy —
              // inaczej znikał razem z paskiem postępu i użytkownik widział tylko,
              // że „nic się nie wczytało", bez podanej przyczyny.
              if (!progress || (!scrapingKinds[kind] && !progress.errorMessage)) return null;
              return (
                <div
                  key={kind}
                  className="mr-auto max-w-[80%] rounded border border-border bg-surface px-4 py-2 text-sm text-muted shadow-sm"
                >
                  {progress.errorMessage ? (
                    <p className="text-danger">{progress.errorMessage}</p>
                  ) : (
                    <p>
                      Przeglądam stronę {kind === "organization" ? "organizacji" : "konkursu"}…
                      znaleziono {progress.htmlCount} podstron, {progress.pdfCount} dokumentów PDF
                      {progress.lastUrl ? ` (${progress.lastUrl})` : ""}
                    </p>
                  )}
                </div>
              );
            })}

            {(isThinking || isReadingDocs) && (
              <ThinkingDots
                label={
                  isReadingDocs
                    ? "Czytam dokumentację konkursu…"
                    : isAnalysing
                      ? "Analizuję dokumentację…"
                      : undefined
                }
              />
            )}
          </div>
        </div>

        {limitError && (
          <p className="mx-auto mb-2 max-w-2xl rounded bg-danger-soft px-3 py-2 text-center text-sm text-danger">
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
            className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            Wyślij
          </button>
        </form>
        {pendingUrl && (
          <div className="mx-auto mb-3 flex max-w-2xl flex-wrap gap-2 px-4 text-sm">
            <span className="w-full text-xs text-muted">
              Co to za strona?
            </span>
            <button
              onClick={() => {
                const url = pendingUrl;
                setPendingUrl(null);
                handleScrape(url, "organization");
              }}
              className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:brightness-95"
            >
              To strona mojej organizacji
            </button>
            <button
              onClick={() => {
                const url = pendingUrl;
                setPendingUrl(null);
                handleScrape(url, "grant");
              }}
              className="rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:brightness-95"
            >
              To strona konkursu
            </button>
          </div>
        )}
        <p className="mx-auto mb-3 max-w-2xl px-4 text-center text-xs text-muted">
          Nie wpisuj danych osobowych osób trzecich. Odpowiedzi generuje AI —
          zweryfikuj treść przed złożeniem wniosku.
        </p>
      </div>
    </div>
  );
}
