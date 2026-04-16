"use client";

// G20: Floating conversational copilot. A rounded button bottom-right pops a
// slide-in chat panel from the right. Streams tokens from /api/copilot/stream
// over Server-Sent Events.

import { useEffect, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function CopilotPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setInput("");
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: trimmed }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/copilot/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, thread_id: threadId }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Stream failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assembled = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // Parse SSE frames separated by blank line.
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let event = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          try {
            const payload = JSON.parse(data);
            if (event === "delta") {
              assembled += payload.text ?? "";
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.role === "assistant") {
                  copy[copy.length - 1] = { ...last, content: assembled };
                }
                return copy;
              });
            } else if (event === "done") {
              if (payload.thread_id && !threadId) setThreadId(payload.thread_id);
            } else if (event === "error") {
              throw new Error(payload.error ?? "Stream failed");
            }
          } catch (parseErr: unknown) {
            // Surface JSON parse failures rather than swallowing them.
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bid Assist failed");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Bid Assist" : "Open Bid Assist"}
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-14 h-14 rounded-full bg-[#2563eb] text-white shadow-lg flex items-center justify-center hover:bg-[#1d4ed8] transition-colors"
      >
        {open ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.84L3 20l1.13-3.39A7.95 7.95 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Slide-in panel */}
      {open && (
        <div className="fixed bottom-0 left-0 right-0 sm:bottom-24 sm:left-auto sm:right-6 z-40 w-full sm:w-[380px] max-w-full sm:max-w-[calc(100vw-3rem)] h-[85vh] sm:h-[560px] max-h-[calc(100vh-4rem)] sm:max-h-[calc(100vh-8rem)] bg-white border border-[#e5e7eb] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
          <div className="px-4 py-3 border-b border-[#e5e7eb] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#0f172a]">Bid Assist</h3>
              <p className="text-[11px] text-[#64748b]">Ask anything about your pipeline</p>
            </div>
            {threadId && (
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setThreadId(null);
                  setError(null);
                }}
                className="text-[11px] text-[#64748b] hover:text-[#0f172a]"
              >
                New chat
              </button>
            )}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-xs text-[#94a3b8] text-center mt-12 px-4">
                <p>Ask Bid Assist anything about your matched opportunities, compliance status, or proposal prep.</p>
                <p className="mt-2">Try: <em>&ldquo;What&apos;s my best opportunity right now?&rdquo;</em></p>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`px-3 py-2 rounded-lg text-xs leading-relaxed max-w-[85%] whitespace-pre-wrap break-words ${
                    m.role === "user"
                      ? "bg-[#2563eb] text-white"
                      : "bg-[#f1f5f9] text-[#0f172a]"
                  }`}
                >
                  {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
                </div>
              </div>
            ))}
            {error && (
              <div className="text-[11px] text-[#dc2626] px-2">{error}</div>
            )}
          </div>

          <div className="border-t border-[#e5e7eb] px-3 py-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask Bid Assist…"
                rows={1}
                className="flex-1 text-xs border border-[#e5e7eb] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#2563eb] resize-none"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                className="text-xs px-3 py-1.5 bg-[#2563eb] text-white rounded-lg hover:bg-[#1d4ed8] disabled:opacity-50"
              >
                {streaming ? "…" : "Send"}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
