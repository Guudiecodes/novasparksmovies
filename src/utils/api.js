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

  if (typeof window !== "undefined" && window?.electron) {
    _isRestrictedBrowserCache = false;
    return;
  }
  if (typeof navigator === "undefined") {
    _isRestrictedBrowserCache = false;
    return;
  }

  const ua = navigator.userAgent || "";

  if (/Firefox\//i.test(ua))        { _isRestrictedBrowserCache = false; return; }
  if (/OPR\//i.test(ua))            { _isRestrictedBrowserCache = false; return; }
  if (/SamsungBrowser\//i.test(ua)) { _isRestrictedBrowserCache = false; return; }
  if (/DuckDuckGo\//i.test(ua))     { _isRestrictedBrowserCache = false; return; }
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    _isRestrictedBrowserCache = false; return;
  }
  if (/Edg\//i.test(ua)) {
    try {
      const brands = navigator?.userAgentData?.brands || [];
      if (brands.some((b) => b.brand === "Microsoft Edge")) {
        _isRestrictedBrowserCache = false; return;
      }
    } catch {}
    _isRestrictedBrowserCache = false; return;
  }

  const brave = await _checkIsBrave();
  if (brave) { _isRestrictedBrowserCache = false; return; }

  try {
    const brands = navigator?.userAgentData?.brands || [];
    if (brands.some((b) => b.brand === "Google Chrome")) {
      _isRestrictedBrowserCache = true; return;
    }
  } catch {}

  if (/Chrome\//i.test(ua) && !/Chromium\//i.test(ua)) {
    _isRestrictedBrowserCache = true; return;
  }
  if (/Chromium\//i.test(ua)) {
    _isRestrictedBrowserCache = true; return;
  }

  _isRestrictedBrowserCache = false;
}

export function isRestrictedBrowser() {
  if (_isRestrictedBrowserCache !== null) return _isRestrictedBrowserCache;

  if (typeof window !== "undefined" && window?.electron) return false;
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent || "";
  if (/Firefox\//i.test(ua))        return false;
  if (/OPR\//i.test(ua))            return false;
  if (/Edg\//i.test(ua))            return false;
  if (/SamsungBrowser\//i.test(ua)) return false;
  if (/DuckDuckGo\//i.test(ua))     return false;
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return false;

  try {
    const brands = navigator?.userAgentData?.brands || [];
    if (brands.some((b) => b.brand === "Brave"))          return false;
    if (brands.some((b) => b.brand === "Microsoft Edge")) return false;
  } catch {}

  if (/Chrome\//i.test(ua) || /Chromium\//i.test(ua)) return true;
  return false;
}


// ═════════════════════════════════════════════════════════════════════════════
// TMDB FETCH
// ═════════════════════════════════════════════════════════════════════════════

const _tmdbCache     = new Map();
const TMDB_CACHE_TTL = 5 * 60 * 1000;

let _inflight      = 0;
const MAX_INFLIGHT = 4;
const _waiters     = [];

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
  } catch {
    _releaseSlot();
    throw new Error("TMDB unreachable");
  }
  _releaseSlot();

  if (res.status === 401 || res.status === 403) throw new Error(`TMDB ${res.status}`);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);

  const data = await res.json();
  _tmdbCache.set(cacheKey, { data, expiresAt: Date.now() + TMDB_CACHE_TTL });

  if (_tmdbCache.size > 80) {
    const now = Date.now();
    for (const [k, v] of _tmdbCache) {
      if (now >= v.expiresAt) _tmdbCache.delete(k);
    }
  }
  return data;
};


// ═════════════════════════════════════════════════════════════════════════════
// PLAYER SOURCES
// ═════════════════════════════════════════════════════════════════════════════

export const PLAYER_SOURCES = [

  // ── TIER 1: Fastest & most reliable ──────────────────────────────────────
  {
    id: "vidlink",
    label: "Server 1",
    tag: null, note: "Fast",
    tier: 1, moviePriority: 1, tvPriority: 1,
    browserPriority: 99,
    browserSafe: false,
    supportsProgress: true,
    movieUrl: (id) => `https://vidlink.pro/movie/${id}?autoplay=true`,
    tvUrl:    (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}?autoplay=true`,
  },
  {
    id: "vidsrc_cc",
    label: "Server 2",
    tag: null, note: "Fast",
    tier: 1, moviePriority: 2, tvPriority: 2,
    browserPriority: 99,
    browserSafe: false,
    supportsProgress: true, progressViaFrames: true,
    movieUrl: (id) => `https://player.videasy.net/movie/${id}`,
    tvUrl:    (id, s, e) => `https://player.videasy.net/tv/${id}/${s}/${e}`,
  },

  // ── TIER 2: Fast & reliable ───────────────────────────────────────────────
  {
    id: "autoembed",
    label: "Server 3",
    tag: null, note: null,
    tier: 2, moviePriority: 7, tvPriority: 7,
    browserPriority: 99,
    browserSafe: false,
    supportsProgress: true, progressViaFrames: true,
    movieUrl: (id) => `https://player.autoembed.cc/embed/movie/${id}`,
    tvUrl:    (id, s, e) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`,
  },

  // ── TIER 3: Reliable fallbacks ────────────────────────────────────────────
  {
    id: "vidsrcto",
    label: "Server 4",
    tag: null, note: null,
    tier: 3, moviePriority: 8, tvPriority: 8,
    browserPriority: 99,
    browserSafe: false,
    supportsProgress: true, progressViaFrames: true,
    movieUrl: (id) => `https://vidsrc.to/embed/movie/${id}`,
    tvUrl:    (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: "vidfast",
    label: "Server 5",
    tag: null, note: null,
    tier: 3, moviePriority: 9, tvPriority: 9,
    browserPriority: 3,
    browserSafe: true,
    supportsProgress: true,
    movieUrl: (id) => `https://vidfast.pro/movie/${id}?autoPlay=true`,
    tvUrl:    (id, s, e) => `https://vidfast.pro/tv/${id}/${s}/${e}?autoPlay=true`,
  },
  {
    id: "videasy",
    label: "Server 6",
    tag: null, note: null,
    tier: 3, moviePriority: 11, tvPriority: 11,
    browserPriority: 5,
    browserSafe: true,
    supportsProgress: true,
    movieUrl: (id) => `https://player.videasy.net/movie/${id}`,
    tvUrl:    (id, s, e) => `https://player.videasy.net/tv/${id}/${s}/${e}`,
  },
  // ── ANIME ─────────────────────────────────────────────────────────────────
  {
    id: "allmanga",
    label: "NsManga",
    tag: "ANIME", note: null,
    tier: 1,
    moviePriority: 99, tvPriority: 99, browserPriority: 99,
    browserSafe: true,
    supportsProgress: true,
    async: true,
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

export const NEEDS_INTERCEPT = ["vidsrc_cc", "autoembed", "vidlink", "vidsrc_fyi", "vidsrc_net"];

export const ANIME_DEFAULT_SOURCE       = "allmanga";
export const NON_ANIME_DEFAULT_SOURCE   = "vidlink";
export const BROWSER_RESTRICTED_DEFAULT = "moviesapi";

export function getDefaultSource() {
  return isRestrictedBrowser() ? BROWSER_RESTRICTED_DEFAULT : NON_ANIME_DEFAULT_SOURCE;
}


// ═════════════════════════════════════════════════════════════════════════════
// RETRY QUEUE
// ═════════════════════════════════════════════════════════════════════════════

export function buildRetryQueue(type, preferredId) {
  const restricted = isRestrictedBrowser();

  const eligible = PLAYER_SOURCES
    .filter((s) => !s.async && !s.tag)
    .filter((s) => !restricted || s.browserSafe === true)
    .sort((a, b) => {
      if (restricted) {
        return (a.browserPriority ?? 99) - (b.browserPriority ?? 99);
      }
      const pa = type === "movie" ? (a.moviePriority ?? 99) : (a.tvPriority ?? 99);
      const pb = type === "movie" ? (b.moviePriority ?? 99) : (b.tvPriority ?? 99);
      return pa - pb;
    })
    .map((s) => s.id);

  const startIdx = eligible.indexOf(preferredId);
  if (startIdx <= 0) return eligible;
  return [...eligible.slice(startIdx), ...eligible.slice(0, startIdx)];
}


// ═════════════════════════════════════════════════════════════════════════════
// PRE-FLIGHT URL PROBE  —  now with double-retry + jitter
// ═════════════════════════════════════════════════════════════════════════════
//
// Strategy: probe each source up to PROBE_RETRIES times before declaring it
// dead.  A slow CDN edge or transient TCP reset should not cause a false
// "refused" on the first attempt.  Jitter between retries avoids
// thundering-herd on the same edge server.
//
// Returns: "ok" | "refused" | "timeout"
// ═════════════════════════════════════════════════════════════════════════════

const PROBE_RETRIES      = 2;    // total attempts per source (1 initial + 1 retry)
const PROBE_RETRY_DELAY  = 800;  // ms between attempts
const PROBE_TIMEOUT_FAST = 2500; // ms — first attempt
const PROBE_TIMEOUT_SLOW = 4000; // ms — retry attempt (more generous)

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
  // First attempt — fast timeout
  const first = await _singleProbe(url, PROBE_TIMEOUT_FAST);
  if (first === "ok") return "ok";

  // Brief pause then retry with a more generous timeout
  await new Promise((r) => setTimeout(r, PROBE_RETRY_DELAY));
  const second = await _singleProbe(url, PROBE_TIMEOUT_SLOW);
  return second;
}


// ═════════════════════════════════════════════════════════════════════════════
// WORKING SOURCE FINDER  —  hardened with per-source double-probe
// ═════════════════════════════════════════════════════════════════════════════
//
// Each source is probed twice (via probeUrl above) before being discarded.
// The preferred source gets zero stagger delay so it wins on good connections.
// A second tier of sources starts 200 ms later; third tier at 500 ms.
// This means:
//   - Fast connection  → preferred source wins immediately
//   - Slow connection  → retry buys enough time for the preferred to respond
//   - Dead source      → two full probe rounds exhaust before next source wins
// ═════════════════════════════════════════════════════════════════════════════

const _sourceCache     = new Map();
const SOURCE_CACHE_TTL = 15 * 60 * 1000;

export async function findWorkingSource(type, id, season = null, episode = null, preferredId = null) {
  const cacheKey = `${type}|${id}|${season ?? ""}|${episode ?? ""}`;
  const cached   = _sourceCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.sourceId;

  const restricted = isRestrictedBrowser();
  const sources    = PLAYER_SOURCES.filter((s) => {
    if (s.async) return false;
    if (restricted && !s.browserSafe) return false;
    return true;
  });

  const racePromises = sources.map((src) => {
    // Stagger: preferred = 0 ms, tier 1 = 0 ms, tier 2 = 200 ms, tier 3 = 500 ms
    let delay = 0;
    if (src.id !== preferredId) {
      if (restricted) {
        delay = ((src.browserPriority ?? 5) - 1) * 120;
      } else {
        delay = src.tier === 1 ? 0 : src.tier === 2 ? 200 : 500;
      }
    }

    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        const url    = type === "movie" ? src.movieUrl(id) : src.tvUrl(id, season, episode);
        // probeUrl already does double-retry internally
        const result = await probeUrl(url);
        if (result === "ok") resolve(src.id);
        else reject();
      }, delay);
    });
  });

  const defaultSource = getDefaultSource();
  try {
    const winner = await Promise.any(racePromises);
    _sourceCache.set(cacheKey, { sourceId: winner, expiresAt: Date.now() + SOURCE_CACHE_TTL });
    return winner;
  } catch {
    // All sources failed probe — still return preferred/default so WatchPage
    // can attempt anyway (iframe sometimes loads even when HEAD is blocked)
    const fallback = preferredId ?? defaultSource;
    _sourceCache.set(cacheKey, { sourceId: fallback, expiresAt: Date.now() + 2 * 60 * 1000 });
    return fallback;
  }
}

// Invalidate source cache for a specific content item (called after a confirmed failure)
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