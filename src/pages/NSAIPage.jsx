import { useState, useEffect, useRef, useCallback } from "react";
import { storage } from "../utils/storage";
import { BackIcon } from "../components/Icons";

const NSAI_KEY_STORAGE = "nsai_anthropic_key";
const NSAI_HISTORY_KEY = "nsai_chat_history";

const SYSTEM_PROMPT = `You are NSAI, the intelligent assistant built into NovaSpark — a premium streaming and media platform. You help users with anything: finding movies or shows, explaining features, answering general questions, and more. Be concise, helpful, and natural. Do not use emojis. When discussing NovaSpark features, be knowledgeable and specific. The platform has features like watchlist, download history, subtitle support, multiple streaming sources, and premium plans.`;

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", padding: "4px 0" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#00b4a6",
            display: "inline-block",
            animation: "nsai-dot-bounce 1.2s infinite ease-in-out",
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 12,
        animation: "nsai-fade-in 0.2s ease",
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #00b4a6, #007a72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginRight: 10,
            marginTop: 2,
            fontSize: 12,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: 0.5,
          }}
        >
          NS
        </div>
      )}
      <div
        style={{
          maxWidth: "72%",
          padding: "10px 14px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
          background: isUser
            ? "linear-gradient(135deg, #00b4a6, #007a72)"
            : "rgba(255,255,255,0.06)",
          border: isUser ? "none" : "1px solid rgba(255,255,255,0.08)",
          fontSize: 13,
          lineHeight: 1.65,
          color: isUser ? "#fff" : "var(--text1, #e8eaed)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

// ── API key setup screen ──────────────────────────────────────────────────────
function SetupScreen({ onSave }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");

  const save = () => {
    const trimmed = key.trim();
    if (!trimmed.startsWith("sk-ant-")) {
      setErr("Key must start with sk-ant-");
      return;
    }
    storage.set(NSAI_KEY_STORAGE, trimmed);
    onSave(trimmed);
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        gap: 20,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #00b4a6, #007a72)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 22,
          fontWeight: 800,
          color: "#fff",
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        NS
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text1, #e8eaed)", marginBottom: 6 }}>
          Connect NSAI
        </div>
        <div style={{ fontSize: 13, color: "var(--text3, #8a9aaa)", maxWidth: 320, lineHeight: 1.6 }}>
          Paste your Anthropic API key to enable the AI assistant. Your key is stored locally on your device only.
        </div>
      </div>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <input
          type="password"
          placeholder="sk-ant-api03-..."
          value={key}
          onChange={(e) => { setKey(e.target.value); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && save()}
          style={{
            width: "100%",
            padding: "11px 14px",
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${err ? "var(--red, #e74c3c)" : "rgba(255,255,255,0.12)"}`,
            borderRadius: 10,
            color: "var(--text1, #e8eaed)",
            fontSize: 13,
            outline: "none",
            boxSizing: "border-box",
            fontFamily: "monospace",
          }}
        />
        {err && (
          <div style={{ fontSize: 12, color: "var(--red, #e74c3c)", marginTop: 6, textAlign: "left" }}>
            {err}
          </div>
        )}
      </div>
      <button
        onClick={save}
        style={{
          padding: "10px 32px",
          background: "linear-gradient(135deg, #00b4a6, #007a72)",
          border: "none",
          borderRadius: 10,
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Connect
      </button>
      <a
        href="https://console.anthropic.com/keys"
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: 12, color: "#00b4a6", textDecoration: "none" }}
      >
        Get an API key at console.anthropic.com
      </a>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function NSAIPage({ onBack, isPremium }) {
  const [apiKey,    setApiKey]    = useState(() => storage.get(NSAI_KEY_STORAGE) || "");
  const [messages,  setMessages]  = useState(() => {
    try { return JSON.parse(storage.get(NSAI_HISTORY_KEY) || "[]"); } catch { return []; }
  });
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [showReset, setShowReset] = useState(false);

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);
  const abortRef  = useRef(null);

  useEffect(() => {
    storage.set(NSAI_HISTORY_KEY, JSON.stringify(messages.slice(-80)));
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setError("");

    const userMsg = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type":         "application/json",
          "x-api-key":            apiKey,
          "anthropic-version":    "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model:      "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system:     SYSTEM_PROMPT,
          messages:   nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `Error ${res.status}`);
      }

      const data    = await res.json();
      const content = data?.content?.[0]?.text || "";
      setMessages((prev) => [...prev, { role: "assistant", content }]);
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message || "Something went wrong. Check your API key.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, apiKey]);

  const clearHistory = () => {
    setMessages([]);
    storage.set(NSAI_HISTORY_KEY, "[]");
    setShowReset(false);
  };

  const resetKey = () => {
    storage.set(NSAI_KEY_STORAGE, "");
    setApiKey("");
    setShowReset(false);
  };

  if (!apiKey) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #0f1117)" }}>
        <TopBar onBack={onBack} hasKey={false} onReset={() => {}} />
        <SetupScreen onSave={setApiKey} />
        <style>{NSAI_STYLES}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg, #0f1117)" }}>
      <TopBar
        onBack={onBack}
        hasKey={true}
        onReset={() => setShowReset((v) => !v)}
        showReset={showReset}
        onClearHistory={clearHistory}
        onChangeKey={resetKey}
      />

      {/* messages area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 16px 8px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.length === 0 && (
          <EmptyState onSuggest={(t) => setInput(t)} />
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 12 }}>
            <div
              style={{
                width: 30, height: 30, borderRadius: "50%",
                background: "linear-gradient(135deg, #00b4a6, #007a72)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginRight: 10, marginTop: 2,
                fontSize: 12, fontWeight: 700, color: "#fff",
              }}
            >
              NS
            </div>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "4px 16px 16px 16px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <TypingDots />
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              margin: "0 0 12px",
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(231,76,60,0.1)",
              border: "1px solid rgba(231,76,60,0.3)",
              fontSize: 12,
              color: "var(--red, #e74c3c)",
            }}
          >
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* input bar */}
      <div
        style={{
          padding: "12px 16px 16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14,
            padding: "8px 8px 8px 14px",
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            placeholder="Ask anything..."
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              color: "var(--text1, #e8eaed)",
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: "inherit",
              maxHeight: 120,
              overflowY: "auto",
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: input.trim() && !loading
                ? "linear-gradient(135deg, #00b4a6, #007a72)"
                : "rgba(255,255,255,0.08)",
              border: "none",
              cursor: input.trim() && !loading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 8L2 2l2 6-2 6 12-6z" fill={input.trim() && !loading ? "#fff" : "rgba(255,255,255,0.3)"} />
            </svg>
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text3, #8a9aaa)", textAlign: "center", marginTop: 8 }}>
          Shift + Enter for new line
        </div>
      </div>

      <style>{NSAI_STYLES}</style>
    </div>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────
function TopBar({ onBack, hasKey, onReset, showReset, onClearHistory, onChangeKey }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px 12px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        position: "relative",
      }}
    >
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text3, #8a9aaa)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          padding: 4,
        }}
      >
        <BackIcon size={18} />
        Back
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #00b4a6, #007a72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 800,
            color: "#fff",
          }}
        >
          NS
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text1, #e8eaed)" }}>
          NSAI
        </span>
      </div>

      {hasKey ? (
        <div style={{ position: "relative" }}>
          <button
            onClick={onReset}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text3, #8a9aaa)",
              fontSize: 20,
              lineHeight: 1,
              padding: "4px 8px",
              borderRadius: 6,
            }}
          >
            ···
          </button>
          {showReset && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 6px)",
                background: "var(--card, #1a1d27)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 10,
                overflow: "hidden",
                zIndex: 100,
                minWidth: 160,
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              <button
                onClick={onClearHistory}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "11px 16px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text1, #e8eaed)",
                  fontSize: 13,
                  textAlign: "left",
                  borderBottom: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                Clear chat history
              </button>
              <button
                onClick={onChangeKey}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "11px 16px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--red, #e74c3c)",
                  fontSize: 13,
                  textAlign: "left",
                }}
              >
                Change API key
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ width: 60 }} />
      )}
    </div>
  );
}

// ── Empty state with suggestions ──────────────────────────────────────────────
function EmptyState({ onSuggest }) {
  const suggestions = [
    "What can I watch on NovaSpark tonight?",
    "How do I download a movie for offline?",
    "What is the best thriller released this year?",
    "How do subtitles work on NovaSpark?",
  ];

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 16px",
        gap: 24,
        textAlign: "center",
      }}
    >
      <div>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #00b4a6, #007a72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 800,
            color: "#fff",
            margin: "0 auto 14px",
          }}
        >
          NS
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text1, #e8eaed)", marginBottom: 6 }}>
          NSAI
        </div>
        <div style={{ fontSize: 13, color: "var(--text3, #8a9aaa)" }}>
          Your NovaSpark AI assistant. Ask anything.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 340 }}>
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggest(s)}
            style={{
              padding: "10px 14px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 10,
              color: "var(--text2, #b0b8c8)",
              fontSize: 12,
              cursor: "pointer",
              textAlign: "left",
              lineHeight: 1.5,
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(0,180,166,0.1)";
              e.currentTarget.style.borderColor = "rgba(0,180,166,0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)";
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const NSAI_STYLES = `
  @keyframes nsai-dot-bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
    40%           { transform: translateY(-5px); opacity: 1; }
  }
  @keyframes nsai-fade-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;