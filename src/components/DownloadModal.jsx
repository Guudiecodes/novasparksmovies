import { useState, useEffect, useCallback, useRef } from "react";
import { storage, isElectron, STORAGE_KEYS } from "../utils/storage";
import { secureStorage } from "../utils/storage";

// ─── Icons ────────────────────────────────────────────────────────────────────
const IcoClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IcoDl = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const IcoPlus = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IcoX = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IcoCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IcoFolder = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);
const IcoSub = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="M7 15h4M15 15h2M7 11h2M13 11h4"/>
  </svg>
);
const IcoAlert = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);
const IcoExternal = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

function Spinner({ size = 16 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: "2px solid rgba(255,255,255,0.1)",
      borderTopColor: "rgba(255,255,255,0.65)",
      animation: "dm-spin 0.7s linear infinite", flexShrink: 0,
    }}/>
  );
}

// ─── Quality tiers (highest → lowest) ────────────────────────────────────────
const QUALITIES = [
  { id: "2160p", label: "4K",    detail: "2160p · Ultra HD",  flag: "2160" },
  { id: "1080p", label: "1080p", detail: "Full HD",           flag: "1080", recommended: true },
  { id: "720p",  label: "720p",  detail: "HD",                flag: "720"  },
  { id: "480p",  label: "480p",  detail: "SD",                flag: "480"  },
  { id: "360p",  label: "360p",  detail: "Low",               flag: "360"  },
  { id: "auto",  label: "Auto",  detail: "Best available",    flag: "best" },
];

// ─── Inline subtitle search panel ────────────────────────────────────────────
function SubPanel({ tmdbId, mediaType, season, episode, subdlKey, wyzieKey, selected, onChange, onClose }) {
  const [lang, setLang]     = useState(storage.get(STORAGE_KEYS.SUBTITLE_LANG) || "en");
  const [rows, setRows]     = useState(null);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState(null);
  const panelRef            = useRef(null);

  const search = useCallback(async (l) => {
    if (!tmdbId || !window.electron) return;
    setBusy(true); setErr(null); setRows(null);
    try {
      const res = await window.electron.searchSubtitles({
        tmdbId, mediaType, season, episode,
        languages: l || "",
        subdlApiKey: subdlKey || "",
        wyzieApiKey: wyzieKey || "",
      });
      if (!res.ok) { setErr(res.error || "Search failed"); setRows([]); }
      else setRows(res.results || []);
    } catch (e) { setErr(e.message); setRows([]); }
    finally { setBusy(false); }
  }, [tmdbId, mediaType, season, episode, subdlKey, wyzieKey]);

  useEffect(() => { search(lang); }, []); // eslint-disable-line

  // Close on outside click
  useEffect(() => {
    const h = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", h); };
  }, [onClose]);

  const toggle = (r) => {
    const has = selected.some((s) => s.file_id === r.file_id);
    onChange(has ? selected.filter((s) => s.file_id !== r.file_id) : [...selected, r]);
  };

  // Common language list
  const LANGS = [
    { code: "en", label: "English" }, { code: "fr", label: "French" },
    { code: "es", label: "Spanish" }, { code: "de", label: "German" },
    { code: "it", label: "Italian" }, { code: "pt", label: "Portuguese" },
    { code: "ru", label: "Russian" }, { code: "ar", label: "Arabic" },
    { code: "zh", label: "Chinese" }, { code: "ja", label: "Japanese" },
    { code: "ko", label: "Korean" },  { code: "hi", label: "Hindi" },
    { code: "tr", label: "Turkish" }, { code: "pl", label: "Polish" },
    { code: "nl", label: "Dutch" },   { code: "sv", label: "Swedish" },
    { code: "no", label: "Norwegian" },{ code: "da", label: "Danish" },
    { code: "fi", label: "Finnish" }, { code: "yo", label: "Yoruba" },
    { code: "ha", label: "Hausa" },   { code: "ig", label: "Igbo" },
  ];

  return (
    <div ref={panelRef} style={{
      position: "absolute", bottom: "calc(100% + 8px)", right: 0, zIndex: 99999,
      width: 360, background: "rgba(10,13,17,0.99)",
      border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12,
      boxShadow: "0 20px 60px rgba(0,0,0,0.85)",
      display: "flex", flexDirection: "column", maxHeight: 380, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
          <IcoSub /> Subtitles{selected.length > 0 ? ` · ${selected.length} selected` : ""}
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", display: "flex", padding: 2 }}><IcoClose /></button>
      </div>

      {/* Language filter */}
      <div style={{ padding: "8px 14px 6px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <select
          value={lang}
          onChange={(e) => { setLang(e.target.value); search(e.target.value); }}
          style={{ width: "100%", background: "var(--surface2,#1a1f26)", border: "1px solid var(--border,rgba(255,255,255,0.1))", borderRadius: 6, color: "var(--text,#fff)", padding: "5px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
        >
          <option value="">All languages</option>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>

      {/* Results */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {busy && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 20, color: "var(--text3)", fontSize: 12 }}>
            <Spinner size={13} /> Searching…
          </div>
        )}
        {!busy && err && (
          <div style={{ padding: "12px 14px", display: "flex", gap: 6, alignItems: "flex-start", color: "var(--red,#e50914)", fontSize: 11, lineHeight: 1.5 }}>
            <IcoAlert /><span>{err}</span>
          </div>
        )}
        {!busy && rows?.length === 0 && (
          <div style={{ padding: 20, color: "var(--text3)", fontSize: 12, textAlign: "center" }}>No subtitles found</div>
        )}
        {!busy && rows?.map((r) => {
          const sel = selected.some((s) => s.file_id === r.file_id);
          return (
            <div
              key={r.file_id}
              onClick={() => toggle(r)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 9, padding: "8px 14px",
                cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.03)",
                background: sel ? "rgba(229,9,20,0.07)" : "transparent", transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = sel ? "rgba(229,9,20,0.07)" : "transparent"; }}
            >
              {/* Checkbox */}
              <div style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0, marginTop: 2,
                border: `1.5px solid ${sel ? "var(--red,#e50914)" : "rgba(255,255,255,0.2)"}`,
                background: sel ? "var(--red,#e50914)" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s",
              }}>
                {sel && <IcoCheck />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(99,202,183,0.12)", color: "#63cab7", border: "1px solid rgba(99,202,183,0.2)", textTransform: "uppercase" }}>{r.language}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: r.via_subdl ? "rgba(99,149,255,0.1)" : "rgba(180,130,255,0.1)", color: r.via_subdl ? "#6395ff" : "#b482ff", border: `1px solid ${r.via_subdl ? "rgba(99,149,255,0.2)" : "rgba(180,130,255,0.2)"}`, textTransform: "uppercase" }}>
                    {r.via_subdl ? "SubDL" : "Wyzie"}
                  </span>
                  {r.hearing_impaired && <span style={{ fontSize: 9, color: "var(--text3)", padding: "1px 4px" }}>HI</span>}
                  {r.ai_translated    && <span style={{ fontSize: 9, color: "var(--text3)", padding: "1px 4px" }}>AI</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.release || r.file_name || `${(r.language || "").toUpperCase()} subtitle`}
                </div>
                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>
                  {r.uploader} · {(r.download_count || 0).toLocaleString()} downloads
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{ background: "var(--red,#e50914)", border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 18px", cursor: "pointer", fontFamily: "inherit" }}
        >
          Done{selected.length > 0 ? ` (${selected.length})` : ""}
        </button>
      </div>
    </div>
  );
}

// ─── Single quality row ───────────────────────────────────────────────────────
function QualityRow({ q, active, onSelect, subs, onSubsChange, canSubs, tmdbId, mediaType, season, episode, subdlKey, wyzieKey }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const wrapRef = useRef(null);

  return (
    <div ref={wrapRef} style={{ position: "relative", marginBottom: 6 }}>
      <div
        onClick={onSelect}
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "11px 13px",
          borderRadius: 9, cursor: "pointer",
          border: `1.5px solid ${active ? "var(--red,#e50914)" : "rgba(255,255,255,0.07)"}`,
          background: active ? "rgba(229,9,20,0.07)" : "rgba(255,255,255,0.02)",
          transition: "all 0.13s",
        }}
        onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; } }}
        onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; } }}
      >
        {/* Radio dot */}
        <div style={{
          width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
          border: `2px solid ${active ? "var(--red,#e50914)" : "rgba(255,255,255,0.25)"}`,
          background: active ? "var(--red,#e50914)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.13s",
        }}>
          {active && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }}/>}
        </div>

        {/* Labels */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: active ? "#fff" : "var(--text2,rgba(255,255,255,0.7))" }}>
              {q.label}
            </span>
            <span style={{ fontSize: 11, color: "var(--text3,rgba(255,255,255,0.4))" }}>{q.detail}</span>
            {q.recommended && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "rgba(99,202,183,0.1)", color: "#63cab7", border: "1px solid rgba(99,202,183,0.18)", letterSpacing: "0.04em" }}>
                RECOMMENDED
              </span>
            )}
          </div>
          {/* Selected sub tags */}
          {active && subs.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {subs.map((s) => (
                <span key={s.file_id} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4,
                  background: "rgba(99,202,183,0.1)", color: "#63cab7", border: "1px solid rgba(99,202,183,0.2)",
                }}>
                  <IcoSub />
                  {(s.language || "").toUpperCase()}
                  <span
                    onClick={(e) => { e.stopPropagation(); onSubsChange(subs.filter((x) => x.file_id !== s.file_id)); }}
                    style={{ cursor: "pointer", opacity: 0.55, display: "flex", alignItems: "center", marginLeft: 1 }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.55"; }}
                  ><IcoX /></span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Subtitle + button — only on selected row */}
        {active && canSubs && (
          <button
            onClick={(e) => { e.stopPropagation(); setPanelOpen((v) => !v); }}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: panelOpen ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7,
              color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600,
              padding: "5px 10px", cursor: "pointer", flexShrink: 0,
              transition: "all 0.13s", fontFamily: "inherit",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.11)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = panelOpen ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
          >
            <IcoPlus /><span>Subtitles</span>
          </button>
        )}
      </div>

      {/* Subtitle picker */}
      {panelOpen && active && (
        <SubPanel
          tmdbId={tmdbId} mediaType={mediaType} season={season} episode={episode}
          subdlKey={subdlKey} wyzieKey={wyzieKey}
          selected={subs} onChange={onSubsChange}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Shared modal header ──────────────────────────────────────────────────────
function ModalHeader({ onClose }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 12px", borderBottom: "1px solid var(--border,rgba(255,255,255,0.08))" }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text,#fff)", display: "flex", alignItems: "center", gap: 8 }}>
        <IcoDl size={14} /> Download
      </span>
      <button
        onClick={onClose}
        style={{ background: "none", border: "none", color: "var(--text3,rgba(255,255,255,0.4))", cursor: "pointer", display: "flex", padding: 4, borderRadius: 6, transition: "color 0.15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text,#fff)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text3,rgba(255,255,255,0.4))"; }}
      >
        <IcoClose />
      </button>
    </div>
  );
}

// ─── Waiting for stream ───────────────────────────────────────────────────────
function WaitStream() {
  return (
    <div style={{ padding: "32px 20px", textAlign: "center" }}>
      <div style={{ width: 38, height: 38, margin: "0 auto 16px", borderRadius: "50%", border: "3px solid rgba(255,255,255,0.06)", borderTopColor: "rgba(255,255,255,0.35)", animation: "dm-spin 0.9s linear infinite" }}/>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text2,rgba(255,255,255,0.65))", marginBottom: 6 }}>Waiting for stream</div>
      <div style={{ fontSize: 11, color: "var(--text3,rgba(255,255,255,0.35))", lineHeight: 1.65 }}>
        Start playing the content first, then tap Download to capture the stream.
      </div>
    </div>
  );
}

// ─── Web download: fetches m3u8 segments and triggers browser save ────────────
// Does NOT require FFmpeg WASM — instead fetches all TS segments, concatenates
// them into a single blob and triggers a native browser download.
// This works for simple HLS streams; for encrypted streams it falls back to
// opening the stream URL directly so the browser handles it.
async function webDownloadHLS({ m3u8Url, name, onProgress, onStatus }) {
  onStatus("Fetching playlist…");
  onProgress(2);

  // Fetch the m3u8 manifest
  let manifest;
  try {
    const r = await fetch(m3u8Url);
    if (!r.ok) throw new Error(`Playlist fetch failed (${r.status})`);
    manifest = await r.text();
  } catch (e) {
    throw new Error(`Could not load playlist: ${e.message}`);
  }

  // Check if it's a master playlist (multiple quality renditions)
  const isMaster = manifest.includes("#EXT-X-STREAM-INF");

  let targetUrl = m3u8Url;
  if (isMaster) {
    // Pick best/first rendition
    const lines = manifest.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
        const next = lines[i + 1]?.trim();
        if (next && !next.startsWith("#")) {
          targetUrl = next.startsWith("http") ? next : new URL(next, m3u8Url).href;
          break;
        }
      }
    }
    // Re-fetch the variant playlist
    onStatus("Loading stream…");
    const r2 = await fetch(targetUrl);
    if (!r2.ok) throw new Error(`Variant playlist fetch failed (${r2.status})`);
    manifest = await r2.text();
  }

  // Parse segments
  const base = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
  const lines = manifest.split("\n").map((l) => l.trim()).filter(Boolean);
  const segments = [];

  for (const line of lines) {
    if (line.startsWith("#")) continue;
    segments.push(line.startsWith("http") ? line : base + line);
  }

  if (segments.length === 0) {
    // No parseable segments — open directly so browser handles it
    const a = document.createElement("a");
    a.href = m3u8Url;
    a.download = (name || "video") + ".m3u8";
    a.click();
    onProgress(100);
    onStatus("Opened in browser");
    return;
  }

  onStatus(`Downloading ${segments.length} segments…`);

  // Fetch all segments
  const buffers = [];
  let done = 0;
  const CONCURRENCY = 4;

  for (let i = 0; i < segments.length; i += CONCURRENCY) {
    const batch = segments.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (url) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Segment fetch failed (${r.status})`);
        return r.arrayBuffer();
      })
    );
    buffers.push(...results);
    done += batch.length;
    onProgress(Math.round(5 + (done / segments.length) * 88));
    onStatus(`${done} / ${segments.length} segments…`);
  }

  onStatus("Building file…");
  onProgress(95);

  // Concatenate all TS buffers
  const totalBytes = buffers.reduce((sum, b) => sum + b.byteLength, 0);
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const buf of buffers) {
    merged.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  onStatus("Saving…");
  onProgress(99);

  const blob = new Blob([merged], { type: "video/MP2T" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (name || "video") + ".ts";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  onProgress(100);
  onStatus("Download complete");
}

// ─── Web download UI ──────────────────────────────────────────────────────────
function WebDownloadView({ m3u8Url, mediaName, quality, onClose }) {
  const [phase, setPhase]       = useState("idle"); // idle | running | done | error
  const [pct, setPct]           = useState(0);
  const [status, setStatus]     = useState("");
  const [err, setErr]           = useState(null);
  const cancelRef               = useRef(false);

  const run = useCallback(async () => {
    if (!m3u8Url) return;
    cancelRef.current = false;
    setPhase("running"); setErr(null); setPct(0);
    try {
      await webDownloadHLS({
        m3u8Url,
        name: mediaName || "video",
        onProgress: (p) => { if (!cancelRef.current) setPct(p); },
        onStatus:   (s) => { if (!cancelRef.current) setStatus(s); },
      });
      if (!cancelRef.current) setPhase("done");
    } catch (e) {
      if (!cancelRef.current) { setErr(e.message); setPhase("error"); }
    }
  }, [m3u8Url, mediaName]);

  const R = 26;
  const CIRC = 2 * Math.PI * R;

  if (phase === "idle") {
    return (
      <div style={{ padding: "18px 18px 22px" }}>
        <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.65, marginBottom: 18 }}>
          Downloads the stream directly to your device. Large files may take a few minutes — keep this tab open.
        </div>
        <button
          onClick={run}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--red,#e50914)", border: "none", borderRadius: 9, color: "#fff", fontSize: 14, fontWeight: 700, padding: "13px", cursor: "pointer", fontFamily: "inherit", transition: "opacity 0.15s" }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >
          <IcoDl size={16} /> Download {quality?.label || ""}
        </button>
      </div>
    );
  }

  if (phase === "running") {
    return (
      <div style={{ padding: "28px 20px", textAlign: "center" }}>
        <div style={{ position: "relative", width: 72, height: 72, margin: "0 auto 18px" }}>
          <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5"/>
            <circle cx="36" cy="36" r={R} fill="none" stroke="var(--red,#e50914)" strokeWidth="5"
              strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)}
              strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.35s ease" }}/>
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "var(--text,#fff)" }}>{pct}%</div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text,#fff)", marginBottom: 5 }}>{status || "Downloading…"}</div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 18 }}>Keep this tab open</div>
        <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "var(--red,#e50914)", width: `${pct}%`, transition: "width 0.3s ease" }}/>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div style={{ padding: "28px 20px", textAlign: "center" }}>
        <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(76,175,80,0.1)", border: "1.5px solid rgba(76,175,80,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#4caf50", marginBottom: 6 }}>Saved to Downloads</div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 20 }}>Check your browser's downloads folder</div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "var(--text2)", fontSize: 13, padding: "8px 22px", cursor: "pointer", fontFamily: "inherit" }}>Close</button>
      </div>
    );
  }

  // error
  return (
    <div style={{ padding: "28px 20px", textAlign: "center" }}>
      <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(229,9,20,0.08)", border: "1.5px solid rgba(229,9,20,0.22)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        <IcoAlert />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--red,#e50914)", marginBottom: 6 }}>Download failed</div>
      <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.6, marginBottom: 20 }}>{err}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button onClick={() => { setPhase("idle"); setErr(null); }} style={{ background: "var(--red,#e50914)", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 20px", cursor: "pointer", fontFamily: "inherit" }}>Retry</button>
        <button onClick={onClose} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "var(--text3)", fontSize: 13, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function DownloadModal({
  onClose,
  m3u8Url,
  subtitles = [],
  mediaName,
  downloaderFolder,
  setDownloaderFolder,
  onOpenSettings,
  onDownloadStarted,
  mediaId,
  mediaType,
  season,
  episode,
  posterPath,
  tmdbId,
}) {
  const [quality,      setQuality]      = useState("1080p");
  const [subsMap,      setSubsMap]      = useState({});   // qualityId → selectedSubs[]
  const [downloadPath, setDownloadPath] = useState(() => storage.get("downloadPath") || "");
  const [downloader,   setDownloader]   = useState(null);
  const [checking,     setChecking]     = useState(false);
  const [dlStatus,     setDlStatus]     = useState(null); // null | "starting" | "ok" | error string
  const [subdlKey,     setSubdlKey]     = useState("");
  const [wyzieKey,     setWyzieKey]     = useState(null);
  const [webPhase,     setWebPhase]     = useState("select"); // select | downloading

  // Load secure keys
  useEffect(() => {
    let ok = true;
    Promise.all([
      secureStorage.get(STORAGE_KEYS.SUBDL_API_KEY),
      secureStorage.get(STORAGE_KEYS.WYZIE_API_KEY),
    ]).then(([s, w]) => {
      if (!ok) return;
      if (s) setSubdlKey(s);
      setWyzieKey(w || "");
    });
    return () => { ok = false; };
  }, []);

  // Check binary when folder set
  useEffect(() => {
    if (!downloaderFolder || !isElectron) return;
    let ok = true;
    setChecking(true);
    window.electron.checkDownloader(downloaderFolder).then((r) => {
      if (!ok) return;
      setDownloader(r);
      setChecking(false);
    });
    return () => { ok = false; };
  }, [downloaderFolder]);

  const currentSubs = subsMap[quality] || [];
  const setCurrentSubs = (s) => setSubsMap((p) => ({ ...p, [quality]: s }));

  const canSubs  = isElectron && !!tmdbId && wyzieKey !== null;
  const noStream = !m3u8Url;

  const ua = (navigator.userAgent || "").toLowerCase();
  const binaryHint = ua.includes("win") ? "Windows_x64-portable" : ua.includes("mac") ? "macOS (compile from source)" : "Linux_x64-portable";
  const releaseUrl = "https://github.com/truelockmc/vid-dl-cli-only/releases/latest";

  // ── Electron download ──────────────────────────────────────────────────────
  const handleElectronDownload = async () => {
    if (!downloader?.binaryPath || !downloadPath || !m3u8Url) return;
    setDlStatus("starting");

    // Resolve subtitle download URLs
    let resolvedSubs = [...subtitles];
    for (const sub of currentSubs) {
      try {
        let url = sub.direct_url || null;
        let fname = null;
        if (!url && sub.file_id) {
          const r = await window.electron.getSubtitleUrl({ fileId: sub.file_id });
          if (r.ok) { url = r.url; fname = r.file_name || null; }
        }
        if (url) resolvedSubs.push({ url, lang: sub.language, name: fname || sub.release || sub.file_name, file_id: sub.file_id || null });
      } catch {}
    }

    const qFlag = QUALITIES.find((q) => q.id === quality)?.flag || "best";

    const result = await window.electron.runDownload({
      binaryPath:  downloader.binaryPath,
      m3u8Url,
      subtitles:   resolvedSubs,
      name:        mediaName,
      downloadPath,
      mediaId,
      mediaType,
      season,
      episode,
      posterPath:  posterPath || null,
      tmdbId:      tmdbId || mediaId || null,
      quality:     qFlag,
    });

    if (result.ok) {
      onDownloadStarted?.({
        id: result.id, name: mediaName, m3u8Url, downloadPath,
        filePath: null, status: "downloading", progress: 0,
        speed: "", size: "", totalFragments: 0, lastMessage: "Starting…",
        startedAt: Date.now(), completedAt: null,
        mediaId, mediaType, season, episode,
        posterPath: posterPath || null,
        tmdbId: tmdbId || mediaId || null,
        subtitles: resolvedSubs, subtitlePaths: [],
      });
      setDlStatus("ok");
    } else {
      setDlStatus(result.error || "Download failed");
    }
  };

  // ── Shared styles ──────────────────────────────────────────────────────────
  const modalStyle = {
    position: "fixed", inset: 0, zIndex: 9800,
    background: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  };
  const boxStyle = {
    width: "100%", maxWidth: 460,
    background: "var(--surface,#0f1318)",
    border: "1px solid var(--border,rgba(255,255,255,0.08))",
    borderRadius: 14,
    boxShadow: "0 24px 64px rgba(0,0,0,0.75)",
    overflow: "hidden",
  };

  // ════════════════════════════════════════════════════════════════
  // WEB MODE — direct browser download
  // ════════════════════════════════════════════════════════════════
  if (!isElectron) {
    return (
      <div style={modalStyle} onClick={onClose}>
        <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
          <style>{`@keyframes dm-spin { to { transform: rotate(360deg); } }`}</style>
          <ModalHeader onClose={onClose} />

          {noStream ? (
            <WaitStream />
          ) : webPhase === "select" ? (
            <div style={{ padding: "16px 18px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Select Quality</div>
              {QUALITIES.map((q) => (
                <QualityRow
                  key={q.id} q={q}
                  active={quality === q.id}
                  onSelect={() => setQuality(q.id)}
                  subs={subsMap[q.id] || []}
                  onSubsChange={(s) => setSubsMap((p) => ({ ...p, [q.id]: s }))}
                  canSubs={false}
                  tmdbId={tmdbId} mediaType={mediaType} season={season} episode={episode}
                  subdlKey={subdlKey} wyzieKey={wyzieKey}
                />
              ))}
              <button
                onClick={() => setWebPhase("downloading")}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--red,#e50914)", border: "none", borderRadius: 9, color: "#fff", fontSize: 14, fontWeight: 700, padding: "13px", cursor: "pointer", fontFamily: "inherit", marginTop: 6, transition: "opacity 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                <IcoDl size={16} /> Download {QUALITIES.find((q) => q.id === quality)?.label}
              </button>
            </div>
          ) : (
            <WebDownloadView
              m3u8Url={m3u8Url}
              mediaName={mediaName}
              quality={QUALITIES.find((q) => q.id === quality)}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // ELECTRON MODE — binary download engine
  // ════════════════════════════════════════════════════════════════
  const needFolder = !downloadPath;
  const needBinary = !downloader?.exists;

  return (
    <div style={modalStyle} onClick={onClose}>
      <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
        <style>{`@keyframes dm-spin { to { transform: rotate(360deg); } }`}</style>
        <ModalHeader onClose={onClose} />

        <div style={{ padding: "14px 18px 20px" }}>

          {/* ── Waiting for stream ── */}
          {noStream && <WaitStream />}

          {/* ── Success ── */}
          {!noStream && dlStatus === "ok" && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(76,175,80,0.1)", border: "1.5px solid rgba(76,175,80,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#4caf50", marginBottom: 6 }}>Download started</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 20 }}>Track progress in the Downloads page</div>
              <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "var(--text2)", fontSize: 13, padding: "8px 24px", cursor: "pointer", fontFamily: "inherit" }}>Close</button>
            </div>
          )}

          {/* ── Error banner ── */}
          {!noStream && dlStatus && dlStatus !== "ok" && dlStatus !== "starting" && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", background: "rgba(229,9,20,0.07)", border: "1px solid rgba(229,9,20,0.18)", borderRadius: 8, marginBottom: 14, fontSize: 12, color: "var(--red,#e50914)", lineHeight: 1.5 }}>
              <IcoAlert /><span>{dlStatus}</span>
            </div>
          )}

          {/* ── Main UI ── */}
          {!noStream && dlStatus !== "ok" && (
            <>
              {/* Quality selection */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>Select Quality</div>
              {QUALITIES.map((q) => (
                <QualityRow
                  key={q.id} q={q}
                  active={quality === q.id}
                  onSelect={() => setQuality(q.id)}
                  subs={subsMap[q.id] || []}
                  onSubsChange={(s) => setSubsMap((p) => ({ ...p, [q.id]: s }))}
                  canSubs={canSubs}
                  tmdbId={tmdbId} mediaType={mediaType} season={season} episode={episode}
                  subdlKey={subdlKey} wyzieKey={wyzieKey}
                />
              ))}

              {/* ── Download engine setup ── */}
              {needBinary && (
                <div style={{ marginTop: 14, padding: "13px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Download Engine Required</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.65, marginBottom: 10 }}>
                    Download the release for <strong style={{ color: "var(--text2)" }}>{binaryHint}</strong>, extract it, then select that folder below.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      onClick={() => window.electron.openExternal(releaseUrl)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "var(--text2)", fontSize: 11, fontWeight: 600, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      <IcoExternal /> Get engine
                    </button>
                    <button
                      onClick={async () => { const f = await window.electron.pickFolder(); if (f) setDownloaderFolder(f); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "var(--text2)", fontSize: 11, fontWeight: 600, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      <IcoFolder /> Select folder
                    </button>
                    {checking && <Spinner size={13} />}
                    {downloaderFolder && !checking && (
                      <span style={{ fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{downloaderFolder}</span>
                    )}
                  </div>
                  {!checking && downloader && !downloader.exists && downloaderFolder && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "var(--red,#e50914)", display: "flex", gap: 5, alignItems: "flex-start", lineHeight: 1.5 }}>
                      <IcoAlert /><span>Engine not found. Folder must contain <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 3 }}>_internal</code> and the binary.</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Folder setup ── */}
              {needFolder && !needBinary && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8 }}>Choose where to save files:</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      style={{ flex: 1, background: "var(--surface2,#1a1f26)", border: "1px solid var(--border,rgba(255,255,255,0.09))", borderRadius: 8, color: "var(--text,#fff)", padding: "8px 11px", fontSize: 11, outline: "none", fontFamily: "inherit" }}
                      placeholder="/home/user/Movies"
                      onChange={(e) => { storage.set("downloadPath", e.target.value); setDownloadPath(e.target.value); }}
                    />
                    <button onClick={async () => { const f = await window.electron.pickFolder(); if (f) { setDownloadPath(f); storage.set("downloadPath", f); } }}
                      style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, color: "var(--text2)", fontSize: 11, padding: "0 12px", cursor: "pointer", fontFamily: "inherit" }}>
                      <IcoFolder /> Browse
                    </button>
                  </div>
                </div>
              )}

              {/* ── Save path display (when set) ── */}
              {!needFolder && !needBinary && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "8px 11px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8 }}>
                  <IcoFolder />
                  <span style={{ flex: 1, fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{downloadPath}</span>
                  <button
                    onClick={async () => { const f = await window.electron.pickFolder(); if (f) { setDownloadPath(f); storage.set("downloadPath", f); } }}
                    style={{ background: "none", border: "none", color: "var(--text3)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text,#fff)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text3)"; }}
                  >
                    Change
                  </button>
                </div>
              )}

              {/* ── Download button ── */}
              <button
                onClick={handleElectronDownload}
                disabled={needBinary || needFolder || dlStatus === "starting"}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: (!needBinary && !needFolder) ? "var(--red,#e50914)" : "rgba(255,255,255,0.05)",
                  border: "none", borderRadius: 9, color: "#fff", fontSize: 14, fontWeight: 700,
                  padding: "13px", cursor: (!needBinary && !needFolder && dlStatus !== "starting") ? "pointer" : "not-allowed",
                  opacity: (!needBinary && !needFolder && dlStatus !== "starting") ? 1 : 0.38,
                  fontFamily: "inherit", marginTop: 14, transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => { if (!needBinary && !needFolder) e.currentTarget.style.opacity = "0.88"; }}
                onMouseLeave={(e) => { if (!needBinary && !needFolder && dlStatus !== "starting") e.currentTarget.style.opacity = "1"; }}
              >
                {dlStatus === "starting"
                  ? <><Spinner size={15} /> Starting…</>
                  : <><IcoDl size={16} /> Download {QUALITIES.find((q) => q.id === quality)?.label}</>
                }
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}