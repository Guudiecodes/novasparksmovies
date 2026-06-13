/**
 * DownloadModal.jsx — NovaSparks
 *
 * Stream resolution strategy (no backend required):
 *
 * Electron:
 *   1. If m3u8Url prop already has a URL → use it immediately
 *   2. If not → listen for the NEXT `m3u8-found` IPC event from the
 *      running webview (same event that drives playback) — wait up to 14s
 *
 * Web:
 *   1. If m3u8Url prop already has a URL (AD-free mode nsStreamUrl) → use it
 *   2. If not → try Service Worker + hidden iframe stream capture
 *   3. Fallback → guide user to enable AD-free mode then re-open Download
 *
 * Download execution:
 *   Electron → window.electron.runDownload (yt-dlp or binary in background)
 *   Web      → fetch HLS segments in-browser, save blob to system Downloads
 *              (appears in browser Downloads tab, no page navigation)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { storage, isElectron, STORAGE_KEYS } from "../utils/storage";
import { secureStorage } from "../utils/storage";
import { extractHLSForChrome } from "../utils/hlsExtractor";

// ─── Icons ────────────────────────────────────────────────────────────────────
const IcoClose  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcoDl     = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IcoFolder = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
const IcoSpin   = ({ size = 14 }) => <span style={{ display:"inline-block", width:size, height:size, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.15)", borderTopColor:"rgba(255,255,255,0.7)", animation:"dm-spin 0.7s linear infinite", flexShrink:0 }} />;

// ─── Quality definitions ───────────────────────────────────────────────────────
const Q_PRESETS = [
  { id:"2160", label:"4K",    height:2160, detail:"Ultra HD"      },
  { id:"1080", label:"1080p", height:1080, detail:"Full HD", recommended:true },
  { id:"720",  label:"720p",  height:720,  detail:"HD"            },
  { id:"480",  label:"480p",  height:480,  detail:"SD"            },
  { id:"best", label:"Auto",  height:0,    detail:"Best available" },
];

// ─── Parse HLS master playlist → quality variants ──────────────────────────────
async function fetchVariants(masterUrl) {
  try {
    const res = await fetch(masterUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.includes("#EXT-X-STREAM-INF")) return [];
    const lines = text.split("\n");
    const out   = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
      const next = lines[i + 1]?.trim();
      if (!next || next.startsWith("#")) continue;
      const h   = parseInt((line.match(/RESOLUTION=\d+x(\d+)/i) || [])[1] || "0");
      const bw  = parseInt((line.match(/BANDWIDTH=(\d+)/i)       || [])[1] || "0");
      const url = next.startsWith("http") ? next : new URL(next, masterUrl).href;
      out.push({ url, height: h, bw });
    }
    return out.sort((a, b) => b.height - a.height);
  } catch { return []; }
}

// ─── Pick the right variant URL for a quality preset ──────────────────────────
function pickVariantUrl(variants, qualityId, fallback) {
  if (!variants.length) return fallback;
  if (qualityId === "best") return variants[0].url;
  const h = parseInt(qualityId);
  return variants.reduce((best, v) =>
    Math.abs(v.height - h) < Math.abs(best.height - h) ? v : best, variants[0]).url;
}

// ─── In-browser HLS downloader (web only) ─────────────────────────────────────
// Saves directly to system Downloads folder via blob + <a download>.
// Appears in browser Downloads tab automatically — no page navigation.
async function runWebDownload({ masterUrl, variantUrl, name, qualityHeight, onProgress, onStatus, signal }) {
  onProgress(3); onStatus("Loading playlist…");

  // Resolve variant URL if needed
  let targetUrl = variantUrl || masterUrl;
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
        const h  = parseInt((line.match(/RESOLUTION=\d+x(\d+)/i) || [])[1] || "0");
        const bw = parseInt((line.match(/BANDWIDTH=(\d+)/i)       || [])[1] || "0");
        const u  = next.startsWith("http") ? next : new URL(next, masterUrl).href;
        variants.push({ url: u, height: h, bw });
      }
      variants.sort((a, b) => b.height - a.height);
      if (variants.length) {
        const pick = qualityHeight > 0
          ? variants.reduce((b, v) => Math.abs(v.height - qualityHeight) < Math.abs(b.height - qualityHeight) ? v : b, variants[0])
          : variants[0];
        targetUrl = pick.url;
      }
    }
  }

  onStatus("Parsing segments…"); onProgress(6);
  const vRes = await fetch(targetUrl, { signal });
  if (!vRes.ok) throw new Error(`Stream unreachable (${vRes.status})`);
  const vText = await vRes.text();

  const base = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
  const segs = vText.split("\n").map(l => l.trim())
    .filter(l => l && !l.startsWith("#"))
    .map(l => l.startsWith("http") ? l : base + l);

  if (!segs.length) throw new Error("No segments found in playlist.");

  onStatus(`Downloading ${segs.length} segments…`); onProgress(8);

  // Parallel batches of 8 with per-segment retry
  const buffers   = new Array(segs.length);
  let   completed = 0;

  const fetchSeg = async (url, attempt = 0) => {
    try {
      const r = await fetch(url, { signal, cache:"no-store" });
      if (r.ok) return r.arrayBuffer();
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (e.name === "AbortError") throw e;
      if (attempt < 2) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); return fetchSeg(url, attempt + 1); }
      throw e;
    }
  };

  for (let i = 0; i < segs.length; i += 8) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await Promise.all(segs.slice(i, i + 8).map(async (url, j) => {
      buffers[i + j] = await fetchSeg(url);
      completed++;
      onProgress(Math.round(8 + (completed / segs.length) * 85));
      onStatus(`${completed} / ${segs.length} segments`);
    }));
  }

  onStatus("Building file…"); onProgress(96);
  const total  = buffers.reduce((s, b) => s + b.byteLength, 0);
  const merged = new Uint8Array(total);
  let   offset = 0;
  for (const buf of buffers) { merged.set(new Uint8Array(buf), offset); offset += buf.byteLength; }

  // Save to system Downloads — NO new tab, NO redirect, NO page navigation
  onStatus("Saving to Downloads folder…"); onProgress(99);
  const blob    = new Blob([merged], { type: "video/MP2T" });
  const blobUrl = URL.createObjectURL(blob);
  const safe    = (name || "video").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "video";
  const a       = document.createElement("a");
  a.href        = blobUrl;
  a.download    = safe + ".ts";
  // Append hidden, click, remove — stays on current page, file appears in browser Downloads
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

  onProgress(100); onStatus("Saved to Downloads ✓");
}

// ─── Progress ring ─────────────────────────────────────────────────────────────
function Ring({ pct }) {
  const R = 28, circ = 2 * Math.PI * R;
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
// MAIN
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
  const [streamUrl,  setStreamUrl]  = useState(m3u8Url || null);
  const [variants,   setVariants]   = useState([]);
  const [resolving,  setResolving]  = useState(!m3u8Url);
  const [streamErr,  setStreamErr]  = useState(null);

  const [quality,      setQuality]      = useState("1080");
  const [downloadPath, setDownloadPath] = useState(() => storage.get("downloadPath") || "");

  // "ready" | "downloading" | "queued" | "done" | "error"
  const [phase,     setPhase]     = useState(m3u8Url ? "ready" : "resolving");
  const [pct,       setPct]       = useState(0);
  const [statusMsg, setStatusMsg] = useState("");
  const [dlErr,     setDlErr]     = useState(null);

  const cancelRef  = useRef(null);
  const m3uHandler = useRef(null);
  const m3uTimeout = useRef(null);

  // ── Load quality variants from master playlist ─────────────────────────────
  const loadVariants = useCallback(async (url) => {
    const found = await fetchVariants(url);
    setVariants(found);
    if (found.length) {
      const best = found.find(v => v.height <= 1080) || found[0];
      const match = Q_PRESETS.find(p => p.height > 0 && Math.abs(best.height - p.height) <= 80);
      if (match) setQuality(match.id);
    }
  }, []);

  // ── Stream resolution on open ──────────────────────────────────────────────
  useEffect(() => {
    // Case 1: stream already provided by parent (AD-free mode or Electron interception)
    if (m3u8Url) {
      setStreamUrl(m3u8Url);
      setResolving(false);
      setPhase("ready");
      loadVariants(m3u8Url);
      return;
    }

    // Case 2: Electron — listen for the NEXT m3u8 intercepted from the running webview
    if (isElectron && window.electron?.onM3u8Found) {
      setResolving(true);

      m3uTimeout.current = setTimeout(() => {
        // Clean up listener
        try { if (m3uHandler.current) window.electron.offM3u8Found(m3uHandler.current); } catch {}
        setResolving(false);
        setStreamErr(
          "Stream not detected yet. Make sure content is playing in the player, then click Download again."
        );
        setPhase("no-stream");
      }, 14000);

      m3uHandler.current = window.electron.onM3u8Found((url) => {
        clearTimeout(m3uTimeout.current);
        try { window.electron.offM3u8Found(m3uHandler.current); } catch {}
        setStreamUrl(url);
        setResolving(false);
        setPhase("ready");
        loadVariants(url);
      });

      return () => {
        clearTimeout(m3uTimeout.current);
        try { if (m3uHandler.current) window.electron.offM3u8Found(m3uHandler.current); } catch {}
      };
    }

    // Case 3: Web — try Service Worker + hidden iframe extraction (Chrome)
    if (!isElectron) {
      const type = mediaType === "tv" ? "tv" : "movie";
      setResolving(true);

      extractHLSForChrome(tmdbId || mediaId, type, season, episode)
        .then(result => {
          if (result?.url) {
            setStreamUrl(result.url);
            setResolving(false);
            setPhase("ready");
            loadVariants(result.url);
          } else {
            setResolving(false);
            setStreamErr(
              'Enable "AD-free" mode in the player (top-right toggle), then click Download.'
            );
            setPhase("no-stream");
          }
        })
        .catch(() => {
          setResolving(false);
          setStreamErr(
            'Enable "AD-free" mode in the player (top-right toggle), then click Download.'
          );
          setPhase("no-stream");
        });
    }
  }, []); // eslint-disable-line

  // ── Web download ───────────────────────────────────────────────────────────
  const handleWebDownload = useCallback(async () => {
    if (!streamUrl) return;
    const ctrl = new AbortController();
    cancelRef.current = ctrl;
    setPhase("downloading"); setPct(0); setDlErr(null);

    const variantUrl = variants.length ? pickVariantUrl(variants, quality, streamUrl) : null;
    try {
      await runWebDownload({
        masterUrl:     streamUrl,
        variantUrl:    variantUrl !== streamUrl ? variantUrl : null,
        qualityHeight: parseInt(quality) || 0,
        name:          mediaName || "video",
        onProgress:    p => setPct(p),
        onStatus:      s => setStatusMsg(s),
        signal:        ctrl.signal,
      });
      setPhase("done");
    } catch (e) {
      if (e.name === "AbortError") { setPhase("ready"); return; }
      setDlErr(e.message || "Download failed"); setPhase("error");
    }
  }, [streamUrl, variants, quality, mediaName]);

  // ── Electron download ──────────────────────────────────────────────────────
  const handleElectronDownload = useCallback(async () => {
    if (!downloadPath || !streamUrl) return;
    setPhase("queued"); setStatusMsg("Starting…");

    const binaryInfo = downloaderFolder
      ? await window.electron.checkDownloader(downloaderFolder).catch(() => null)
      : null;

    const result = await window.electron.runDownload({
      binaryPath:  binaryInfo?.binaryPath || "",
      m3u8Url:     streamUrl,
      subtitles:   subtitles || [],
      name:        mediaName || "video",
      downloadPath,
      mediaId, mediaType, season, episode,
      posterPath:  posterPath || null,
      tmdbId:      tmdbId || mediaId || null,
      quality,
    });

    if (result.ok) {
      onDownloadStarted?.({
        id: result.id, name: mediaName || "video",
        m3u8Url: streamUrl, downloadPath,
        filePath: null, status:"downloading", progress:0,
        speed:"", size:"", totalFragments:0, lastMessage:"Starting…",
        startedAt: Date.now(), completedAt: null,
        mediaId, mediaType, season, episode,
        posterPath: posterPath || null,
        tmdbId: tmdbId || mediaId || null,
        subtitles: subtitles || [], subtitlePaths: [],
      });
      setPhase("done");
    } else {
      setDlErr(result.error || "Download failed"); setPhase("error");
    }
  }, [streamUrl, downloadPath, downloaderFolder, mediaName, subtitles, mediaId, mediaType, season, episode, posterPath, tmdbId, quality, onDownloadStarted]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const canGo      = !!streamUrl && (isElectron ? !!downloadPath : true);
  const needFolder = isElectron && !downloadPath;

  const displayQualities = variants.length
    ? variants.map(v => {
        const p = Q_PRESETS.find(q => q.height > 0 && Math.abs(v.height - q.height) <= 80);
        return p ? { ...p, variantUrl: v.url } : { id: `${v.height}`, label:`${v.height}p`, height:v.height, detail:"" };
      }).filter((v, i, a) => a.findIndex(x => x.id === v.id) === i)
    : Q_PRESETS.filter(p => p.id !== "2160");

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:9900, background:"rgba(0,0,0,0.72)", backdropFilter:"blur(6px)", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
      onClick={onClose}
    >
      <style>{`
        @keyframes dm-spin { to { transform:rotate(360deg); } }
        .dm-q { display:flex; align-items:center; gap:6px; padding:9px 12px; border-radius:8px; cursor:pointer; border:1.5px solid rgba(255,255,255,0.06); background:rgba(255,255,255,0.02); transition:all 0.13s; }
        .dm-q.on  { border-color:var(--red,#e50914); background:rgba(229,9,20,0.07); }
        .dm-q:not(.on):hover { border-color:rgba(255,255,255,0.16); background:rgba(255,255,255,0.04); }
      `}</style>

      <div
        style={{ width:"100%", maxWidth:430, background:"var(--surface,#0f1318)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, boxShadow:"0 28px 64px rgba(0,0,0,0.85)", overflow:"hidden" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 15px 10px", borderBottom:"1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ fontSize:13, fontWeight:700, color:"#fff", display:"flex", alignItems:"center", gap:7 }}>
            <IcoDl /> Download{mediaName ? ` · ${mediaName.length > 30 ? mediaName.slice(0,30)+"…" : mediaName}` : ""}
          </span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", display:"flex", padding:3, borderRadius:5 }}
            onMouseEnter={e=>e.currentTarget.style.color="#fff"}
            onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.4)"}>
            <IcoClose/>
          </button>
        </div>

        {/* ── Downloading (web) ── */}
        {phase === "downloading" && (
          <div style={{ padding:"30px 20px", textAlign:"center" }}>
            <div style={{ position:"relative", width:76, height:76, margin:"0 auto 14px" }}>
              <Ring pct={pct}/>
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff" }}>{pct}%</div>
            </div>
            <div style={{ fontSize:13, fontWeight:600, color:"#fff", marginBottom:4 }}>{statusMsg || "Downloading…"}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginBottom:18 }}>Keep this tab open · file saves to your Downloads folder</div>
            <div style={{ height:3, background:"rgba(255,255,255,0.06)", borderRadius:2, overflow:"hidden", marginBottom:16 }}>
              <div style={{ height:"100%", background:"var(--red,#e50914)", width:`${pct}%`, borderRadius:2, transition:"width 0.3s ease" }}/>
            </div>
            <button onClick={() => cancelRef.current?.abort()}
              style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"rgba(255,255,255,0.45)", fontSize:12, padding:"6px 16px", cursor:"pointer", fontFamily:"inherit" }}>
              Cancel
            </button>
          </div>
        )}

        {/* ── Queued / Done ── */}
        {(phase === "queued" || phase === "done") && (
          <div style={{ padding:"30px 20px", textAlign:"center" }}>
            <div style={{ width:50, height:50, borderRadius:"50%", background:"rgba(76,175,80,0.1)", border:"1.5px solid rgba(76,175,80,0.28)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 13px" }}>
              {phase === "queued"
                ? <IcoSpin size={20}/>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
            <div style={{ fontSize:14, fontWeight:700, color: phase==="queued" ? "#fff" : "#4caf50", marginBottom:5 }}>
              {phase === "queued" ? "Download started" : "Download complete"}
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.38)", marginBottom:20 }}>
              {phase === "queued" ? "Track progress in the Downloads tab" : "File saved to your Downloads folder"}
            </div>
            <button onClick={onClose}
              style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, color:"rgba(255,255,255,0.65)", fontSize:13, padding:"8px 24px", cursor:"pointer", fontFamily:"inherit" }}>
              Close
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {phase === "error" && (
          <div style={{ padding:"28px 20px", textAlign:"center" }}>
            <div style={{ fontSize:13, fontWeight:600, color:"var(--red,#e50914)", marginBottom:6 }}>Download failed</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.45)", lineHeight:1.7, marginBottom:18 }}>{dlErr}</div>
            <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
              <button onClick={() => { setPhase("ready"); setDlErr(null); }}
                style={{ background:"var(--red,#e50914)", border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, padding:"8px 20px", cursor:"pointer", fontFamily:"inherit" }}>Retry</button>
              <button onClick={onClose}
                style={{ background:"none", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"rgba(255,255,255,0.45)", fontSize:12, padding:"8px 14px", cursor:"pointer", fontFamily:"inherit" }}>Close</button>
            </div>
          </div>
        )}

        {/* ── Setup / Ready / Resolving / No-stream ── */}
        {(phase === "ready" || phase === "resolving" || phase === "no-stream") && (
          <div style={{ padding:"13px 15px 17px" }}>

            {/* Stream status */}
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 11px", borderRadius:8, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.05)", marginBottom:14, fontSize:12 }}>
              {resolving ? (
                <><IcoSpin size={12}/><span style={{ color:"rgba(255,255,255,0.5)" }}>
                  {isElectron ? "Waiting for stream interception…" : "Detecting stream…"}
                </span></>
              ) : streamUrl ? (
                <><span style={{ color:"#4caf50", fontSize:15, lineHeight:1 }}>●</span>
                  <span style={{ color:"rgba(255,255,255,0.7)" }}>
                    Stream ready{variants.length ? ` · ${variants[0].height}p–${variants[variants.length-1].height}p` : ""}
                  </span></>
              ) : (
                <><span style={{ color:"var(--red,#e50914)", fontSize:15, lineHeight:1 }}>●</span>
                  <span style={{ color:"rgba(255,255,255,0.5)", flex:1, lineHeight:1.5 }}>{streamErr || "No stream found"}</span></>
              )}
            </div>

            {/* Quality pills */}
            {streamUrl && (
              <>
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.3)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>Quality</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
                  {displayQualities.map(q => (
                    <div key={q.id} className={`dm-q${quality===q.id?" on":""}`} onClick={() => setQuality(q.id)}>
                      <div style={{ width:12, height:12, borderRadius:"50%", flexShrink:0, border:`2px solid ${quality===q.id?"var(--red,#e50914)":"rgba(255,255,255,0.2)"}`, background:quality===q.id?"var(--red,#e50914)":"transparent", display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.12s" }}>
                        {quality===q.id && <div style={{ width:4,height:4,borderRadius:"50%",background:"#fff" }}/>}
                      </div>
                      <span style={{ fontSize:12, fontWeight:700, color:quality===q.id?"#fff":"rgba(255,255,255,0.6)" }}>{q.label}</span>
                      {q.recommended && <span style={{ fontSize:9, fontWeight:700, color:"#63cab7", background:"rgba(99,202,183,0.1)", border:"1px solid rgba(99,202,183,0.2)", borderRadius:3, padding:"1px 5px" }}>REC</span>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Electron: folder */}
            {isElectron && (
              <div style={{ marginBottom:13 }}>
                <div style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.3)", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:7 }}>Save to</div>
                <div style={{ display:"flex", gap:7 }}>
                  <div style={{ flex:1, display:"flex", alignItems:"center", gap:7, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, padding:"7px 10px", fontSize:12, color:"rgba(255,255,255,0.45)", overflow:"hidden" }}>
                    <IcoFolder/>
                    <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{downloadPath || "No folder selected"}</span>
                  </div>
                  <button
                    onClick={async () => { const f = await window.electron.pickFolder(); if (f) { setDownloadPath(f); storage.set("downloadPath", f); } }}
                    style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"rgba(255,255,255,0.65)", fontSize:11, fontWeight:600, padding:"7px 12px", cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}
                    onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}
                  >Browse</button>
                </div>
              </div>
            )}

            {/* Download button */}
            <button
              onClick={isElectron ? handleElectronDownload : handleWebDownload}
              disabled={!canGo || resolving}
              style={{
                width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                background: (canGo && !resolving) ? "var(--red,#e50914)" : "rgba(255,255,255,0.04)",
                border:"none", borderRadius:9, color:"#fff", fontSize:14, fontWeight:700,
                padding:"12px", fontFamily:"inherit", transition:"opacity 0.15s",
                cursor: (canGo && !resolving) ? "pointer" : "not-allowed",
                opacity: (canGo && !resolving) ? 1 : 0.4,
              }}
              onMouseEnter={e => { if (canGo && !resolving) e.currentTarget.style.opacity="0.88"; }}
              onMouseLeave={e => { if (canGo && !resolving) e.currentTarget.style.opacity="1"; }}
            >
              {resolving ? <><IcoSpin size={15}/>&nbsp;{isElectron ? "Waiting for stream…" : "Detecting stream…"}</>
                : !streamUrl   ? "No stream available"
                : needFolder   ? "Select a download folder first"
                : <><IcoDl/> Download {Q_PRESETS.find(p=>p.id===quality)?.label || quality}</>}
            </button>

            {!isElectron && streamUrl && (
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.22)", textAlign:"center", marginTop:8 }}>
                Saves directly to your Downloads folder · appears in browser Downloads tab
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}