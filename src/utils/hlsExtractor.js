/**
 * hlsExtractor.js — NovaStream Smart Stream Extractor
 *
 * Strategy: Service Worker intercepts hidden iframe network calls.
 * Works on ANY server. No proxy. No blocked IPs.
 * Electron: returns null immediately — uses webview instead.
 * Brave/Firefox: returns null — they have built-in shields, use iframe+shield.
 * Chrome only: runs SW + hidden iframe extraction.
 */

const CACHE     = new Map();
const CACHE_TTL = 10 * 60 * 1000;
const SW_PATH   = "/nova-sw.js";
const TIMEOUT   = 15000;

// Chrome-only providers ordered by reliability
// Only browserSafe sources — no redirects in Chrome iframes
const PROVIDERS = [
  (type, id, s, e) => type === "movie"
    ? `https://embed.su/embed/movie/${id}`
    : `https://embed.su/embed/tv/${id}/${s}/${e}`,

  (type, id, s, e) => type === "movie"
    ? `https://moviesapi.club/movie/${id}`
    : `https://moviesapi.club/tv/${id}-${s}-${e}`,

  (type, id, s, e) => type === "movie"
    ? `https://vidfast.pro/movie/${id}?autoPlay=true`
    : `https://vidfast.pro/tv/${id}/${s}/${e}?autoPlay=true`,

  (type, id, s, e) => type === "movie"
    ? `https://player.smashy.stream/movie/${id}`
    : `https://player.smashy.stream/tv/${id}?s=${s}&e=${e}`,

  (type, id, s, e) => type === "movie"
    ? `https://player.videasy.net/movie/${id}`
    : `https://player.videasy.net/tv/${id}/${s}/${e}`,
];

// ── Service Worker registration ───────────────────────────────────────────
let _swReady = null;
async function ensureSW() {
  if (!("serviceWorker" in navigator)) return false;
  if (_swReady !== null) return _swReady;

  try {
    const reg = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
    if (reg.active) { _swReady = true; return true; }

    await new Promise((resolve) => {
      const sw = reg.installing || reg.waiting;
      if (!sw) { resolve(); return; }
      sw.addEventListener("statechange", () => {
        if (sw.state === "activated") resolve();
      });
      setTimeout(resolve, 3000); // don't wait forever
    });

    _swReady = true;
    return true;
  } catch {
    _swReady = false;
    return false;
  }
}

// ── Hidden iframe capture ─────────────────────────────────────────────────
function captureFromIframe(embedUrl) {
  return new Promise((resolve) => {
    let done = false;
    let iframe = null;
    let handler = null;
    let timer = null;

    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (handler) {
        try { navigator.serviceWorker.removeEventListener("message", handler); } catch {}
      }
      if (iframe) {
        try { iframe.src = "about:blank"; } catch {}
        try { iframe.parentNode?.removeChild(iframe); } catch {}
      }
      resolve(result);
    };

    // Listen for SW stream capture message
    handler = (e) => {
      if (e.data?.type !== "NOVA_STREAM_CAPTURED") return;
      const url = e.data.url;
      if (!url) return;
      const isVideo = /\.(m3u8|mp4|ts)(\?|$)/i.test(url) ||
                      /\/(hls|stream|manifest|playlist|video)\//i.test(url);
      if (!isVideo) return;
      finish({
        url,
        type: /\.mp4(\?|$)/i.test(url) ? "mp4" : "hls",
        subtitles: [],
      });
    };

    try {
      navigator.serviceWorker.addEventListener("message", handler);
    } catch {
      resolve(null);
      return;
    }

    // Create invisible iframe — SW intercepts its requests
    iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;top:-9999px;left:-9999px;" +
      "width:1px;height:1px;opacity:0;" +
      "pointer-events:none;border:none;visibility:hidden;";
    iframe.allow = "autoplay; encrypted-media";
    iframe.src = embedUrl;

    try {
      document.body.appendChild(iframe);
    } catch {
      finish(null);
      return;
    }

    timer = setTimeout(() => finish(null), TIMEOUT);
  });
}

// ── Try providers sequentially ────────────────────────────────────────────
async function tryAll(type, id, season, episode) {
  for (const buildUrl of PROVIDERS) {
    try {
      const url = buildUrl(type, id, season, episode);
      const result = await captureFromIframe(url);
      if (result?.url) return result;
    } catch {}
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────
export async function extractHLSForChrome(id, type, season, episode) {
  const key = `${type}|${id}|${season || ""}|${episode || ""}`;
  const hit = CACHE.get(key);
  if (hit && Date.now() < hit.exp) return hit.data;

  // Only run in real browser — not Electron, not SSR
  if (typeof window === "undefined") return null;
  if (window?.electron) return null;
  if (!/Chrome/i.test(navigator.userAgent)) return null;
  if (/Electron/i.test(navigator.userAgent)) return null;

  const swOk = await ensureSW();
  if (!swOk) return null;

  const result = await tryAll(type, id, season, episode);
  if (result) CACHE.set(key, { data: result, exp: Date.now() + CACHE_TTL });
  return result;
}

export function invalidateHLSCache(id, type, season, episode) {
  const pat = `${type}|${id}|${season || ""}|${episode || ""}`;
  for (const k of CACHE.keys()) {
    if (k.includes(pat)) CACHE.delete(k);
  }
}