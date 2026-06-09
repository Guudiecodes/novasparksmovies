import { memo, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { PlayIcon, StarIcon } from "../components/Icons";
import TrendingCarousel from "../components/TrendingCarousel";
import { imgUrl, tmdbFetch } from "../utils/api";
import { useRatings, getRatingForItem } from "../utils/useRatings";
import { isRestricted } from "../utils/ageRating";
import { storage } from "../utils/storage";
import { loadHomeLayout, loadHomeViewMode } from "../utils/homeLayout";
import MediaCard from "../components/MediaCard";

// ── Social Icons (real brand logos) ─────────────────────────────────────────
function DiscordIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
    </svg>
  );
}
function XIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  );
}
function FacebookIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}
function TikTokIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.08 2.68 1.61 4.24 1.69v4.02c-1.38-.05-2.76-.35-4.06-.98s-2.43-1.56-3.33-2.72v7.86c0 2.22-1.04 4.31-2.81 5.65-1.77 1.34-4.05 1.72-6.14 1.04-2.09-.68-3.71-2.33-4.37-4.43-.66-2.1-.31-4.43.94-6.22 1.25-1.79 3.29-2.89 5.49-2.93.61-.01 1.21.06 1.8.19V9.63c-.58-.11-1.17-.15-1.76-.12-1.86.09-3.59.88-4.82 2.2-1.23 1.32-1.87 3.08-1.78 4.87.09 1.79.87 3.46 2.12 4.65 1.25 1.19 2.93 1.84 4.68 1.81 1.75-.03 3.4-.73 4.61-1.95 1.21-1.22 1.89-2.87 1.89-4.6V.02z"/>
    </svg>
  );
}

const HERO_COUNT    = 5;
const HERO_INTERVAL = 7000;

function getRecentHistoryItem(history) {
  if (!history || history.length === 0) return null;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = history.filter((h) => h.watchedAt && h.watchedAt > sevenDaysAgo);
  if (recent.length === 0) return null;
  return recent[Math.floor(Math.random() * recent.length)];
}

// ── Social slide notification ─────────────────────────────────────────────────
function SocialSlideNoti() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    const t = setTimeout(() => setVisible(true), 1800);
    const hide = setTimeout(() => setVisible(false), 12000);
    return () => { clearTimeout(t); clearTimeout(hide); };
  }, [dismissed]);

  if (dismissed) return null;

  return (
    <div className={`ns-social-noti ${visible ? 'ns-social-noti--visible' : ''}`}>
      <button className="ns-social-noti-close" onClick={() => { setDismissed(true); setVisible(false); }} aria-label="Close">×</button>
      <div className="ns-social-noti-inner">
        <div className="ns-social-noti-label">Join our community</div>
        <div className="ns-social-noti-icons">
          <a href="https://discord.gg/9BWtjg9c9E" target="_blank" rel="noopener noreferrer" aria-label="Discord" title="Discord"><DiscordIcon size={16} /></a>
          <a href="#" target="_blank" rel="noopener noreferrer" aria-label="X" title="X"><XIcon size={16} /></a>
          <a href="#" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook"><FacebookIcon size={16} /></a>
          <a href="#" target="_blank" rel="noopener noreferrer" aria-label="TikTok" title="TikTok"><TikTokIcon size={16} /></a>
        </div>
      </div>
    </div>
  );
}

// ── Infinite scroll row ───────────────────────────────────────────────────────
const InfiniteRow = memo(function InfiniteRow({
  title,
  titleHighlight,
  items,
  onSelect,
  ratingsMap,
  onLoadMore,
  hasMore,
  loadingMore,
}) {
  const sentinelRef   = useRef(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => { onLoadMoreRef.current = onLoadMore; }, [onLoadMore]);

  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMoreRef.current?.(); },
      { threshold: 0.1 }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore]);

  if (!items || items.length === 0) return null;

  return (
    <div className="ns-row-section">
      <div className="ns-row-title">
        {title}
        {titleHighlight && (
          <span style={{ color: "var(--red)", marginLeft: 6 }}>{titleHighlight}</span>
        )}
      </div>
      <div className="ns-row">
        {items.map((item) => {
          const type = item.media_type === "tv" ? "tv" : "movie";
          const rk   = `${type}_${item.id}`;
          const rd   = ratingsMap[rk] || {};
          return (
            <div
              key={`${item.media_type}_${item.id}`}
              className="ns-row-card"
              onClick={() => onSelect(item)}
            >
              <div className="ns-row-card-poster">
                {item.poster_path ? (
                  <img
                    src={imgUrl(item.poster_path, "w300")}
                    alt={item.title || item.name}
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <div className="ns-row-card-noposter"><PlayIcon /></div>
                )}
                <div className="ns-row-card-overlay">
                  <div className="ns-row-card-play"><PlayIcon /></div>
                </div>
                {item.vote_average > 0 && (
                  <div className="ns-row-card-score">
                    <StarIcon style={{ width: 10, height: 10 }} /> {item.vote_average.toFixed(1)}
                  </div>
                )}
              </div>
              <div className="ns-row-card-info">
                <div className="ns-row-card-title">{item.title || item.name}</div>
                <div className="ns-row-card-meta">
                  <span className="ns-row-card-type">{type}</span>
                  <span>{(item.release_date || item.first_air_date || "").slice(0, 4)}</span>
                </div>
              </div>
            </div>
          );
        })}

        {hasMore && (
          <div
            ref={sentinelRef}
            style={{ flexShrink: 0, width: 40, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {loadingMore && (
              <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default function HomePage({
  trending,
  trendingTV,
  loading,
  onSelect,
  progress,
  inProgress,
  offline,
  onRetry,
  watched,
  onMarkWatched,
  onMarkUnwatched,
  history,
  apiKey,
}) {
  const [heroIdx,    setHeroIdx]    = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroFading, setHeroFading] = useState(false);
  const timerRef = useRef(null);

  const heroItems = useMemo(() => trending.slice(0, HERO_COUNT), [trending]);
  const hero      = heroItems[heroIdx] ?? null;

  const goToHero = useCallback((idx) => {
    if (idx === heroIdx) return;
    setHeroFading(true);
    setTimeout(() => { setHeroIdx(idx); setHeroFading(false); }, 350);
  }, [heroIdx]);

  useEffect(() => {
    if (heroPaused || heroItems.length < 2) return;
    timerRef.current = setInterval(() => {
      setHeroIdx((prev) => {
        setHeroFading(true);
        setTimeout(() => setHeroFading(false), 350);
        return (prev + 1) % heroItems.length;
      });
    }, HERO_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [heroPaused, heroItems.length]);

  const [layout]   = useState(() => loadHomeLayout());
  const { order: rowOrder, visible: rowVisible } = layout;
  const [viewMode] = useState(() => loadHomeViewMode());

  const [similarItems,   setSimilarItems]   = useState([]);
  const [similarSource,  setSimilarSource]  = useState(null);
  const [topRatedItems,  setTopRatedItems]  = useState([]);

  const [popularMovies,     setPopularMovies]     = useState([]);
  const [popularMoviesPage, setPopularMoviesPage] = useState(1);
  const [popularMoviesMore, setPopularMoviesMore] = useState(true);
  const [popularMoviesLoad, setPopularMoviesLoad] = useState(false);

  const [popularTV,     setPopularTV]     = useState([]);
  const [popularTVPage, setPopularTVPage] = useState(1);
  const [popularTVMore, setPopularTVMore] = useState(true);
  const [popularTVLoad, setPopularTVLoad] = useState(false);

  const [nowPlaying,     setNowPlaying]     = useState([]);
  const [nowPlayingPage, setNowPlayingPage] = useState(1);
  const [nowPlayingMore, setNowPlayingMore] = useState(true);
  const [nowPlayingLoad, setNowPlayingLoad] = useState(false);

  const [airingToday,     setAiringToday]     = useState([]);
  const [airingTodayPage, setAiringTodayPage] = useState(1);
  const [airingTodayMore, setAiringTodayMore] = useState(true);
  const [airingTodayLoad, setAiringTodayLoad] = useState(false);

  const [upcomingMovies,     setUpcomingMovies]     = useState([]);
  const [upcomingMoviesPage, setUpcomingMoviesPage] = useState(1);
  const [upcomingMoviesMore, setUpcomingMoviesMore] = useState(true);
  const [upcomingMoviesLoad, setUpcomingMoviesLoad] = useState(false);

  const [actionMovies,     setActionMovies]     = useState([]);
  const [actionMoviesPage, setActionMoviesPage] = useState(1);
  const [actionMoviesMore, setActionMoviesMore] = useState(true);
  const [actionMoviesLoad, setActionMoviesLoad] = useState(false);

  const [comedyMovies,     setComedyMovies]     = useState([]);
  const [comedyMoviesPage, setComedyMoviesPage] = useState(1);
  const [comedyMoviesMore, setComedyMoviesMore] = useState(true);
  const [comedyMoviesLoad, setComedyMoviesLoad] = useState(false);

  const [horrorMovies,     setHorrorMovies]     = useState([]);
  const [horrorMoviesPage, setHorrorMoviesPage] = useState(1);
  const [horrorMoviesMore, setHorrorMoviesMore] = useState(true);
  const [horrorMoviesLoad, setHorrorMoviesLoad] = useState(false);

  const [scifiMovies,     setScifiMovies]     = useState([]);
  const [scifiMoviesPage, setScifiMoviesPage] = useState(1);
  const [scifiMoviesMore, setScifiMoviesMore] = useState(true);
  const [scifiMoviesLoad, setScifiMoviesLoad] = useState(false);

  const [animeTV,     setAnimeTV]     = useState([]);
  const [animeTVPage, setAnimeTVPage] = useState(1);
  const [animeTVMore, setAnimeTVMore] = useState(true);
  const [animeTVLoad, setAnimeTVLoad] = useState(false);

  const allItems = useMemo(() => [
    ...inProgress,
    ...trending.map((i) => ({ ...i, media_type: "movie" })),
    ...trendingTV.map((i) => ({ ...i, media_type: "tv" })),
    ...similarItems, ...topRatedItems,
    ...popularMovies, ...popularTV,
    ...nowPlaying, ...airingToday,
    ...upcomingMovies, ...actionMovies,
    ...comedyMovies, ...horrorMovies,
    ...scifiMovies, ...animeTV,
  ], [inProgress, trending, trendingTV, similarItems, topRatedItems,
      popularMovies, popularTV, nowPlaying, airingToday,
      upcomingMovies, actionMovies, comedyMovies, horrorMovies, scifiMovies, animeTV]);

  const { ratingsMap, ageLimitSetting } = useRatings(allItems);

  const enrichedRatingsMap = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(ratingsMap)) {
      out[k] = { ...v, restricted: isRestricted(v.minAge, ageLimitSetting) };
    }
    return out;
  }, [ratingsMap, ageLimitSetting]);

  const getRating      = useCallback((item) => getRatingForItem(item, ratingsMap), [ratingsMap]);
  const itemRestricted = useCallback(
    (item) => isRestricted(getRatingForItem(item, ratingsMap).minAge, ageLimitSetting),
    [ratingsMap, ageLimitSetting]
  );

  const fetchPage = useCallback(async (
    endpoint, page, mediaType,
    setter, setPage, setMore, setLoading
  ) => {
    if (!apiKey || offline) return;
    setLoading(true);
    try {
      const data    = await tmdbFetch(`${endpoint}?page=${page}`, apiKey);
      const results = (data.results || []).map((i) => ({ ...i, media_type: mediaType }));
      setter((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        return [...prev, ...results.filter((i) => !existingIds.has(i.id))];
      });
      setPage(page + 1);
      setMore(page < (data.total_pages || 1) && page < 10);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [apiKey, offline]);

  useEffect(() => {
    if (!apiKey || offline) return;

    if (history && history.length > 0) {
      const source = getRecentHistoryItem(history);
      if (source) {
        setSimilarSource(source);
        const type = source.media_type === "tv" ? "tv" : "movie";
        tmdbFetch(`/${type}/${source.id}/similar`, apiKey)
          .then((d) => setSimilarItems(
            (d.results || []).slice(0, 20).map((i) => ({ ...i, media_type: type }))
          ))
          .catch(() => {});
      }
    }

    Promise.all([
      tmdbFetch("/movie/top_rated?page=1", apiKey),
      tmdbFetch("/tv/top_rated?page=1", apiKey),
    ]).then(([m, t]) => {
      const movies = (m.results || []).slice(0, 10).map((i) => ({ ...i, media_type: "movie" }));
      const tv     = (t.results || []).slice(0, 10).map((i) => ({ ...i, media_type: "tv" }));
      const merged = [];
      for (let i = 0; i < Math.max(movies.length, tv.length); i++) {
        if (movies[i]) merged.push(movies[i]);
        if (tv[i])     merged.push(tv[i]);
      }
      setTopRatedItems(merged);
    }).catch(() => {});

    fetchPage("/movie/popular",                                       1, "movie", setPopularMovies,  setPopularMoviesPage, setPopularMoviesMore, setPopularMoviesLoad);
    fetchPage("/tv/popular",                                          1, "tv",    setPopularTV,       setPopularTVPage,     setPopularTVMore,     setPopularTVLoad);
    fetchPage("/movie/now_playing",                                   1, "movie", setNowPlaying,      setNowPlayingPage,    setNowPlayingMore,    setNowPlayingLoad);
    fetchPage("/tv/airing_today",                                     1, "tv",    setAiringToday,     setAiringTodayPage,   setAiringTodayMore,   setAiringTodayLoad);
    fetchPage("/movie/upcoming",                                      1, "movie", setUpcomingMovies,  setUpcomingMoviesPage,setUpcomingMoviesMore,setUpcomingMoviesLoad);
    fetchPage("/discover/movie?with_genres=28",                       1, "movie", setActionMovies,    setActionMoviesPage,  setActionMoviesMore,  setActionMoviesLoad);
    fetchPage("/discover/movie?with_genres=35",                       1, "movie", setComedyMovies,    setComedyMoviesPage,  setComedyMoviesMore,  setComedyMoviesLoad);
    fetchPage("/discover/movie?with_genres=27",                       1, "movie", setHorrorMovies,    setHorrorMoviesPage,  setHorrorMoviesMore,  setHorrorMoviesLoad);
    fetchPage("/discover/movie?with_genres=878",                      1, "movie", setScifiMovies,     setScifiMoviesPage,   setScifiMoviesMore,   setScifiMoviesLoad);
    fetchPage("/discover/tv?with_genres=16&with_original_language=ja",1, "tv",    setAnimeTV,         setAnimeTVPage,       setAnimeTVMore,       setAnimeTVLoad);
  }, [apiKey, offline]);

  const trendingMovieItems = useMemo(
    () => trending.slice(0, 10).map((i) => ({ ...i, media_type: "movie" })),
    [trending]
  );
  const trendingTVItems = useMemo(
    () => trendingTV.slice(0, 10).map((i) => ({ ...i, media_type: "tv" })),
    [trendingTV]
  );

  const loadMorePopularMovies  = useCallback(() => fetchPage("/movie/popular",                                       popularMoviesPage, "movie", setPopularMovies,  setPopularMoviesPage, setPopularMoviesMore, setPopularMoviesLoad),  [fetchPage, popularMoviesPage]);
  const loadMorePopularTV      = useCallback(() => fetchPage("/tv/popular",                                          popularTVPage,     "tv",    setPopularTV,       setPopularTVPage,     setPopularTVMore,     setPopularTVLoad),      [fetchPage, popularTVPage]);
  const loadMoreNowPlaying     = useCallback(() => fetchPage("/movie/now_playing",                                   nowPlayingPage,    "movie", setNowPlaying,      setNowPlayingPage,    setNowPlayingMore,    setNowPlayingLoad),     [fetchPage, nowPlayingPage]);
  const loadMoreAiringToday    = useCallback(() => fetchPage("/tv/airing_today",                                     airingTodayPage,   "tv",    setAiringToday,     setAiringTodayPage,   setAiringTodayMore,   setAiringTodayLoad),    [fetchPage, airingTodayPage]);
  const loadMoreUpcoming       = useCallback(() => fetchPage("/movie/upcoming",                                      upcomingMoviesPage,"movie", setUpcomingMovies,  setUpcomingMoviesPage,setUpcomingMoviesMore,setUpcomingMoviesLoad), [fetchPage, upcomingMoviesPage]);
  const loadMoreAction         = useCallback(() => fetchPage("/discover/movie?with_genres=28",                       actionMoviesPage,  "movie", setActionMovies,    setActionMoviesPage,  setActionMoviesMore,  setActionMoviesLoad),   [fetchPage, actionMoviesPage]);
  const loadMoreComedy         = useCallback(() => fetchPage("/discover/movie?with_genres=35",                       comedyMoviesPage,  "movie", setComedyMovies,    setComedyMoviesPage,  setComedyMoviesMore,  setComedyMoviesLoad),   [fetchPage, comedyMoviesPage]);
  const loadMoreHorror         = useCallback(() => fetchPage("/discover/movie?with_genres=27",                       horrorMoviesPage,  "movie", setHorrorMovies,    setHorrorMoviesPage,  setHorrorMoviesMore,  setHorrorMoviesLoad),   [fetchPage, horrorMoviesPage]);
  const loadMoreScifi          = useCallback(() => fetchPage("/discover/movie?with_genres=878",                      scifiMoviesPage,   "movie", setScifiMovies,     setScifiMoviesPage,   setScifiMoviesMore,   setScifiMoviesLoad),    [fetchPage, scifiMoviesPage]);
  const loadMoreAnime          = useCallback(() => fetchPage("/discover/tv?with_genres=16&with_original_language=ja",animeTVPage,       "tv",    setAnimeTV,         setAnimeTVPage,       setAnimeTVMore,       setAnimeTVLoad),        [fetchPage, animeTVPage]);

  return (
    <div className="fade-in ns-home-page">
      <SocialSlideNoti />
      <style>{`
        /* ── Hero ────────────────────────────────────────────── */
        .ns-home-hero {
          position: relative;
          width: 100%;
          min-height: 80vh;
          display: flex;
          align-items: flex-end;
          overflow: hidden;
          background: var(--bg, #0a0a0a);
        }
        .ns-home-hero-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center 20%;
          background-repeat: no-repeat;
          transition: opacity 0.35s ease, transform 8s ease;
        }
        .ns-home-hero-bg.is-fading {
          opacity: 0;
        }
        .ns-home-hero-grad {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(10,10,10,0.1) 0%,
            rgba(10,10,10,0.3) 30%,
            rgba(10,10,10,0.7) 60%,
            var(--bg, #0a0a0a) 100%
          );
        }
        .ns-home-hero-bottom-fade {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 120px;
          background: linear-gradient(to top, var(--bg, #0a0a0a) 0%, transparent 100%);
          pointer-events: none;
          z-index: 2;
        }
        .ns-home-hero-content {
          position: relative;
          z-index: 3;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 28px 48px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ns-home-hero-type {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: var(--red, #e50914);
        }
        .ns-home-hero-title {
          font-size: clamp(28px, 5vw, 52px);
          font-weight: 900;
          line-height: 1.05;
          color: #fff;
          margin: 0;
          max-width: 700px;
          letter-spacing: -0.5px;
        }
        .ns-home-hero-meta {
          display: flex;
          align-items: center;
          gap: 14px;
          font-size: 14px;
          color: rgba(255,255,255,0.65);
        }
        .ns-home-hero-rating {
          display: flex;
          align-items: center;
          gap: 5px;
          color: #f5c518;
          font-weight: 700;
          font-size: 14px;
        }
        .ns-home-hero-overview {
          font-size: 14.5px;
          line-height: 1.6;
          color: rgba(255,255,255,0.72);
          max-width: 520px;
          margin: 4px 0 10px;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .ns-home-hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 4px;
        }
        .ns-home-hero-dots {
          position: absolute;
          bottom: 18px;
          right: 28px;
          z-index: 4;
          display: flex;
          gap: 8px;
        }
        .ns-home-hero-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: none;
          padding: 0;
          background: rgba(255,255,255,0.25);
          cursor: pointer;
          transition: background 0.25s ease, transform 0.25s ease;
        }
        .ns-home-hero-dot:hover {
          background: rgba(255,255,255,0.5);
        }
        .ns-home-hero-dot.active {
          background: var(--red, #e50914);
          transform: scale(1.15);
        }

        /* ── Page spacing ────────────────────────────────────── */
        .ns-home-page {
          padding-bottom: max(80px, env(safe-area-inset-bottom, 80px));
        }

        /* ── Social notification ───────────────────────────── */
        .ns-social-noti {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
          background: rgba(16,16,20,0.96);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 14px;
          padding: 14px 18px;
          backdrop-filter: blur(16px);
          box-shadow: 0 12px 40px rgba(0,0,0,0.5);
          opacity: 0;
          transform: translateX(200px);
          transition: transform 0.5s ease, opacity 0.5s ease;
        }
        .ns-social-noti--visible {
          opacity: 1;
          transform: translateX(0);
        }
        .ns-social-noti-inner {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .ns-social-noti-label {
          font-size: 12px;
          font-weight: 700;
          color: rgba(255,255,255,0.85);
          white-space: nowrap;
          letter-spacing: 0.2px;
        }
        .ns-social-noti-icons {
          display: flex;
          gap: 8px;
        }
        .ns-social-noti-icons a {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.65);
          transition: all 0.2s ease;
        }
        .ns-social-noti-icons a:hover {
          background: rgba(255,255,255,0.12);
          border-color: rgba(255,255,255,0.18);
          color: #fff;
          transform: scale(1.1);
        }
        .ns-social-noti-close {
          position: absolute;
          top: -10px;
          right: -10px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(24,24,28,0.95);
          color: rgba(255,255,255,0.5);
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .ns-social-noti-close:hover {
          background: rgba(229,9,20,0.15);
          color: var(--red, #e50914);
          border-color: rgba(229,9,20,0.3);
        }

        /* ── Footer ──────────────────────────────────────────── */
        .ns-home-footer {
          margin-top: 80px;
          padding: 56px 28px 28px;
          border-top: 1px solid rgba(255,255,255,0.06);
          background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(10,10,10,0.6) 20%, rgba(8,8,8,0.95) 100%);
          position: relative;
          min-height: 320px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .ns-home-footer::before {
          content: "";
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 120px;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--red, #e50914), transparent);
          opacity: 0.6;
        }
        .ns-footer-inner {
          max-width: 1200px;
          width: 100%;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1.6fr 1fr;
          gap: 48px;
          align-items: start;
        }
        .ns-footer-brand-col {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ns-footer-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .ns-footer-logo {
          font-size: 22px;
          font-weight: 900;
          color: var(--red, #e50914);
          letter-spacing: -0.3px;
          text-shadow: 0 0 30px rgba(229,9,20,0.3);
        }
        .ns-footer-year {
          font-size: 11px;
          font-weight: 700;
          color: rgba(255,255,255,0.4);
          background: rgba(255,255,255,0.06);
          padding: 3px 10px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.08);
          letter-spacing: 1px;
        }
        .ns-footer-tagline {
          font-size: 12.5px;
          color: rgba(255,255,255,0.35);
          margin: 0;
          line-height: 1.5;
          font-weight: 500;
        }
        .ns-footer-disclaimer-col {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .ns-footer-disclaimer {
          font-size: 12px;
          line-height: 1.7;
          color: rgba(255,255,255,0.3);
          margin: 0;
        }
        .ns-footer-links-col {
          display: flex;
          flex-direction: column;
          gap: 20px;
          align-items: flex-end;
        }
        .ns-footer-social {
          display: flex;
          gap: 10px;
        }
        .ns-footer-social-link {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.55);
          transition: all 0.25s ease;
          text-decoration: none;
        }
        .ns-footer-social-link:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.18);
          color: #fff;
          transform: translateY(-3px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .ns-footer-social--discord:hover { color: #5865F2; background: rgba(88,101,242,0.12); border-color: rgba(88,101,242,0.25); box-shadow: 0 4px 12px rgba(88,101,242,0.2); }
        .ns-footer-social--x:hover { color: #fff; background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
        .ns-footer-social--facebook:hover { color: #1877F2; background: rgba(24,119,242,0.12); border-color: rgba(24,119,242,0.25); box-shadow: 0 4px 12px rgba(24,119,242,0.2); }
        .ns-footer-social--tiktok:hover { color: #fff; background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
        .ns-footer-links {
          display: flex;
          gap: 20px;
          font-size: 12px;
          font-weight: 600;
          color: rgba(255,255,255,0.4);
        }
        .ns-footer-links span {
          cursor: pointer;
          transition: color 0.2s;
          position: relative;
        }
        .ns-footer-links span::after {
          content: "";
          position: absolute;
          bottom: -4px;
          left: 0;
          width: 0;
          height: 1.5px;
          background: var(--red, #e50914);
          transition: width 0.3s ease;
        }
        .ns-footer-links span:hover {
          color: rgba(255,255,255,0.85);
        }
        .ns-footer-links span:hover::after {
          width: 100%;
        }
        .ns-footer-bottom {
          max-width: 1200px;
          width: 100%;
          margin: 32px auto 0;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,0.04);
          text-align: center;
          font-size: 11px;
          color: rgba(255,255,255,0.25);
          letter-spacing: 0.3px;
        }

        /* ── Responsive ──────────────────────────────────────── */
        @media (max-width: 860px) {
          .ns-home-hero {
            min-height: 65vh;
          }
          .ns-home-hero-content {
            padding: 0 18px 40px;
          }
          .ns-home-hero-title {
            font-size: clamp(22px, 6vw, 32px);
          }
          .ns-home-hero-overview {
            font-size: 13px;
            -webkit-line-clamp: 2;
            max-width: 100%;
          }
          .ns-home-hero-actions .btn {
            padding: 9px 16px;
            font-size: 13px;
          }
          .ns-home-hero-dots {
            right: 18px;
          }
          .ns-home-footer {
            min-height: unset;
            padding: 40px 18px 24px;
            margin-top: 56px;
          }
          .ns-footer-inner {
            grid-template-columns: 1fr;
            gap: 28px;
            text-align: center;
          }
          .ns-footer-links-col {
            align-items: center;
          }
          .ns-footer-social {
            justify-content: center;
          }
          .ns-footer-bottom {
            margin-top: 24px;
          }
        }
        @media (max-width: 540px) {
          .ns-home-hero {
            min-height: 60vh;
          }
          .ns-home-hero-content {
            padding: 0 14px 36px;
            gap: 8px;
          }
          .ns-home-hero-title {
            font-size: 22px;
            line-height: 1.1;
          }
          .ns-home-hero-overview {
            display: none;
          }
          .ns-home-hero-actions {
            gap: 8px;
          }
          .ns-home-hero-actions .btn {
            flex: 1 1 auto;
            min-width: 100px;
            justify-content: center;
            padding: 10px 12px;
          }
          .ns-home-hero-dots {
            bottom: 12px;
            right: 14px;
            gap: 6px;
          }
          .ns-home-hero-dot {
            width: 6px;
            height: 6px;
          }
          .ns-home-footer {
            padding: 32px 14px 20px;
            margin-top: 40px;
          }
          .ns-footer-logo {
            font-size: 18px;
          }
          .ns-footer-disclaimer {
            font-size: 11px;
          }
          .ns-social-noti {
            right: 14px;
            bottom: 14px;
            padding: 12px 14px;
          }
          .ns-social-noti-label {
            font-size: 11px;
          }
        }
        @media (max-width: 380px) {
          .ns-home-hero-content {
            padding: 0 12px 32px;
          }
          .ns-home-hero-title {
            font-size: 20px;
          }
          .ns-home-hero-actions .btn {
            min-width: 80px;
            font-size: 12px;
            padding: 8px 10px;
          }
        }
      `}</style>

      {offline && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16, color: "var(--text2)" }}>
          <div style={{ fontSize: 48 }}>📡</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)" }}>No internet connection</div>
          <div style={{ fontSize: 14, color: "var(--text3)" }}>Trending and search require an internet connection. Your downloads and library still work offline.</div>
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={onRetry}>Retry</button>
        </div>
      )}

      {!offline && loading && <div className="loader"><div className="spinner" /></div>}

      {/* ── Cinematic hero ── */}
      {!loading && hero && (
        <div
          className="ns-home-hero"
          onMouseEnter={() => setHeroPaused(true)}
          onMouseLeave={() => setHeroPaused(false)}
        >
          <div
            className={`ns-home-hero-bg${heroFading ? ' is-fading' : ''}`}
            key={heroIdx}
            style={{
              backgroundImage: `url(${imgUrl(hero.backdrop_path, "original")})`,
            }}
          />
          <div className="ns-home-hero-grad" />
          <div className="ns-home-hero-bottom-fade" />
          <div className="ns-home-hero-content">
            <div className="ns-home-hero-type">Trending&nbsp;·&nbsp;{hero.media_type === "tv" ? "Series" : "Movie"}</div>
            <h1 className="ns-home-hero-title">{hero.title || hero.name}</h1>
            <div className="ns-home-hero-meta">
              <span className="ns-home-hero-rating"><StarIcon /> {hero.vote_average?.toFixed(1)}</span>
              <span>{(hero.release_date || hero.first_air_date || "").slice(0, 4)}</span>
            </div>
            <p className="ns-home-hero-overview">{hero.overview}</p>
            <div className="ns-home-hero-actions">
              <button className="btn btn-primary" onClick={() => onSelect(hero)}><PlayIcon /> Watch Now</button>
              <button className="btn btn-secondary" onClick={() => onSelect(hero)}>More Info</button>
            </div>
          </div>
          {heroItems.length > 1 && (
            <div className="ns-home-hero-dots">
              {heroItems.map((_, i) => (
                <button
                  key={i}
                  className={`ns-home-hero-dot${i === heroIdx ? " active" : ""}`}
                  onClick={() => goToHero(i)}
                  aria-label={`Hero ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Continue Watching ── */}
      {Array.isArray(inProgress) && inProgress.length > 0 && (
        <div className="section ns-continue-section">
          <div className="section-title">Continue Watching</div>
          <div className="cards-grid">
            {inProgress.map((item) => {
              const pk = item.media_type === "movie"
                ? `movie_${item.id}`
                : `tv_${item.id}_s${item.season}e${item.episode}`;
              return (
                <MediaCard
                  key={`${item.media_type}_${item.id}`}
                  item={item}
                  onClick={() => onSelect(item)}
                  progress={progress[pk] || 0}
                  watched={watched}
                  onMarkWatched={onMarkWatched}
                  onMarkUnwatched={onMarkUnwatched}
                  ageRating={getRating(item)?.cert}
                  restricted={itemRestricted(item)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Trending carousels ── */}
      {trendingMovieItems.length > 0 && (
        <TrendingCarousel key="trendingMovies" items={trendingMovieItems} title="Trending Movies" onSelect={onSelect} ratingsMap={enrichedRatingsMap} />
      )}
      {trendingTVItems.length > 0 && (
        <TrendingCarousel key="trendingTV" items={trendingTVItems} title="Trending Series" onSelect={onSelect} ratingsMap={enrichedRatingsMap} />
      )}

      {/* ── Infinite scroll rows ── */}
      <InfiniteRow title="Popular Movies"  items={popularMovies}  onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={popularMoviesMore}  loadingMore={popularMoviesLoad}  onLoadMore={loadMorePopularMovies} />
      <InfiniteRow title="Popular Series"  items={popularTV}      onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={popularTVMore}      loadingMore={popularTVLoad}      onLoadMore={loadMorePopularTV} />
      <InfiniteRow title="Now Playing"     items={nowPlaying}     onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={nowPlayingMore}     loadingMore={nowPlayingLoad}     onLoadMore={loadMoreNowPlaying} />
      <InfiniteRow title="Airing Today"    items={airingToday}    onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={airingTodayMore}    loadingMore={airingTodayLoad}    onLoadMore={loadMoreAiringToday} />

      {topRatedItems.length > 0 && (
        <TrendingCarousel key="topRated" items={topRatedItems} title="Top Rated" onSelect={onSelect} ratingsMap={enrichedRatingsMap} />
      )}

      <InfiniteRow title="Coming Soon"     items={upcomingMovies} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={upcomingMoviesMore} loadingMore={upcomingMoviesLoad} onLoadMore={loadMoreUpcoming} />
      <InfiniteRow title="Action"       items={actionMovies}   onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={actionMoviesMore}   loadingMore={actionMoviesLoad}   onLoadMore={loadMoreAction} />
      <InfiniteRow title="Comedy"       items={comedyMovies}   onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={comedyMoviesMore}   loadingMore={comedyMoviesLoad}   onLoadMore={loadMoreComedy} />
      <InfiniteRow title="Horror"       items={horrorMovies}   onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={horrorMoviesMore}   loadingMore={horrorMoviesLoad}   onLoadMore={loadMoreHorror} />
      <InfiniteRow title="Sci-Fi"       items={scifiMovies}    onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={scifiMoviesMore}    loadingMore={scifiMoviesLoad}    onLoadMore={loadMoreScifi} />
      <InfiniteRow title="Anime"        items={animeTV}        onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={animeTVMore}        loadingMore={animeTVLoad}        onLoadMore={loadMoreAnime} />

      {similarItems.length > 0 && similarSource && (
        <InfiniteRow
          title="Because you watched"
          titleHighlight={similarSource.title || similarSource.name}
          items={similarItems}
          onSelect={onSelect}
          ratingsMap={enrichedRatingsMap}
          hasMore={false}
        />
      )}

      {/* ── Footer ── */}
      <footer className="ns-home-footer">
        <div className="ns-footer-inner">
          <div className="ns-footer-brand-col">
            <div className="ns-footer-brand">
              <span className="ns-footer-logo">NovaSpark</span>
              <span className="ns-footer-year">2026</span>
            </div>
            <p className="ns-footer-tagline">Stream without limits.</p>
          </div>

          <div className="ns-footer-disclaimer-col">
            <p className="ns-footer-disclaimer">
              NovaSpark does not host or store any media content. All streams are sourced from independent third-party providers over the public internet. Stream quality and availability may vary by region.
            </p>
            <p className="ns-footer-disclaimer">
              For personal, non-commercial use only. You must be of legal viewing age in your jurisdiction. We are not responsible for third-party content or advertisements.
            </p>
          </div>

          <div className="ns-footer-links-col">
            <div className="ns-footer-social">
              <a href="https://discord.gg/9BWtjg9c9E" target="_blank" rel="noopener noreferrer" className="ns-footer-social-link ns-footer-social--discord" aria-label="Discord" title="Discord"><DiscordIcon size={18} /></a>
              <a href="#" target="_blank" rel="noopener noreferrer" className="ns-footer-social-link ns-footer-social--x" aria-label="X" title="X"><XIcon size={18} /></a>
              <a href="#" target="_blank" rel="noopener noreferrer" className="ns-footer-social-link ns-footer-social--facebook" aria-label="Facebook" title="Facebook"><FacebookIcon size={18} /></a>
              <a href="#" target="_blank" rel="noopener noreferrer" className="ns-footer-social-link ns-footer-social--tiktok" aria-label="TikTok" title="TikTok"><TikTokIcon size={18} /></a>
            </div>
            <div className="ns-footer-links">
              <span>Privacy</span>
              <span>Terms</span>
              <span>Contact</span>
            </div>
          </div>
        </div>
        <div className="ns-footer-bottom">
          <span>© 2026 NovaSpark. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}