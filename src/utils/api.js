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
// Labels use NS numbering for public confidentiality.
// NS 1–6 live in /api/sources.js (non-embed AD-free path).
// NS 7–20 are the embed iframe sources below.
// Dead servers removed: primesrc, vapsrc, cinezo, smashystream, twoembed, vidbinge, vidupto
// ═════════════════════════════════════════════════════════════════════════════

export const PLAYER_SOURCES = [

  // ── TIER 1 ───────────────────────────────────────────────────────────────

  {
    id: "vidlink",
    label: "NS 7",
    tag: null, note: "★ Fast",
    tier: 1, moviePriority: 1, tvPriority: 1,
    browserPriority: 1, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://vidlink.pro/movie/${id}?ads=0`,
    tvUrl:    (id, s, e) => `https://vidlink.pro/tv/${id}/${s}/${e}?ads=0`,
  },

  {
    id: "videasy",
    label: "NS 8",
    tag: null, note: "★ Fast",
    tier: 1, moviePriority: 2, tvPriority: 2,
    browserPriority: 2, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://player.videasy.net/movie/${id}`,
    tvUrl:    (id, s, e) => `https://player.videasy.net/tv/${id}/${s}/${e}`,
  },

  {
    id: "multiembed",
    label: "NS 9",
    tag: null, note: "★ Multi-Server",
    tier: 1, moviePriority: 3, tvPriority: 3,
    browserPriority: 3, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1&server=2`,
    tvUrl:    (id, s, e) => `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}&server=2`,
  },

  // ── TIER 2 ───────────────────────────────────────────────────────────────

  {
    id: "autoembed",
    label: "NS 10",
    tag: null, note: "★ Aggregator",
    tier: 2, moviePriority: 4, tvPriority: 4,
    browserPriority: 4, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://player.autoembed.cc/embed/movie/${id}?server=1`,
    tvUrl:    (id, s, e) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}?server=1`,
  },

  {
    id: "vidsrc_cc",
    label: "NS 11",
    tag: null, note: "★ HD",
    tier: 2, moviePriority: 5, tvPriority: 5,
    browserPriority: 5, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
    tvUrl:    (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
  },

  // ── TIER 3 ───────────────────────────────────────────────────────────────

  {
    id: "vidsrc_me",
    label: "NS 12",
    tag: null, note: null,
    tier: 3, moviePriority: 6, tvPriority: 6,
    browserPriority: 6, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://vidsrc.me/embed/movie?tmdb=${id}`,
    tvUrl:    (id, s, e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },

  {
    id: "vidfast",
    label: "NS 13",
    tag: null, note: "★ Multi",
    tier: 3, moviePriority: 7, tvPriority: 7,
    browserPriority: 7, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://vidfast.pro/movie/${id}`,
    tvUrl:    (id, s, e) => `https://vidfast.pro/tv/${id}/${s}/${e}`,
  },

  {
    id: "mapple",
    label: "NS 14",
    tag: null, note: "★ 4K",
    tier: 3, moviePriority: 8, tvPriority: 8,
    browserPriority: 8, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://mapple.uk/watch/movie/${id}?nextButton=true&autoPlay=true&autoNext=true`,
    tvUrl:    (id, s, e) => `https://mapple.uk/watch/tv/${id}-${s}-${e}?nextButton=true&autoPlay=true&autoNext=true`,
  },

  {
    id: "pstream",
    label: "NS 15",
    tag: null, note: null,
    tier: 3, moviePriority: 9, tvPriority: 9,
    browserPriority: 9, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://iframe.pstream.mov/embed/tmdb-movie-${id}`,
    tvUrl:    (id, s, e) => `https://iframe.pstream.mov/embed/tmdb-tv-${id}/${s}/${e}`,
  },

  {
    id: "vidcorenl",
    label: "NS 16",
    tag: null, note: "★ Multi",
    tier: 3, moviePriority: 10, tvPriority: 10,
    browserPriority: 10, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://vidcore.net/movie/${id}?autoplay=true`,
    tvUrl:    (id, s, e) => `https://vidcore.net/tv/${id}/${s}/${e}?autoplay=true`,
  },

  {
    id: "vidsrcnl",
    label: "NS 17",
    tag: null, note: "★ Multi",
    tier: 3, moviePriority: 11, tvPriority: 11,
    browserPriority: 11, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://player.vidsrc.nl/embed/movie/${id}`,
    tvUrl:    (id, s, e) => `https://player.vidsrc.nl/embed/tv/${id}/${s}/${e}`,
  },

  {
    id: "peachify",
    label: "NS 18",
    tag: null, note: null,
    tier: 3, moviePriority: 12, tvPriority: 12,
    browserPriority: 12, browserSafe: true, supportsProgress: true,
    movieUrl: (id) => `https://peachify.top/embed/movie/${id}?autoPlay=true`,
    tvUrl:    (id, s, e) => `https://peachify.top/embed/tv/${id}/${s}/${e}?autoPlay=true`,
  },

  {
    id: "vidsrc_xyz",
    label: "NS 19",
    tag: null, note: null,
    tier: 3, moviePriority: 13, tvPriority: 13,
    browserPriority: 13, browserSafe: true, supportsProgress: true,
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
// RETRY QUEUE
// ═════════════════════════════════════════════════════════════════════════════

export function buildRetryQueue(type, preferredId) {
  const eligible = PLAYER_SOURCES
    .filter((s) => !s.async && !s.tag)
    .sort((a, b) => {
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
// PRE-FLIGHT URL PROBE
// ═════════════════════════════════════════════════════════════════════════════

const PROBE_RETRIES      = 2;
const PROBE_RETRY_DELAY  = 250;
const PROBE_TIMEOUT_FAST = 1800;
const PROBE_TIMEOUT_SLOW = 2800;

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
// WORKING SOURCE FINDER
// ═════════════════════════════════════════════════════════════════════════════

const _sourceCache     = new Map();
const SOURCE_CACHE_TTL = 15 * 60 * 1000;

export async function findWorkingSource(type, id, season = null, episode = null, preferredId = null) {
  const cacheKey = `${type}|${id}|${season ?? ""}|${episode ?? ""}`;
  const cached   = _sourceCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.sourceId;

  const sources = PLAYER_SOURCES.filter((s) => !s.async);

  const racePromises = sources.map((src) => {
    let delay = 0;
    if (src.id !== preferredId) {
      delay = src.tier === 1 ? 0 : src.tier === 2 ? 150 : 400;
    }
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        const url    = type === "movie" ? src.movieUrl(id) : src.tvUrl(id, season, episode);
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