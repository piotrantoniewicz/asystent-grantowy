"use client";

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
};

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
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<{
    freeQuestionsRemaining: number;
    paidQuestionsRemaining: number;
  } | null>(null);
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
      .then((data) => setMessages(data.messages ?? []));
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleNewConversation() {
    const res = await fetch("/api/conversations", { method: "POST" });
    const conversation = await res.json();
    setConversations((prev) => [conversation, ...prev]);
    setActiveId(conversation.id);
    setMessages([]);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isSending) return;

    setLimitError(null);
    let conversationId = activeId;
    if (!conversationId) {
      const res = await fetch("/api/conversations", { method: "POST" });
      const conversation = await res.json();
      conversationId = conversation.id;
      setConversations((prev) => [conversation, ...prev]);
      setActiveId(conversation.id);
    }

    const userMessage: Message = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: text }),
      });

      if (res.status === 403) {
        const data = await res.json().catch(() => null);
        setLimitError(
          data?.error === "Wykorzystano limit pytań."
            ? "Wykorzystano limit pytań. Kup pakiet, aby kontynuować."
            : "Nie można wysłać wiadomości.",
        );
        setIsSending(false);
        return;
      }

      if (!res.ok || !res.body) {
        setLimitError("Wystąpił błąd. Spróbuj ponownie.");
        setIsSending(false);
        return;
      }

      const assistantId = `tmp-assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: fullText } : m,
          ),
        );
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex h-screen">
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-gray-200 p-3 sm:flex">
        <button
          onClick={handleNewConversation}
          className="mb-3 rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          + Nowa rozmowa
        </button>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`w-full truncate rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100 ${
                c.id === activeId ? "bg-gray-100 font-medium" : ""
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>
        {remaining && (
          <p className="border-t border-gray-200 pt-2 text-xs text-gray-500">
            Pytania: {remaining.freeQuestionsRemaining} darmowych +{" "}
            {remaining.paidQuestionsRemaining} kupionych
          </p>
        )}
      </aside>

      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="mt-10 text-center text-sm text-gray-400">
              Napisz pytanie, aby zacząć rozmowę o wniosku grantowym.
            </p>
          )}
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`whitespace-pre-wrap rounded-lg px-4 py-2 text-sm ${
                  m.role === "user"
                    ? "ml-auto max-w-[80%] bg-black text-white"
                    : "mr-auto max-w-[80%] bg-gray-100 text-gray-900"
                }`}
              >
                {m.content}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {limitError && (
          <p className="mx-auto mb-2 max-w-2xl rounded-md bg-red-50 px-3 py-2 text-center text-sm text-red-700">
            {limitError}
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
            placeholder="Napisz wiadomość..."
            disabled={isSending}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Wyślij
          </button>
        </form>
      </div>
    </div>
  );
}
