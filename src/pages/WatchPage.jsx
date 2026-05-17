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
  PopOutIcon,
  DownloadIcon,
} from "../components/Icons";
import TrailerModal from "../components/TrailerModal";
import DownloadModal from "../components/DownloadModal";
import { canDownload, canPopOut, canSwitchSource } from "../utils/gate";
import PremiumGate from "../components/PremiumGate";

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
  sourceId: preFoundSource,
  isPremium,
}) {
  const isElectron = !!window?.electron;

  const type    = item?.media_type === "tv" || !!item?.first_air_date ? "tv" : "movie";
  const title   = item?.title || item?.name || "";
  const season  = item?.season  ?? 1;
  const episode = item?.episode ?? 1;

  const [playerSource,     setPlayerSource]     = useState(() => storage.get("playerSource") || NON_ANIME_DEFAULT_SOURCE);
  const [autoSourceStatus, setAutoSourceStatus] = useState("testing");
  const [showSourceMenu,   setShowSourceMenu]   = useState(false);
  const [webviewLoading,   setWebviewLoading]   = useState(true);
  const [related,          setRelated]          = useState([]);
  const [details,          setDetails]          = useState(null);
  const [trailerKey,       setTrailerKey]       = useState(null);
  const [showTrailer,      setShowTrailer]      = useState(false);
  const [menuPos,          setMenuPos]          = useState(null);
  const [m3u8Url,          setM3u8Url]          = useState(null);
  const [interceptedSubs,  setInterceptedSubs]  = useState([]);
  const [showDownload,     setShowDownload]     = useState(false);
  const [gateModal,        setGateModal]        = useState(null);
  const [pipOpen,          setPipOpen]          = useState(false);
  const [downloaderFolder, setDownloaderFolder] = useState(() => storage.get("downloaderFolder") || "");

  const webviewRef = useRef(null);
  const iframeRef  = useRef(null);
  const sourceRef  = useRef(null);

  // ── Fetch details + trailer ──────────────────────────────────────────────
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

  // ── Fetch related ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!item?.id || !apiKey) return;
    let mounted = true;
    tmdbFetch(`/${type}/${item.id}/recommendations`, apiKey)
      .then((d) => { if (mounted) setRelated((d.results || []).slice(0, 14)); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [item?.id, type, apiKey]);

  // ── Auto source detection — respects stored preference ──────────────────
  useEffect(() => {
    if (!item?.id) return;
    if (preFoundSource) {
      setPlayerSource(preFoundSource);
      setAutoSourceStatus("found");
      return;
    }
    let cancelled = false;
    setAutoSourceStatus("testing");
    if (typeof findWorkingSource === "function") {
      findWorkingSource(type, item.id, season, episode, playerSource).then((id) => {
        if (cancelled) return;
        // Only switch if our stored source is actually dead
        if (id && id !== playerSource) { setPlayerSource(id); storage.set("playerSource", id); }
        setAutoSourceStatus(id ? "found" : "failed");
      });
    } else {
      setAutoSourceStatus("found");
    }
    return () => { cancelled = true; };
  }, [item?.id, type, season, episode, preFoundSource]);

  // ── Push to history once ─────────────────────────────────────────────────
  useEffect(() => {
    if (!item) return;
    onHistory?.({ ...item, media_type: type, season, episode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // ── Reset intercepted data on source/content change ──────────────────────
  useEffect(() => {
    setM3u8Url(null);
    setInterceptedSubs([]);
  }, [playerSource, item?.id, season, episode]);

  // ── Electron M3U8 / subtitle listeners ───────────────────────────────────
  useEffect(() => {
    if (!window.electron) return;
    const handler = window.electron.onM3u8Found((url) => {
      setM3u8Url((prev) => (prev !== url ? url : prev));
    });
    return () => window.electron.offM3u8Found(handler);
  }, []);

  useEffect(() => {
    if (!window.electron) return;
    const handler = window.electron.onSubtitleFound(({ url, lang }) => {
      if (!url || !url.toLowerCase().includes(".vtt")) return;
      setInterceptedSubs((prev) => {
        const filtered = prev.filter((s) => s.lang !== lang);
        return [...filtered, { url, lang: lang || "unknown" }];
      });
    });
    return () => window.electron.offSubtitleFound(handler);
  }, []);

  // ── PiP listeners ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) return;
    const openH  = window.electron?.onPipOpened?.(() => setPipOpen(true));
    const closeH = window.electron?.onPipClosed?.(() => setPipOpen(false));
    return () => {
      if (openH)  window.electron?.offPipOpened?.(openH);
      if (closeH) window.electron?.offPipClosed?.(closeH);
    };
  }, [isElectron]);

  // ── Build embed URL ───────────────────────────────────────────────────────
  const embedUrl = useMemo(() => {
    if (!item?.id) return "about:blank";
    return getSourceUrl(playerSource, type, item.id, season, episode);
  }, [playerSource, type, item?.id, season, episode]);

  // ── Reset loading state on any content/source change ─────────────────────
  useEffect(() => {
    setWebviewLoading(true);
  }, [playerSource, item?.id, season, episode]);

  // ── Electron webview: CSS injection to kill embed loading screens + 1.5s timeout ──
  useEffect(() => {
    if (!isElectron) return;
    const wv = webviewRef.current;
    if (!wv) return;
    let active = true;
    const done = () => { if (active) setWebviewLoading(false); };

    const onDomReady = () => {
      try {
        wv.executeJavaScript(`
          (function() {
            if (window.__novasparkInjected) return;
            window.__novasparkInjected = true;
            var css = [
              '[class*="loading" i],[class*="loader" i],[class*="fetching" i],[class*="spinner" i],',
              '[id*="loading" i],[id*="loader" i],[id*="fetching" i],[id*="spinner" i],',
              '.loading,.loader,.fetching,.spinner,.preloader,.preload,',
              '.vidfast-loader,.vidfast-loading,.vf-loader,.videasy-loader,.videasy-preloader,',
              '.autoembed-loader,.ae-loader { display:none !important; opacity:0 !important; visibility:hidden !important; }',
              'video,iframe,.player,#player,.video-player,#video-player { opacity:1 !important; visibility:visible !important; display:block !important; }'
            ].join('');
            var s = document.createElement('style');
            s.id = '__novaspark-hide';
            s.textContent = css;
            document.head.appendChild(s);
            var hideText = function() {
              document.querySelectorAll('*').forEach(function(el) {
                if (el.children.length === 0 && el.textContent) {
                  var t = el.textContent.toUpperCase();
                  if (t.includes('FETCHING') || t.includes('ONE MOMENT') || t.includes('LOADING') || t.includes('PLEASE WAIT')) {
                    el.style.display = 'none';
                  }
                }
              });
            };
            hideText();
            var obs = new MutationObserver(hideText);
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(function() { obs.disconnect(); }, 5000);
            document.querySelectorAll('video').forEach(function(v) {
              v.style.opacity = '1'; v.style.visibility = 'visible'; v.style.display = 'block';
              if (v.paused && v.readyState >= 2) v.play().catch(function(){});
            });
          })()
        `).catch(() => {});
      } catch (_) {}
    };

    wv.addEventListener("dom-ready", onDomReady);
    wv.addEventListener("did-stop-loading", done);
    wv.addEventListener("did-fail-load", done);
    // 1.5s hard cap so overlay never lingers
    const tid = setTimeout(() => { if (active) setWebviewLoading(false); }, 1500);

    return () => {
      active = false;
      clearTimeout(tid);
      try { wv.removeEventListener("dom-ready", onDomReady); } catch (_) {}
      try { wv.removeEventListener("did-stop-loading", done); } catch (_) {}
      try { wv.removeEventListener("did-fail-load", done); } catch (_) {}
    };
  }, [embedUrl, isElectron]);

  // ── Web iframe: 3s fallback timeout ──────────────────────────────────────
  useEffect(() => {
    if (isElectron) return;
    let active = true;
    const tid = setTimeout(() => { if (active) setWebviewLoading(false); }, 3000);
    return () => { active = false; clearTimeout(tid); };
  }, [embedUrl, isElectron]);

  // ── Source menu close on outside click ───────────────────────────────────
  const switchSource = useCallback((id) => {
    setShowSourceMenu(false);
    if (id === playerSource) return;
    setPlayerSource(id);
    storage.set("playerSource", id);
  }, [playerSource]);

  useEffect(() => {
    if (!showSourceMenu) return;
    const close = (e) => {
      if (!sourceRef.current?.contains(e.target) && !e.target.closest(".watch-source-dropdown"))
        setShowSourceMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showSourceMenu]);

  // ── Derived display values ────────────────────────────────────────────────
  const d       = details || item || {};
  const year    = (d.release_date || d.first_air_date || "").slice(0, 4);
  const rating  = d.vote_average ? d.vote_average.toFixed(1) : null;
  const runtime = d.runtime
    ? `${d.runtime} min`
    : d.episode_run_time?.[0]
      ? `${d.episode_run_time[0]} min/ep`
      : null;

  const currentLabel = PLAYER_SOURCES?.find((s) => s.id === playerSource)?.label ?? playerSource;
  const planId = isPremium?.planId || (isPremium ? "premium" : "free");

  const currentDownload = useMemo(() => {
    if (!downloads?.length) return null;
    if (type === "movie") {
      return downloads.find(
        (dl) =>
          dl.mediaType === "movie" &&
          (dl.tmdbId === item.id || dl.mediaId === item.id) &&
          (dl.status === "completed" || dl.status === "local" || dl.status === "downloading"),
      );
    }
    return downloads.find(
      (dl) =>
        dl.mediaType === "tv" &&
        (dl.tmdbId === item.id || dl.mediaId === item.id) &&
        dl.season === season &&
        dl.episode === episode &&
        (dl.status === "completed" || dl.status === "local" || dl.status === "downloading"),
    );
  }, [downloads, item?.id, type, season, episode]);

  const mediaName = useMemo(() => {
    const base = `${title}${year ? " (" + year + ")" : ""}`;
    return type === "tv"
      ? `${base} S${String(season).padStart(2, "0")} E${String(episode).padStart(2, "0")}`
      : base;
  }, [title, year, type, season, episode]);

  const handleUpgrade = useCallback(() => {
    window.dispatchEvent(new CustomEvent("novaspark:upgrade"));
  }, []);

  if (!item) return null;

  return (
    <div className="watch-page fade-in">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="watch-topbar">
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6 }}><BackIcon /> Back</button>
        <div className="watch-topbar-title">
          {title}
          {type === "tv" && (
            <span className="watch-topbar-ep">&nbsp;·&nbsp;S{season} E{episode}</span>
          )}
        </div>
      </div>

      {/* ── Player ───────────────────────────────────────────────────────── */}
      <div className="watch-player-wrap" style={{ background: "#000", position: "relative" }}>

        {/* Solid black spinner overlay — no text ever */}
        {webviewLoading && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 5,
            background: "#000",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div className="spinner" />
          </div>
        )}

        {isElectron ? (
          <webview
            ref={webviewRef}
            src={embedUrl}
            partition="persist:player"
            allowpopups="true"
            plugins="true"
            nodeintegration="no"
            webpreferences="contextIsolation=yes,nodeIntegration=no,webSecurity=no,allowRunningInsecureContent=yes"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              border: "none", background: "#000",
              opacity: webviewLoading ? 0 : 1,
              transition: "opacity 0.25s ease",
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
              position: "absolute", inset: 0, width: "100%", height: "100%",
              border: "none", background: "#000",
              opacity: webviewLoading ? 0 : 1,
              transition: "opacity 0.25s ease",
            }}
          />
        )}

        {/* PiP overlay */}
        {pipOpen && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 20,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.92)", gap: 16,
          }}>
            <PopOutIcon size={36} />
            <span style={{ fontSize: 15, color: "var(--text1)", fontWeight: 600 }}>Playing in pop-out window</span>
            <button className="player-overlay-btn" onClick={() => window.electron?.closePipWindow?.()}>Close pop-out &amp; return</button>
          </div>
        )}

        {/* Source / PiP control bar */}
        <div className="watch-source-bar" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            ref={sourceRef}
            className="player-overlay-btn"
            style={{ position: "static" }}
            onClick={() => {
              if (!canSwitchSource(planId)) { setGateModal("source"); return; }
              const rect = sourceRef.current?.getBoundingClientRect();
              if (rect) setMenuPos({ top: rect.bottom + 6, left: rect.left });
              setShowSourceMenu((v) => !v);
            }}
          >
            <SourceIcon /> {currentLabel}
          </button>

          {isElectron && (
            <button
              className="player-overlay-btn"
              onClick={() => {
                if (pipOpen) { window.electron?.closePipWindow?.(); return; }
                if (!canPopOut(planId)) { setGateModal("pip"); return; }
                window.electron?.openPipWindow?.(embedUrl, title);
              }}
              title={pipOpen ? "Close pop-out" : "Pop out player"}
              style={pipOpen ? { color: "var(--red)" } : undefined}
            >
              <PopOutIcon />
            </button>
          )}
        </div>

        {/* Source dropdown */}
        {showSourceMenu && menuPos && PLAYER_SOURCES && (
          <div
            className="source-dropdown source-dropdown--fixed watch-source-dropdown"
            style={{ top: menuPos.top, left: menuPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {PLAYER_SOURCES.map((src) => (
              <button
                key={src.id}
                className={"source-dropdown__item" + (playerSource === src.id ? " source-dropdown__item--active" : "")}
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

      {/* ── Meta row ─────────────────────────────────────────────────────── */}
      <div className="watch-meta">
        <div className="watch-meta-left">
          <div className="watch-meta-title">{title}</div>
          <div className="watch-meta-info">
            {rating && <span className="detail-rating"><StarIcon /> {rating}</span>}
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
            <p className="watch-meta-overview">{(details || item).overview}</p>
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
          <button
            className="btn btn-secondary"
            onClick={() => {
              if (currentDownload) { onGoToDownloads?.(currentDownload.id); return; }
              if (!canDownload(planId)) { setGateModal("download"); return; }
              setShowDownload(true);
            }}
            title={
              currentDownload
                ? (currentDownload.status === "downloading" ? "Downloading… click to view" : "Downloaded — click to view")
                : "Download for offline"
            }
            style={
              currentDownload
                ? {
                    color: currentDownload.status === "downloading" ? "var(--red)" : "#4caf50",
                    borderColor: currentDownload.status === "downloading" ? "rgba(229,9,20,0.3)" : "rgba(76,175,80,0.3)",
                  }
                : undefined
            }
          >
            {currentDownload ? (
              currentDownload.status === "downloading" ? "↓ Downloading…" : "✓ Downloaded"
            ) : (
              <><DownloadIcon /> Download</>
            )}
          </button>
          <button className="btn btn-ghost" onClick={onBack}><BackIcon /> Back</button>
        </div>
      </div>

      {/* ── Related ──────────────────────────────────────────────────────── */}
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
                      <img src={imgUrl(rel.poster_path)} alt={rel.title || rel.name} loading="lazy" />
                    ) : (
                      <div className="no-poster"><PlayIcon /></div>
                    )}
                    <div className="card-overlay"><div className="card-play"><PlayIcon /></div></div>
                    {rel.vote_average > 0 && (
                      <div className="card-badge">★ {rel.vote_average.toFixed(1)}</div>
                    )}
                  </div>
                  <div className="card-info">
                    <div className="card-title">{rel.title || rel.name}</div>
                    <div className="card-year">{(rel.release_date || rel.first_air_date || "").slice(0, 4)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showTrailer && trailerKey && (
        <TrailerModal trailerKey={trailerKey} title={title} onClose={() => setShowTrailer(false)} />
      )}

      {showDownload && (
        <DownloadModal
          onClose={() => setShowDownload(false)}
          m3u8Url={m3u8Url}
          subtitles={interceptedSubs}
          mediaName={mediaName}
          downloaderFolder={downloaderFolder}
          setDownloaderFolder={(folder) => { setDownloaderFolder(folder); storage.set("downloaderFolder", folder); }}
          onOpenSettings={() => {}}
          onDownloadStarted={onDownloadStarted}
          mediaId={item.id}
          mediaType={type}
          season={type === "tv" ? season : null}
          episode={type === "tv" ? episode : null}
          posterPath={d.poster_path}
          tmdbId={item.id}
        />
      )}

      {gateModal && (
        <PremiumGate
          feature={gateModal}
          onUpgrade={handleUpgrade}
          onClose={() => setGateModal(null)}
        />
      )}
    </div>
  );
}