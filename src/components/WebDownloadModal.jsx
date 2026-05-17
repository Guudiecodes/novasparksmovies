import { useState, useEffect, useCallback, useRef } from "react";
import { storage, isElectron, STORAGE_KEYS } from "../utils/storage";
import { secureStorage } from "../utils/storage";
import { DownloadIcon, SubtitlesIcon } from "../components/Icons";

// Icons inline to avoid import issues
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
);

// ── Web Download Component ─────────────────────────────────────────────────
function WebDownload({ m3u8Url, mediaName, onClose }) {
  const [phase, setPhase]       = useState("idle"); // idle | loading | downloading | done | error
  const [progress, setProgress] = useState(0);
  const [status, setStatus]     = useState("");
  const [error, setError]       = useState(null);
  const cancelRef = useRef(false);

  const handleDownload = useCallback(async () => {
    if (!m3u8Url) return;
    cancelRef.current = false;
    setPhase("loading");
    setError(null);
    setProgress(0);

    try {
      const { downloadWithFFmpeg } = await import("../utils/webDownloader.js");
      setPhase("downloading");
      await downloadWithFFmpeg({
        m3u8Url,
        name: mediaName || "video",
        onProgress: (p) => { if (!cancelRef.current) setProgress(p); },
        onStatus:   (s) => { if (!cancelRef.current) setStatus(s); },
      });
      if (!cancelRef.current) setPhase("done");
    } catch (err) {
      if (!cancelRef.current) { setError(err.message); setPhase("error"); }
    }
  }, [m3u8Url, mediaName]);

  if (!m3u8Url) {
    return (
      <div style={{ padding: "32px 24px", textAlign: "center" }}>
        <div className="spinner" style={{ margin: "0 auto 16px", width: 28, height: 28, borderWidth: 2 }} />
        <div style={{ fontSize: 14, color: "var(--text2)" }}>Play the video first, then click Download</div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>Waiting for stream to initialize…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {phase === "idle" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, padding: 14, background: "rgba(0,168,225,0.06)", border: "1px solid rgba(0,168,225,0.2)", borderRadius: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(0,168,225,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <DownloadIcon />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 3 }}>Browser Download</div>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>Downloads directly to your device — no software needed</div>
            </div>
          </div>

          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16, padding: "10px 14px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border)" }}>
            <strong style={{ color: "var(--text)" }}>{mediaName}</strong>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, wordBreak: "break-all" }}>{m3u8Url.slice(0, 60)}…</div>
          </div>

          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20, lineHeight: 1.6 }}>
            ⚡ Uses your browser's built-in processing. Large files may take a few minutes. Keep this tab open.
          </div>

          <button className="btn btn-primary" onClick={handleDownload} style={{ width: "100%", justifyContent: "center", padding: "13px" }}>
            <DownloadIcon /> Download to Device
          </button>
        </>
      )}

      {(phase === "loading" || phase === "downloading") && (
        <div style={{ textAlign: "center" }}>
          <div style={{ position: "relative", width: 80, height: 80, margin: "0 auto 20px" }}>
            <svg viewBox="0 0 80 80" style={{ width: 80, height: 80, transform: "rotate(-90deg)" }}>
              <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle cx="40" cy="40" r="34" fill="none" stroke="var(--red)" strokeWidth="6"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - progress / 100)}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.3s ease" }}
              />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
              {progress}%
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>{status || "Processing…"}</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>Keep this tab open</div>
          <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "var(--red)", borderRadius: 2, width: `${progress}%`, transition: "width 0.3s ease" }} />
          </div>
        </div>
      )}

      {phase === "done" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(76,175,80,0.12)", border: "2px solid rgba(76,175,80,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#4caf50", marginBottom: 8 }}>Download Complete!</div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 24 }}>Your file has been saved to your Downloads folder.</div>
          <button className="btn btn-ghost" onClick={onClose} style={{ margin: "0 auto" }}>Close</button>
        </div>
      )}

      {phase === "error" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--red)", marginBottom: 8 }}>Download Failed</div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 20, lineHeight: 1.6 }}>{error}</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => { setPhase("idle"); setError(null); }}>Try Again</button>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main DownloadModal ─────────────────────────────────────────────────────
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
  // ── Web mode — use browser download ──────────────────────────────────────
  if (!isElectron) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="download-modal" onClick={(e) => e.stopPropagation()}>
          <div className="download-modal-header">
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <DownloadIcon /> Download
            </span>
            <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
          </div>
          <WebDownload m3u8Url={m3u8Url} mediaName={mediaName} onClose={onClose} />
        </div>
      </div>
    );
  }

  // ── Desktop (Electron) mode — existing binary flow ────────────────────────
  return <ElectronDownloadModal
    onClose={onClose} m3u8Url={m3u8Url} subtitles={subtitles}
    mediaName={mediaName} downloaderFolder={downloaderFolder}
    setDownloaderFolder={setDownloaderFolder} onOpenSettings={onOpenSettings}
    onDownloadStarted={onDownloadStarted} mediaId={mediaId} mediaType={mediaType}
    season={season} episode={episode} posterPath={posterPath} tmdbId={tmdbId}
  />;
}

// ── Electron Download Modal (original flow, unchanged) ────────────────────
function ElectronDownloadModal({
  onClose, m3u8Url, subtitles = [], mediaName, downloaderFolder,
  setDownloaderFolder, onOpenSettings, onDownloadStarted,
  mediaId, mediaType, season, episode, posterPath, tmdbId,
}) {
  const [downloadPath, setDownloadPath] = useState(() => storage.get("downloadPath") || "");
  const [settingPath, setSettingPath]   = useState(false);
  const [downloader, setDownloader]     = useState(null);
  const [checking, setChecking]         = useState(false);
  const [downloadStatus, setDownloadStatus] = useState(null);
  const [subdlApiKey, setSubdlApiKey]   = useState("");
  const [wyzieApiKey, setWyzieApiKey]   = useState(null);
  const [subEnabled, setSubEnabled]     = useState(() => storage.get(STORAGE_KEYS.SUBTITLE_ENABLED) !== 0 && storage.get(STORAGE_KEYS.SUBTITLE_ENABLED) !== "0");
  const [subResults, setSubResults]     = useState(null);
  const [subSearching, setSubSearching] = useState(false);
  const [subSearchError, setSubSearchError] = useState(null);
  const [selectedSubs, setSelectedSubs] = useState([]);
  const defaultLang = storage.get(STORAGE_KEYS.SUBTITLE_LANG) || "en";

  const ua = navigator.userAgent.toLowerCase();
  const binaryHint = ua.includes("win") ? "Windows_x64-portable" : ua.includes("mac") ? "For MacOS you will have to compile it yourself" : "Linux_x64-portable";
  const releaseUrl = "https://github.com/truelockmc/vid-dl-cli-only/releases/latest";

  useEffect(() => {
    let mounted = true;
    Promise.all([
      secureStorage.get(STORAGE_KEYS.SUBDL_API_KEY),
      secureStorage.get(STORAGE_KEYS.WYZIE_API_KEY),
    ]).then(([subdl, wyzie]) => {
      if (!mounted) return;
      if (subdl) setSubdlApiKey(subdl);
      setWyzieApiKey(wyzie || "");
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!downloaderFolder) return;
    let mounted = true;
    setChecking(true);
    window.electron.checkDownloader(downloaderFolder).then((result) => {
      if (!mounted) return;
      setDownloader(result);
      setChecking(false);
    });
    return () => { mounted = false; };
  }, [downloaderFolder]);

  const searchSubtitles = useCallback(async (lang) => {
    if (!tmdbId) return;
    setSubSearching(true); setSubSearchError(null); setSubResults(null); setSelectedSubs([]);
    try {
      const res = await window.electron.searchSubtitles({ tmdbId, mediaType, season, episode, languages: lang, subdlApiKey, wyzieApiKey: wyzieApiKey || "" });
      if (!res.ok) { setSubSearchError(res.error || "Search failed"); setSubResults([]); return; }
      setSubResults(res.results);
      if (res.results.length > 0) setSelectedSubs([res.results[0]]);
    } catch (e) { setSubSearchError(e.message); setSubResults([]); }
    finally { setSubSearching(false); }
  }, [tmdbId, mediaType, season, episode, subdlApiKey, wyzieApiKey]);

  useEffect(() => {
    if (!m3u8Url || !subEnabled || !tmdbId || wyzieApiKey === null) return;
    if (!wyzieApiKey && !subdlApiKey) return;
    searchSubtitles(defaultLang);
  }, [m3u8Url, subEnabled, wyzieApiKey]);

  const pickBinaryFolder   = async () => { const f = await window.electron.pickFolder(); if (f) setDownloaderFolder(f); };
  const pickDownloadFolder = async () => { const f = await window.electron.pickFolder(); if (f) { setDownloadPath(f); storage.set("downloadPath", f); setSettingPath(false); } };

  const handleDownload = async () => {
    if (!downloader?.binaryPath || !downloadPath || !m3u8Url) return;
    setDownloadStatus("starting");
    let resolvedSubs = [...subtitles];
    if (subEnabled && selectedSubs.length > 0) {
      for (const sub of selectedSubs) {
        try {
          let url = sub.direct_url || null;
          let resolvedFileName = null;
          if (!url && sub.file_id) {
            const urlRes = await window.electron.getSubtitleUrl({ fileId: sub.file_id });
            if (urlRes.ok) { url = urlRes.url; resolvedFileName = urlRes.file_name || null; }
          }
          if (url) resolvedSubs.push({ url, lang: sub.language, name: resolvedFileName || sub.release || sub.file_name, file_id: sub.file_id || null });
        } catch {}
      }
    }
    const result = await window.electron.runDownload({ binaryPath: downloader.binaryPath, m3u8Url, subtitles: resolvedSubs, name: mediaName, downloadPath, mediaId, mediaType, season, episode, posterPath: posterPath || null, tmdbId: tmdbId || mediaId || null });
    if (result.ok) {
      onDownloadStarted?.({ id: result.id, name: mediaName, m3u8Url, downloadPath, filePath: null, status: "downloading", progress: 0, speed: "", size: "", totalFragments: 0, lastMessage: "Starting…", startedAt: Date.now(), completedAt: null, mediaId, mediaType, season, episode, posterPath: posterPath || null, tmdbId: tmdbId || mediaId || null, subtitles: resolvedSubs, subtitlePaths: [] });
      setDownloadStatus("ok");
    } else {
      setDownloadStatus(result.error || "Failed to start");
    }
  };

  if (!downloadPath || settingPath) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="download-modal" onClick={(e) => e.stopPropagation()}>
          <div className="download-modal-header">
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}><DownloadIcon /> Set Download Folder</span>
            <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
          </div>
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 20, lineHeight: 1.6 }}>
              {settingPath ? "Choose where downloaded videos should be saved:" : <><span style={{ color: "var(--red)", fontWeight: 600 }}>No download folder set.</span><br />Choose where to save downloaded videos:</>}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
              <input className="apikey-input" style={{ flex: 1, minWidth: 200, marginBottom: 0 }} placeholder="/home/you/Movies" value={downloadPath} onChange={(e) => setDownloadPath(e.target.value)} />
              <button className="btn btn-secondary" onClick={pickDownloadFolder}>Browse…</button>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} disabled={!downloadPath.trim()} onClick={() => { storage.set("downloadPath", downloadPath.trim()); setSettingPath(false); }}>Confirm</button>
              {settingPath && <button className="btn btn-ghost" onClick={() => setSettingPath(false)}>Cancel</button>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="download-modal" onClick={(e) => e.stopPropagation()}>
        <div className="download-modal-header">
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}><DownloadIcon /> Download</span>
          <button className="icon-btn" onClick={onClose}><CloseIcon /></button>
        </div>

        {!m3u8Url && (
          <div className="download-waiting">
            <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
            Waiting for stream URL… (start the video first)
          </div>
        )}

        {m3u8Url && (
          <>
            <div className="download-url-block">
              <div className="download-url-label">Stream URL found</div>
              <code className="download-url-code">{m3u8Url}</code>
            </div>

            {!downloader?.exists && (
              <div className="download-instructions">
                <div className="download-instructions-title">Set up Video Downloader</div>
                <ol className="download-steps">
                  <li>Download from <a className="download-link" href="#" onClick={(e) => { e.preventDefault(); window.electron.openExternal(releaseUrl); }}>github.com/truelockmc/vid-dl-cli-only/releases/latest</a> for: <code>{binaryHint}</code></li>
                  <li>Extract into a folder of your choice</li>
                  <li>Select that folder below — it must contain <code>_internal</code> and the binary</li>
                </ol>
                <div className="download-folder-row">
                  <button className="btn btn-secondary" onClick={pickBinaryFolder}>Choose folder…</button>
                  {downloaderFolder && <span className="download-folder-path">{downloaderFolder}</span>}
                </div>
                {checking && <div className="download-checking"><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Checking…</div>}
                {!checking && downloader && !downloader.exists && downloaderFolder && <div className="download-error">No binary found. Make sure <code>_internal</code> and the binary are inside the chosen folder.</div>}
              </div>
            )}

            {downloader?.exists && (
              <div className="download-ready">
                <div className="download-found-badge">✓ Video Downloader found</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>Wrong folder?</span>
                  <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={pickBinaryFolder}>Change</button>
                </div>
                {downloadStatus !== "ok" && (
                  <button className="btn btn-primary" onClick={handleDownload} disabled={downloadStatus === "starting"} style={{ width: "100%", justifyContent: "center" }}>
                    <DownloadIcon /> {downloadStatus === "starting" ? "Starting…" : "Start Download"}
                  </button>
                )}
                {downloadStatus === "ok" && (
                  <div style={{ textAlign: "center", padding: "12px 0" }}>
                    <div className="download-success" style={{ fontSize: 15, marginBottom: 8 }}>✓ Download started!</div>
                    <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={onClose}>Close — track progress in Downloads</button>
                  </div>
                )}
                {downloadStatus && downloadStatus !== "ok" && downloadStatus !== "starting" && <div className="download-error">{downloadStatus}</div>}
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>Save to: <code>{downloadPath}</code></span>
                  <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setSettingPath(true)}>Change</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}