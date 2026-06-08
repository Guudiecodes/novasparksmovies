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

// ─── Stream source resolvers ──────────────────────────────────────────────────
// NS knows the TMDB ID, type, season, episode — it builds the embed URL itself
// and extracts the m3u8 from each source in order until one succeeds.
// Sources are from US, NL, EU, JP CDN networks.
const STREAM_SOURCES = [
  {
    id: "vidsrc",
    label: "Source 1",
    buildUrl: (type, id, s, e) =>
      type === "movie"
        ? `https://vidsrc.to/embed/movie/${id}`
        : `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidlink",
    label: "Source 2",
    buildUrl: (type, id, s, e) =>
      type === "movie"
        ? `https://vidlink.pro/movie/${id}`
        : `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
  {
    id: "autoembed",
    label: "Source 3",
    buildUrl: (type, id, s, e) =>
      type === "movie"
        ? `https://player.autoembed.cc/embed/movie/${id}`
        : `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "videasy",
    label: "Source 4",
    buildUrl: (type, id, s, e) =>
      type === "movie"
        ? `https://player.videasy.net/movie/${id}`
        : `https://player.videasy.net/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidfast",
    label: "Source 5",
    buildUrl: (type, id, s, e) =>
      type === "movie"
        ? `https://vidfast.pro/movie/${id}?autoPlay=true`
        : `https://vidfast.pro/tv/${id}/${s}/${e}?autoPlay=true`,
  },
  {
    id: "2embed",
    label: "Source 6",
    buildUrl: (type, id, s, e) =>
      type === "movie"
        ? `https://www.2embed.cc/embed/${id}`
        : `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
  {
    id: "smashystream",
    label: "Source 7",
    buildUrl: (type, id, s, e) =>
      type === "movie"
        ? `https://player.smashy.stream/movie/${id}`
        : `https://player.smashy.stream/tv/${id}?s=${s}&e=${e}`,
  },
  {
    id: "multiembed",
    label: "Source 8",
    buildUrl: (type, id, s, e) =>
      type === "movie"
        ? `https://multiembed.mov/?video_id=${id}&tmdb=1`
        : `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
];

// ─── CORS proxy pool (US, EU, NL, JP) ────────────────────────────────────────
const CORS_PROXIES = [
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://proxy.cors.sh/${u}`,
  (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
];

async function fetchCORS(url, timeoutMs = 12000) {
  // Try direct first
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
    const r    = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (r.ok) return r;
  } catch {}

  // Try proxies
  for (const proxy of CORS_PROXIES) {
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
      const r    = await fetch(proxy(url), { signal: ctrl.signal });
      clearTimeout(tid);
      if (r.ok) return r;
    } catch {}
  }
  return null;
}

// ─── Extract m3u8 URL from an embed page HTML ─────────────────────────────────
// Scans the raw HTML/JS for .m3u8 patterns. Works on most embed sources.
function extractM3u8FromHtml(html) {
  if (!html) return null;
  // Match full URLs
  const patterns = [
    /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/gi,
    /["']([^"']+\.m3u8[^"']*)['"]/gi,
    /src["']\s*:\s*["']([^"']+\.m3u8[^"']*)['"]/gi,
    /file["']\s*:\s*["']([^"']+\.m3u8[^"']*)['"]/gi,
    /url["']\s*:\s*["']([^"']+\.m3u8[^"']*)['"]/gi,
    /source["']\s*:\s*["']([^"']+\.m3u8[^"']*)['"]/gi,
    /hls["']\s*:\s*["']([^"']+\.m3u8[^"']*)['"]/gi,
  ];

  for (const pat of patterns) {
    const matches = [...html.matchAll(new RegExp(pat.source, pat.flags))];
    for (const m of matches) {
      const candidate = m[1] || m[0];
      if (candidate && candidate.includes(".m3u8") && candidate.startsWith("http")) {
        return candidate.trim();
      }
    }
  }

  // Also check for base64-encoded URLs containing m3u8
  const b64 = html.match(/atob\(["']([A-Za-z0-9+/=]+)['"]\)/g);
  if (b64) {
    for (const match of b64) {
      try {
        const inner = match.match(/atob\(["']([A-Za-z0-9+/=]+)['"]\)/)[1];
        const decoded = atob(inner);
        if (decoded.includes(".m3u8")) {
          const urlMatch = decoded.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
          if (urlMatch) return urlMatch[0];
        }
      } catch {}
    }
  }

  return null;
}

// ─── Resolve m3u8 from TMDB ID by trying all sources ─────────────────────────
// Returns { url, sourceLabel } or throws
async function resolveStreamUrl(tmdbId, mediaType, season, episode, onStatus) {
  // If m3u8 was already intercepted from the active player, use it directly
  // (passed as prop — checked before calling this function)

  const type = mediaType === "tv" ? "tv" : "movie";

  for (const src of STREAM_SOURCES) {
    const embedUrl = src.buildUrl(type, tmdbId, season || 1, episode || 1);
    onStatus(`Connecting to ${src.label}…`);

    try {
      const res = await fetchCORS(embedUrl, 10000);
      if (!res) continue;
      const html = await res.text();
      const m3u8 = extractM3u8FromHtml(html);
      if (m3u8) {
        onStatus(`Stream found via ${src.label}`);
        return { url: m3u8, sourceLabel: src.label };
      }

      // Some sources load the m3u8 via a JSON API endpoint embedded in the page
      const apiPaths = html.match(/["'](\/api\/[^"']+)['"]/g) || [];
      for (const ap of apiPaths.slice(0, 3)) {
        const path = ap.replace(/['"]/g, "");
        if (!path.includes("stream") && !path.includes("source") && !path.includes("embed")) continue;
        const origin = new URL(embedUrl).origin;
        const apiRes = await fetchCORS(origin + path, 8000);
        if (!apiRes) continue;
        const apiText = await apiRes.text();
        const apiM3u8 = extractM3u8FromHtml(apiText);
        if (apiM3u8) {
          return { url: apiM3u8, sourceLabel: src.label };
        }
      }
    } catch {}
  }

  throw new Error("Could not resolve a download stream. All sources were checked.");
}

// ─── Parse master playlist renditions ─────────────────────────────────────────
function parseMasterRenditions(manifest, baseUrl) {
  const lines    = manifest.split("\n");
  const variants = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const next = lines[i + 1]?.trim();
    if (!next || next.startsWith("#")) continue;
    const bw  = parseInt((line.match(/BANDWIDTH=(\d+)/i) || [])[1] || "0");
    const h   = parseInt((line.match(/RESOLUTION=\d+x(\d+)/i) || [])[1] || "0");
    const url = next.startsWith("http") ? next : new URL(next, baseUrl).href;
    variants.push({ url, bw, height: h });
  }
  return variants.sort((a, b) => b.bw - a.bw);
}

function pickVariant(variants, qualityFlag) {
  if (!variants.length) return null;
  if (qualityFlag === "best" || qualityFlag === "auto") return variants[0];
  const target = parseInt(qualityFlag);
  if (isNaN(target)) return variants[0];
  return variants.reduce((best, v) => {
    return Math.abs((v.height || 9999) - target) < Math.abs((best.height || 9999) - target) ? v : best;
  }, variants[0]);
}

// ─── Fetch segment with retry ─────────────────────────────────────────────────
async function fetchSegment(url, attempt = 0) {
  const res = await fetchCORS(url, 20000);
  if (res) return res.arrayBuffer();
  if (attempt < 2) {
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    return fetchSegment(url, attempt + 1);
  }
  throw new Error(`Segment unreachable: ${url.split("/").pop()}`);
}

// ─── Core HLS downloader ──────────────────────────────────────────────────────
async function downloadHLS({ m3u8Url, name, qualityFlag = "best", onProgress, onStatus }) {
  onProgress(5);

  // 1. Fetch root playlist
  const rootRes = await fetchCORS(m3u8Url, 15000);
  if (!rootRes) throw new Error("Could not reach the stream.");
  const rootText = await rootRes.text();

  let variantUrl  = m3u8Url;
  let variantText = rootText;

  // 2. Master playlist → pick quality
  if (rootText.includes("#EXT-X-STREAM-INF")) {
    const variants = parseMasterRenditions(rootText, m3u8Url);
    if (!variants.length) throw new Error("No streams found in playlist.");
    const chosen   = pickVariant(variants, qualityFlag);
    variantUrl     = chosen.url;
    onStatus(`Loading ${chosen.height ? chosen.height + "p" : "stream"}…`);
    const varRes   = await fetchCORS(variantUrl, 15000);
    if (!varRes) throw new Error("Could not load quality stream.");
    variantText    = await varRes.text();
  }

  // 3. Encrypted stream — can't merge raw segments, open via anchor
  if (variantText.includes("#EXT-X-KEY")) {
    onStatus("Preparing download…");
    onProgress(80);
    const a    = document.createElement("a");
    a.href     = variantUrl;
    a.download = sanitizeName(name) + ".m3u8";
    a.target   = "_blank";
    a.rel      = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onProgress(100);
    onStatus("Download started in browser");
    return;
  }

  // 4. Parse segment URLs
  const base     = variantUrl.substring(0, variantUrl.lastIndexOf("/") + 1);
  const segments = variantText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.startsWith("http") ? l : base + l);

  if (!segments.length) throw new Error("Playlist has no video segments.");

  onStatus(`Downloading ${segments.length} segments…`);
  onProgress(8);

  // 5. Download in parallel batches of 6 with per-segment retry
  const buffers   = new Array(segments.length);
  let   completed = 0;
  const BATCH     = 6;

  for (let i = 0; i < segments.length; i += BATCH) {
    await Promise.all(
      segments.slice(i, i + BATCH).map(async (url, j) => {
        buffers[i + j] = await fetchSegment(url);
        completed++;
        onProgress(Math.round(8 + (completed / segments.length) * 86));
        onStatus(`${completed} / ${segments.length} segments…`);
      })
    );
  }

  // 6. Merge and save
  onStatus("Building file…");
  onProgress(96);

  const totalBytes = buffers.reduce((s, b) => s + b.byteLength, 0);
  const merged     = new Uint8Array(totalBytes);
  let   offset     = 0;
  for (const buf of buffers) { merged.set(new Uint8Array(buf), offset); offset += buf.byteLength; }

  onStatus("Saving to device…");
  onProgress(99);

  const blob    = new Blob([merged], { type: "video/MP2T" });
  const blobUrl = URL.createObjectURL(blob);
  const a       = document.createElement("a");
  a.href        = blobUrl;
  a.download    = sanitizeName(name) + ".ts";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);

  onProgress(100);
  onStatus("Saved to Downloads");
}

function sanitizeName(name) {
  return (name || "video").replace(/[/\\?%*:|"<>]/g, "-").trim() || "video";
}

// ─── Subtitle picker panel ────────────────────────────────────────────────────
function SubPanel({ tmdbId, mediaType, season, episode, subdlKey, wyzieKey, selected, onChange, onClose }) {
  const [lang, setLang] = useState(storage.get(STORAGE_KEYS.SUBTITLE_LANG) || "en");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState(null);
  const ref             = useRef(null);

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

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const t = setTimeout(() => document.addEventListener("mousedown", h), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", h); };
  }, [onClose]);

  const toggle = (r) => {
    const has = selected.some((s) => s.file_id === r.file_id);
    onChange(has ? selected.filter((s) => s.file_id !== r.file_id) : [...selected, r]);
  };

  const LANGS = [
    { code: "en", label: "English" },   { code: "fr", label: "French" },
    { code: "es", label: "Spanish" },   { code: "de", label: "German" },
    { code: "it", label: "Italian" },   { code: "pt", label: "Portuguese" },
    { code: "ru", label: "Russian" },   { code: "ar", label: "Arabic" },
    { code: "zh", label: "Chinese" },   { code: "ja", label: "Japanese" },
    { code: "ko", label: "Korean" },    { code: "hi", label: "Hindi" },
    { code: "tr", label: "Turkish" },   { code: "pl", label: "Polish" },
    { code: "nl", label: "Dutch" },     { code: "sv", label: "Swedish" },
    { code: "yo", label: "Yoruba" },    { code: "ha", label: "Hausa" },
    { code: "ig", label: "Igbo" },
  ];

  return (
    <div ref={ref} style={{
      position: "absolute", bottom: "calc(100% + 8px)", right: 0, zIndex: 99999,
      width: 340, background: "rgba(10,13,17,0.99)",
      border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12,
      boxShadow: "0 20px 60px rgba(0,0,0,0.85)",
      display: "flex", flexDirection: "column", maxHeight: 360, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text,#fff)", display: "flex", alignItems: "center", gap: 6 }}>
          <IcoSub /> Subtitles{selected.length > 0 ? ` · ${selected.length}` : ""}
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", display: "flex", padding: 2 }}><IcoClose /></button>
      </div>
      <div style={{ padding: "7px 14px 6px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <select value={lang} onChange={(e) => { setLang(e.target.value); search(e.target.value); }}
          style={{ width: "100%", background: "var(--surface2,#1a1f26)", border: "1px solid var(--border,rgba(255,255,255,0.1))", borderRadius: 6, color: "var(--text,#fff)", padding: "5px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
          <option value="">All languages</option>
          {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {busy && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 20, color: "var(--text3)", fontSize: 12 }}><Spinner size={13} /> Searching…</div>}
        {!busy && err && <div style={{ padding: "12px 14px", color: "var(--red,#e50914)", fontSize: 11, lineHeight: 1.5, display: "flex", gap: 6 }}><IcoAlert /><span>{err}</span></div>}
        {!busy && rows?.length === 0 && <div style={{ padding: 20, color: "var(--text3)", fontSize: 12, textAlign: "center" }}>No subtitles found</div>}
        {!busy && rows?.map((r) => {
          const sel = selected.some((s) => s.file_id === r.file_id);
          return (
            <div key={r.file_id} onClick={() => toggle(r)}
              style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.03)", background: sel ? "rgba(229,9,20,0.07)" : "transparent", transition: "background 0.1s" }}
              onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = sel ? "rgba(229,9,20,0.07)" : "transparent"; }}
            >
              <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, marginTop: 2, border: `1.5px solid ${sel ? "var(--red,#e50914)" : "rgba(255,255,255,0.2)"}`, background: sel ? "var(--red,#e50914)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s" }}>
                {sel && <IcoCheck />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(99,202,183,0.12)", color: "#63cab7", border: "1px solid rgba(99,202,183,0.2)", textTransform: "uppercase" }}>{r.language}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: r.via_subdl ? "rgba(99,149,255,0.1)" : "rgba(180,130,255,0.1)", color: r.via_subdl ? "#6395ff" : "#b482ff", border: `1px solid ${r.via_subdl ? "rgba(99,149,255,0.2)" : "rgba(180,130,255,0.2)"}`, textTransform: "uppercase" }}>
                    {r.via_subdl ? "SubDL" : "Wyzie"}
                  </span>
                  {r.hearing_impaired && <span style={{ fontSize: 9, color: "var(--text3)", padding: "1px 4px" }}>HI</span>}
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
      <div style={{ padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ background: "var(--red,#e50914)", border: "none", borderRadius: 7, color: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 18px", cursor: "pointer", fontFamily: "inherit" }}>
          Done{selected.length > 0 ? ` (${selected.length})` : ""}
        </button>
      </div>
    </div>
  );
}

// ─── Quality row ──────────────────────────────────────────────────────────────
function QualityRow({ q, active, onSelect, subs, onSubsChange, canSubs, tmdbId, mediaType, season, episode, subdlKey, wyzieKey }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const ref = useRef(null);

  return (
    <div ref={ref} style={{ position: "relative", marginBottom: 6 }}>
      <div onClick={onSelect}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 9, cursor: "pointer", border: `1.5px solid ${active ? "var(--red,#e50914)" : "rgba(255,255,255,0.07)"}`, background: active ? "rgba(229,9,20,0.07)" : "rgba(255,255,255,0.02)", transition: "all 0.13s" }}
        onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; } }}
        onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.background = "rgba(255,255,255,0.02)"; } }}
      >
        <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, border: `2px solid ${active ? "var(--red,#e50914)" : "rgba(255,255,255,0.25)"}`, background: active ? "var(--red,#e50914)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.13s" }}>
          {active && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }}/>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: active ? "#fff" : "var(--text2,rgba(255,255,255,0.7))" }}>{q.label}</span>
            <span style={{ fontSize: 11, color: "var(--text3,rgba(255,255,255,0.4))" }}>{q.detail}</span>
            {q.recommended && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "rgba(99,202,183,0.1)", color: "#63cab7", border: "1px solid rgba(99,202,183,0.18)", letterSpacing: "0.04em" }}>RECOMMENDED</span>}
          </div>
          {active && subs.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {subs.map((s) => (
                <span key={s.file_id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: "rgba(99,202,183,0.1)", color: "#63cab7", border: "1px solid rgba(99,202,183,0.2)" }}>
                  <IcoSub />{(s.language || "").toUpperCase()}
                  <span onClick={(e) => { e.stopPropagation(); onSubsChange(subs.filter((x) => x.file_id !== s.file_id)); }} style={{ cursor: "pointer", opacity: 0.55, display: "flex", alignItems: "center" }} onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.55"; }}><IcoX /></span>
                </span>
              ))}
            </div>
          )}
        </div>
        {active && canSubs && (
          <button onClick={(e) => { e.stopPropagation(); setPanelOpen((v) => !v); }}
            style={{ display: "flex", alignItems: "center", gap: 5, background: panelOpen ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600, padding: "5px 10px", cursor: "pointer", flexShrink: 0, transition: "all 0.13s", fontFamily: "inherit" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.11)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = panelOpen ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
          >
            <IcoPlus /><span>Subtitles</span>
          </button>
        )}
      </div>
      {panelOpen && active && (
        <SubPanel tmdbId={tmdbId} mediaType={mediaType} season={season} episode={episode} subdlKey={subdlKey} wyzieKey={wyzieKey} selected={subs} onChange={onSubsChange} onClose={() => setPanelOpen(false)} />
      )}
    </div>
  );
}

// ─── Modal header ─────────────────────────────────────────────────────────────
function ModalHeader({ title, onClose }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 12px", borderBottom: "1px solid var(--border,rgba(255,255,255,0.08))" }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text,#fff)", display: "flex", alignItems: "center", gap: 8 }}>
        <IcoDl size={14} /> {title || "Download"}
      </span>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text3,rgba(255,255,255,0.4))", cursor: "pointer", display: "flex", padding: 4, borderRadius: 6, transition: "color 0.15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text,#fff)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text3,rgba(255,255,255,0.4))"; }}>
        <IcoClose />
      </button>
    </div>
  );
}

// ─── Download progress view (shared web + electron) ───────────────────────────
function DownloadProgress({ pct, status, err, onRetry, onClose }) {
  const R    = 26;
  const CIRC = 2 * Math.PI * R;

  if (err) {
    return (
      <div style={{ padding: "28px 20px", textAlign: "center" }}>
        <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(229,9,20,0.08)", border: "1.5px solid rgba(229,9,20,0.22)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <IcoAlert />
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--red,#e50914)", marginBottom: 6 }}>Download failed</div>
        <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.6, marginBottom: 20 }}>{err}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={onRetry} style={{ background: "var(--red,#e50914)", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 20px", cursor: "pointer", fontFamily: "inherit" }}>Retry</button>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "var(--text3)", fontSize: 13, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit" }}>Close</button>
        </div>
      </div>
    );
  }

  if (pct >= 100) {
    return (
      <div style={{ padding: "28px 20px", textAlign: "center" }}>
        <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(76,175,80,0.1)", border: "1.5px solid rgba(76,175,80,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#4caf50", marginBottom: 6 }}>Download complete</div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 20 }}>{status}</div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "var(--text2)", fontSize: 13, padding: "8px 24px", cursor: "pointer", fontFamily: "inherit" }}>Close</button>
      </div>
    );
  }

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
      <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 16 }}>Keep this tab open</div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", background: "var(--red,#e50914)", width: `${pct}%`, borderRadius: 2, transition: "width 0.3s ease" }}/>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═════════════════════════════════════════════════════════════════════════════
export default function DownloadModal({
  onClose,
  m3u8Url,           // intercepted from active player — used if available
  subtitles = [],    // intercepted subtitles from active player
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
  const [subsMap,      setSubsMap]      = useState({});
  const [downloadPath, setDownloadPath] = useState(() => storage.get("downloadPath") || "");
  const [downloader,   setDownloader]   = useState(null);
  const [checking,     setChecking]     = useState(false);
  const [screen,       setScreen]       = useState("select"); // select | downloading | done
  const [pct,          setPct]          = useState(0);
  const [status,       setStatus]       = useState("");
  const [dlErr,        setDlErr]        = useState(null);
  const [dlStatus,     setDlStatus]     = useState(null); // electron: null|starting|ok|errstr
  const [subdlKey,     setSubdlKey]     = useState("");
  const [wyzieKey,     setWyzieKey]     = useState(null);
  const cancelRef                       = useRef(false);

  // Load keys
  useEffect(() => {
    let ok = true;
    Promise.all([
      secureStorage.get(STORAGE_KEYS.SUBDL_API_KEY),
      secureStorage.get(STORAGE_KEYS.WYZIE_API_KEY),
    ]).then(([s, w]) => { if (!ok) return; if (s) setSubdlKey(s); setWyzieKey(w || ""); });
    return () => { ok = false; };
  }, []);

  // Check binary
  useEffect(() => {
    if (!downloaderFolder || !isElectron) return;
    let ok = true;
    setChecking(true);
    window.electron.checkDownloader(downloaderFolder).then((r) => { if (!ok) return; setDownloader(r); setChecking(false); });
    return () => { ok = false; };
  }, [downloaderFolder]);

  const currentSubs = subsMap[quality] || [];
  const setCurrentSubs = (s) => setSubsMap((p) => ({ ...p, [quality]: s }));
  const canSubs = isElectron && !!tmdbId && wyzieKey !== null;

  const ua         = (navigator.userAgent || "").toLowerCase();
  const binaryHint = ua.includes("win") ? "Windows_x64-portable" : ua.includes("mac") ? "macOS (compile from source)" : "Linux_x64-portable";
  const releaseUrl = "https://github.com/truelockmc/vid-dl-cli-only/releases/latest";
  const qFlag      = QUALITIES.find((q) => q.id === quality)?.flag || "best";

  // ── WEB: resolve stream and download directly ───────────────────────────────
  const handleWebDownload = useCallback(async () => {
    cancelRef.current = false;
    setScreen("downloading");
    setPct(0);
    setDlErr(null);

    try {
      // Use intercepted m3u8 if available, else resolve from sources
      let streamUrl = m3u8Url;
      if (!streamUrl && tmdbId) {
        streamUrl = (await resolveStreamUrl(
          tmdbId, mediaType, season, episode,
          (s) => { if (!cancelRef.current) setStatus(s); }
        )).url;
      }
      if (!streamUrl) throw new Error("No stream could be found for this content.");

      await downloadHLS({
        m3u8Url:     streamUrl,
        name:        mediaName || "video",
        qualityFlag: qFlag,
        onProgress:  (p) => { if (!cancelRef.current) setPct(p); },
        onStatus:    (s) => { if (!cancelRef.current) setStatus(s); },
      });
      if (!cancelRef.current) { setPct(100); setStatus("Saved to Downloads"); setScreen("done"); }
    } catch (e) {
      if (!cancelRef.current) { setDlErr(e.message); setScreen("error"); }
    }
  }, [m3u8Url, tmdbId, mediaType, season, episode, mediaName, qFlag]);

  // ── ELECTRON: pass to binary runner ────────────────────────────────────────
  const handleElectronDownload = useCallback(async () => {
    if (!downloadPath) return;
    setDlStatus("starting");

    // Resolve stream URL if not intercepted yet
    let streamUrl = m3u8Url;
    if (!streamUrl && tmdbId) {
      try {
        setStatus("Finding stream…");
        const res = await resolveStreamUrl(
          tmdbId, mediaType, season, episode,
          (s) => setStatus(s)
        );
        streamUrl = res.url;
      } catch (e) {
        setDlStatus(e.message);
        return;
      }
    }
    if (!streamUrl) { setDlStatus("No stream URL available — play the content first."); return; }

    // Resolve subtitle URLs
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

    const result = await window.electron.runDownload({
      binaryPath:  downloader?.binaryPath || "",
      m3u8Url:     streamUrl,
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
        id: result.id, name: mediaName, m3u8Url: streamUrl, downloadPath,
        filePath: null, status: "downloading", progress: 0,
        speed: "", size: "", totalFragments: 0, lastMessage: "Starting…",
        startedAt: Date.now(), completedAt: null,
        mediaId, mediaType, season, episode,
        posterPath: posterPath || null, tmdbId: tmdbId || mediaId || null,
        subtitles: resolvedSubs, subtitlePaths: [],
      });
      setDlStatus("ok");
    } else {
      setDlStatus(result.error || "Download failed");
    }
  }, [m3u8Url, tmdbId, mediaType, season, episode, mediaName, qFlag, downloadPath, downloader, currentSubs, subtitles, posterPath, mediaId, onDownloadStarted]);

  const needBinary = isElectron && !downloader?.exists;
  const needFolder = isElectron && !downloadPath;

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

  return (
    <div style={modalStyle} onClick={onClose}>
      <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
        <style>{`@keyframes dm-spin { to { transform: rotate(360deg); } }`}</style>

        {/* ── Downloading screen ── */}
        {(screen === "downloading" || screen === "error" || screen === "done") && !isElectron ? (
          <>
            <ModalHeader title="Download" onClose={onClose} />
            <DownloadProgress
              pct={screen === "done" ? 100 : pct}
              status={status}
              err={screen === "error" ? dlErr : null}
              onRetry={() => { setScreen("select"); setDlErr(null); setPct(0); }}
              onClose={onClose}
            />
          </>
        ) : isElectron && dlStatus === "ok" ? (
          <>
            <ModalHeader title="Download" onClose={onClose} />
            <div style={{ padding: "28px 20px", textAlign: "center" }}>
              <div style={{ width: 50, height: 50, borderRadius: "50%", background: "rgba(76,175,80,0.1)", border: "1.5px solid rgba(76,175,80,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#4caf50", marginBottom: 6 }}>Download started</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 20 }}>Track progress in Downloads</div>
              <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "var(--text2)", fontSize: 13, padding: "8px 24px", cursor: "pointer", fontFamily: "inherit" }}>Close</button>
            </div>
          </>
        ) : (
          <>
            <ModalHeader title={`Download · ${mediaName || ""}`} onClose={onClose} />
            <div style={{ padding: "14px 18px 20px" }}>

              {/* Electron error */}
              {isElectron && dlStatus && dlStatus !== "ok" && dlStatus !== "starting" && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", background: "rgba(229,9,20,0.07)", border: "1px solid rgba(229,9,20,0.18)", borderRadius: 8, marginBottom: 14, fontSize: 12, color: "var(--red,#e50914)", lineHeight: 1.5 }}>
                  <IcoAlert /><span>{dlStatus}</span>
                </div>
              )}

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

              {/* Electron: binary setup */}
              {isElectron && needBinary && (
                <div style={{ marginTop: 14, padding: "13px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>Download Engine Required</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.65, marginBottom: 10 }}>
                    Download the release for <strong style={{ color: "var(--text2)" }}>{binaryHint}</strong>, extract it, then select that folder.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={() => window.electron.openExternal(releaseUrl)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "var(--text2)", fontSize: 11, fontWeight: 600, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}>
                      <IcoExternal /> Get engine
                    </button>
                    <button onClick={async () => { const f = await window.electron.pickFolder(); if (f) setDownloaderFolder(f); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, color: "var(--text2)", fontSize: 11, fontWeight: 600, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit" }}>
                      <IcoFolder /> Select folder
                    </button>
                    {checking && <Spinner size={13} />}
                    {downloaderFolder && !checking && <span style={{ fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{downloaderFolder}</span>}
                  </div>
                  {!checking && downloader && !downloader.exists && downloaderFolder && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "var(--red,#e50914)", display: "flex", gap: 5, alignItems: "flex-start", lineHeight: 1.5 }}>
                      <IcoAlert /><span>Engine not found. Folder must contain <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 4px", borderRadius: 3 }}>_internal</code> and the binary.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Electron: folder setup */}
              {isElectron && needFolder && !needBinary && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8 }}>Set download folder:</div>
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

              {/* Electron: save path row */}
              {isElectron && !needFolder && !needBinary && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "8px 11px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8 }}>
                  <IcoFolder />
                  <span style={{ flex: 1, fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{downloadPath}</span>
                  <button onClick={async () => { const f = await window.electron.pickFolder(); if (f) { setDownloadPath(f); storage.set("downloadPath", f); } }}
                    style={{ background: "none", border: "none", color: "var(--text3)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text,#fff)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text3)"; }}>
                    Change
                  </button>
                </div>
              )}

              {/* Download button */}
              <button
                onClick={isElectron ? handleElectronDownload : handleWebDownload}
                disabled={isElectron && (needBinary || needFolder || dlStatus === "starting")}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: isElectron && (needBinary || needFolder) ? "rgba(255,255,255,0.05)" : "var(--red,#e50914)",
                  border: "none", borderRadius: 9, color: "#fff", fontSize: 14, fontWeight: 700,
                  padding: "13px", fontFamily: "inherit", marginTop: 14, transition: "opacity 0.15s",
                  cursor: (isElectron && (needBinary || needFolder || dlStatus === "starting")) ? "not-allowed" : "pointer",
                  opacity: (isElectron && (needBinary || needFolder || dlStatus === "starting")) ? 0.38 : 1,
                }}
                onMouseEnter={(e) => { if (!(isElectron && (needBinary || needFolder))) e.currentTarget.style.opacity = "0.88"; }}
                onMouseLeave={(e) => { if (!(isElectron && (needBinary || needFolder || dlStatus === "starting"))) e.currentTarget.style.opacity = "1"; }}
              >
                {(dlStatus === "starting") ? <><Spinner size={15} /> Resolving stream…</> : <><IcoDl size={16} /> Download {QUALITIES.find((q) => q.id === quality)?.label}</>}
              </button>

            </div>
          </>
        )}
      </div>
    </div>
  );
}