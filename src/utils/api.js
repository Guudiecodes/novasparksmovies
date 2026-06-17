const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE  = "https://image.tmdb.org/t/p";

export const imgUrl = (path, size = "w500") =>
  path ? `${IMG_BASE}/${size}${path}` : null;

// ── Silent error handlers ─────────────────────────────────────────────────────
let _onAuthError   = () => {};
let _onUnreachable = () => {};
export const setApiErrorHandlers = (onAuth, onUnreachable) => {
  _onAuthError   = onAuth        || (() => {});
  _onUnreachable = onUnreachable || (() => {});
};


// ═════════════════════════════════════════════════════════════════════════════
// BROWSER ENVIRONMENT DETECTION
// ═════════════════════════════════════════════════════════════════════════════

let _braveCheckCache          = null;
let _isRestrictedBrowserCache = null;

async function _checkIsBrave() {
  if (_braveCheckCache !== null) return _braveCheckCache;
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.brave &&
      typeof navigator.brave.isBrave === "function"
    ) {
      _braveCheckCache = await navigator.brave.isBrave();
      return _braveCheckCache;
    }
  } catch {}
  try {
    const brands = navigator?.userAgentData?.brands || [];
    if (brands.some((b) => b.brand === "Brave")) {
      _braveCheckCache = true;
      return true;
    }
  } catch {}
  _braveCheckCache = false;
  return false;
}

export async function initBrowserEnv() {
  if (_isRestrictedBrowserCache !== null) return;
  if (typeof window !== "undefined" && window?.electron) { _isRestrictedBrowserCache = false; return; }
  if (typeof navigator === "undefined") { _isRestrictedBrowserCache = false; return; }
  const ua = navigator.userAgent || "";
  if (/Firefox\//i.test(ua))        { _isRestrictedBrowserCache = false; return; }
  if (/OPR\//i.test(ua))            { _isRestrictedBrowserCache = false; return; }
  if (/SamsungBrowser\//i.test(ua)) { _isRestrictedBrowserCache = false; return; }
  if (/DuckDuckGo\//i.test(ua))     { _isRestrictedBrowserCache = false; return; }
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) { _isRestrictedBrowserCache = false; return; }
  if (/Edg\//i.test(ua)) { _isRestrictedBrowserCache = false; return; }
  const brave = await _checkIsBrave();
  if (brave) { _isRestrictedBrowserCache = false; return; }
  _isRestrictedBrowserCache = false;
}

export function isRestrictedBrowser() { return false; }


// ═════════════════════════════════════════════════════════════════════════════
// TMDB FETCH
// ═════════════════════════════════════════════════════════════════════════════

const _tmdbCache     = new Map();
const TMDB_CACHE_TTL = 5 * 60 * 1000;
let _inflight        = 0;
const MAX_INFLIGHT   = 4;
const _waiters       = [];

function _acquireSlot() {
  if (_inflight < MAX_INFLIGHT) { _inflight++; return Promise.resolve(); }
  return new Promise((resolve) => _waiters.push(resolve));
}
function _releaseSlot() {
  _inflight--;
  if (_waiters.length > 0) { _inflight++; _waiters.shift()(); }
}

export const tmdbFetch = async (path, apiKey) => {
  const cacheKey = `${apiKey}|${path}`;
  const cached   = _tmdbCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;
  await _acquireSlot();
  let res;
  try {
    const sep = path.includes("?") ? "&" : "?";
    res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${apiKey}`);
  } catch { _releaseSlot(); throw new Error("TMDB unreachable"); }
  _releaseSlot();
  if (res.status === 401 || res.status === 403) throw new Error(`TMDB ${res.status}`);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  _tmdbCache.set(cacheKey, { data, expiresAt: Date.now() + TMDB_CACHE_TTL });
  if (_tmdbCache.size > 80) {
    const now = Date.now();
    for (const [k, v] of _tmdbCache) { if (now >= v.expiresAt) _tmdbCache.delete(k); }
  }
  return data;
};


// ═════════════════════════════════════════════════════════════════════════════
// NON-EMBED PROVIDER FETCHING
// ═════════════════════════════════════════════════════════════════════════════

const BFF_BASE = "/api/sources";
export const M3U8_PROXY = "/api/proxy?url=";
export const SUB_PROXY  = "https://proxy.valhallastream.dpdns.org";
const WYZIE_SUB         = "https://sub.wyzie.ru/search";

export async function fetchOnlineSubtitles(tmdbId) {
  try {
    const res = await fetch(`${SUB_PROXY}/?destination=${encodeURIComponent(`${WYZIE_SUB}?id=${tmdbId}`)}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((s) => ({
      url:      s.url  || s.file || "",
      display:  s.display || s.label || s.language || "Unknown",
      language: s.language || s.lang || "",
      type:     s.type || s.format || "srt",
    })).filter((s) => s.url);
  } catch { return []; }
}

export async function fetchProviderSources(type, id, season, episode, service) {
  try {
    const params = new URLSearchParams({ id, service });
    if (type === "tv" && season)  params.set("season",  season);
    if (type === "tv" && episode) params.set("episode", episode);
    const url = `${BFF_BASE}?type=${type}&${params}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data || null;
  } catch { return null; }
}

// NS 1–6 = self-hosted ad-free (Chrome primary)
// NS 7–11 = public embed scrapers
export async function fetchProviderServices() {
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
}

export async function fetchAllNonEmbedSources(type, id, season, episode, {
  onSourceFound    = null,
  onProviderStatus = null,
  signal           = null,
} = {}) {
  const services = await fetchProviderServices();
  if (!services.length) return { sources: [], captions: [] };
  const merged = { sources: [], captions: [] };
  onProviderStatus?.(services.map((s) => ({ name: s, status: "available" })));
  await Promise.allSettled(
    services.map(async (service) => {
      if (signal?.aborted) return;
      onProviderStatus?.([{ name: service, status: "fetching" }]);
      try {
        const data = await fetchProviderSources(type, id, season, episode, service);
        if (signal?.aborted) return;
        const hasSources = data?.sources?.length > 0;
        onProviderStatus?.([{ name: service, status: hasSources ? "success" : "error" }]);
        if (hasSources) {
          data.sources.forEach((src) => { merged.sources.push(src); onSourceFound?.(src); });
          (data.captions || []).forEach((cap) => merged.captions.push(cap));
        }
      } catch {
        if (!signal?.aborted) onProviderStatus?.([{ name: service, status: "error" }]);
      }
    })
  );
  return merged;
}


// ═════════════════════════════════════════════════════════════════════════════
// PLAYER SOURCES  (Embed mode — iframe-based)
//
// TIER 1 — Zero-redirect direct players. Instant load, clean experience.
// TIER 2 — Reliable aggregators, minimal internal redirects.
// TIER 3 — Last-resort fallbacks. Known to have ad-popups or redirect chains.
//
// REMOVED: videasy (NS 8) — excessive redirects, non-expandable player
//          mapple (NS 14) — embed ads + user redirection
// DEAD (previously removed): primesrc, vapsrc, cinezo, smashystream,
//   twoembed, vidbinge, vidupto, embedsu
// ═════════════════════════════════════════════════════════════════════════════

export const PLAYER_SOURCES = [

  // ── TIER 1 — Zero-redirect, instant load ─────────────────────────────────

  {
    id: "vidlink",
    label: "NS 7",
    tag: null, note: "★ Fast",
    tier: 1, moviePriority: 1, tvPriority: 1, browserPriority: 1,
    browserSafe: true, supportsProgress: true, zeroRedirect: true,
    movieUrl: (id) => `https://vidlink.pro/movie/${id}?ads=0`,
    tvUrl:    (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}?ads=0`,
  },

  {
    id: "multiembed",
    label: "NS 9",
    tag: null, note: "★ Multi-Server",
    tier: 1, moviePriority: 2, tvPriority: 2, browserPriority: 2,
    browserSafe: true, supportsProgress: true, zeroRedirect: true,
    movieUrl: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
    tvUrl:    (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },

  {
    id: "pstream",
    label: "NS 15",
    tag: null, note: "★ Direct",
    tier: 1, moviePriority: 3, tvPriority: 3, browserPriority: 3,
    browserSafe: true, supportsProgress: true, zeroRedirect: true,
    movieUrl: (id) => `https://iframe.pstream.mov/embed/tmdb-movie-${id}`,
    tvUrl:    (id, s, e) => `https://iframe.pstream.mov/embed/tmdb-tv-${id}/${s}/${e}`,
  },

  // ── Peachify — clean multi-server player, built-in auto-failover,
  //    progress events via postMessage (PLAYER_EVENT + MEDIA_DATA),
  //    no embed ads, no user redirection, fullscreen + PiP ready ──────────

  {
    id: "peachify",
    label: "NS 14",
    tag: null, note: "★ Clean",
    tier: 1, moviePriority: 4, tvPriority: 4, browserPriority: 4,
    browserSafe: true, supportsProgress: true, zeroRedirect: true,
    movieUrl: (id) => `https://peachify.top/embed/movie/${id}`,
    tvUrl:    (id, s, e) => `https://peachify.top/embed/tv/${id}/${s}/${e}`,
  },

  // ── TIER 2 — Reliable aggregators ────────────────────────────────────────

  {
    id: "autoembed",
    label: "NS 10",
    tag: null, note: "★ Clean",
    tier: 2, moviePriority: 5, tvPriority: 5, browserPriority: 5,
    browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://player.autoembed.cc/embed/movie/${id}`,
    tvUrl:    (id, s, e) => `https://player.autoembed.cc/embed/tv/${id}?season=${s}&episode=${e}`,
  },

  {
    id: "vidsrc_cc",
    label: "NS 11",
    tag: null, note: "★ HD",
    tier: 2, moviePriority: 6, tvPriority: 6, browserPriority: 6,
    browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
    tvUrl:    (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
  },

  // ── TIER 3 — Last-resort fallbacks ───────────────────────────────────────

  {
    id: "embed2",
    label: "NS 13",
    tag: null, note: null,
    tier: 3, moviePriority: 7, tvPriority: 7, browserPriority: 7,
    browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://www.2embed.cc/embed/${id}`,
    tvUrl:    (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },

  {
    id: "vidsrc_xyz",
    label: "NS 12",
    tag: null, note: null,
    tier: 3, moviePriority: 8, tvPriority: 8, browserPriority: 8,
    browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
    tvUrl:    (id, s, e) => `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },

  // ── ANIME ─────────────────────────────────────────────────────────────────
  {
    id: "allmanga",
    label: "NS 20",
    tag: "ANIME", note: null,
    tier: 1,
    moviePriority: 99, tvPriority: 99, browserPriority: 99,
    browserSafe: true, supportsProgress: true, async: true,
    movieUrl: (_id) => "https://allmanga.to",
    tvUrl:    (_id, _s, _e) => "https://allmanga.to",
  },
];


// ═════════════════════════════════════════════════════════════════════════════
// SOURCE HELPERS
// ═════════════════════════════════════════════════════════════════════════════

export const getSourceUrl = (sourceId, type, id, season, ep) => {
  const src = PLAYER_SOURCES.find((s) => s.id === sourceId) ?? PLAYER_SOURCES[0];
  return type === "movie" ? src.movieUrl(id) : src.tvUrl(id, season, ep);
};

export const sourceSupportsProgress  = (id) => PLAYER_SOURCES.find((s) => s.id === id)?.supportsProgress  ?? false;
export const sourceProgressViaFrames = (id) => PLAYER_SOURCES.find((s) => s.id === id)?.progressViaFrames ?? false;
export const sourceIsAsync           = (id) => PLAYER_SOURCES.find((s) => s.id === id)?.async             ?? false;

export const NEEDS_INTERCEPT = [];

export const ANIME_DEFAULT_SOURCE       = "allmanga";
export const NON_ANIME_DEFAULT_SOURCE   = "vidlink";
export const BROWSER_RESTRICTED_DEFAULT = "vidlink";

export function getDefaultSource() {
  return NON_ANIME_DEFAULT_SOURCE;
}


// ═════════════════════════════════════════════════════════════════════════════
// PRE-FLIGHT URL PROBE
// Placed before HealthRegistry so prewarmSources can call it.
// ═════════════════════════════════════════════════════════════════════════════

const PROBE_TIMEOUT_FAST = 1800;
const PROBE_TIMEOUT_SLOW = 2800;
const PROBE_RETRY_DELAY  = 250;

async function _singleProbe(url, timeoutMs) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { method: "HEAD", mode: "no-cors", signal: controller.signal });
    clearTimeout(tid);
    return "ok";
  } catch (err) {
    clearTimeout(tid);
    if (err.name === "AbortError") return "timeout";
    return "refused";
  }
}

export async function probeUrl(url, _legacyTimeout) {
  const first = await _singleProbe(url, PROBE_TIMEOUT_FAST);
  if (first === "ok") return "ok";
  await new Promise((r) => setTimeout(r, PROBE_RETRY_DELAY));
  const second = await _singleProbe(url, PROBE_TIMEOUT_SLOW);
  return second;
}


// ═════════════════════════════════════════════════════════════════════════════
// SOURCE HEALTH REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
// Two-signal health tracking per embed source:
//
//   1. HTTP probe results (fast, imprecise — reachability check only)
//      recordProbe(id, success, responseTimeMs)
//
//   2. Actual playback outcomes (authoritative — did video actually play?)
//      reportPlayOutcome(id, success)   ← called from WatchPage
//
// Score range: 0–100  |  50 = unknown/neutral  |  100 = fully trusted
//
// Circuit breaker: score < CIRCUIT_OPEN_SCORE AND failures ≥ 3 defers the
// source to end of queue. Never permanently excluded — recovery is possible.
//
// Persistence: localStorage with 30-min TTL per probe entry.
// Stale entries trigger a background re-probe on next prewarmSources() call.
// ═════════════════════════════════════════════════════════════════════════════

const HEALTH_STORAGE_KEY = "novaspark_sourceHealth_v2";
const HEALTH_PROBE_TTL   = 30 * 60 * 1000;   // 30 min before re-probe

const SCORE_NEUTRAL      = 50;
const SCORE_MAX          = 100;
const SCORE_PROBE_HIT    = 18;   // probe success  — small (reachable ≠ plays)
const SCORE_PROBE_MISS   = 28;   // probe fail     — bigger (unreachable = broken)
const SCORE_PLAY_SUCCESS = 38;   // video played   — strong positive
const SCORE_PLAY_FAIL    = 45;   // video failed   — strongest negative
const CIRCUIT_OPEN_SCORE = 12;   // threshold to open circuit
const MIN_FAILURES_OPEN  = 3;    // minimum consecutive failures to open circuit

class _SourceHealthRegistry {
  constructor() {
    this._records   = {};
    this._saveTimer = null;
    this._hydrate();
  }

  _hydrate() {
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(HEALTH_STORAGE_KEY);
      if (!raw) return;
      const parsed   = JSON.parse(raw);
      const validIds = new Set(PLAYER_SOURCES.map((s) => s.id));
      for (const [id, rec] of Object.entries(parsed)) {
        if (validIds.has(id)) this._records[id] = rec;
      }
    } catch { /* start fresh */ }
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(HEALTH_STORAGE_KEY, JSON.stringify(this._records));
        }
      } catch {}
    }, 300);
  }

  _blank() {
    return { score: SCORE_NEUTRAL, failures: 0, successes: 0, lastProbe: 0, lastPlay: 0, responseTime: 0 };
  }

  _get(id)   { return this._records[id] || this._blank(); }
  _clamp(v)  { return Math.max(0, Math.min(SCORE_MAX, Math.round(v))); }

  recordProbe(id, success, responseTimeMs = 0) {
    const r = this._get(id);
    this._records[id] = {
      score:        this._clamp(r.score + (success ? SCORE_PROBE_HIT : -SCORE_PROBE_MISS)),
      failures:     success ? 0 : r.failures + 1,
      successes:    success ? r.successes + 1 : r.successes,
      lastProbe:    Date.now(),
      lastPlay:     r.lastPlay,
      responseTime: success ? responseTimeMs : r.responseTime,
    };
    this._scheduleSave();
  }

  reportPlayOutcome(id, success) {
    const r = this._get(id);
    this._records[id] = {
      ...r,
      score:     this._clamp(r.score + (success ? SCORE_PLAY_SUCCESS : -SCORE_PLAY_FAIL)),
      failures:  success ? 0 : r.failures + 1,
      successes: success ? r.successes + 1 : r.successes,
      lastPlay:  Date.now(),
    };
    this._scheduleSave();
  }

  getScore(id)      { return this._get(id).score; }

  isCircuitOpen(id) {
    const r = this._get(id);
    return r.failures >= MIN_FAILURES_OPEN && r.score < CIRCUIT_OPEN_SCORE;
  }

  isStale(id) {
    return (Date.now() - (this._records[id]?.lastProbe || 0)) > HEALTH_PROBE_TTL;
  }

  /**
   * Returns source IDs in recommended trial order:
   *   1. Circuit-closed sources first, sorted by score DESC then priority ASC
   *   2. Circuit-open sources deferred to end (not excluded — recovery possible)
   */
  sortedIds(type) {
    const eligible = PLAYER_SOURCES.filter((s) => !s.async && !s.tag);
    const score    = (s) => this.getScore(s.id);
    const prio     = (s) => type === "movie" ? (s.moviePriority ?? 99) : (s.tvPriority ?? 99);
    const cmp      = (a, b) => {
      const diff = score(b) - score(a);
      return Math.abs(diff) > 10 ? diff : prio(a) - prio(b);
    };
    const active   = eligible.filter((s) => !this.isCircuitOpen(s.id)).sort(cmp);
    const deferred = eligible.filter((s) =>  this.isCircuitOpen(s.id)).sort(cmp);
    return [...active, ...deferred].map((s) => s.id);
  }
}

export const sourceHealth = new _SourceHealthRegistry();


// ═════════════════════════════════════════════════════════════════════════════
// PREWARM — background-probe all stale sources on module init
// ─────────────────────────────────────────────────────────────────────────────
// Uses Fight Club (TMDB 550) as a stable canary to check server reachability
// without needing the user's actual title. Results populate sourceHealth so
// WatchPage already has a sorted, trusted list before the user arrives.
//
// Auto-called 2 s after module import (see bottom of file).
// Idempotent — runs at most once per session.
// ═════════════════════════════════════════════════════════════════════════════

const CANARY_MOVIE_ID = "550"; // Fight Club — stable TMDB ID, indexed everywhere

let _prewarmDone = false;

export async function prewarmSources() {
  if (_prewarmDone) return;
  _prewarmDone = true;

  const stale = PLAYER_SOURCES.filter((s) => !s.async && !s.tag && sourceHealth.isStale(s.id));
  if (!stale.length) return;

  // Fire-and-forget: all probes run concurrently in the background
  stale.forEach(async (src) => {
    try {
      const url = src.movieUrl(CANARY_MOVIE_ID);
      const t0  = Date.now();
      const res = await probeUrl(url);
      sourceHealth.recordProbe(src.id, res === "ok", Date.now() - t0);
    } catch { /* silent */ }
  });
}

/**
 * Report actual playback outcome to the health registry.
 * Call from WatchPage once the player's state is known:
 *
 *   reportSourceOutcome("vidlink",  true);   // video started playing
 *   reportSourceOutcome("vidsrc_cc", false); // source loaded but no video
 */
export function reportSourceOutcome(sourceId, success) {
  sourceHealth.reportPlayOutcome(sourceId, success);
}


// ═════════════════════════════════════════════════════════════════════════════
// RETRY QUEUE
// Health-score aware fallback ordering.
// Circuit-open sources deferred to end, never permanently excluded.
// ═════════════════════════════════════════════════════════════════════════════

export function buildRetryQueue(type, preferredId) {
  const sorted = sourceHealth.sortedIds(type);
  if (!preferredId || !sorted.includes(preferredId)) return sorted;
  const idx = sorted.indexOf(preferredId);
  return [...sorted.slice(idx), ...sorted.slice(0, idx)];
}


// ═════════════════════════════════════════════════════════════════════════════
// WORKING SOURCE FINDER
// ─────────────────────────────────────────────────────────────────────────────
// Health-aware probe ordering:
//   • Preferred source → 0 ms delay (always first)
//   • Top 3 by health score → 0 ms delay (race immediately)
//   • Mid-tier → 150 ms stagger
//   • Circuit-open sources → 600 ms stagger (tried last)
// All probe outcomes update the health registry.
// ═════════════════════════════════════════════════════════════════════════════

const _sourceCache     = new Map();
const SOURCE_CACHE_TTL = 15 * 60 * 1000;

export async function findWorkingSource(type, id, season = null, episode = null, preferredId = null) {
  const cacheKey = `${type}|${id}|${season ?? ""}|${episode ?? ""}`;
  const cached   = _sourceCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.sourceId;

  const sortedIds = sourceHealth.sortedIds(type);
  const order     = preferredId && sortedIds.includes(preferredId)
    ? [preferredId, ...sortedIds.filter((sid) => sid !== preferredId)]
    : sortedIds;

  const sources = order
    .map((sid) => PLAYER_SOURCES.find((s) => s.id === sid))
    .filter(Boolean);

  const racePromises = sources.map((src, index) => {
    const isPreferred   = src.id === preferredId;
    const isCircuitOpen = sourceHealth.isCircuitOpen(src.id);
    const delay = isPreferred   ? 0
                : index < 3     ? 0
                : isCircuitOpen ? 600
                : index < 5     ? 150
                :                 350;

    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          const url = type === "movie" ? src.movieUrl(id) : src.tvUrl(id, season, episode);
          const t0  = Date.now();
          const res = await probeUrl(url);
          sourceHealth.recordProbe(src.id, res === "ok", Date.now() - t0);
          if (res === "ok") resolve(src.id);
          else reject(new Error(src.id));
        } catch { reject(new Error(src.id)); }
      }, delay);
    });
  });

  const defaultSource = getDefaultSource();
  try {
    const winner = await Promise.any(racePromises);
    _sourceCache.set(cacheKey, { sourceId: winner, expiresAt: Date.now() + SOURCE_CACHE_TTL });
    return winner;
  } catch {
    const fallback = preferredId ?? defaultSource;
    _sourceCache.set(cacheKey, { sourceId: fallback, expiresAt: Date.now() + 2 * 60 * 1000 });
    return fallback;
  }
}

export function invalidateSourceCache(type, id, season = null, episode = null) {
  const cacheKey = `${type}|${id}|${season ?? ""}|${episode ?? ""}`;
  _sourceCache.delete(cacheKey);
}


// ═════════════════════════════════════════════════════════════════════════════
// ANILIST
// ═════════════════════════════════════════════════════════════════════════════

const ANILIST_API = "https://graphql.anilist.co";

export const cleanAnilistDescription = (desc) => {
  if (!desc) return desc;
  let clean = desc
    .split("<")
    .map((chunk, i) => (i === 0 ? chunk : chunk.slice(chunk.indexOf(">") + 1)))
    .join("")
    .replace(/>/g, "");
  clean = clean
    .replace(/\(Source:[^)]*\)/gi, "")
    .replace(/\bNote:[^\n]*/gi, "")
    .replace(/[\s\n]+$/, "")
    .trim();
  return clean;
};

const ANILIST_QUERY = `
query ($search: String, $type: MediaType) {
  Media(search: $search, type: $type, sort: SEARCH_MATCH) {
    id idMal
    title { romaji english native }
    description(asHtml: false)
    coverImage { extraLarge large }
    bannerImage genres averageScore episodes status season seasonYear
    studios(isMain: true) { nodes { name } }
    startDate { year month }
    relations {
      edges {
        relationType
        node {
          id type format
          title { romaji english }
          episodes
          startDate { year month }
          seasonYear
        }
      }
    }
  }
}`;

const ANILIST_CACHE_KEY = "novaspark_anilistCache";
const ANILIST_CACHE_TTL = 1000 * 60 * 60 * 24 * 7;
let _anilistCache = null;

function getAnilistCache() {
  if (_anilistCache) return _anilistCache;
  try {
    const raw     = localStorage.getItem(ANILIST_CACHE_KEY);
    _anilistCache = raw ? JSON.parse(raw) : {};
  } catch { _anilistCache = {}; }
  const now = Date.now();
  for (const key of Object.keys(_anilistCache)) {
    if (now - _anilistCache[key].ts > ANILIST_CACHE_TTL) delete _anilistCache[key];
  }
  return _anilistCache;
}

let _anilistFlushTimer = null;
function flushAnilistCache() {
  if (_anilistFlushTimer) clearTimeout(_anilistFlushTimer);
  _anilistFlushTimer = setTimeout(() => {
    _anilistFlushTimer = null;
    try { localStorage.setItem(ANILIST_CACHE_KEY, JSON.stringify(_anilistCache)); } catch {}
  }, 500);
}

export const fetchAnilistData = async (title, type = "ANIME", tmdbId = null) => {
  const cacheKey = tmdbId
    ? `${type}__tmdb_${tmdbId}`
    : `${type}__${title.toLowerCase().trim()}`;
  const cache = getAnilistCache();
  const entry = cache[cacheKey];
  if (entry && Date.now() - entry.ts <= ANILIST_CACHE_TTL) {
    const cachedTitles = [
      entry.data?.title?.romaji,
      entry.data?.title?.english,
      entry.data?.title?.native,
    ].filter(Boolean).map((t) => t.toLowerCase());
    const searchTitle = title.toLowerCase();
    const isMismatch  =
      entry.data !== null &&
      cachedTitles.length > 0 &&
      !cachedTitles.some((t) => t.includes(searchTitle) || searchTitle.includes(t));
    if (!isMismatch) return entry.data;
    delete cache[cacheKey];
    flushAnilistCache();
  }
  try {
    const res  = await fetch(ANILIST_API, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body:    JSON.stringify({ query: ANILIST_QUERY, variables: { search: title, type } }),
    });
    const json = await res.json();
    const data = json?.data?.Media || null;
    cache[cacheKey] = { data, ts: Date.now() };
    flushAnilistCache();
    return data;
  } catch {
    if (entry) return entry.data;
    return null;
  }
};

export const buildAnilistSeasons = (anilistData) => {
  if (!anilistData) return null;
  const main = {
    id:       anilistData.id,
    title:    anilistData.title?.english || anilistData.title?.romaji || anilistData.title?.native,
    episodes: anilistData.episodes || null,
    year:     anilistData.startDate?.year  || anilistData.seasonYear || 9999,
    month:    anilistData.startDate?.month || 0,
  };
  const sequels = (anilistData.relations?.edges || [])
    .filter((e) =>
      e.relationType === "SEQUEL" &&
      e.node.type    === "ANIME"  &&
      (e.node.format === "TV" || e.node.format === "TV_SHORT")
    )
    .map((e) => ({
      id:       e.node.id,
      title:    e.node.title?.english || e.node.title?.romaji,
      episodes: e.node.episodes || null,
      year:     e.node.startDate?.year  || e.node.seasonYear || 9999,
      month:    e.node.startDate?.month || 0,
    }));
  const all = [main, ...sequels].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );
  return all.map((s, i) => ({ seasonNum: i + 1, ...s }));
};

export const isAnimeContent = (item, details) => {
  const d          = details || item;
  const genreIds   = d.genre_ids || (d.genres || []).map((g) => g.id);
  const countries  = d.origin_country || [];
  return genreIds.includes(16) && (d.original_language === "ja" || countries.includes("JP"));
};


// ═════════════════════════════════════════════════════════════════════════════
// EPISODE GROUP CACHE
// ═════════════════════════════════════════════════════════════════════════════

const EG_CACHE_KEY = "novaspark_episodeGroupCache";
const EG_CACHE_TTL = 1000 * 60 * 60 * 24 * 7;
let _egCache = null;

function getEgCache() {
  if (_egCache) return _egCache;
  try {
    const raw = localStorage.getItem(EG_CACHE_KEY);
    _egCache  = raw ? JSON.parse(raw) : {};
  } catch { _egCache = {}; }
  const now = Date.now();
  for (const key of Object.keys(_egCache)) {
    if (now - _egCache[key].ts > EG_CACHE_TTL) delete _egCache[key];
  }
  return _egCache;
}

let _egFlushTimer = null;
function flushEgCache() {
  if (_egFlushTimer) clearTimeout(_egFlushTimer);
  _egFlushTimer = setTimeout(() => {
    _egFlushTimer = null;
    try { localStorage.setItem(EG_CACHE_KEY, JSON.stringify(_egCache)); } catch {}
  }, 500);
}

export const fetchEpisodeGroup = async (groupId, apiKey) => {
  const cache = getEgCache();
  const entry = cache[groupId];
  if (entry && Date.now() - entry.ts <= EG_CACHE_TTL) return entry.data;
  const data = await tmdbFetch(`/tv/episode_group/${groupId}`, apiKey);
  cache[groupId] = { data, ts: Date.now() };
  flushEgCache();
  return data;
};


// ═════════════════════════════════════════════════════════════════════════════
// MODULE INIT — auto-prewarm 2 s after import (non-blocking, idempotent)
// ═════════════════════════════════════════════════════════════════════════════
if (typeof window !== "undefined") {
  setTimeout(prewarmSources, 2_000);
}