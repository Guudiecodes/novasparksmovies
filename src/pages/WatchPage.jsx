import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  PLAYER_SOURCES,
  getSourceUrl,
  tmdbFetch,
  imgUrl,
  NON_ANIME_DEFAULT_SOURCE,
  findWorkingSource,
} from "../utils/api";
import { storage } from "../utils/storage";
import {
  BackIcon,
  StarIcon,
  SourceIcon,
  PlayIcon,
  BookmarkIcon,
  BookmarkFillIcon,
  TrailerIcon,
} from "../components/Icons";
import TrailerModal from "../components/TrailerModal";

// ── WatchPage: standalone Netflix-style player page ──────────────────────────
export default function WatchPage({
  item,
  apiKey,
  onBack,
  onSelect,
  progress,
  saveProgress,
  onHistory,
  watched,
  onMarkWatched,
  onMarkUnwatched,
  onSave,
  isSaved,
  downloads,
  onDownloadStarted,
  onGoToDownloads,
}) {
  const isElectron = !!window?.electron;

  const type    = item?.media_type === "tv" || !!item?.first_air_date ? "tv" : "movie";
  const title   = item?.title || item?.name || "";
  const season  = item?.season  ?? 1;
  const episode = item?.episode ?? 1;

  const [playerSource, setPlayerSource] = useState(
    () => storage.get("playerSource") || NON_ANIME_DEFAULT_SOURCE,
  );
  const [autoSourceStatus, setAutoSourceStatus] = useState("testing");
  const [showSourceMenu,   setShowSourceMenu]   = useState(false);
  const [webviewLoading,   setWebviewLoading]   = useState(true);
  const [related,          setRelated]          = useState([]);
  const [details,          setDetails]          = useState(null);
  const [trailerKey,       setTrailerKey]       = useState(null);
  const [showTrailer,      setShowTrailer]      = useState(false);
  const [menuPos,          setMenuPos]          = useState(null);

  const webviewRef = useRef(null);
  const iframeRef  = useRef(null);
  const sourceRef  = useRef(null);

  // ── Fetch full details ────────────────────────────────────────────────────
  useEffect(() => {
    if (!item?.id || !apiKey) return;
    let mounted = true;
    tmdbFetch(`/${type}/${item.id}?append_to_response=credits,videos`, apiKey)
      .then((d) => {
        if (!mounted) return;
        setDetails(d);
        const trailer =
          d.videos?.results?.find((v) => v.type === "Trailer" && v.site === "YouTube") ||
          d.videos?.results?.find((v) => v.site === "YouTube");
        if (trailer) setTrailerKey(trailer.key);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [item?.id, type, apiKey]);

  // ── Fetch related content ─────────────────────────────────────────────────
  useEffect(() => {
    if (!item?.id || !apiKey) return;
    let mounted = true;
    tmdbFetch(`/${type}/${item.id}/recommendations`, apiKey)
      .then((d) => { if (mounted) setRelated((d.results || []).slice(0, 14)); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [item?.id, type, apiKey]);

  // ── Auto source detection ─────────────────────────────────────────────────
  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;
    setAutoSourceStatus("testing");
    if (typeof findWorkingSource === "function") {
      findWorkingSource(type, item.id, season, episode, playerSource).then((id) => {
        if (cancelled) return;
        if (id && id !== playerSource) {
          setPlayerSource(id);
          storage.set("playerSource", id);
        }
        setAutoSourceStatus(id ? "found" : "failed");
      });
    } else {
      setAutoSourceStatus("found");
    }
    return () => { cancelled = true; };
  }, [item?.id, type, season, episode]);

  // ── Record history on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!item) return;
    onHistory?.({ ...item, media_type: type, season, episode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // ── Webview load events (Electron) ────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) return;
    const wv = webviewRef.current;
    if (!wv) return;
    const done  = () => setWebviewLoading(false);
    wv.addEventListener("did-finish-load", done);
    wv.addEventListener("did-fail-load",   done);
    const tid = setTimeout(() => setWebviewLoading(false), 15000);
    return () => {
      wv.removeEventListener("did-finish-load", done);
      wv.removeEventListener("did-fail-load",   done);
      clearTimeout(tid);
    };
  }, [playerSource, item?.id, season, episode, isElectron]);

  // ── Reset loader on any player change ────────────────────────────────────
  useEffect(() => { setWebviewLoading(true); }, [playerSource, item?.id, season, episode]);

  // ── Source URL ────────────────────────────────────────────────────────────
  const embedUrl = useMemo(() => {
    if (!item?.id) return "about:blank";
    return getSourceUrl(playerSource, type, item.id, season, episode);
  }, [playerSource, type, item?.id, season, episode]);

  // ── Source switch ─────────────────────────────────────────────────────────
  const switchSource = useCallback((id) => {
    setShowSourceMenu(false);
    if (id === playerSource) return;
    setPlayerSource(id);
    storage.set("playerSource", id);
  }, [playerSource]);

  // ── Close source menu on outside click ───────────────────────────────────
  useEffect(() => {
    if (!showSourceMenu) return;
    const close = (e) => {
      if (!sourceRef.current?.contains(e.target) && !e.target.closest(".watch-source-dropdown"))
        setShowSourceMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showSourceMenu]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const d       = details || item || {};
  const year    = (d.release_date || d.first_air_date || "").slice(0, 4);
  const rating  = d.vote_average ? d.vote_average.toFixed(1) : null;
  const runtime = d.runtime
    ? `${d.runtime} min`
    : d.episode_run_time?.[0]
      ? `${d.episode_run_time[0]} min/ep`
      : null;

  const currentLabel = PLAYER_SOURCES?.find((s) => s.id === playerSource)?.label ?? playerSource;

  if (!item) return null;

  return (
    <div className="watch-page fade-in">
      {/* ── Back bar ── */}
      <div className="watch-topbar">
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6 }}>
          <BackIcon /> Back
        </button>
        <div className="watch-topbar-title">
          {title}
          {type === "tv" && (
            <span className="watch-topbar-ep">
              &nbsp;·&nbsp;S{season} E{episode}
            </span>
          )}
        </div>
        {/* Auto-source status */}
        {autoSourceStatus !== "idle" && (
          <div className={`auto-source-badge ${autoSourceStatus}`} style={{ position: "static", pointerEvents: "none" }}>
            <span className="dot" />
            {autoSourceStatus === "testing" && "Testing sources…"}
            {autoSourceStatus === "found"   && `Auto: ${currentLabel}`}
            {autoSourceStatus === "failed"  && "No source found"}
          </div>
        )}
      </div>

      {/* ── Player area ── */}
      <div className="watch-player-wrap">
        {/* Loading overlay */}
        {webviewLoading && (
          <div className="watch-player-loading">
            <div className="spinner" />
            <span>Loading {currentLabel}…</span>
          </div>
        )}

        {/* Player — webview in Electron, iframe on web */}
        {isElectron ? (
          <webview
            ref={webviewRef}
            src={embedUrl}
            partition="persist:player"
            allowpopups="true"
            plugins="true"
            webpreferences="contextIsolation=true,nodeIntegration=false,webSecurity=false,allowRunningInsecureContent=true"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              background: "#000",
              visibility: webviewLoading ? "hidden" : "visible",
            }}
          />
        ) : (
          <iframe
            ref={iframeRef}
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={() => setWebviewLoading(false)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              background: "#000",
              visibility: webviewLoading ? "hidden" : "visible",
            }}
          />
        )}

        {/* Source switcher */}
        <div className="watch-source-bar">
          <button
            ref={sourceRef}
            className="player-overlay-btn"
            style={{ position: "static" }}
            onClick={() => {
              const rect = sourceRef.current?.getBoundingClientRect();
              if (rect) setMenuPos({ top: rect.bottom + 6, left: rect.left });
              setShowSourceMenu((v) => !v);
            }}
          >
            <SourceIcon /> {currentLabel}
          </button>
        </div>

        {/* Source dropdown */}
        {showSourceMenu && menuPos && PLAYER_SOURCES && (
          <div
            className="source-dropdown source-dropdown--fixed"
            style={{ top: menuPos.top, left: menuPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {PLAYER_SOURCES.map((src) => (
              <button
                key={src.id}
                className={
                  "source-dropdown__item" +
                  (playerSource === src.id ? " source-dropdown__item--active" : "")
                }
                onClick={() => switchSource(src.id)}
              >
                <span>{src.label}</span>
                {src.tag  && <span className="source-dropdown__tag">{src.tag}</span>}
                {src.note && <span className="source-dropdown__note">{src.note}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Meta below player ── */}
      <div className="watch-meta">
        <div className="watch-meta-left">
          <div className="watch-meta-title">{title}</div>
          <div className="watch-meta-info">
            {rating && (
              <span className="detail-rating">
                <StarIcon /> {rating}
              </span>
            )}
            {year    && <span>{year}</span>}
            {runtime && <span>{runtime}</span>}
            {type === "tv" && (
              <span className="tag tag-red">
                S{season} · E{episode}
                {item?.episodeName ? ` · ${item.episodeName}` : ""}
              </span>
            )}
          </div>
          {(details || item)?.overview && (
            <p className="watch-meta-overview">
              {(details || item).overview}
            </p>
          )}
        </div>
        <div className="watch-meta-actions">
          {trailerKey && (
            <button className="btn btn-secondary" onClick={() => setShowTrailer(true)}>
              <TrailerIcon /> Trailer
            </button>
          )}
          {onSave && (
            <button className="btn btn-secondary" onClick={onSave}>
              {isSaved ? <BookmarkFillIcon /> : <BookmarkIcon />}
              {isSaved ? "Saved" : "Save"}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onBack}>
            <BackIcon /> Back
          </button>
        </div>
      </div>

      {/* ── Related content ── */}
      {related.length > 0 && (
        <div className="section" style={{ paddingTop: 8 }}>
          <div className="section-title">More Like This</div>
          <div className="cards-grid">
            {related.map((rel) => {
              const rType = rel.title ? "movie" : "tv";
              return (
                <div
                  key={`${rType}_${rel.id}`}
                  className="card"
                  onClick={() => onSelect?.({ ...rel, media_type: rType })}
                  style={{ cursor: "pointer" }}
                >
                  <div className="card-poster">
                    {rel.poster_path ? (
                      <img
                        src={imgUrl(rel.poster_path)}
                        alt={rel.title || rel.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="no-poster">
                        <PlayIcon />
                      </div>
                    )}
                    <div className="card-overlay">
                      <div className="card-play">
                        <PlayIcon />
                      </div>
                    </div>
                    {rel.vote_average > 0 && (
                      <div className="card-badge">
                        ★ {rel.vote_average.toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div className="card-info">
                    <div className="card-title">{rel.title || rel.name}</div>
                    <div className="card-year">
                      {(rel.release_date || rel.first_air_date || "").slice(0, 4)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Trailer modal ── */}
      {showTrailer && trailerKey && (
        <TrailerModal
          trailerKey={trailerKey}
          title={title}
          onClose={() => setShowTrailer(false)}
        />
      )}
    </div>
  );
}