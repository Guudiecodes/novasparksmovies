import { useEffect, useRef, useState, useCallback } from "react";
import { CloseIcon, ExternalLinkIcon } from "./Icons";
import { storage } from "../utils/storage";

export const DEFAULT_INVIDIOUS_BASE = "https://inv.nadeko.net";

const FALLBACK_INSTANCES = [
  "https://invidious.privacyredirect.com",
  "https://inv.tux.pizza",
  "https://yt.cdaut.de",
  "https://invidious.lunar.icu",
  "https://invidious.protokolla.fi",
  "https://invidious.nerdvpn.de",
  "https://iv.melmac.space",
  "https://invidious.perennialte.ch",
];

export function getInvidiousBase() {
  return (storage.get("invidiousBase") || DEFAULT_INVIDIOUS_BASE).replace(/\/$/, "");
}

// ── Electron-only scripts (never run in browser) ──────────────────────────────
const DETECT_BOT_JS = `
(function() {
  var title = (document.title || '').toLowerCase()
  var body  = (document.body  && document.body.innerText || '').toLowerCase()
  var botKeywords = ['verifying', 'antibot', 'challenge', 'ddos', 'please wait', 'checking your browser', 'just a moment']
  var isBot = botKeywords.some(function(k) { return title.includes(k) || body.includes(k) })
  isBot
})()
`;

const SETUP_JS = `
(function() {
  if (window.__trailerSetup) return
  window.__trailerSetup = true
  var style = document.createElement('style')
  style.textContent = '.player-container .invidious-link, a[href*="/watch"], .vjs-invidious-button { display: none !important; }'
  document.head.appendChild(style)
  var attachEnded = function() {
    var video = document.querySelector('video')
    if (!video) return false
    video.addEventListener('ended', function() { window.__trailerEnded = true })
    return true
  }
  if (!attachEnded()) {
    var obs = new MutationObserver(function() { if (attachEnded()) obs.disconnect() })
    obs.observe(document.body, { childList: true, subtree: true })
  }
})()
`;

const TIMEOUT_MS = 8000; // try next instance after 8s with no load on web

// ── Web iframe player ─────────────────────────────────────────────────────────
// iframes are cross-origin so we can't run JS inside them.
// Strategy: onLoad = success → show player. Timeout = failure → try next.
function WebTrailerPlayer({ trailerKey, onStatusChange }) {
  const iframeRef      = useRef(null);
  const timeoutRef     = useRef(null);
  const instanceIndex  = useRef(-1);
  const [src, setSrc]  = useState(null);

  const tryNext = useCallback(() => {
    const preferred = getInvidiousBase();
    const list = [preferred, ...FALLBACK_INSTANCES.filter(i => i !== preferred)];
    instanceIndex.current += 1;
    const idx = instanceIndex.current;

    if (idx >= list.length) {
      onStatusChange({ loading: false, failed: true, msg: "All instances failed. Try setting a custom Invidious instance in Settings." });
      return;
    }

    const label = list[idx].replace(/^https?:\/\//, "");
    onStatusChange({ loading: true, failed: false, msg: idx === 0 ? "Loading trailer…" : `Trying ${label}…` });

    // Clear previous timeout
    clearTimeout(timeoutRef.current);

    // Set timeout — if iframe hasn't loaded after TIMEOUT_MS, try next
    timeoutRef.current = setTimeout(tryNext, TIMEOUT_MS);

    setSrc(`${list[idx]}/embed/${trailerKey}?autoplay=1&listen=0`);
  }, [trailerKey, onStatusChange]);

  useEffect(() => {
    instanceIndex.current = -1;
    tryNext();
    return () => clearTimeout(timeoutRef.current);
  }, [tryNext]);

  const handleLoad = () => {
    // iframe fired onLoad — assume it's playing
    clearTimeout(timeoutRef.current);
    onStatusChange({ loading: false, failed: false, msg: null });
  };

  const handleError = () => {
    clearTimeout(timeoutRef.current);
    tryNext();
  };

  if (!src) return null;

  return (
    <iframe
      ref={iframeRef}
      src={src}
      onLoad={handleLoad}
      onError={handleError}
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowFullScreen
      referrerPolicy="no-referrer"
      style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%",
        border: "none",
      }}
    />
  );
}

// ── Electron webview player (untouched) ───────────────────────────────────────
function ElectronTrailerPlayer({ trailerKey, onStatusChange, onClose }) {
  const webviewRef    = useRef(null);
  const [src, setSrc] = useState(null);
  const instanceIndex = useRef(-1);

  const tryNext = useCallback(() => {
    const preferred = getInvidiousBase();
    const list = [preferred, ...FALLBACK_INSTANCES.filter(i => i !== preferred)];
    instanceIndex.current += 1;
    const idx = instanceIndex.current;

    if (idx >= list.length) {
      onStatusChange({ loading: false, failed: true, msg: "All Invidious instances failed. Try setting a custom instance in Settings." });
      return;
    }

    const label = list[idx].replace(/^https?:\/\//, "");
    onStatusChange({ loading: true, failed: false, msg: idx === 0 ? "Loading trailer…" : `Trying ${label}…` });
    setSrc(`${list[idx]}/embed/${trailerKey}?autoplay=1&listen=0`);
  }, [trailerKey, onStatusChange]);

  useEffect(() => {
    instanceIndex.current = -1;
    tryNext();
  }, [tryNext]);

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv || !src) return;

    const onLoad = () => {
      wv.executeJavaScript(DETECT_BOT_JS)
        .then(isBot => {
          if (isBot) {
            tryNext();
          } else {
            wv.executeJavaScript(SETUP_JS).catch(() => {});
            onStatusChange({ loading: false, failed: false, msg: null });
          }
        })
        .catch(() => tryNext());
    };

    const onFailLoad = () => tryNext();

    const onWillNavigate = e => {
      const instanceBase = src.split("/embed/")[0];
      if (!e.url.startsWith(instanceBase)) {
        e.preventDefault();
        window.electron?.openExternal(e.url);
      }
    };

    const endedPoll = setInterval(() => {
      wv.executeJavaScript("!!window.__trailerEnded")
        .then(ended => { if (ended) { clearInterval(endedPoll); setTimeout(onClose, 1200); } })
        .catch(() => {});
    }, 800);

    wv.addEventListener("did-finish-load", onLoad);
    wv.addEventListener("did-fail-load", onFailLoad);
    wv.addEventListener("will-navigate", onWillNavigate);
    return () => {
      clearInterval(endedPoll);
      wv.removeEventListener("did-finish-load", onLoad);
      wv.removeEventListener("did-fail-load", onFailLoad);
      wv.removeEventListener("will-navigate", onWillNavigate);
    };
  }, [src, tryNext, onClose, onStatusChange]);

  if (!src) return null;

  return (
    <webview
      ref={webviewRef}
      src={src}
      partition="persist:trailer"
      allowpopups="false"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function TrailerModal({ trailerKey, title, onClose }) {
  const isElectron = !!window.electron;
  const [status, setStatus] = useState({ loading: true, failed: false, msg: "Loading trailer…" });

  const handleStatus = useCallback(s => setStatus(s), []);

  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const openInBrowser = () => {
    const url = `${getInvidiousBase()}/watch?v=${trailerKey}`;
    if (isElectron) window.electron.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="trailer-overlay" onClick={onClose}>
      <div className="trailer-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="trailer-modal-header">
          <span className="trailer-modal-title">🎬 {title} — Official Trailer</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={openInBrowser}
              title="Open in browser"
              style={{
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6, color: "rgba(255,255,255,0.75)", cursor: "pointer",
                fontSize: 12, padding: "4px 10px", display: "flex", alignItems: "center",
                gap: 5, whiteSpace: "nowrap",
              }}
            >
              <ExternalLinkIcon size={13} />
              Open in Browser
            </button>
            <button className="trailer-close-btn" onClick={onClose} title="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Player area */}
        <div className="trailer-embed-wrap" style={{ background: "#000", position: "relative" }}>

          {/* Status overlay — shown while loading or failed */}
          {(status.loading || status.failed) && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 2,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              background: "#000",
              color: status.failed ? "#ff3860" : "rgba(255,255,255,0.6)",
              fontSize: 14, textAlign: "center", padding: "0 32px", gap: 10,
            }}>
              {status.failed ? (
                <>
                  <span style={{ fontSize: 28 }}>⚠</span>
                  <span>{status.msg}</span>
                  <button
                    onClick={openInBrowser}
                    style={{
                      marginTop: 8, padding: "8px 20px", borderRadius: 8,
                      background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                      color: "#fff", cursor: "pointer", fontSize: 13,
                    }}
                  >
                    Watch on Invidious ↗
                  </button>
                </>
              ) : (
                <>
                  <span style={{ opacity: 0.5, fontSize: 22 }}>⏳</span>
                  <span>{status.msg}</span>
                </>
              )}
            </div>
          )}

          {/* Player — iframe on web, webview on Electron */}
          {isElectron ? (
            <ElectronTrailerPlayer
              trailerKey={trailerKey}
              onStatusChange={handleStatus}
              onClose={onClose}
            />
          ) : (
            <WebTrailerPlayer
              trailerKey={trailerKey}
              onStatusChange={handleStatus}
            />
          )}
        </div>

      </div>
    </div>
  );
}