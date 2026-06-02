/**
 * ReelPage.jsx — NovaSpark Cinema Reels
 *
 * ROOT CAUSE FIX:
 *  Kinocheck returns 403 "Host not in allowlist" from Vercel/any deployed domain.
 *  Removed Kinocheck entirely. All trailer data now comes from TMDB exclusively:
 *    1. Fetch movie list from 4 rotating TMDB sources
 *    2. For each movie batch, fetch /movie/{id}/videos in parallel
 *    3. Pick the best English official trailer (YouTube, official=true, type=Trailer, iso_639_1=en)
 *    4. Fall back to Teaser if no Trailer found
 *  This works from ANY domain, zero third-party dependency on Kinocheck.
 *
 * ARCHITECTURE:
 *  - Infinite no-repeat pool: _seenIds Set persists entire session
 *  - English-only: TMDB original_language=en + video iso_639_1=en filter
 *  - Smart scoring: vote_average × log(vote_count) with top/discovery interleave
 *  - 4 TMDB rotating sources: trending, popular, top_rated, upcoming
 *  - Background prefetch: refills when pool < 15
 *  - Parallel video fetching: batches of 6 movies fetched simultaneously
 *
 * PLAYER:
 *  - Full-bleed iframe: 120% × 140%, offset -20% top / -10% left
 *  - Muted autoplay (browser policy). Unmutes on first tap.
 *  - muted/active in separate effects — NEVER restarts video on mute toggle
 *  - onBlocked → advance reel automatically
 *
 * BUG FIXES (permanent):
 *  - Rail button taps no longer skip reels: ALL pointer/touch events stopped
 *    on every button AND on the rail container. Touch swipe threshold 60px.
 *  - English-only enforced at TMDB movie level AND video level (iso_639_1=en)
 *  - Ghost icon rail: zero background, zero border, zero shadow
 *  - Share: ONLY shares app URL (?v=tmdb_id). YouTube IDs never exposed.
 *  - Watchlist: onSave / savedItems wired, deduped by tmdb_id
 *
 * ELECTRON:
 *  - Kinocheck webview still works in Electron (no allowlist restriction there)
 *  - Web path uses TMDB-sourced YouTube ID in youtube-nocookie embed
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── ENV ──────────────────────────────────────────────────────────────────────
const IS_ELECTRON = typeof window !== "undefined" && !!window.electron;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TMDB_BASE    = "https://api.themoviedb.org/3";
const KINO         = "https://api.kinocheck.com"; // Electron only
const START_OFFSET = 20;
const END_BUFFER   = 10;
const APP_ORIGIN   = "https://novasparks-gen.vercel.app";

// ─── NAV ──────────────────────────────────────────────────────────────────────
const NAV = [
  {
    id: "home", label: "Home",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
      </svg>
    ),
  },
  {
    id: "search", label: "Search",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
  },
  {
    id: "history", label: "Library",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
  {
    id: "downloads", label: "Downloads",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    ),
  },
  {
    id: "settings", label: "Settings",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
];

// ─── URL BUILDERS ─────────────────────────────────────────────────────────────

function buildKinoSrc(videoId) {
  return `https://api.kinocheck.com/embed?yt=${videoId}&autoplay=1&muted=0`;
}

function buildYTSrc(videoId) {
  const p = new URLSearchParams({
    autoplay:       "1",
    mute:           "1",
    controls:       "0",
    modestbranding: "1",
    rel:            "0",
    showinfo:       "0",
    iv_load_policy: "3",
    disablekb:      "1",
    fs:             "0",
    playsinline:    "1",
    loop:           "1",
    playlist:       videoId,
    enablejsapi:    "1",
    start:          String(START_OFFSET),
    hl:             "en",
    cc_lang_pref:   "en",
    cc_load_policy: "1",
    origin: typeof window !== "undefined" ? window.location.origin : APP_ORIGIN,
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${p}`;
}

function ytMsg(iframe, obj) {
  try { iframe?.contentWindow?.postMessage(JSON.stringify(obj), "*"); } catch {}
}

// ─── SHUFFLE ENGINE ───────────────────────────────────────────────────────────

function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    const j = (s >>> 0) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── SESSION STATE (never resets until page refresh) ──────────────────────────
const _seenIds   = new Set();  // YouTube video IDs already shown
const _seenMovies = new Set(); // TMDB movie IDs already fetched
const _pool      = [];
let   _fetching  = false;
const _SEED      = Date.now();
const _tmdbPages = [1, 1, 1, 1];

const TMDB_SOURCES = [
  (k, p) => `${TMDB_BASE}/trending/movie/week?api_key=${k}&page=${p}&language=en-US`,
  (k, p) => `${TMDB_BASE}/movie/popular?api_key=${k}&page=${p}&language=en-US`,
  (k, p) => `${TMDB_BASE}/movie/top_rated?api_key=${k}&page=${p}&language=en-US`,
  (k, p) => `${TMDB_BASE}/movie/upcoming?api_key=${k}&page=${p}&language=en-US`,
];

/**
 * Pick the best English trailer from TMDB video results.
 * Priority: official Trailer in English > any Trailer in English > Teaser in English
 */
function pickBestTrailer(videos) {
  const results = (videos || []).filter(v =>
    v.site === "YouTube" &&
    v.key &&
    (v.iso_639_1 === "en" || !v.iso_639_1) &&
    (v.type === "Trailer" || v.type === "Teaser")
  );

  // Official English Trailer first
  const officialTrailer = results.find(v => v.type === "Trailer" && v.official === true && v.iso_639_1 === "en");
  if (officialTrailer) return officialTrailer.key;

  // Any English Trailer
  const anyTrailer = results.find(v => v.type === "Trailer" && v.iso_639_1 === "en");
  if (anyTrailer) return anyTrailer.key;

  // English Teaser fallback
  const teaser = results.find(v => v.type === "Teaser" && v.iso_639_1 === "en");
  if (teaser) return teaser.key;

  // Last resort: any English YouTube video
  const anyEn = results.find(v => v.iso_639_1 === "en");
  if (anyEn) return anyEn.key;

  return null;
}

/**
 * fillPool — TMDB-only, no Kinocheck.
 * 1. Fetch a page of movies from a rotating source
 * 2. Filter to original_language=en, not seen, has a poster
 * 3. Batch-fetch /movie/{id}/videos for all movies in parallel (6 at a time)
 * 4. Score, shuffle, interleave top/discovery, push to pool
 */
async function fillPool(apiKey) {
  if (_fetching) return;
  _fetching = true;
  try {
    // Rotate through all 4 TMDB sources — fetch 2 pages at a time for variety
    const srcIdx  = (_pool.length === 0 ? 0 : Math.floor(Math.random() * 4));
    const page    = _tmdbPages[srcIdx];
    _tmdbPages[srcIdx]++;

    const url = TMDB_SOURCES[srcIdx](apiKey, page);
    let movies = [];
    try {
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        movies = (d.results || []).filter(m =>
          m.original_language === "en" &&
          m.poster_path &&
          !_seenMovies.has(m.id)
        );
      }
    } catch {}

    if (movies.length === 0) return;

    // Mark movies as seen before fetching videos (prevents double-fetch on concurrent calls)
    movies.forEach(m => _seenMovies.add(m.id));

    // Parallel video fetch — 6 at a time to stay within rate limits
    const BATCH = 6;
    const reels = [];
    for (let i = 0; i < movies.length; i += BATCH) {
      const slice = movies.slice(i, i + BATCH);
      const videoResults = await Promise.allSettled(
        slice.map(m =>
          fetch(`${TMDB_BASE}/movie/${m.id}/videos?api_key=${apiKey}&language=en-US`)
            .then(r => r.ok ? r.json() : { results: [] })
            .then(d => ({ movie: m, videos: d.results || [] }))
            .catch(() => ({ movie: m, videos: [] }))
        )
      );

      for (const result of videoResults) {
        if (result.status !== "fulfilled") continue;
        const { movie: m, videos } = result.value;

        const youtubeId = pickBestTrailer(videos);
        if (!youtubeId) continue;           // no English trailer — skip
        if (_seenIds.has(youtubeId)) continue; // already shown this trailer

        const genres = (m.genre_ids || []).slice(0, 2).map(id => GENRE_MAP[id]).filter(Boolean);

        reels.push({
          id:        youtubeId,
          youtubeId,
          tmdb_id:   m.id,
          title:     m.title || m.original_title || "Unknown",
          overview:  m.overview  || "",
          genres,
          rating:    m.vote_average ? +m.vote_average.toFixed(1) : null,
          duration:  m.runtime    || null,
          tmdbObj:   m,
          _score:    (m.vote_average || 5) * Math.log((m.vote_count || 1) + 1),
        });
      }
    }

    if (reels.length === 0) return;

    const shuffled = seededShuffle(reels, _SEED ^ (_pool.length * 2654435761));

    // Interleave: top-scored with discovery
    const sorted = [...shuffled].sort((a, b) => b._score - a._score);
    const top    = sorted.slice(0, Math.ceil(sorted.length / 2));
    const disc   = sorted.slice(Math.ceil(sorted.length / 2));
    const mixed  = [];
    for (let i = 0; i < Math.max(top.length, disc.length); i++) {
      if (i < top.length)  mixed.push(top[i]);
      if (i < disc.length) mixed.push(disc[i]);
    }
    _pool.push(...mixed);
  } finally {
    _fetching = false;
  }
}

async function fetchReels(apiKey, count = 12) {
  // Retry up to 4x — TMDB is reliable but first page of videos may be sparse
  for (let attempt = 0; attempt < 4 && _pool.length < count; attempt++) {
    await fillPool(apiKey);
    if (_pool.length === 0) await new Promise(r => setTimeout(r, 600));
  }
  const result = [];
  while (result.length < count && _pool.length > 0) {
    const reel = _pool.shift();
    if (_seenIds.has(reel.id)) continue;
    _seenIds.add(reel.id);
    result.push(reel);
  }
  // Background prefetch — keeps pool full
  if (_pool.length < 15) setTimeout(() => fillPool(apiKey), 0);
  return result;
}

// TMDB genre ID → name map
const GENRE_MAP = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
  80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
  14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
  9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie",
  53: "Thriller", 10752: "War", 37: "Western",
};

// ─── SHARE ────────────────────────────────────────────────────────────────────
function buildShareUrl(reel) {
  if (reel.tmdb_id) return `${APP_ORIGIN}/reel?v=${reel.tmdb_id}`;
  return APP_ORIGIN;
}

async function shareReel(reel) {
  const url   = buildShareUrl(reel);
  const title = reel.title || "Watch on NovaSpark";
  const text  = reel.overview
    ? `${title} — ${reel.overview.slice(0, 100).trim()}...`
    : `${title} — Watch now on NovaSpark`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "aborted";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────

function ProgressBar({ active, duration }) {
  const [pct, setPct]   = useState(0);
  const rafRef          = useRef(null);
  const startRef        = useRef(null);
  const totalMs = Math.max(60000, (((duration || 2.5) * 60) - START_OFFSET - END_BUFFER) * 1000);

  useEffect(() => {
    if (!active) { setPct(0); cancelAnimationFrame(rafRef.current); return; }
    startRef.current = performance.now();
    const tick = (now) => {
      const next = Math.min(((now - startRef.current) / totalMs) * 100, 100);
      setPct(next);
      if (next < 100) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, totalMs]);

  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.06)", zIndex: 40 }}>
      <div style={{
        height: "100%",
        width: `${pct}%`,
        background: "linear-gradient(90deg, #00e5cc, #00b4ff, #a78bfa)",
        boxShadow: "0 0 8px rgba(0,229,204,0.5)",
        transition: "width 0.12s linear",
        borderRadius: "0 2px 2px 0",
      }} />
    </div>
  );
}

// ─── PLAYER ───────────────────────────────────────────────────────────────────

function YTPlayer({ videoId, active, muted, onBlocked, hasInteracted }) {
  const iframeRef  = useRef(null);
  const webviewRef = useRef(null);
  const [ready,  setReady]  = useState(false);
  const [loaded, setLoaded] = useState(false);
  const blockedRef = useRef(false);
  const activeRef  = useRef(active);
  const readyRef   = useRef(false);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { readyRef.current  = ready;  }, [ready]);

  useEffect(() => {
    setReady(false);
    setLoaded(false);
    blockedRef.current = false;
    readyRef.current   = false;
  }, [videoId]);

  // ── ELECTRON: Kinocheck webview polling ───────────────────────────────────
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const wv = webviewRef.current;
    if (!wv || !loaded) return;

    const CHECK = `(function(){
      var v = document.querySelector('video');
      if (!v) return 'loading';
      if (v.error) return 'error';
      if (v.ended) return 'ended';
      if (!v.paused && v.readyState >= 2 && v.currentTime > 0) return 'playing';
      return 'loading';
    })()`;

    const applyMute = (m) => {
      const js = m
        ? `(function(){var v=document.querySelector('video');if(v)v.muted=true;})()`
        : `(function(){var v=document.querySelector('video');if(v){v.muted=false;v.volume=1;}})()`;
      wv.executeJavaScript(js).catch(() => {});
    };

    const nudge = setTimeout(() => {
      if (wv.isDestroyed?.()) return;
      wv.executeJavaScript(`(function(){var v=document.querySelector('video');if(v&&v.paused)v.play().catch(function(){});})()`).catch(() => {});
      applyMute(muted);
    }, 1200);

    const poll = setInterval(() => {
      if (wv.isDestroyed?.()) { clearInterval(poll); return; }
      wv.executeJavaScript(CHECK).then((state) => {
        if (!activeRef.current) return;
        if (state === "playing" && !readyRef.current) setReady(true);
        if ((state === "ended" || state === "error") && !blockedRef.current) {
          blockedRef.current = true;
          clearInterval(poll);
          onBlocked?.();
        }
      }).catch(() => {});
    }, 700);

    const hard = setTimeout(() => { if (!readyRef.current) setReady(true); }, 5000);
    return () => { clearTimeout(nudge); clearInterval(poll); clearTimeout(hard); };
  }, [loaded, videoId]); // eslint-disable-line

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const wv = webviewRef.current;
    if (!wv || !loaded || wv.isDestroyed?.()) return;
    const js = muted
      ? `(function(){var v=document.querySelector('video');if(v)v.muted=true;})()`
      : `(function(){var v=document.querySelector('video');if(v){v.muted=false;v.volume=1;}})()`;
    wv.executeJavaScript(js).catch(() => {});
  }, [muted, loaded]);

  // ── WEB: YT iframe postMessage ────────────────────────────────────────────

  useEffect(() => {
    if (IS_ELECTRON || !loaded || !iframeRef.current) return;
    const ifr = iframeRef.current;
    ytMsg(ifr, { event: "listening" });
    ytMsg(ifr, { event: "command", func: "addEventListener", args: ["onStateChange"] });
    ytMsg(ifr, { event: "command", func: "addEventListener", args: ["onError"] });
    const t = setTimeout(() => {
      if (active) {
        ytMsg(ifr, { event: "command", func: "playVideo", args: [] });
        ytMsg(ifr, { event: "command", func: "mute",      args: [] });
      } else {
        ytMsg(ifr, { event: "command", func: "pauseVideo", args: [] });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [loaded]); // eslint-disable-line

  // active ONLY — never touches mute
  useEffect(() => {
    if (IS_ELECTRON || !loaded || !iframeRef.current) return;
    if (active) {
      ytMsg(iframeRef.current, { event: "command", func: "playVideo",  args: [] });
    } else {
      ytMsg(iframeRef.current, { event: "command", func: "pauseVideo", args: [] });
    }
  }, [active]); // eslint-disable-line

  // muted ONLY — never restarts video
  useEffect(() => {
    if (IS_ELECTRON || !loaded || !iframeRef.current || !active) return;
    if (muted) {
      ytMsg(iframeRef.current, { event: "command", func: "mute",      args: [] });
    } else {
      ytMsg(iframeRef.current, { event: "command", func: "unMute",    args: [] });
      ytMsg(iframeRef.current, { event: "command", func: "setVolume", args: [100] });
    }
  }, [muted]); // eslint-disable-line

  useEffect(() => {
    if (IS_ELECTRON || !hasInteracted || !loaded || !iframeRef.current || !active) return;
    if (!muted) {
      ytMsg(iframeRef.current, { event: "command", func: "unMute",    args: [] });
      ytMsg(iframeRef.current, { event: "command", func: "setVolume", args: [100] });
    }
  }, [hasInteracted]); // eslint-disable-line

  useEffect(() => {
    if (IS_ELECTRON) return;
    const fn = (e) => {
      if (!e.data) return;
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.event === "onStateChange") {
          if (d.info === 1 && activeRef.current) setReady(true);
          if (d.info === 0 && activeRef.current && !blockedRef.current) {
            blockedRef.current = true; onBlocked?.();
          }
        }
        if (d?.event === "onError" && activeRef.current && !blockedRef.current) {
          blockedRef.current = true; onBlocked?.();
        }
        if (d?.event === "infoDelivery") {
          if (d?.info?.playerState === 1 && activeRef.current) setReady(true);
          if (d?.info?.playerState === 0 && activeRef.current && !blockedRef.current) {
            blockedRef.current = true; onBlocked?.();
          }
        }
      } catch {}
    };
    window.addEventListener("message", fn);
    return () => window.removeEventListener("message", fn);
  }, [onBlocked]);

  useEffect(() => {
    if (IS_ELECTRON || !active || !loaded) return;
    const t = setTimeout(() => { if (!readyRef.current) setReady(true); }, 7000);
    return () => clearTimeout(t);
  }, [active, loaded, videoId]);

  const embedStyle = {
    position: "absolute",
    top: "-20%", left: "-10%",
    width: "120%", height: "140%",
    border: "none",
    pointerEvents: "none",
    display: "block",
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", overflow: "hidden" }}>
      {IS_ELECTRON ? (
        <webview
          ref={webviewRef}
          src={buildKinoSrc(videoId)}
          partition="persist:trailer"
          allowpopups="false"
          onLoad={() => setLoaded(true)}
          style={embedStyle}
        />
      ) : (
        <iframe
          ref={iframeRef}
          src={buildYTSrc(videoId)}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          frameBorder="0"
          title="reel"
          onLoad={() => setLoaded(true)}
          style={embedStyle}
        />
      )}

      {/* Cinematic vignette */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none",
        background: `
          linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 22%),
          linear-gradient(to top,    rgba(0,0,0,1) 0%, rgba(0,0,0,0.75) 16%, rgba(0,0,0,0.12) 42%, transparent 62%)
        `,
      }} />

      {/* Loading overlay */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 25,
        background: "#06060a",
        pointerEvents: "none",
        opacity: ready ? 0 : 1,
        transition: ready ? "opacity 0.9s cubic-bezier(0.4,0,0.2,1)" : "none",
      }}>
        {!ready && (
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 18,
          }}>
            <div style={{ position: "relative", width: 52, height: 52 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.04)" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid transparent", borderTopColor: "#00e5cc", animation: "spin 0.8s linear infinite" }} />
              <div style={{ position: "absolute", inset: 7, borderRadius: "50%", border: "1px solid transparent", borderTopColor: "rgba(167,139,250,0.55)", animation: "spin 1.4s linear infinite reverse" }} />
            </div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, letterSpacing: 3.5, color: "rgba(255,255,255,0.18)", textTransform: "uppercase" }}>
              Loading
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ACTION BUTTON ────────────────────────────────────────────────────────────
/**
 * Ghost icon — NO background, NO border, NO box-shadow on wrapper.
 * ALL pointer/touch events stopped so nothing bubbles to scroll container.
 */
function ActionBtn({ children, label, active, count, onClick }) {
  const [pop, setPop] = useState(false);

  const stopAll = (e) => {
    e.stopPropagation();
    e.nativeEvent?.stopImmediatePropagation?.();
  };

  const handleClick = (e) => {
    stopAll(e);
    setPop(true);
    setTimeout(() => setPop(false), 150);
    onClick();
  };

  return (
    <button
      onPointerDown={stopAll}
      onPointerUp={stopAll}
      onPointerMove={stopAll}
      onPointerCancel={stopAll}
      onTouchStart={stopAll}
      onTouchEnd={stopAll}
      onTouchMove={stopAll}
      onTouchCancel={stopAll}
      onClick={handleClick}
      style={{
        all: "unset",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 5,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <div style={{
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: active ? "#00e5cc" : "rgba(255,255,255,0.92)",
        transform: pop ? "scale(0.68)" : "scale(1)",
        transition: "transform 0.15s cubic-bezier(0.34,1.56,0.64,1), color 0.18s",
        filter: active
          ? "drop-shadow(0 0 6px rgba(0,229,204,0.7))"
          : "drop-shadow(0 2px 4px rgba(0,0,0,0.8))",
        background: "none",
        border: "none",
        boxShadow: "none",
      }}>
        {children}
      </div>
      {(label || count !== undefined) && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: active ? "#00e5cc" : "rgba(255,255,255,0.45)",
          fontFamily: "'DM Mono', monospace",
          lineHeight: 1,
          transition: "color 0.18s",
          textShadow: "0 1px 4px rgba(0,0,0,0.9)",
        }}>
          {count !== undefined ? count : label}
        </span>
      )}
    </button>
  );
}

// ─── REEL CARD ────────────────────────────────────────────────────────────────

function ReelCard({ reel, active, muted, onToggleMute, onWatch, onSave, saved, onBlocked, hasInteracted }) {
  const [liked,      setLiked]      = useState(false);
  const [likeCount,  setLikeCount]  = useState(() => Math.floor(Math.random() * 18000) + 800);
  const [heart,      setHeart]      = useState(false);
  const [ripple,     setRipple]     = useState(null);
  const [shareState, setShareState] = useState(null);
  const lastTap = useRef(0);

  const handleTap = (e) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      const rect = e.currentTarget.getBoundingClientRect();
      setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: now });
      setTimeout(() => setRipple(null), 600);
      if (!liked) setLikeCount(c => c + 1);
      setLiked(true);
      setHeart(true);
      setTimeout(() => setHeart(false), 900);
    }
    lastTap.current = now;
  };

  const handleShare = async () => {
    const result = await shareReel(reel);
    if (result === "copied") {
      setShareState("copied");
      setTimeout(() => setShareState(null), 2200);
    } else if (result === "shared") {
      setShareState("shared");
      setTimeout(() => setShareState(null), 1500);
    }
  };

  const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div
      style={{ position: "absolute", inset: 0, background: "#000", overflow: "hidden" }}
      onClick={handleTap}
    >
      <YTPlayer
        videoId={reel.youtubeId}
        active={active}
        muted={muted}
        onBlocked={onBlocked}
        hasInteracted={hasInteracted}
      />
      <ProgressBar active={active} duration={reel.duration} />

      {ripple && (
        <div style={{
          position: "absolute",
          left: ripple.x - 60, top: ripple.y - 60,
          width: 120, height: 120,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.08)",
          zIndex: 45, pointerEvents: "none",
          animation: "ripple-burst 0.55s ease-out forwards",
        }} />
      )}

      {heart && (
        <div style={{
          position: "absolute", top: "42%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 46, pointerEvents: "none",
          animation: "heart-pop 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards",
        }}>
          <svg width="76" height="76" viewBox="0 0 24 24" fill="#ff4060">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </div>
      )}

      {shareState && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 60, pointerEvents: "none",
          background: "rgba(0,0,0,0.72)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 12,
          padding: "10px 20px",
          fontFamily: "'DM Mono', monospace",
          fontSize: 11,
          letterSpacing: 1.5,
          color: "#00e5cc",
          textTransform: "uppercase",
          animation: "fade-in 0.25s ease both",
          whiteSpace: "nowrap",
        }}>
          {shareState === "copied" ? "Link Copied" : "Shared"}
        </div>
      )}

      {/* ACTION RAIL — all events stopped at container level too */}
      <div
        className="rc-rail"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e)   => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onTouchStart={(e)  => e.stopPropagation()}
        onTouchEnd={(e)    => e.stopPropagation()}
        onTouchMove={(e)   => e.stopPropagation()}
        onTouchCancel={(e) => e.stopPropagation()}
        onClick={(e)       => e.stopPropagation()}
      >
        {/* Like */}
        <ActionBtn
          count={fmt(likeCount)}
          active={liked}
          onClick={() => setLiked(v => { if (!v) setLikeCount(c => c + 1); return !v; })}
        >
          <svg width="24" height="24" viewBox="0 0 24 24"
            fill={liked ? "#ff4060" : "none"}
            stroke={liked ? "#ff4060" : "rgba(255,255,255,0.92)"}
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </ActionBtn>

        {/* Save / Watchlist */}
        <ActionBtn label={saved ? "Saved" : "Save"} active={saved} onClick={() => onSave(reel)}>
          {saved
            ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#00e5cc">
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            )
          }
        </ActionBtn>

        {/* Share */}
        <ActionBtn label={shareState === "copied" ? "Copied" : "Share"} active={shareState !== null} onClick={handleShare}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        </ActionBtn>

        {/* Sound */}
        <ActionBtn label={muted ? "Unmute" : "Sound"} active={!muted} onClick={onToggleMute}>
          {muted
            ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )
          }
        </ActionBtn>
      </div>

      {/* BOTTOM INFO */}
      <div className="rc-bottom">
        <div className="rc-meta">
          {reel.genres.map(g => (
            <span key={g} className="rc-tag">{g}</span>
          ))}
          {reel.rating && (
            <span className="rc-rating">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="#f1c40f" style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}>
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {reel.rating}
            </span>
          )}
        </div>

        <h2 className="rc-title" style={{ animation: active ? "slide-up 0.45s cubic-bezier(0.22,1,0.36,1) both" : "none" }}>
          {reel.title}
        </h2>

        {reel.overview && (
          <p className="rc-overview" style={{ animation: active ? "slide-up 0.55s cubic-bezier(0.22,1,0.36,1) 0.06s both" : "none" }}>
            {reel.overview.length > 120 ? reel.overview.slice(0, 120).trim() + "..." : reel.overview}
          </p>
        )}

        <button
          className="rc-watch"
          onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.style.transform = "scale(0.94)"; }}
          onPointerUp={(e)   => { e.currentTarget.style.transform = "scale(1)"; }}
          onPointerLeave={(e)=> { e.currentTarget.style.transform = "scale(1)"; }}
          onTouchStart={(e)  => e.stopPropagation()}
          onTouchEnd={(e)    => e.stopPropagation()}
          onTouchMove={(e)   => e.stopPropagation()}
          onTouchCancel={(e) => e.stopPropagation()}
          onClick={(e)       => { e.stopPropagation(); onWatch(reel); }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          Watch Now
        </button>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
/**
 * Props:
 *   apiKey     {string}   TMDB API key
 *   onSelect   {function} called with TMDB movie object when Watch Now is tapped
 *   onSave     {function} called with TMDB movie object to toggle watchlist
 *   savedItems {array}    saved TMDB items — each must have .id matching tmdb_id
 *   onNavigate {function} called with nav id ("home" | "history" | "downloads" | "settings")
 *   onSearch   {function} called when Search is tapped
 */
export default function ReelPage({ apiKey, onSelect, onSave, savedItems = [], onNavigate, onSearch }) {
  const [reels,         setReels]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [moreLoad,      setMoreLoad]      = useState(false);
  const [idx,           setIdx]           = useState(0);
  const [muted,         setMuted]         = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  const wrapRef    = useRef(null);
  const snapping   = useRef(false);
  const touchY0    = useRef(0);
  const touchY1    = useRef(0);
  const touchMoved = useRef(false);

  const handleFirstInteraction = useCallback(() => {
    if (!hasInteracted) {
      setHasInteracted(true);
      setMuted(false);
    }
  }, [hasInteracted]);

  useEffect(() => {
    if (!apiKey) return;
    let dead = false;
    setLoading(true);
    fetchReels(apiKey, 12)
      .then(d => { if (!dead) { setReels(d); setLoading(false); } })
      .catch(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [apiKey]);

  useEffect(() => {
    if (moreLoad || reels.length === 0 || idx < reels.length - 4) return;
    setMoreLoad(true);
    fetchReels(apiKey, 10)
      .then(d => { setReels(p => [...p, ...d]); setMoreLoad(false); })
      .catch(() => setMoreLoad(false));
  }, [idx, reels.length, moreLoad]); // eslint-disable-line

  const goTo = useCallback((n) => {
    if (snapping.current) return;
    const c = Math.max(0, Math.min(n, reels.length - 1));
    if (c === idx) return;
    snapping.current = true;
    setIdx(c);
    wrapRef.current?.scrollTo({ top: c * wrapRef.current.clientHeight, behavior: "smooth" });
    setTimeout(() => { snapping.current = false; }, 450);
  }, [idx, reels.length]);

  const handleBlocked = useCallback(() => goTo(idx + 1), [goTo, idx]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === "ArrowDown" || e.key === "j") goTo(idx + 1);
      if (e.key === "ArrowUp"   || e.key === "k") goTo(idx - 1);
      if (e.key === "m") setMuted(v => !v);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [idx, goTo]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let acc = 0, t = null;
    const h = (e) => {
      e.preventDefault();
      acc += e.deltaY;
      clearTimeout(t);
      t = setTimeout(() => {
        if (Math.abs(acc) > 30) goTo(idx + (acc > 0 ? 1 : -1));
        acc = 0;
      }, 50);
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => { el.removeEventListener("wheel", h); clearTimeout(t); };
  }, [idx, goTo]);

  const onTouchStart = (e) => {
    touchY0.current    = e.touches[0].clientY;
    touchY1.current    = e.touches[0].clientY;
    touchMoved.current = false;
  };
  const onTouchMove = (e) => {
    touchY1.current = e.touches[0].clientY;
    if (Math.abs(touchY1.current - touchY0.current) > 10) touchMoved.current = true;
  };
  const onTouchEnd = () => {
    const delta = touchY0.current - touchY1.current;
    if (touchMoved.current && Math.abs(delta) > 60) {
      goTo(idx + (delta > 0 ? 1 : -1));
    }
  };

  const handleWatch = (reel) => {
    const item = reel.tmdbObj
      ? { ...reel.tmdbObj, media_type: "movie" }
      : { id: reel.tmdb_id, title: reel.title, media_type: "movie" };
    onSelect?.(item);
  };

  const handleSave = (reel) => {
    const item = reel.tmdbObj
      ? { ...reel.tmdbObj, media_type: "movie" }
      : { id: reel.tmdb_id, title: reel.title, media_type: "movie" };
    onSave?.(item);
  };

  const handleNav    = (id) => { if (id === "search") onSearch?.(); else onNavigate?.(id); };
  const shouldRender = (i) => i >= idx - 1 && i <= idx + 1;

  const isSaved = (reel) => {
    const tid = reel.tmdb_id || reel.tmdbObj?.id;
    return (savedItems || []).some(s => String(s.id) === String(tid));
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;600;700&family=DM+Mono:wght@400;500&display=swap');

        @keyframes spin         { to { transform: rotate(360deg); } }
        @keyframes slide-up     { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes heart-pop    {
          0%   { transform: translate(-50%,-50%) scale(0);    opacity: 1; }
          55%  { transform: translate(-50%,-50%) scale(1.35); opacity: 1; }
          100% { transform: translate(-50%,-50%) scale(1);    opacity: 0; }
        }
        @keyframes ripple-burst {
          0%   { transform: scale(0);   opacity: 0.45; }
          100% { transform: scale(3.5); opacity: 0; }
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes hint-fade {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          75%  { opacity: 1; }
          100% { opacity: 0; }
        }

        .rp-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        .rp-scroll::-webkit-scrollbar { display: none; }

        .rp-nav-btn {
          all: unset;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          padding: 5px 14px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          letter-spacing: 0.3px;
          color: rgba(255,255,255,0.4);
          transition: color 0.15s, background 0.15s;
          white-space: nowrap;
          -webkit-tap-highlight-color: transparent;
        }
        .rp-nav-btn:hover  { color: #fff; background: rgba(255,255,255,0.07); }
        .rp-nav-btn:active { transform: scale(0.91); }

        .rc-rail {
          position: absolute;
          right: 14px;
          bottom: 110px;
          z-index: 30;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
          touch-action: none;
        }

        .rc-bottom {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 78px;
          z-index: 30;
          padding: 0 16px 88px 20px;
          pointer-events: none;
          box-sizing: border-box;
        }

        .rc-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          margin-bottom: 10px;
        }

        .rc-tag {
          background: rgba(255,255,255,0.07);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 30px;
          padding: 3px 11px;
          font-size: 9.5px;
          font-weight: 700;
          color: rgba(255,255,255,0.75);
          letter-spacing: 1px;
          font-family: 'DM Mono', monospace;
          text-transform: uppercase;
        }

        .rc-rating {
          background: rgba(241,196,15,0.07);
          border: 1px solid rgba(241,196,15,0.22);
          border-radius: 30px;
          padding: 3px 10px;
          font-size: 9.5px;
          font-weight: 700;
          color: #f1c40f;
          font-family: 'DM Mono', monospace;
          display: inline-flex;
          align-items: center;
        }

        .rc-title {
          margin: 0 0 10px 0;
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(28px, 7vw, 54px);
          font-weight: 400;
          letter-spacing: 1.5px;
          line-height: 0.96;
          color: #fff;
          text-shadow: 0 2px 28px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9);
          word-break: break-word;
        }

        .rc-overview {
          margin: 0 0 14px 0;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 400;
          line-height: 1.6;
          color: rgba(255,255,255,0.5);
          text-shadow: 0 1px 8px rgba(0,0,0,0.95);
          letter-spacing: 0.1px;
          pointer-events: none;
          max-width: 320px;
        }

        .rc-watch {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #00e5cc 0%, #00b4ff 55%, #a78bfa 100%);
          border: none;
          border-radius: 10px;
          color: #000;
          font-size: 12px;
          font-weight: 800;
          font-family: 'DM Sans', sans-serif;
          padding: 11px 24px;
          cursor: pointer;
          letter-spacing: 0.9px;
          text-transform: uppercase;
          -webkit-tap-highlight-color: transparent;
          transition: box-shadow 0.2s, transform 0.1s;
          box-shadow: 0 4px 22px rgba(0,229,204,0.28), 0 2px 8px rgba(0,0,0,0.45);
          white-space: nowrap;
          touch-action: manipulation;
        }
        .rc-watch:hover {
          box-shadow: 0 6px 30px rgba(0,229,204,0.48), 0 2px 8px rgba(0,0,0,0.45);
        }

        @media (max-width: 520px) {
          .rc-rail    { right: 10px; bottom: 130px; gap: 18px; }
          .rc-bottom  { padding-bottom: 88px; padding-left: 14px; right: 70px; }
          .rc-title   { font-size: clamp(24px, 8vw, 34px); }
          .rc-watch   { font-size: 11px; padding: 10px 18px; }
          .rc-overview { font-size: 11.5px; }
        }

        @media (min-width: 1280px) {
          .rc-rail    { right: 28px; bottom: 130px; gap: 26px; }
          .rc-bottom  { padding-left: 40px; padding-bottom: 60px; right: 110px; }
          .rc-watch   { font-size: 13px; padding: 13px 30px; }
        }

        @media (min-width: 1800px) {
          .rc-rail    { right: 44px; }
          .rc-bottom  { padding-left: 56px; }
        }
      `}</style>

      <div
        style={{
          position: "fixed", top: 0, bottom: 0,
          left: "var(--sidebar,0px)", right: 0,
          background: "#000", overflow: "hidden",
          fontFamily: "'DM Sans','Helvetica Neue',sans-serif",
          zIndex: 10,
        }}
        onClick={handleFirstInteraction}
        onTouchStart={handleFirstInteraction}
      >
        <div
          ref={wrapRef}
          className="rp-scroll"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            width: "100%",
            height: "100%",
            overflowY: "scroll",
            scrollSnapType: "y mandatory",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {loading && [0, 1].map(i => (
            <div key={i} style={{
              width: "100%", height: "100dvh", flexShrink: 0, scrollSnapAlign: "start",
              background: "linear-gradient(120deg, #090909 25%, #131313 50%, #090909 75%)",
              backgroundSize: "400% 400%",
              animation: "shimmer 1.8s ease infinite",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {i === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                  <div style={{ position: "relative", width: 46, height: 46 }}>
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.04)" }} />
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid transparent", borderTopColor: "#00e5cc", animation: "spin 0.8s linear infinite" }} />
                  </div>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: 3.5, color: "rgba(255,255,255,0.16)", textTransform: "uppercase" }}>
                    Curating Reels
                  </span>
                </div>
              )}
            </div>
          ))}

          {!loading && reels.map((reel, i) => (
            <div key={`${reel.id}-${i}`} style={{
              width: "100%",
              height: "100dvh",
              flexShrink: 0,
              scrollSnapAlign: "start",
              position: "relative",
              overflow: "hidden",
              background: "#000",
            }}>
              {shouldRender(i) && (
                <ReelCard
                  reel={reel}
                  active={i === idx}
                  muted={muted}
                  onToggleMute={() => { setHasInteracted(true); setMuted(m => !m); }}
                  onWatch={handleWatch}
                  onSave={handleSave}
                  saved={isSaved(reel)}
                  onBlocked={i === idx ? handleBlocked : undefined}
                  hasInteracted={hasInteracted}
                />
              )}
            </div>
          ))}

          {!loading && reels.length === 0 && (
            <div style={{
              width: "100%", height: "100dvh", flexShrink: 0, scrollSnapAlign: "start",
              background: "#06060a",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 14,
              animation: "fade-in 0.5s ease both",
            }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2.5, color: "rgba(255,255,255,0.18)" }}>
                No Reels Found
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "center", maxWidth: 220, lineHeight: 1.75, fontFamily: "'DM Sans',sans-serif" }}>
                Check your TMDB API key is valid and try again.
              </div>
            </div>
          )}

          {moreLoad && (
            <div style={{ width: "100%", height: 80, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.05)", borderTopColor: "#00e5cc", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}
        </div>

        {/* TOP NAV */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 50,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.25) 60%, transparent 100%)",
          pointerEvents: "none",
        }}>
          <div style={{
            display: "flex", alignItems: "center",
            padding: "14px 16px 24px", gap: 2,
            overflowX: "auto", scrollbarWidth: "none",
            pointerEvents: "auto",
          }}>
            {NAV.map(n => (
              <button key={n.id} className="rp-nav-btn" onClick={() => handleNav(n.id)}>
                {n.icon}{n.label}
              </button>
            ))}
          </div>
        </div>

        {/* SOUND HINT */}
        {!hasInteracted && !loading && reels.length > 0 && (
          <div style={{
            position: "absolute", bottom: 170, left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60, pointerEvents: "none",
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24,
            padding: "8px 18px",
            animation: "hint-fade 3.5s ease 0.8s both",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(255,255,255,0.55)">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
            <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", fontFamily: "'DM Sans',sans-serif", whiteSpace: "nowrap", letterSpacing: 0.3 }}>
              Tap anywhere for sound
            </span>
          </div>
        )}

        {/* REEL COUNTER */}
        {!loading && reels.length > 0 && (
          <div style={{
            position: "absolute", top: 18, right: 18, zIndex: 51,
            fontFamily: "'DM Mono', monospace",
            fontSize: 9.5, letterSpacing: 1.8,
            color: "rgba(255,255,255,0.25)",
            textTransform: "uppercase",
            pointerEvents: "none",
            animation: "fade-in 0.4s ease both",
          }}>
            {idx + 1} / {reels.length}
          </div>
        )}
      </div>
    </>
  );
}