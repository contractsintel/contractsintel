"use client";

// DocIntel Panel: Floating panel for uploading and analyzing RFP/solicitation
// documents via AI. Streams tokens from /api/documents/chat over SSE.

import { useEffect, useRef, useState } from "react";
import { useDashboard } from "./context";
import { isBdProOrHigher } from "@/lib/feature-gate";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function DocumentChatPanel() {
  const { organization } = useDashboard();
  const [open, setOpen] = useState(false);
  const [documentText, setDocumentText] = useState("");
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"upload" | "chat">("upload");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  const [parsing, setParsing] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "txt") {
      const text = await file.text();
      if (text.length > 100_000) {
        setError(
          `File too large (${text.length.toLocaleString()} chars). Maximum is 100,000.`,
        );
        return;
      }
      setDocumentText(text);
      setDocumentName(file.name);
      setView("chat");
    } else if (ext === "pdf" || ext === "docx") {
      // Server-side parsing for PDF and DOCX files
      setParsing(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/documents/parse", {
          method: "POST",
          body: formData,
        });
        const result = await res.json();
        if (!res.ok) {
          setError(result.error || "Failed to parse file");
          return;
        }
        setDocumentText(result.text);
        setDocumentName(
          result.truncated
            ? `${file.name} (truncated to 100K chars)`
            : file.name,
        );
        setView("chat");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to parse file");
      } finally {
        setParsing(false);
      }
    } else {
      setError("Unsupported file type. Please upload .txt, .pdf, or .docx.");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handlePaste = () => {
    if (!documentText.trim()) return;
    if (documentText.length > 100_000) {
      setError(
        `Text too long (${documentText.length.toLocaleString()} chars). Maximum is 100,000.`,
      );
      return;
    }
    setDocumentName("Pasted document");
    setView("chat");
  };

  const resetDocument = () => {
    setDocumentText("");
    setDocumentName(null);
    setMessages([]);
    setThreadId(null);
    setError(null);
    setView("upload");
  };

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming || !documentText) return;
    setInput("");
    setError(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
      { role: "assistant", content: "" },
    ]);
    setStreaming(true);

    try {
      const res = await fetch("/api/documents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_text: documentText,
          question: trimmed,
          thread_id: threadId,
          history: messages,
        }),
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
              if (payload.thread_id && !threadId)
                setThreadId(payload.thread_id);
            } else if (event === "error") {
              throw new Error(payload.error ?? "Stream failed");
            }
          } catch (parseErr: unknown) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Document chat failed");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  };

  // Feature gate: DocIntel is BD Pro+ only (or active trial)
  if (!isBdProOrHigher(organization.plan, organization)) return null;

  return (
    <>
      {/* Floating button - positioned left of copilot button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close DocIntel" : "Open DocIntel"}
        className="fixed bottom-36 right-4 sm:bottom-6 sm:right-24 z-40 w-14 h-14 rounded-full bg-[#7c3aed] text-white shadow-lg flex items-center justify-center hover:bg-[#6d28d9] transition-colors"
      >
        {open ? (
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        )}
      </button>

      {/* Slide-in panel */}
      {open && (
        <div className="fixed bottom-0 left-0 right-0 sm:bottom-24 sm:left-auto sm:right-24 z-40 w-full sm:w-[420px] max-w-full sm:max-w-[calc(100vw-3rem)] h-[85vh] sm:h-[600px] max-h-[calc(100vh-4rem)] sm:max-h-[calc(100vh-8rem)] bg-white border border-[#e5e7eb] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#e5e7eb] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#0f172a]">
                Document Analyst
              </h3>
              <p className="text-[11px] text-[#64748b]">
                {view === "upload"
                  ? "Upload or paste a document to analyze"
                  : documentName}
              </p>
            </div>
            {view === "chat" && (
              <button
                type="button"
                onClick={resetDocument}
                className="text-[11px] text-[#64748b] hover:text-[#0f172a]"
              >
                New document
              </button>
            )}
          </div>

          {view === "upload" ? (
            /* Upload / paste view */
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#d1d5db] rounded-xl p-6 text-center cursor-pointer hover:border-[#7c3aed] hover:bg-[#faf5ff] transition-colors"
              >
                <svg
                  className="w-8 h-8 mx-auto text-[#94a3b8] mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <p className="text-xs text-[#64748b]">
                  Drop a file here or click to browse
                </p>
                <p className="text-[10px] text-[#94a3b8] mt-1">
                  .pdf, .docx, and .txt supported
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[#e5e7eb]" />
                <span className="text-[10px] text-[#94a3b8] uppercase tracking-wide">
                  or paste text
                </span>
                <div className="flex-1 h-px bg-[#e5e7eb]" />
              </div>

              {/* Paste area */}
              <textarea
                value={documentText}
                onChange={(e) => setDocumentText(e.target.value)}
                placeholder="Paste your RFP, solicitation, or contract text here..."
                rows={8}
                className="w-full text-xs border border-[#e5e7eb] rounded-lg px-3 py-2 focus:outline-none focus:border-[#7c3aed] resize-none"
              />

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#94a3b8]">
                  {documentText.length.toLocaleString()} / 100,000 chars
                </span>
                <button
                  type="button"
                  onClick={handlePaste}
                  disabled={!documentText.trim()}
                  className="text-xs px-4 py-1.5 bg-[#7c3aed] text-white rounded-lg hover:bg-[#6d28d9] disabled:opacity-50"
                >
                  Analyze Document
                </button>
              </div>

              {parsing && (
                <div className="text-[11px] text-[#7c3aed] px-1 flex items-center gap-2">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Extracting text from document...
                </div>
              )}
              {error && (
                <div className="text-[11px] text-[#dc2626] px-1">{error}</div>
              )}
            </div>
          ) : (
            /* Chat view */
            <>
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
              >
                {messages.length === 0 && (
                  <div className="text-xs text-[#94a3b8] text-center mt-12 px-4">
                    <p>
                      Document loaded. Ask questions about this RFP or
                      solicitation.
                    </p>
                    <p className="mt-2">
                      Try:{" "}
                      <em>
                        &ldquo;What are the key requirements?&rdquo;
                      </em>
                    </p>
                    <p className="mt-1">
                      <em>
                        &ldquo;Summarize the evaluation criteria.&rdquo;
                      </em>
                    </p>
                    <p className="mt-1">
                      <em>
                        &ldquo;What is the response deadline?&rdquo;
                      </em>
                    </p>
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
                          ? "bg-[#7c3aed] text-white"
                          : "bg-[#f1f5f9] text-[#0f172a]"
                      }`}
                    >
                      {m.content ||
                        (streaming && i === messages.length - 1 ? "..." : "")}
                    </div>
                  </div>
                ))}
                {error && (
                  <div className="text-[11px] text-[#dc2626] px-2">
                    {error}
                  </div>
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
                    placeholder="Ask about this document..."
                    rows={1}
                    className="flex-1 text-xs border border-[#e5e7eb] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#7c3aed] resize-none"
                  />
                  <button
                    type="submit"
                    disabled={streaming || !input.trim()}
                    className="text-xs px-3 py-1.5 bg-[#7c3aed] text-white rounded-lg hover:bg-[#6d28d9] disabled:opacity-50"
                  >
                    {streaming ? "..." : "Send"}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
