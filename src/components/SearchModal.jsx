import { useState, useEffect, useRef, useCallback } from "react";
import { tmdbFetch, imgUrl } from "../utils/api";
import { SearchIcon, CloseIcon } from "./Icons";
import { storage } from "../utils/storage";

const HISTORY_KEY = "searchHistory";
const MAX_HISTORY  = 12;

function loadHistory() { return storage.get(HISTORY_KEY) || []; }
function saveHistory(h) { storage.set(HISTORY_KEY, h); }

// ── Inline search bar — stays in place, no full-screen overlay ──────────────
export default function SearchModal({ apiKey, onSelect, onClose, offline }) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const inputRef  = useRef();
  const panelRef  = useRef();

  // Auto-focus input on open
  useEffect(() => {
    const tid = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(tid);
  }, []);

  // Close on outside click (backdrop)
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let mounted = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await tmdbFetch(
          `/search/multi?query=${encodeURIComponent(query)}&page=1`,
          apiKey,
        );
        if (mounted) {
          setResults(
            (data.results || []).filter((r) => r.media_type !== "person").slice(0, 12),
          );
        }
      } catch {}
      if (mounted) setLoading(false);
    }, 380);
    return () => { mounted = false; clearTimeout(timer); };
  }, [query, apiKey]);

  const addToHistory = useCallback((term) => {
    const t = term.trim(); if (!t) return;
    setHistory((prev) => {
      const next = [t, ...prev.filter((h) => h !== t)].slice(0, MAX_HISTORY);
      saveHistory(next); return next;
    });
  }, []);

  const removeFromHistory = useCallback((e, term) => {
    e.stopPropagation();
    setHistory((prev) => { const next = prev.filter((h) => h !== term); saveHistory(next); return next; });
  }, []);

  const clearHistory = useCallback(() => { setHistory([]); saveHistory([]); }, []);

  const handleSelect = (r) => {
    const t = query.trim();
    if (t) {
      const next = [t, ...history.filter((h) => h !== t)].slice(0, MAX_HISTORY);
      saveHistory(next); setHistory(next);
    }
    onSelect(r); onClose();
  };

  const handleHistoryClick = useCallback((term) => {
    setQuery(term); inputRef.current?.focus();
  }, []);

  const handleKey = (e) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Enter" && query.trim()) addToHistory(query);
  };

  const showHistory = !query && history.length > 0;

  return (
    <>
      {/* ── Invisible click-away layer ── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 199,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(2px)",
        }}
        onClick={onClose}
      />

      {/* ── Inline search panel — fixed at top of main area ── */}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: 0,
          left: "var(--sidebar)",
          right: 0,
          zIndex: 200,
          background: "var(--surface)",
          borderBottom: "2px solid var(--red)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px var(--border)",
          animation: "slideDown 0.2s ease",
        }}
      >
        {/* ── Input row ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 40px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <svg
            width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>

          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search movies, series, anime…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 22,
              fontWeight: 400,
              color: "var(--text)",
              fontFamily: "var(--font-body)",
              letterSpacing: 0.2,
            }}
          />

          {query && (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              style={{
                background: "var(--surface3)",
                border: "1px solid var(--border)",
                color: "var(--text3)",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: "var(--font-body)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Clear
            </button>
          )}

          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text3)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: 4,
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "var(--font-body)",
            }}
            title="Close (Esc)"
          >
            <span style={{ fontSize: 11, marginRight: 4, opacity: 0.6 }}>ESC</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Results panel ── */}
        <div style={{ maxHeight: "65vh", overflowY: "auto", padding: "8px 0" }}>

          {offline && (
            <div style={{ padding: "12px 40px", background: "rgba(255,165,0,0.08)", borderBottom: "1px solid var(--border)", fontSize: 13, color: "#ff9800", display: "flex", alignItems: "center", gap: 8 }}>
              🌐 No internet — search is unavailable offline.
            </div>
          )}

          {!offline && loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "28px 0" }}>
              <div className="spinner" />
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div style={{ padding: "32px 40px", color: "var(--text3)", fontSize: 15, textAlign: "center" }}>
              No results for "{query}"
            </div>
          )}

          {!loading && results.map((r) => (
            <div
              key={r.id}
              onClick={() => handleSelect(r)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "10px 40px",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <img
                src={r.poster_path ? imgUrl(r.poster_path, "w92") : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='58'%3E%3Crect fill='%23222' width='40' height='58'/%3E%3C/svg%3E"}
                alt=""
                style={{ width: 40, height: 58, objectFit: "cover", borderRadius: 5, flexShrink: 0, background: "var(--surface3)" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.title || r.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>
                  {(r.release_date || r.first_air_date || "").slice(0, 4)}
                  {r.vote_average ? ` · ★ ${r.vote_average.toFixed(1)}` : ""}
                </div>
              </div>
              <span
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase",
                  padding: "2px 8px", borderRadius: 3, flexShrink: 0,
                  background: r.media_type === "tv" ? "rgba(59,130,246,0.15)" : "var(--red-dim)",
                  color:      r.media_type === "tv" ? "#60a5fa"              : "var(--red)",
                  border:     r.media_type === "tv" ? "1px solid rgba(59,130,246,0.4)" : "1px solid var(--red)",
                }}
              >
                {r.media_type === "tv" ? "Series" : "Movie"}
              </span>
            </div>
          ))}

          {showHistory && (
            <div style={{ padding: "0 0 8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 40px", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "var(--text3)" }}>
                  Recent searches
                </span>
                <button onClick={clearHistory} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text3)", fontFamily: "var(--font-body)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text3)")}
                >
                  Clear all
                </button>
              </div>
              {history.map((term) => (
                <div
                  key={term}
                  onClick={() => handleHistoryClick(term)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 40px", cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  <span style={{ flex: 1, fontSize: 14, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{term}</span>
                  <button
                    onClick={(e) => removeFromHistory(e, term)}
                    style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: 3, borderRadius: 4, display: "flex", opacity: 0.6 }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "var(--red)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.color = "var(--text3)"; }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {!query && history.length === 0 && (
            <div style={{ padding: "32px 40px", textAlign: "center", color: "var(--text3)", fontSize: 14 }}>
              Start typing to search movies and series &nbsp;·&nbsp; <kbd>ESC</kbd> to close
            </div>
          )}
        </div>
      </div>
    </>
  );
}