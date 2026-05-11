import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { imgUrl, tmdbFetch } from "../utils/api";
import { StarIcon, PlayIcon } from "../components/Icons";
import MediaCard from "../components/MediaCard";

// ── Embed source definitions ────────────────────────────────────────────────
const MOVIE_SOURCES = [
  { id: "vidsrc",      label: "VidSrc",      url: (id)         => `https://vidsrc.to/embed/movie/${id}` },
  { id: "vidsrc2",     label: "VidSrc 2",    url: (id)         => `https://vidsrc.me/embed/movie?tmdb=${id}` },
  { id: "videasy",     label: "Videasy",     url: (id)         => `https://player.videasy.net/movie/${id}` },
  { id: "2embed",      label: "2Embed",      url: (id)         => `https://www.2embed.cc/embed/${id}` },
  { id: "embedsu",     label: "Embed.su",    url: (id)         => `https://embed.su/embed/movie/${id}` },
  { id: "autoembed",   label: "AutoEmbed",   url: (id)         => `https://player.autoembed.cc/embed/movie/${id}` },
  { id: "moviesapi",   label: "MoviesAPI",   url: (id)         => `https://moviesapi.club/movie/${id}` },
  { id: "smashystream",label: "SmashyStream",url: (id)         => `https://player.smashy.stream/movie/${id}` },
];

const TV_SOURCES = [
  { id: "vidsrc",      label: "VidSrc",      url: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}` },
  { id: "vidsrc2",     label: "VidSrc 2",    url: (id, s, e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}` },
  { id: "videasy",     label: "Videasy",     url: (id, s, e) => `https://player.videasy.net/tv/${id}/${s}/${e}` },
  { id: "2embed",      label: "2Embed",      url: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}` },
  { id: "embedsu",     label: "Embed.su",    url: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}` },
  { id: "autoembed",   label: "AutoEmbed",   url: (id, s, e) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}` },
  { id: "moviesapi",   label: "MoviesAPI",   url: (id, s, e) => `https://moviesapi.club/tv/${id}-${s}-${e}` },
  { id: "smashystream",label: "SmashyStream",url: (id, s, e) => `https://player.smashy.stream/tv/${id}?s=${s}&e=${e}` },
];

function buildEmbedUrl(item, sourceId, season, episode) {
  const isTV = item.media_type === "tv";
  const sources = isTV ? TV_SOURCES : MOVIE_SOURCES;
  const src = sources.find((s) => s.id === sourceId) ?? sources[0];
  return isTV ? src.url(item.id, season, episode) : src.url(item.id);
}

// ── Small back-arrow icon ───────────────────────────────────────────────────
function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// ── Chevron for source dropdown ─────────────────────────────────────────────
function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Main WatchPage component ────────────────────────────────────────────────
export default function WatchPage({
  item,
  season,
  episode,
  episodeName,
  sourceId: initialSourceId,
  apiKey,
  onBack,
  onHistory,
  saveProgress,
  onMarkWatched,
  onMarkUnwatched,
  watched,
  progress,
  onSelect,
  onSave,
  isSaved,
}) {
  const isTV    = item?.media_type === "tv";
  const sources = isTV ? TV_SOURCES : MOVIE_SOURCES;

  const [sourceId, setSourceId]         = useState(initialSourceId ?? sources[0].id);
  const [sourceOpen, setSourceOpen]     = useState(false);
  const [related, setRelated]           = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const sourceDropRef = useRef(null);
  const progressRef   = useRef(null);

  const embedUrl = useMemo(
    () => buildEmbedUrl(item, sourceId, season, episode),
    [item, sourceId, season, episode],
  );

  // Progress key — same format as MoviePage / TVPage
  const progressKey = isTV
    ? `tv_${item.id}_s${season}e${episode}`
    : `movie_${item.id}`;

  const isWatched = !!watched?.[progressKey];
  const pct       = progress?.[progressKey] ?? 0;

  // Log to history once on mount
  useEffect(() => {
    if (!item) return;
    onHistory?.({
      ...item,
      season:      season  ?? null,
      episode:     episode ?? null,
      episodeName: episodeName ?? null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simulate progress tracking (real progress needs webview/postMessage)
  useEffect(() => {
    if (isWatched) return;
    let elapsed = ((pct / 100) * 7200) | 0; // rough seconds already watched
    progressRef.current = setInterval(() => {
      elapsed += 5;
      const est = Math.min(98, Math.round((elapsed / 7200) * 100));
      saveProgress?.(progressKey, est);
    }, 5000);
    return () => clearInterval(progressRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressKey, isWatched]);

  // Fetch related content
  useEffect(() => {
    if (!apiKey || !item) return;
    const type = isTV ? "tv" : "movie";
    const controller = new AbortController();
    tmdbFetch(`/${type}/${item.id}/recommendations`, apiKey, { signal: controller.signal })
      .then((data) => {
        const results = (data.results || [])
          .slice(0, 12)
          .map((r) => ({ ...r, media_type: type }));
        if (results.length > 0) { setRelated(results); return; }
        // fallback to similar
        return tmdbFetch(`/${type}/${item.id}/similar`, apiKey, { signal: controller.signal })
          .then((d) =>
            setRelated((d.results || []).slice(0, 12).map((r) => ({ ...r, media_type: type }))),
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [apiKey, item, isTV]);

  // Close source dropdown on outside click
  useEffect(() => {
    const close = (e) => {
      if (sourceDropRef.current && !sourceDropRef.current.contains(e.target))
        setSourceOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!item) return null;

  const title    = item.title || item.name || "";
  const year     = (item.release_date || item.first_air_date || "").slice(0, 4);
  const rating   = item.vote_average?.toFixed(1);
  const overview = item.overview || "";

  const currentSource = sources.find((s) => s.id === sourceId) ?? sources[0];

  return (
    <div
      className="fade-in"
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        paddingBottom: 80,
      }}
    >
      {/* ── Player zone ── */}
      <div
        style={{
          background: "#000",
          position: "relative",
        }}
      >
        {/* Back button */}
        {!isFullscreen && (
          <button
            onClick={onBack}
            style={{
              position: "absolute",
              top: 16,
              left: 16,
              zIndex: 20,
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(0,0,0,0.65)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              borderRadius: 8,
              padding: "7px 14px 7px 10px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              backdropFilter: "blur(6px)",
              transition: "background 0.2s",
              fontFamily: "var(--font-body)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,168,225,0.7)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.65)")}
          >
            <BackArrow /> Back
          </button>
        )}

        {/* 16:9 iframe */}
        <div style={{ position: "relative", paddingTop: "56.25%", width: "100%" }}>
          <iframe
            key={embedUrl}
            src={embedUrl}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
            }}
            allowFullScreen
            allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="no-referrer"
            title={title}
          />
        </div>
      </div>

      {/* ── Controls row ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          padding: "14px 5%",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        {/* Progress bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 200 }}>
          <div style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2 }}>
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "var(--red)",
                borderRadius: 2,
                transition: "width 0.4s",
              }}
            />
          </div>
          <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>
            {pct > 0 ? `${pct}%` : "Not started"}
          </span>
        </div>

        {/* Source switcher */}
        <div style={{ position: "relative" }} ref={sourceDropRef}>
          <button
            onClick={() => setSourceOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--surface2)",
              border: `1px solid ${sourceOpen ? "var(--red)" : "var(--border)"}`,
              color: "var(--text)",
              borderRadius: 7,
              padding: "7px 12px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              transition: "border-color 0.15s",
            }}
          >
            <span style={{ color: "var(--red)", fontSize: 11, fontWeight: 700 }}>SOURCE</span>
            {currentSource.label}
            <ChevronDown />
          </button>

          {sourceOpen && (
            <div
              style={{
                position: "absolute",
                bottom: "calc(100% + 8px)",
                right: 0,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 6,
                minWidth: 180,
                boxShadow: "0 12px 40px rgba(0,0,0,0.7)",
                zIndex: 300,
              }}
            >
              {sources.map((src) => (
                <button
                  key={src.id}
                  onClick={() => { setSourceId(src.id); setSourceOpen(false); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    background: src.id === sourceId ? "var(--red-dim)" : "none",
                    border: "none",
                    color: src.id === sourceId ? "var(--text)" : "var(--text2)",
                    textAlign: "left",
                    padding: "9px 12px",
                    fontSize: 13,
                    borderRadius: 6,
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => { if (src.id !== sourceId) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = src.id === sourceId ? "var(--red-dim)" : "none"; }}
                >
                  {src.id === sourceId && (
                    <span style={{ color: "var(--red)", fontWeight: 700, fontSize: 11 }}>✓</span>
                  )}
                  {src.label}
                </button>
              ))}
              <div style={{ fontSize: 11, color: "var(--text3)", padding: "8px 12px 4px", borderTop: "1px solid var(--border)", marginTop: 4 }}>
                If one source doesn't load, try another
              </div>
            </div>
          )}
        </div>

        {/* Mark watched */}
        <button
          onClick={() =>
            isWatched
              ? onMarkUnwatched?.(progressKey)
              : onMarkWatched?.(progressKey)
          }
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: isWatched ? "rgba(72,199,116,0.12)" : "var(--surface2)",
            border: `1px solid ${isWatched ? "rgba(72,199,116,0.4)" : "var(--border)"}`,
            color: isWatched ? "#48c774" : "var(--text2)",
            borderRadius: 7,
            padding: "7px 14px",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            transition: "all 0.2s",
          }}
        >
          {isWatched ? "✓ Watched" : "Mark Watched"}
        </button>
      </div>

      {/* ── Title + meta ── */}
      <div style={{ padding: "28px 5% 0" }}>
        {isTV && season != null && (
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "var(--red)", marginBottom: 8 }}>
            Season {season} · Episode {episode}{episodeName ? ` · ${episodeName}` : ""}
          </div>
        )}
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(32px, 5vw, 56px)",
            lineHeight: 1,
            letterSpacing: 1,
            marginBottom: 14,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16, fontSize: 13, color: "var(--text2)" }}>
          {rating && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#f5c518", fontWeight: 600 }}>
              <StarIcon style={{ width: 14, height: 14 }} /> {rating}
            </span>
          )}
          {year && <span>{year}</span>}
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              background: "var(--red-dim)",
              color: "var(--red)",
              border: "1px solid var(--red)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            {isTV ? "Series" : "Movie"}
          </span>
        </div>

        {/* Actions row */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          <button
            onClick={onSave}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 20px",
              borderRadius: 7,
              border: `1px solid ${isSaved ? "var(--red)" : "var(--border)"}`,
              background: isSaved ? "var(--red-dim)" : "var(--surface2)",
              color: isSaved ? "var(--red)" : "var(--text2)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              transition: "all 0.2s",
            }}
          >
            {isSaved ? "✓ In Watchlist" : "+ Watchlist"}
          </button>
        </div>

        {overview && (
          <p style={{ fontSize: 15, color: "var(--text2)", lineHeight: 1.7, maxWidth: 760, marginBottom: 40 }}>
            {overview}
          </p>
        )}
      </div>

      {/* ── Related content ── */}
      {related.length > 0 && (
        <div style={{ padding: "0 5%" }}>
          <div
            className="section-title"
            style={{ fontFamily: "var(--font-display)", fontSize: 28, letterSpacing: 1, marginBottom: 16 }}
          >
            More Like This
          </div>
          <div className="cards-grid">
            {related.map((rel) => (
              <MediaCard
                key={`${rel.media_type}_${rel.id}`}
                item={rel}
                onClick={() => onSelect?.(rel)}
                progress={progress?.[`${rel.media_type}_${rel.id}`] ?? 0}
                watched={watched}
                onMarkWatched={onMarkWatched}
                onMarkUnwatched={onMarkUnwatched}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}