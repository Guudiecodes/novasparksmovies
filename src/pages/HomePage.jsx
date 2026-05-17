import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import MediaCard from "../components/MediaCard";
import TrendingCarousel from "../components/TrendingCarousel";
import { PlayIcon, StarIcon } from "../components/Icons";
import { imgUrl, tmdbFetch } from "../utils/api";
import { useRatings, getRatingForItem } from "../utils/useRatings";
import { isRestricted } from "../utils/ageRating";
import { storage } from "../utils/storage";
import { loadHomeLayout, loadHomeViewMode } from "../utils/homeLayout";

const HERO_COUNT    = 5;
const HERO_INTERVAL = 7000;

function getRecentHistoryItem(history) {
  if (!history || history.length === 0) return null;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = history.filter((h) => h.watchedAt && h.watchedAt > sevenDaysAgo);
  if (recent.length === 0) return null;
  return recent[Math.floor(Math.random() * recent.length)];
}

// ── Infinite scroll row ───────────────────────────────────────────────────────
function InfiniteRow({ title, titleHighlight, items, onSelect, ratingsMap, onLoadMore, hasMore, loadingMore }) {
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!hasMore || !sentinelRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore?.(); },
      { threshold: 0.1 }
    );
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [hasMore, onLoadMore]);

  if (!items || items.length === 0) return null;

  return (
    <div className="ns-row-section">
      <div className="ns-row-title">
        {title}
        {titleHighlight && (
          <span style={{ color: "var(--red)", marginLeft: 6 }}>{titleHighlight}</span>
        )}
      </div>
      <div className="ns-row" style={{ overflowX: "auto", display: "flex", gap: 12, paddingBottom: 12 }}>
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
                  <img src={imgUrl(item.poster_path, "w300")} alt={item.title || item.name} loading="lazy" />
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
        {/* Infinite scroll sentinel */}
        {hasMore && (
          <div ref={sentinelRef} style={{ flexShrink: 0, width: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {loadingMore && <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />}
          </div>
        )}
      </div>
    </div>
  );
}

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

  // ── Extended data ─────────────────────────────────────────────────────────
  const [similarItems,   setSimilarItems]   = useState([]);
  const [similarSource,  setSimilarSource]  = useState(null);
  const [topRatedItems,  setTopRatedItems]  = useState([]);

  // New infinite sections
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

  const getRating    = useCallback((item) => getRatingForItem(item, ratingsMap), [ratingsMap]);
  const itemRestricted = useCallback((item) => isRestricted(getRatingForItem(item, ratingsMap).minAge, ageLimitSetting), [ratingsMap, ageLimitSetting]);

  // ── Fetch helpers ─────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (endpoint, page, mediaType, setter, setPage, setMore, setLoading) => {
    if (!apiKey || offline) return;
    setLoading(true);
    try {
      const data = await tmdbFetch(`${endpoint}?page=${page}`, apiKey);
      const results = (data.results || []).map((i) => ({ ...i, media_type: mediaType }));
      setter((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        return [...prev, ...results.filter((i) => !existingIds.has(i.id))];
      });
      setPage(page + 1);
      setMore(page < (data.total_pages || 1) && page < 10);
    } catch {}
    finally { setLoading(false); }
  }, [apiKey, offline]);

  // Initial loads
  useEffect(() => {
    if (!apiKey || offline) return;

    // Similar
    if (history && history.length > 0) {
      const source = getRecentHistoryItem(history);
      if (source) {
        setSimilarSource(source);
        const type = source.media_type === "tv" ? "tv" : "movie";
        tmdbFetch(`/${type}/${source.id}/similar`, apiKey)
          .then((d) => setSimilarItems((d.results || []).slice(0, 20).map((i) => ({ ...i, media_type: type }))))
          .catch(() => {});
      }
    }

    // Top rated
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

    // Popular sections
    fetchPage("/movie/popular",                   1, "movie", setPopularMovies,   setPopularMoviesPage, setPopularMoviesMore, setPopularMoviesLoad);
    fetchPage("/tv/popular",                       1, "tv",    setPopularTV,       setPopularTVPage,     setPopularTVMore,     setPopularTVLoad);
    fetchPage("/movie/now_playing",                1, "movie", setNowPlaying,      setNowPlayingPage,    setNowPlayingMore,    setNowPlayingLoad);
    fetchPage("/tv/airing_today",                  1, "tv",    setAiringToday,     setAiringTodayPage,   setAiringTodayMore,   setAiringTodayLoad);
    fetchPage("/movie/upcoming",                   1, "movie", setUpcomingMovies,  setUpcomingMoviesPage,setUpcomingMoviesMore,setUpcomingMoviesLoad);
    fetchPage("/discover/movie?with_genres=28",    1, "movie", setActionMovies,    setActionMoviesPage,  setActionMoviesMore,  setActionMoviesLoad);
    fetchPage("/discover/movie?with_genres=35",    1, "movie", setComedyMovies,    setComedyMoviesPage,  setComedyMoviesMore,  setComedyMoviesLoad);
    fetchPage("/discover/movie?with_genres=27",    1, "movie", setHorrorMovies,    setHorrorMoviesPage,  setHorrorMoviesMore,  setHorrorMoviesLoad);
    fetchPage("/discover/movie?with_genres=878",   1, "movie", setScifiMovies,     setScifiMoviesPage,   setScifiMoviesMore,   setScifiMoviesLoad);
    fetchPage("/discover/tv?with_genres=16&with_original_language=ja", 1, "tv", setAnimeTV, setAnimeTVPage, setAnimeTVMore, setAnimeTVLoad);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, offline]);

  const trendingMovieItems = useMemo(() => trending.slice(0, 10).map((i) => ({ ...i, media_type: "movie" })), [trending]);
  const trendingTVItems    = useMemo(() => trendingTV.slice(0, 10).map((i) => ({ ...i, media_type: "tv" })), [trendingTV]);

  const getRating_ = useCallback((item) => getRating(item), [getRating]);

  return (
    <div className="fade-in">
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
        <div className="hero" onMouseEnter={() => setHeroPaused(true)} onMouseLeave={() => setHeroPaused(false)}>
          <div className="hero-bg" key={heroIdx} style={{ backgroundImage: `url(${imgUrl(hero.backdrop_path, "original")})`, opacity: heroFading ? 0 : 1, transition: "opacity 0.35s ease" }} />
          <div className="hero-gradient" />
          <div className="hero-content" style={{ opacity: heroFading ? 0 : 1, transform: heroFading ? "translateY(6px)" : "translateY(0)", transition: "opacity 0.35s ease, transform 0.35s ease" }}>
            <div className="hero-type">Trending&nbsp;·&nbsp;{hero.media_type === "tv" ? "Series" : "Movie"}</div>
            <div className="hero-title">{hero.title || hero.name}</div>
            <div className="hero-meta">
              <span className="hero-rating"><StarIcon /> {hero.vote_average?.toFixed(1)}</span>
              <span>{(hero.release_date || hero.first_air_date || "").slice(0, 4)}</span>
            </div>
            <div className="hero-overview">{hero.overview}</div>
            <div className="hero-actions">
              <button className="btn btn-primary" onClick={() => onSelect(hero)}><PlayIcon /> Watch Now</button>
              <button className="btn btn-secondary" onClick={() => onSelect(hero)}>More Info</button>
            </div>
          </div>
          {heroItems.length > 1 && (
            <div className="hero-dots">
              {heroItems.map((_, i) => (
                <button key={i} className={`hero-dot${i === heroIdx ? " active" : ""}`} onClick={() => goToHero(i)} aria-label={`Hero ${i + 1}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Continue Watching ── */}
      {inProgress.length > 0 && (
        <div className="section">
          <div className="section-title">Continue Watching</div>
          <div className="cards-grid">
            {inProgress.map((item) => {
              const pk = item.media_type === "movie" ? `movie_${item.id}` : `tv_${item.id}_s${item.season}e${item.episode}`;
              return (
                <MediaCard
                  key={`${item.media_type}_${item.id}`}
                  item={item}
                  onClick={() => onSelect(item)}
                  progress={progress[pk] || 0}
                  watched={watched}
                  onMarkWatched={onMarkWatched}
                  onMarkUnwatched={onMarkUnwatched}
                  ageRating={getRating_(item).cert}
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
      <InfiniteRow title="Popular Movies" items={popularMovies} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={popularMoviesMore} loadingMore={popularMoviesLoad}
        onLoadMore={() => fetchPage("/movie/popular", popularMoviesPage, "movie", setPopularMovies, setPopularMoviesPage, setPopularMoviesMore, setPopularMoviesLoad)} />

      <InfiniteRow title="Popular Series" items={popularTV} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={popularTVMore} loadingMore={popularTVLoad}
        onLoadMore={() => fetchPage("/tv/popular", popularTVPage, "tv", setPopularTV, setPopularTVPage, setPopularTVMore, setPopularTVLoad)} />

      <InfiniteRow title="Now Playing" items={nowPlaying} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={nowPlayingMore} loadingMore={nowPlayingLoad}
        onLoadMore={() => fetchPage("/movie/now_playing", nowPlayingPage, "movie", setNowPlaying, setNowPlayingPage, setNowPlayingMore, setNowPlayingLoad)} />

      <InfiniteRow title="Airing Today" items={airingToday} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={airingTodayMore} loadingMore={airingTodayLoad}
        onLoadMore={() => fetchPage("/tv/airing_today", airingTodayPage, "tv", setAiringToday, setAiringTodayPage, setAiringTodayMore, setAiringTodayLoad)} />

      {topRatedItems.length > 0 && (
        <TrendingCarousel key="topRated" items={topRatedItems} title="Top Rated" onSelect={onSelect} ratingsMap={enrichedRatingsMap} />
      )}

      <InfiniteRow title="Coming Soon" items={upcomingMovies} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={upcomingMoviesMore} loadingMore={upcomingMoviesLoad}
        onLoadMore={() => fetchPage("/movie/upcoming", upcomingMoviesPage, "movie", setUpcomingMovies, setUpcomingMoviesPage, setUpcomingMoviesMore, setUpcomingMoviesLoad)} />

      <InfiniteRow title="🔥 Action" items={actionMovies} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={actionMoviesMore} loadingMore={actionMoviesLoad}
        onLoadMore={() => fetchPage("/discover/movie?with_genres=28", actionMoviesPage, "movie", setActionMovies, setActionMoviesPage, setActionMoviesMore, setActionMoviesLoad)} />

      <InfiniteRow title="😂 Comedy" items={comedyMovies} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={comedyMoviesMore} loadingMore={comedyMoviesLoad}
        onLoadMore={() => fetchPage("/discover/movie?with_genres=35", comedyMoviesPage, "movie", setComedyMovies, setComedyMoviesPage, setComedyMoviesMore, setComedyMoviesLoad)} />

      <InfiniteRow title="👻 Horror" items={horrorMovies} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={horrorMoviesMore} loadingMore={horrorMoviesLoad}
        onLoadMore={() => fetchPage("/discover/movie?with_genres=27", horrorMoviesPage, "movie", setHorrorMovies, setHorrorMoviesPage, setHorrorMoviesMore, setHorrorMoviesLoad)} />

      <InfiniteRow title="🚀 Sci-Fi" items={scifiMovies} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={scifiMoviesMore} loadingMore={scifiMoviesLoad}
        onLoadMore={() => fetchPage("/discover/movie?with_genres=878", scifiMoviesPage, "movie", setScifiMovies, setScifiMoviesPage, setScifiMoviesMore, setScifiMoviesLoad)} />

      <InfiniteRow title="⚡ Anime" items={animeTV} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={animeTVMore} loadingMore={animeTVLoad}
        onLoadMore={() => fetchPage("/discover/tv?with_genres=16&with_original_language=ja", animeTVPage, "tv", setAnimeTV, setAnimeTVPage, setAnimeTVMore, setAnimeTVLoad)} />

      {similarItems.length > 0 && similarSource && (
        <InfiniteRow title="Because you watched" titleHighlight={similarSource.title || similarSource.name} items={similarItems} onSelect={onSelect} ratingsMap={enrichedRatingsMap} hasMore={false} />
      )}
    </div>
  );
}