/**
 * DownloadModal.jsx — NovaSparks Download System
 *
 * ✓ Never redirects or leaves the page
 * ✓ Auto-resolves stream from active player OR BFF sources
 * ✓ Parses master m3u8 for real quality variants
 * ✓ Electron: yt-dlp background download (no binary setup required)
 * ✓ Web: in-browser HLS download → saves straight to system Downloads folder
 * ✓ Shows in browser Downloads tab automatically
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { storage, isElectron, STORAGE_KEYS } from "../utils/storage";
import { secureStorage } from "../utils/storage";
import { fetchAllNonEmbedSources, M3U8_PROXY } from "../utils/api";

// ─── Icons ────────────────────────────────────────────────────────────────────
const IcoClose  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcoDl     = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IcoCheck  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoFolder = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
const IcoSpin   = ({ size = 14 }) => (
  <span style={{ display:"inline-block", width:size, height:size, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.15)", borderTopColor:"rgba(255,255,255,0.7)", animation:"dm-spin 0.7s linear infinite", flexShrink:0 }} />
);

// ─── Quality definitions ───────────────────────────────────────────────────────
const QUALITY_PRESETS = [
  { id: "2160", label: "4K",    height: 2160, detail: "Ultra HD"  },
  { id: "1080", label: "1080p", height: 1080, detail: "Full HD", recommended: true },
  { id: "720",  label: "720p",  height: 720,  detail: "HD"        },
  { id: "480",  label: "480p",  height: 480,  detail: "SD"        },
  { id: "best", label: "Auto",  height: 0,    detail: "Best available" },
];

// ─── Parse HLS master playlist for quality variants ────────────────────────────
async function fetchVariants(masterUrl) {
  try {
    const res = await fetch(masterUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.includes("#EXT-X-STREAM-INF")) return []; // already a variant playlist
    const lines   = text.split("\n");
    const found   = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
      const next = lines[i + 1]?.trim();
      if (!next || next.startsWith("#")) continue;
      const height = parseInt((line.match(/RESOLUTION=\d+x(\d+)/i) || [])[1] || "0");
      const bw     = parseInt((line.match(/BANDWIDTH=(\d+)/i) || [])[1] || "0");
      const url    = next.startsWith("http") ? next : new URL(next, masterUrl).href;
      found.push({ url, height, bw });
    }
    return found.sort((a, b) => b.height - a.height);
  } catch { return []; }
}

// ─── HLS downloader (web) — segments in-browser, saves to Downloads folder ────
async function downloadHLS({ masterUrl, variantUrl, qualityHeight, name, onProgress, onStatus, signal }) {
  onProgress(3); onStatus("Loading playlist…");

  // 1. Fetch master to find variant if not already resolved
  let finalVariantUrl = variantUrl || masterUrl;
  if (!variantUrl) {
    const res = await fetch(masterUrl, { signal });
    if (!res.ok) throw new Error(`Playlist unreachable (${res.status})`);
    const text = await res.text();
    if (text.includes("#EXT-X-STREAM-INF")) {
      const lines = text.split("\n");
      const variants = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
        const next = lines[i + 1]?.trim();
        if (!next || next.startsWith("#")) continue;
        const height = parseInt((line.match(/RESOLUTION=\d+x(\d+)/i) || [])[1] || "0");
        const bw     = parseInt((line.match(/BANDWIDTH=(\d+)/i) || [])[1] || "0");
        const url    = next.startsWith("http") ? next : new URL(next, masterUrl).href;
        variants.push({ url, height, bw });
      }
      variants.sort((a, b) => b.height - a.height);
      if (variants.length) {
        const target = qualityHeight > 0
          ? variants.reduce((best, v) => Math.abs(v.height - qualityHeight) < Math.abs(best.height - qualityHeight) ? v : best, variants[0])
          : variants[0];
        finalVariantUrl = target.url;
      }
    }
  }

  // 2. Fetch variant playlist
  onStatus("Parsing stream…"); onProgress(6);
  const vRes = await fetch(finalVariantUrl, { signal });
  if (!vRes.ok) throw new Error(`Stream unreachable (${vRes.status})`);
  const vText = await vRes.text();

  // 3. Extract segments
  const base = finalVariantUrl.substring(0, finalVariantUrl.lastIndexOf("/") + 1);
  const segments = vText
    .split("\n").map(l => l.trim())
    .filter(l => l && !l.startsWith("#"))
    .map(l => l.startsWith("http") ? l : base + l);

  if (!segments.length) throw new Error("Playlist has no segments.");

  onStatus(`Downloading ${segments.length} segments…`); onProgress(8);

  // 4. Download in parallel batches of 8 with per-segment retry
  const buffers = new Array(segments.length);
  let completed = 0;
  const BATCH   = 8;

  const fetchSeg = async (url, retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await fetch(url, { signal, cache: "no-store" });
        if (r.ok) return r.arrayBuffer();
      } catch (e) {
        if (e.name === "AbortError") throw e;
        if (attempt === retries) throw e;
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw new Error("Segment failed after retries");
  };

  for (let i = 0; i < segments.length; i += BATCH) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await Promise.all(
      segments.slice(i, i + BATCH).map(async (url, j) => {
        buffers[i + j] = await fetchSeg(url);
        completed++;
        onProgress(Math.round(8 + (completed / segments.length) * 86));
        onStatus(`${completed} / ${segments.length} segments`);
      })
    );
  }

  // 5. Merge all segment buffers
  onStatus("Merging file…"); onProgress(96);
  const total  = buffers.reduce((s, b) => s + b.byteLength, 0);
  const merged = new Uint8Array(total);
  let   offset = 0;
  for (const buf of buffers) { merged.set(new Uint8Array(buf), offset); offset += buf.byteLength; }

  // 6. Save — creates blob, triggers browser download manager (no page navigation)
  onStatus("Saving to Downloads…"); onProgress(99);
  const blob     = new Blob([merged], { type: "video/MP2T" });
  const blobUrl  = URL.createObjectURL(blob);
  const safeName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "video";
  const anchor   = document.createElement("a");
  anchor.href     = blobUrl;
  anchor.download = safeName + ".ts";
  // Append hidden to body, click, remove — this saves to system Downloads
  // and shows in browser's Downloads tab, WITHOUT opening a new page
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

  onProgress(100); onStatus("Saved to Downloads folder ✓");
}

// ─── Resolve stream via BFF (AD-free non-embed sources) ───────────────────────
async function resolveViaBFF(mediaType, tmdbId, season, episode, signal) {
  return new Promise((resolve) => {
    let found = false;
    fetchAllNonEmbedSources(
      mediaType === "tv" ? "tv" : "movie",
      tmdbId,
      season ?? null,
      episode ?? null,
      {
        onSourceFound: (src) => {
          if (!found && src?.url) {
            found = true;
            const url = src.format === "hls"
              ? `${M3U8_PROXY}${encodeURIComponent(src.url)}`
              : src.url;
            resolve({ url, quality: src.quality || null, source: src.source || "source" });
          }
        },
        signal,
      }
    ).then(({ sources }) => {
      if (!found) {
        if (sources.length) {
          const s = sources[0];
          const url = s.format === "hls" ? `${M3U8_PROXY}${encodeURIComponent(s.url)}` : s.url;
          resolve({ url, quality: s.quality || null, source: s.source || "source" });
        } else {
          resolve(null);
        }
      }
    }).catch(() => { if (!found) resolve(null); });
  });
}

// ─── Progress ring ─────────────────────────────────────────────────────────────
function Ring({ pct = 0 }) {
  const R    = 28;
  const circ = 2 * Math.PI * R;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" style={{ transform:"rotate(-90deg)" }}>
      <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4.5"/>
      <circle cx="38" cy="38" r={R} fill="none" stroke="var(--red,#e50914)" strokeWidth="4.5"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
        strokeLinecap="round" style={{ transition:"stroke-dashoffset 0.35s ease" }}/>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
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
  // ── Stream state ──────────────────────────────────────────────────────────
  const [streamUrl,  setStreamUrl]  = useState(m3u8Url || null);
  const [variants,   setVariants]   = useState([]);    // quality variants from master
  const [resolving,  setResolving]  = useState(!m3u8Url);
  const [streamErr,  setStreamErr]  = useState(null);

  // ── Download options ──────────────────────────────────────────────────────
  const [quality,      setQuality]      = useState("1080");
  const [downloadPath, setDownloadPath] = useState(() => storage.get("downloadPath") || "");
  const [ytdlpReady,   setYtdlpReady]   = useState(null); // null=checking, true/false

  // ── UI phase ──────────────────────────────────────────────────────────────
  // "setup" | "ready" | "downloading" | "queued" | "done" | "error"
  const [phase,     setPhase]     = useState("setup");
  const [pct,       setPct]       = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [dlErr,     setDlErr]     = useState(null);

  const cancelCtrl = useRef(null);
  const resolveCtrl = useRef(null);

  // ── On open: resolve stream if not provided ───────────────────────────────
  useEffect(() => {
    // Check yt-dlp for electron
    if (isElectron && window.electron?.checkYtdlp) {
      window.electron.checkYtdlp().then(r => setYtdlpReady(!!r?.available)).catch(() => setYtdlpReady(false));
    } else if (!isElectron) {
      setYtdlpReady(false); // not needed on web
    }

    if (m3u8Url) {
      setStreamUrl(m3u8Url);
      setResolving(false);
      setPhase("ready");
      loadVariants(m3u8Url);
      return;
    }

    // No stream yet — find one via BFF
    const ctrl = new AbortController();
    resolveCtrl.current = ctrl;
    setResolving(true);

    resolveViaBFF(mediaType, tmdbId || mediaId, season, episode, ctrl.signal)
      .then((result) => {
        if (ctrl.signal.aborted) return;
        if (result?.url) {
          setStreamUrl(result.url);
          setResolving(false);
          setPhase("ready");
          loadVariants(result.url);
        } else {
          setStreamErr("Stream not found. Try playing content first, or use AD-free mode.");
          setResolving(false);
          setPhase("no-stream");
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setStreamErr("Could not reach stream servers.");
          setResolving(false);
          setPhase("no-stream");
        }
      });

    return () => ctrl.abort();
  }, []); // eslint-disable-line

  // ── Load quality variants from master playlist ────────────────────────────
  const loadVariants = useCallback(async (url) => {
    const found = await fetchVariants(url);
    setVariants(found);
    // Auto-select best variant ≤ 1080p
    if (found.length) {
      const best = found.find(v => v.height <= 1080) || found[0];
      const match = QUALITY_PRESETS.find(p => best.height >= p.height - 60 && best.height <= p.height + 60);
      if (match) setQuality(match.id);
    }
  }, []);

  // ── Pick variant URL for selected quality ─────────────────────────────────
  const getVariantUrl = useCallback(() => {
    if (!variants.length) return streamUrl;
    if (quality === "best") return variants[0].url;
    const h = parseInt(quality);
    const match = variants.reduce((best, v) =>
      Math.abs(v.height - h) < Math.abs(best.height - h) ? v : best, variants[0]);
    return match.url;
  }, [variants, quality, streamUrl]);

  // ── WEB download handler ──────────────────────────────────────────────────
  const handleWebDownload = useCallback(async () => {
    if (!streamUrl) return;
    const ctrl = new AbortController();
    cancelCtrl.current = ctrl;
    setPhase("downloading");
    setPct(0);
    setDlErr(null);

    const variantUrl = variants.length ? getVariantUrl() : null;

    try {
      await downloadHLS({
        masterUrl:     streamUrl,
        variantUrl:    variantUrl !== streamUrl ? variantUrl : null,
        qualityHeight: parseInt(quality) || 0,
        name:          mediaName || "video",
        onProgress:    p  => setPct(p),
        onStatus:      s  => setStatusMsg(s),
        signal:        ctrl.signal,
      });
      setPhase("done");
    } catch (e) {
      if (e.name === "AbortError") { setPhase("ready"); return; }
      setDlErr(e.message || "Download failed");
      setPhase("error");
    }
  }, [streamUrl, variants, getVariantUrl, quality, mediaName]);

  // ── ELECTRON download handler ─────────────────────────────────────────────
  const handleElectronDownload = useCallback(async () => {
    if (!downloadPath) return;
    const url = streamUrl;
    if (!url) return;

    setPhase("queued"); setStatusMsg("Starting…");

    // Resolve subtitle file URLs
    let resolvedSubs = [...(subtitles || [])];

    const result = await window.electron.runDownload({
      binaryPath:  downloaderFolder ? (await window.electron.checkDownloader(downloaderFolder))?.binaryPath || "" : "",
      m3u8Url:     url,
      subtitles:   resolvedSubs,
      name:        mediaName || "video",
      downloadPath,
      mediaId,
      mediaType,
      season,
      episode,
      posterPath:  posterPath || null,
      tmdbId:      tmdbId || mediaId || null,
      quality,
    });

    if (result.ok) {
      onDownloadStarted?.({
        id: result.id, name: mediaName || "video",
        m3u8Url: url, downloadPath,
        filePath: null, status: "downloading", progress: 0,
        speed: "", size: "", totalFragments: 0, lastMessage: "Starting…",
        startedAt: Date.now(), completedAt: null,
        mediaId, mediaType, season, episode,
        posterPath: posterPath || null,
        tmdbId: tmdbId || mediaId || null,
        subtitles: resolvedSubs, subtitlePaths: [],
      });
      setPhase("done");
    } else {
      setDlErr(result.error || "Download failed");
      setPhase("error");
    }
  }, [streamUrl, downloadPath, downloaderFolder, mediaName, subtitles, mediaId, mediaType, season, episode, posterPath, tmdbId, quality, onDownloadStarted]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const needFolder     = isElectron && !downloadPath;
  const canDownloadNow = !!streamUrl && (isElectron ? !!downloadPath : true);
  const isElectronReady = isElectron && ytdlpReady !== null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:9900, background:"rgba(0,0,0,0.72)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"16px" }}
      onClick={onClose}
    >
      <div
        style={{ width:"100%", maxWidth:440, background:"var(--surface,#0f1318)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, boxShadow:"0 28px 64px rgba(0,0,0,0.8)", overflow:"hidden", display:"flex", flexDirection:"column" }}
        onClick={e => e.stopPropagation()}
      >
        <style>{`
          @keyframes dm-spin { to { transform: rotate(360deg); } }
          @keyframes dm-slide { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
          .dm-quality-pill { display:flex; align-items:center; gap:6px; padding:9px 13px; border-radius:8px; cursor:pointer; border:1.5px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02); transition:all 0.13s; }
          .dm-quality-pill.active { border-color:var(--red,#e50914); background:rgba(229,9,20,0.07); }
          .dm-quality-pill:not(.active):hover { border-color:rgba(255,255,255,0.15); background:rgba(255,255,255,0.04); }
        `}</style>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"13px 16px 11px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ fontSize:13, fontWeight:700, color:"var(--text,#fff)", display:"flex", alignItems:"center", gap:7 }}>
            <IcoDl /> Download{mediaName ? ` · ${mediaName.length > 32 ? mediaName.slice(0,32)+"…" : mediaName}` : ""}
          </span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", display:"flex", padding:4, borderRadius:5, transition:"color 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.color="#fff"}
            onMouseLeave={e => e.currentTarget.style.color="rgba(255,255,255,0.4)"}>
            <IcoClose />
          </button>
        </div>

        {/* ─ Downloading (web) ─ */}
        {phase === "downloading" && (
          <div style={{ padding:"32px 20px", textAlign:"center", animation:"dm-slide 0.2s ease" }}>
            <div style={{ position:"relative", width:76, height:76, margin:"0 auto 16px" }}>
              <Ring pct={pct} />
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff" }}>{pct}%</div>
            </div>
            <div style={{ fontSize:13, fontWeight:600, color:"#fff", marginBottom:4 }}>{statusMsg || "Downloading…"}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:18 }}>Keep this tab open — saving to your Downloads folder</div>
            <div style={{ height:3, background:"rgba(255,255,255,0.06)", borderRadius:2, overflow:"hidden", marginBottom:18 }}>
              <div style={{ height:"100%", background:"var(--red,#e50914)", width:`${pct}%`, borderRadius:2, transition:"width 0.3s ease" }}/>
            </div>
            <button onClick={() => { cancelCtrl.current?.abort(); }}
              style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"rgba(255,255,255,0.5)", fontSize:12, padding:"7px 18px", cursor:"pointer", fontFamily:"inherit" }}>
              Cancel
            </button>
          </div>
        )}

        {/* ─ Done ─ */}
        {(phase === "done" || phase === "queued") && (
          <div style={{ padding:"32px 20px", textAlign:"center", animation:"dm-slide 0.2s ease" }}>
            <div style={{ width:52, height:52, borderRadius:"50%", background:"rgba(76,175,80,0.1)", border:"1.5px solid rgba(76,175,80,0.3)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
              {phase === "queued"
                ? <IcoSpin size={20}/>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <div style={{ fontSize:14, fontWeight:700, color: phase === "queued" ? "#fff" : "#4caf50", marginBottom:6 }}>
              {phase === "queued" ? "Download started" : "Download complete"}
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginBottom:22 }}>
              {phase === "queued" ? "Track progress in the Downloads tab" : "File saved to your Downloads folder"}
            </div>
            <button onClick={onClose} style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:"rgba(255,255,255,0.7)", fontSize:13, padding:"8px 24px", cursor:"pointer", fontFamily:"inherit" }}>
              Close
            </button>
          </div>
        )}

        {/* ─ Error ─ */}
        {phase === "error" && (
          <div style={{ padding:"28px 20px", textAlign:"center", animation:"dm-slide 0.2s ease" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"var(--red,#e50914)", marginBottom:6 }}>Download failed</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.7, marginBottom:20 }}>{dlErr}</div>
            <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
              <button onClick={() => { setPhase("ready"); setDlErr(null); }}
                style={{ background:"var(--red,#e50914)", border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, padding:"8px 20px", cursor:"pointer", fontFamily:"inherit" }}>
                Retry
              </button>
              <button onClick={onClose}
                style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"rgba(255,255,255,0.5)", fontSize:12, padding:"8px 16px", cursor:"pointer", fontFamily:"inherit" }}>
                Close
              </button>
            </div>
          </div>
        )}

        {/* ─ Setup / Ready ─ */}
        {(phase === "setup" || phase === "ready" || phase === "no-stream") && (
          <div style={{ padding:"14px 16px 18px" }}>

            {/* Stream status bar */}
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 12px", borderRadius:8, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.05)", marginBottom:14, fontSize:12 }}>
              {resolving ? (
                <><IcoSpin size={12}/><span style={{ color:"rgba(255,255,255,0.55)" }}>Finding stream…</span></>
              ) : streamUrl ? (
                <>
                  <span style={{ color:"#4caf50", fontSize:14, lineHeight:1 }}>●</span>
                  <span style={{ color:"rgba(255,255,255,0.7)" }}>
                    Stream ready
                    {variants.length > 0 && ` · ${variants[0].height}p – ${variants[variants.length - 1].height}p available`}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ color:"var(--red,#e50914)", fontSize:14, lineHeight:1 }}>●</span>
                  <span style={{ color:"rgba(255,255,255,0.55)", flex:1 }}>{streamErr || "No stream found"}</span>
                </>
              )}
            </div>

            {/* Quality picker */}
            {streamUrl && (
              <>
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>Quality</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                  {(variants.length > 0
                    ? variants.map(v => {
                        const preset = QUALITY_PRESETS.find(p => p.height > 0 && Math.abs(v.height - p.height) <= 60) || { id: `${v.height}`, label: `${v.height}p`, recommended: false };
                        return { ...preset, variantUrl: v.url };
                      }).filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i)
                    : QUALITY_PRESETS.filter(p => p.id !== "2160")
                  ).map(q => (
                    <div
                      key={q.id}
                      className={`dm-quality-pill${quality === q.id ? " active" : ""}`}
                      onClick={() => setQuality(q.id)}
                    >
                      <div style={{ width:13, height:13, borderRadius:"50%", flexShrink:0, border:`2px solid ${quality === q.id ? "var(--red,#e50914)" : "rgba(255,255,255,0.2)"}`, background:quality === q.id ? "var(--red,#e50914)" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.12s" }}>
                        {quality === q.id && <div style={{ width:4, height:4, borderRadius:"50%", background:"#fff" }}/>}
                      </div>
                      <span style={{ fontSize:12, fontWeight:700, color:quality === q.id ? "#fff" : "rgba(255,255,255,0.65)" }}>{q.label}</span>
                      {q.recommended && <span style={{ fontSize:9, fontWeight:700, color:"#63cab7", background:"rgba(99,202,183,0.1)", border:"1px solid rgba(99,202,183,0.2)", borderRadius:3, padding:"1px 5px" }}>RECOMMENDED</span>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Electron: folder picker */}
            {isElectron && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.35)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:7 }}>Save to</div>
                <div style={{ display:"flex", gap:7, alignItems:"center" }}>
                  <div style={{ flex:1, display:"flex", alignItems:"center", gap:7, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, padding:"7px 10px", fontSize:12, color:"rgba(255,255,255,0.5)", overflow:"hidden" }}>
                    <IcoFolder />
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {downloadPath || "No folder selected"}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      const f = await window.electron.pickFolder();
                      if (f) { setDownloadPath(f); storage.set("downloadPath", f); }
                    }}
                    style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"rgba(255,255,255,0.7)", fontSize:11, fontWeight:600, padding:"7px 12px", cursor:"pointer", fontFamily:"inherit", flexShrink:0, transition:"background 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.1)"}
                    onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,0.06)"}
                  >
                    Browse
                  </button>
                </div>
              </div>
            )}

            {/* Electron: yt-dlp note */}
            {isElectron && ytdlpReady === false && !downloaderFolder && (
              <div style={{ fontSize:11, color:"rgba(255,200,0,0.7)", background:"rgba(255,200,0,0.05)", border:"1px solid rgba(255,200,0,0.12)", borderRadius:7, padding:"8px 11px", marginBottom:14, lineHeight:1.55 }}>
                Install <strong style={{ color:"rgba(255,200,0,0.9)" }}>yt-dlp</strong> for best download quality — or set up the custom engine below.{" "}
                <span
                  style={{ color:"var(--red,#e50914)", cursor:"pointer", textDecoration:"underline" }}
                  onClick={() => window.electron.openExternal("https://github.com/yt-dlp/yt-dlp/releases/latest")}
                >
                  Download yt-dlp
                </span>
              </div>
            )}

            {/* Download button */}
            <button
              onClick={isElectron ? handleElectronDownload : handleWebDownload}
              disabled={!canDownloadNow || resolving}
              style={{
                width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                background: canDownloadNow && !resolving ? "var(--red,#e50914)" : "rgba(255,255,255,0.05)",
                border:"none", borderRadius:9, color:"#fff", fontSize:14, fontWeight:700,
                padding:"13px", fontFamily:"inherit", cursor: canDownloadNow && !resolving ? "pointer" : "not-allowed",
                opacity: canDownloadNow && !resolving ? 1 : 0.4, transition:"opacity 0.15s",
              }}
              onMouseEnter={e => { if (canDownloadNow && !resolving) e.currentTarget.style.opacity = "0.88"; }}
              onMouseLeave={e => { if (canDownloadNow && !resolving) e.currentTarget.style.opacity = "1"; }}
            >
              {resolving
                ? <><IcoSpin size={15}/> Finding stream…</>
                : !streamUrl
                ? <>No stream available</>
                : needFolder
                ? <>Select a folder to download</>
                : <><IcoDl /> Download {QUALITY_PRESETS.find(p => p.id === quality)?.label || quality}</>
              }
            </button>

            {/* Web note */}
            {!isElectron && streamUrl && (
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", textAlign:"center", marginTop:9, lineHeight:1.5 }}>
                File saves directly to your Downloads folder · appears in browser Downloads tab
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}