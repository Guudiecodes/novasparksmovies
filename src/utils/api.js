const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p";

export const imgUrl = (path, size = "w500") =>
  path ? `${IMG_BASE}/${size}${path}` : null;

let _onAuthError = null;
let _onUnreachable = null;
export const setApiErrorHandlers = (onAuth, onUnreachable) => {
  _onAuthError = onAuth;
  _onUnreachable = onUnreachable;
};

const _tmdbCache = new Map();
const TMDB_CACHE_TTL = 5 * 60 * 1000;

let _inflight = 0;
const MAX_INFLIGHT = 4;
const _waiters = [];

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
  const cached = _tmdbCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;
  await _acquireSlot();
  let res;
  try {
    const sep = path.includes("?") ? "&" : "?";
    res = await fetch(`${TMDB_BASE}${path}${sep}api_key=${apiKey}`);
  } catch {
    _releaseSlot();
    _onUnreachable?.();
    throw new Error("TMDB unreachable");
  }
  _releaseSlot();
  if (res.status === 401 || res.status === 403) { _onAuthError?.(); throw new Error(`TMDB ${res.status}`); }
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  _tmdbCache.set(cacheKey, { data, expiresAt: Date.now() + TMDB_CACHE_TTL });
  if (_tmdbCache.size > 80) {
    const now = Date.now();
    for (const [k, v] of _tmdbCache) { if (now >= v.expiresAt) _tmdbCache.delete(k); }
  }
  return data;
};

// ===== PLAYER SOURCES — fastest / cleanest loaders first =====
// Tier 1: load player directly, no intermediate "FETCHING ONE MOMENT" screens
// Tier 2: fallbacks — may show loading text on their own pages
export const PLAYER_SOURCES = [
  {
    id: "vidlink",
    label: "Server 1",
    tag: null,
    note: "Fast",
    supportsProgress: true,
    movieUrl: (id) => `https://vidlink.pro/movie/${id}?autoplay=true`,
    tvUrl:    (id, season, ep) => `https://vidlink.pro/tv/${id}/${season}/${ep}?autoplay=true`,
  },
  {
    id: "moviesapi",
    label: "Server 2",
    tag: null,
    note: "Fast",
    supportsProgress: true,
    movieUrl: (id) => `https://moviesapi.club/movie/${id}`,
    tvUrl:    (id, season, ep) => `https://moviesapi.club/tv/${id}-${season}-${ep}`,
  },
  {
    id: "embedsu",
    label: "Server 3",
    tag: null,
    note: "Fast",
    supportsProgress: true,
    movieUrl: (id) => `https://embed.su/embed/movie/${id}`,
    tvUrl:    (id, season, ep) => `https://embed.su/embed/tv/${id}/${season}/${ep}`,
  },
  {
    id: "vidsrcto",
    label: "Server 4",
    tag: null,
    note: "Fast",
    supportsProgress: true,
    movieUrl: (id) => `https://vidsrc.to/embed/movie/${id}`,
    tvUrl:    (id, season, ep) => `https://vidsrc.to/embed/tv/${id}/${season}/${ep}`,
  },
  {
    id: "smashy",
    label: "Server 5",
    tag: null,
    note: "Fast",
    supportsProgress: true,
    movieUrl: (id) => `https://player.smashy.stream/movie/${id}`,
    tvUrl:    (id, season, ep) => `https://player.smashy.stream/tv/${id}?s=${season}&e=${ep}`,
  },
  // ===== FALLBACKS — kept for manual selection =====
  {
    id: "vidfast",
    label: "Server 6",
    tag: null,
    note: null,
    supportsProgress: true,
    movieUrl: (id) => `https://vidfast.pro/movie/${id}?autoPlay=true`,
    tvUrl:    (id, season, ep) => `https://vidfast.pro/tv/${id}/${season}/${ep}?autoPlay=true`,
  },
  {
    id: "videasy",
    label: "Server 7",
    tag: null,
    note: null,
    supportsProgress: true,
    movieUrl: (id) => `https://player.videasy.net/movie/${id}`,
    tvUrl:    (id, season, ep) => `https://player.videasy.net/tv/${id}/${season}/${ep}`,
  },
  {
    id: "autoembed",
    label: "Server 8",
    tag: null,
    note: null,
    supportsProgress: true,
    progressViaFrames: true,
    movieUrl: (id) => `https://player.autoembed.cc/embed/movie/${id}`,
    tvUrl:    (id, season, ep) => `https://player.autoembed.cc/embed/tv/${id}/${season}/${ep}`,
  },
  {
    id: "vidsrc_cc",
    label: "Server 9",
    tag: null,
    note: null,
    supportsProgress: true,
    progressViaFrames: true,
    movieUrl: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
    tvUrl:    (id, season, ep) => `https://vidsrc.cc/v2/embed/tv/${id}/${season}/${ep}`,
  },
  {
    id: "allmanga",
    label: "NsManga",
    tag: "ANIME",
    note: null,
    supportsProgress: true,
    async: true,
    movieUrl: (_id) => "https://allmanga.to",
    tvUrl:    (_id, _season, _ep) => "https://allmanga.to",
  },
];

export const getSourceUrl = (sourceId, type, id, season, ep) => {
  const src = PLAYER_SOURCES.find((s) => s.id === sourceId) ?? PLAYER_SOURCES[0];
  return type === "movie" ? src.movieUrl(id) : src.tvUrl(id, season, ep);
};

export const sourceSupportsProgress = (sourceId) =>
  PLAYER_SOURCES.find((s) => s.id === sourceId)?.supportsProgress ?? false;

export const sourceProgressViaFrames = (sourceId) =>
  PLAYER_SOURCES.find((s) => s.id === sourceId)?.progressViaFrames ?? false;

export const sourceIsAsync = (sourceId) =>
  PLAYER_SOURCES.find((s) => s.id === sourceId)?.async ?? false;

export const NEEDS_INTERCEPT = ["vidsrc_cc", "autoembed", "vidlink"];

async function testUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    await fetch(url, { method: "HEAD", mode: "no-cors", signal: controller.signal });
    clearTimeout(timeout);
    return true;
  } catch { return false; }
}

/**
 * findWorkingSource — only auto-switches if the preferred/stored source fails.
 * If the preferredId source is reachable, it always wins. This prevents the app
 * from jumping to Server 6 when Server 1 is perfectly alive.
 */
export async function findWorkingSource(type, id, season = null, episode = null, preferredId = null) {
  const sources = PLAYER_SOURCES.filter((s) => !s.tag || s.tag === "ANIME");

  // Always try the preferred (stored) source first — if alive, use it, done.
  if (preferredId) {
    const preferred = sources.find((s) => s.id === preferredId);
    if (preferred) {
      const url = type === "movie" ? preferred.movieUrl(id) : preferred.tvUrl(id, season, episode);
      if (await testUrl(url)) return preferred.id;
    }
  }

  // Preferred is dead — scan the rest in order (Tier 1 first)
  const remaining = sources.filter((s) => s.id !== preferredId);
  const BATCH = 3;
  for (let i = 0; i < remaining.length; i += BATCH) {
    const batch = remaining.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (src) => {
        const url = type === "movie" ? src.movieUrl(id) : src.tvUrl(id, season, episode);
        const ok = await testUrl(url);
        return { id: src.id, ok };
      }),
    );
    const winner = results.find((r) => r.ok);
    if (winner) return winner.id;
  }

  return NON_ANIME_DEFAULT_SOURCE;
}

const ANILIST_API = "https://graphql.anilist.co";

export const cleanAnilistDescription = (desc) => {
  if (!desc) return desc;
  let clean = desc
    .split("<")
    .map((chunk, i) => (i === 0 ? chunk : chunk.slice(chunk.indexOf(">") + 1)))
    .join("")
    .replace(/>/g, "");
  clean = clean.replace(/\(Source:[^)]*\)/gi, "");
  clean = clean.replace(/\bNote:[^\n]*/gi, "");
  clean = clean.replace(/[\s\n]+$/, "").trim();
  return clean;
};

const ANILIST_QUERY = `
query ($search: String, $type: MediaType) {
  Media(search: $search, type: $type, sort: SEARCH_MATCH) {
    id
    idMal
    title { romaji english native }
    description(asHtml: false)
    coverImage { extraLarge large }
    bannerImage
    genres
    averageScore
    episodes
    status
    season
    seasonYear
    studios(isMain: true) { nodes { name } }
    startDate { year month }
    relations {
      edges {
        relationType
        node {
          id
          type
          format
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
    const raw = localStorage.getItem(ANILIST_CACHE_KEY);
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
  const cacheKey = tmdbId ? `${type}__tmdb_${tmdbId}` : `${type}__${title.toLowerCase().trim()}`;
  const cache = getAnilistCache();
  const entry = cache[cacheKey];
  if (entry && Date.now() - entry.ts <= ANILIST_CACHE_TTL) {
    const cachedTitles = [entry.data?.title?.romaji, entry.data?.title?.english, entry.data?.title?.native]
      .filter(Boolean).map((t) => t.toLowerCase());
    const searchTitle = title.toLowerCase();
    const isMismatch = entry.data !== null && cachedTitles.length > 0 &&
      !cachedTitles.some((t) => t.includes(searchTitle) || searchTitle.includes(t));
    if (!isMismatch) return entry.data;
    delete cache[cacheKey];
    flushAnilistCache();
  }
  try {
    const res = await fetch(ANILIST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: title, type } }),
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
    id: anilistData.id,
    title: anilistData.title?.english || anilistData.title?.romaji || anilistData.title?.native,
    episodes: anilistData.episodes || null,
    year: anilistData.startDate?.year || anilistData.seasonYear || 9999,
    month: anilistData.startDate?.month || 0,
  };
  const sequels = (anilistData.relations?.edges || [])
    .filter((e) => e.relationType === "SEQUEL" && e.node.type === "ANIME" && (e.node.format === "TV" || e.node.format === "TV_SHORT"))
    .map((e) => ({
      id: e.node.id,
      title: e.node.title?.english || e.node.title?.romaji,
      episodes: e.node.episodes || null,
      year: e.node.startDate?.year || e.node.seasonYear || 9999,
      month: e.node.startDate?.month || 0,
    }));
  const all = [main, ...sequels].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  return all.map((s, i) => ({ seasonNum: i + 1, ...s }));
};

export const isAnimeContent = (item, details) => {
  const d = details || item;
  const lang = d.original_language;
  const countries = d.origin_country || [];
  const genreIds = d.genre_ids || (d.genres || []).map((g) => g.id);
  const hasAnimation = genreIds.includes(16);
  return hasAnimation && (lang === "ja" || countries.includes("JP"));
};

export const ANIME_DEFAULT_SOURCE = "allmanga";
export const NON_ANIME_DEFAULT_SOURCE = "vidlink";

const EG_CACHE_KEY = "novaspark_episodeGroupCache";
const EG_CACHE_TTL = 1000 * 60 * 60 * 24 * 7;

let _egCache = null;
function getEgCache() {
  if (_egCache) return _egCache;
  try {
    const raw = localStorage.getItem(EG_CACHE_KEY);
    _egCache = raw ? JSON.parse(raw) : {};
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