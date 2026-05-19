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
  BackIcon, StarIcon, SourceIcon, PlayIcon,
  BookmarkIcon, BookmarkFillIcon, TrailerIcon,
  PopOutIcon, DownloadIcon,
} from "../components/Icons";
import TrailerModal from "../components/TrailerModal";
import DownloadModal from "../components/DownloadModal";
import { canDownload, canPopOut, canSwitchSource } from "../utils/gate";
import PremiumGate from "../components/PremiumGate";

// ─── Embed injection ──────────────────────────────────────────────────────────
// Runs the moment dom-ready fires — hides ALL embed loading chrome before it paints
const _EMBED_CSS = `
[class*="loading"i],[class*="loader"i],[class*="fetching"i],[class*="preload"i],
[id*="loading"i],[id*="loader"i],[id*="fetching"i],
.spinner,.preloader,.lds-ring,.lds-spinner,.vjs-loading-spinner,
.jw-icon-loading,.plyr__loading {
  display:none!important;opacity:0!important;visibility:hidden!important;
}
video{opacity:1!important;visibility:visible!important;display:block!important;}
`;

// Text-node walker — kills "FETCHING, ONE MOMENT..." regardless of how it's rendered
const _EMBED_JS = `(function(){
  if(window.__ns)return;window.__ns=true;
  var BAD=['FETCHING, ONE MOMENT...','FETCHING','ONE MOMENT...','PLEASE WAIT','LOADING...','LOADING'];
  function run(){try{document.querySelectorAll('body *').forEach(function(el){
    if(!el.childElementCount){
      var t=(el.textContent||'').trim().toUpperCase();
      if(BAD.some(function(k){return t===k||t.startsWith(k);})){
        var p=el;for(var i=0;i<4;i++){var par=p.parentElement;if(par&&par!==document.body)p=par;else break;}
        p.style.cssText='display:none!important;opacity:0!important;pointer-events:none!important;';
      }
    }
  });}catch(e){}}
  run();
  var obs=new MutationObserver(run);
  obs.observe(document.body,{childList:true,subtree:true});
  setTimeout(function(){obs.disconnect();},12000);
})()`;

// ─── Server toast ─────────────────────────────────────────────────────────────
function ServerToast({ status, sourceLabel }) {
  const [show,  setShow]  = useState(false);
  const [fade,  setFade]  = useState(false);
  const timerRef          = useRef(null);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (status === "testing" || status === "retrying") {
      setShow(true); setFade(false);
    } else if (status === "found") {
      setFade(false);
      timerRef.current = setTimeout(() => { setFade(true); timerRef.current = setTimeout(() => setShow(false), 500); }, 2500);
    } else if (status === "failed") {
      setFade(false);
      timerRef.current = setTimeout(() => { setFade(true); timerRef.current = setTimeout(() => setShow(false), 500); }, 4000);
    }
    return () => clearTimeout(timerRef.current);
  }, [status, sourceLabel]);

  if (!show) return null;
  return (
    <div style={{
      position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",
      zIndex:9999,background:"rgba(8,8,8,0.97)",border:"1px solid rgba(255,255,255,0.08)",
      borderRadius:12,padding:"11px 22px",display:"flex",alignItems:"center",gap:10,
      color:"#fff",fontSize:13,fontWeight:500,backdropFilter:"blur(12px)",
      WebkitBackdropFilter:"blur(12px)",boxShadow:"0 6px 32px rgba(0,0,0,0.7)",
      opacity:fade?0:1,transition:"opacity 0.45s ease",pointerEvents:"none",
    }}>
      {(status === "testing" || status === "retrying") ? (<>
        <div style={{width:14,height:14,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.15)",
          borderTopColor:"#fff",animation:"spin 0.7s linear infinite",flexShrink:0}}/>
        <span>{status === "retrying" ? "Trying another server…" : "Please wait, finding best server…"}</span>
      </>) : status === "found" ? (<>
        <span style={{color:"#4caf50",fontSize:17,lineHeight:1}}>✓</span>
        <span>Playing on <strong>{sourceLabel}</strong></span>
      </>) : (<>
        <span style={{color:"#ff5252",fontSize:17,lineHeight:1}}>⚠</span>
        <span>Could not load — check your connection</span>
      </>)}
    </div>
  );
}

export default function WatchPage({
  item, apiKey, onBack, onSelect, progress, saveProgress, onHistory,
  watched, onMarkWatched, onMarkUnwatched, onSave, isSaved,
  downloads, onDownloadStarted, onGoToDownloads,
  sourceId: preFoundSource, isPremium,
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

  // Beast engine refs
  const webviewRef    = useRef(null);
  const iframeRef     = useRef(null);
  const sourceRef     = useRef(null);
  const pollRef       = useRef(null);   // video-ready poll interval
  const retryQueueRef = useRef([]);     // ordered source ids to try
  const retryIdxRef   = useRef(0);      // next index in queue

  // ── Build retry queue once per content item ─────────────────────────────
  useEffect(() => {
    const all = PLAYER_SOURCES.filter((s) => !s.async && !s.tag).map((s) => s.id);
    const start = all.indexOf(playerSource);
    const ordered = start >= 0
      ? [...all.slice(start), ...all.slice(0, start)]
      : [playerSource, ...all.filter((id) => id !== playerSource)];
    retryQueueRef.current = ordered;
    retryIdxRef.current = 1; // 0 is already loading
  }, [item?.id, season, episode]); // reset on actual content change only

  // ── Silent auto-retry: pick next source, chain fires automatically ───────
  const tryNextSource = useCallback(() => {
    const idx = retryIdxRef.current;
    if (idx >= retryQueueRef.current.length) {
      setAutoSourceStatus("failed");
      setWebviewLoading(false);
      return;
    }
    const nextId = retryQueueRef.current[idx];
    retryIdxRef.current += 1;
    setAutoSourceStatus("retrying");
    setPlayerSource(nextId);
    storage.set("playerSource", nextId);
    // webviewLoading resets to true via the embedUrl-change effect below
  }, []);

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

  // ── Initial source detection (runs once, respects stored preference) ─────
  useEffect(() => {
    if (!item?.id) return;
    if (preFoundSource) { setPlayerSource(preFoundSource); setAutoSourceStatus("found"); return; }
    let cancelled = false;
    setAutoSourceStatus("testing");
    if (typeof findWorkingSource === "function") {
      findWorkingSource(type, item.id, season, episode, playerSource).then((id) => {
        if (cancelled) return;
        if (id && id !== playerSource) { setPlayerSource(id); storage.set("playerSource", id); }
        setAutoSourceStatus(id ? "found" : "failed");
      });
    } else { setAutoSourceStatus("found"); }
    return () => { cancelled = true; };
  }, [item?.id, type, season, episode, preFoundSource]);

  // ── History ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!item) return;
    onHistory?.({ ...item, media_type: type, season, episode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // ── Reset on URL change ──────────────────────────────────────────────────
  useEffect(() => {
    setM3u8Url(null); setInterceptedSubs([]);
  }, [playerSource, item?.id, season, episode]);

  // ── Electron listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electron) return;
    const h = window.electron.onM3u8Found((url) => setM3u8Url((p) => p !== url ? url : p));
    return () => window.electron.offM3u8Found(h);
  }, []);
  useEffect(() => {
    if (!window.electron) return;
    const h = window.electron.onSubtitleFound(({ url, lang }) => {
      if (!url || !url.toLowerCase().includes(".vtt")) return;
      setInterceptedSubs((prev) => [...prev.filter((s) => s.lang !== lang), { url, lang: lang || "unknown" }]);
    });
    return () => window.electron.offSubtitleFound(h);
  }, []);
  useEffect(() => {
    if (!isElectron) return;
    const h1 = window.electron?.onPipOpened?.(() => setPipOpen(true));
    const h2 = window.electron?.onPipClosed?.(() => setPipOpen(false));
    return () => {
      if (h1) window.electron?.offPipOpened?.(h1);
      if (h2) window.electron?.offPipClosed?.(h2);
    };
  }, [isElectron]);

  // ── Embed URL ────────────────────────────────────────────────────────────
  const embedUrl = useMemo(() => {
    if (!item?.id) return "about:blank";
    return getSourceUrl(playerSource, type, item.id, season, episode);
  }, [playerSource, type, item?.id, season, episode]);

  // ── Reset overlay whenever URL changes ──────────────────────────────────
  useEffect(() => {
    setWebviewLoading(true);
  }, [embedUrl]);

  // ─── BEAST ENGINE — Electron ──────────────────────────────────────────────
  // 1. On dom-ready: inject CSS + JS (kills embed loading screens)
  // 2. Poll every 300ms for video.readyState >= 2 + duration > 0
  // 3. On video network error: immediately retry next source (no waiting)
  // 4. Hard timeout 12s: retry next source silently
  // 5. Repeat until video plays or all sources exhausted
  useEffect(() => {
    if (!isElectron) return;
    const wv = webviewRef.current;
    if (!wv) return;

    let active = true;
    clearInterval(pollRef.current);

    const markReady = () => {
      if (!active) return;
      active = false;
      clearInterval(pollRef.current);
      setAutoSourceStatus((s) => (s === "retrying" || s === "testing") ? "found" : s);
      setWebviewLoading(false);
    };

    const onFail = () => {
      if (!active) return;
      active = false;
      clearInterval(pollRef.current);
      clearTimeout(hardTimeout); // eslint-disable-line no-use-before-define
      tryNextSource();
    };

    const onDomReady = async () => {
      // Kill embed loading chrome before it paints
      try { await wv.insertCSS(_EMBED_CSS); } catch (_) {}
      try { await wv.executeJavaScript(_EMBED_JS); } catch (_) {}

      // Poll for genuine video readiness
      pollRef.current = setInterval(async () => {
        if (!active) { clearInterval(pollRef.current); return; }
        try {
          const r = await wv.executeJavaScript(
            `(()=>{const v=document.querySelector('video');` +
            `if(!v)return{ready:false,err:false};` +
            `return{` +
            `ready:v.readyState>=2&&v.duration>0&&!isNaN(v.duration),` +
            `err:v.networkState===3||!!(v.error&&v.error.code>0)` +
            `};})()`
          );
          if (r.ready)     markReady();
          else if (r.err)  onFail(); // instant retry on video network error
        } catch { markReady(); }
      }, 300);
    };

    wv.addEventListener("dom-ready", onDomReady);
    wv.addEventListener("did-fail-load", onFail);

    // 12 s hard cap — if video never started, try next source
    const hardTimeout = setTimeout(onFail, 12000);

    return () => {
      active = false;
      clearInterval(pollRef.current);
      clearTimeout(hardTimeout);
      try { wv.removeEventListener("dom-ready", onDomReady); } catch (_) {}
      try { wv.removeEventListener("did-fail-load", onFail); } catch (_) {}
    };
  }, [embedUrl, isElectron, tryNextSource]);

  // ─── Web iframe fallback ─────────────────────────────────────────────────
  useEffect(() => {
    if (isElectron) return;
    let active = true;
    const tid = setTimeout(() => { if (active) setWebviewLoading(false); }, 8000);
    return () => { active = false; clearTimeout(tid); };
  }, [embedUrl, isElectron]);

  // ── Source menu ───────────────────────────────────────────────────────────
  const switchSource = useCallback((id) => {
    setShowSourceMenu(false);
    if (id === playerSource) return;
    // Manual switch: rebuild queue from this source
    const all = PLAYER_SOURCES.filter((s) => !s.async && !s.tag).map((s) => s.id);
    const start = all.indexOf(id);
    retryQueueRef.current = start >= 0
      ? [...all.slice(start), ...all.slice(0, start)]
      : [id, ...all.filter((x) => x !== id)];
    retryIdxRef.current = 1;
    setPlayerSource(id); storage.set("playerSource", id);
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

  // ── Derived values ────────────────────────────────────────────────────────
  const d           = details || item || {};
  const year        = (d.release_date || d.first_air_date || "").slice(0, 4);
  const rating      = d.vote_average ? d.vote_average.toFixed(1) : null;
  const runtime     = d.runtime ? `${d.runtime} min` : d.episode_run_time?.[0] ? `${d.episode_run_time[0]} min/ep` : null;
  const currentLabel = PLAYER_SOURCES?.find((s) => s.id === playerSource)?.label ?? playerSource;
  const planId       = isPremium?.planId || (isPremium ? "premium" : "free");

  const currentDownload = useMemo(() => {
    if (!downloads?.length) return null;
    if (type === "movie") {
      return downloads.find((dl) => dl.mediaType === "movie" &&
        (dl.tmdbId === item.id || dl.mediaId === item.id) &&
        (dl.status === "completed" || dl.status === "local" || dl.status === "downloading"));
    }
    return downloads.find((dl) => dl.mediaType === "tv" &&
      (dl.tmdbId === item.id || dl.mediaId === item.id) &&
      dl.season === season && dl.episode === episode &&
      (dl.status === "completed" || dl.status === "local" || dl.status === "downloading"));
  }, [downloads, item?.id, type, season, episode]);

  const mediaName = useMemo(() => {
    const base = `${title}${year ? " (" + year + ")" : ""}`;
    return type === "tv" ? `${base} S${String(season).padStart(2,"0")} E${String(episode).padStart(2,"0")}` : base;
  }, [title, year, type, season, episode]);

  const handleUpgrade = useCallback(() => window.dispatchEvent(new CustomEvent("novaspark:upgrade")), []);

  if (!item) return null;

  return (
    <div className="watch-page fade-in">

      {/* ── Server status toast ──────────────────────────────────────────── */}
      <ServerToast status={autoSourceStatus} sourceLabel={currentLabel} />

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="watch-topbar">
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6 }}><BackIcon /> Back</button>
        <div className="watch-topbar-title">
          {title}
          {type === "tv" && <span className="watch-topbar-ep">&nbsp;·&nbsp;S{season} E{episode}</span>}
        </div>
      </div>

      {/* ── Player ───────────────────────────────────────────────────────── */}
      <div className="watch-player-wrap" style={{ background: "#000", position: "relative" }}>

        {/* Black overlay — only lifts when video.readyState >= 2 */}
        {webviewLoading && (
          <div style={{
            position:"absolute",inset:0,zIndex:5,background:"#000",
            display:"flex",alignItems:"center",justifyContent:"center",
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
              position:"absolute",inset:0,width:"100%",height:"100%",
              border:"none",background:"#000",
              opacity:webviewLoading?0:1,transition:"opacity 0.3s ease",
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
              position:"absolute",inset:0,width:"100%",height:"100%",
              border:"none",background:"#000",
              opacity:webviewLoading?0:1,transition:"opacity 0.3s ease",
            }}
          />
        )}

        {pipOpen && (
          <div style={{
            position:"absolute",inset:0,zIndex:20,
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
            background:"rgba(0,0,0,0.92)",gap:16,
          }}>
            <PopOutIcon size={36} />
            <span style={{fontSize:15,color:"var(--text1)",fontWeight:600}}>Playing in pop-out window</span>
            <button className="player-overlay-btn" onClick={() => window.electron?.closePipWindow?.()}>
              Close pop-out &amp; return
            </button>
          </div>
        )}

        {/* Controls bar */}
        <div className="watch-source-bar" style={{ display:"flex",gap:8,alignItems:"center" }}>
          <button
            ref={sourceRef}
            className="player-overlay-btn"
            style={{ position:"static" }}
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
              style={pipOpen ? { color:"var(--red)" } : undefined}
            >
              <PopOutIcon />
            </button>
          )}
        </div>

        {showSourceMenu && menuPos && PLAYER_SOURCES && (
          <div
            className="source-dropdown source-dropdown--fixed watch-source-dropdown"
            style={{ top:menuPos.top, left:menuPos.left }}
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

      {/* ── Meta ─────────────────────────────────────────────────────────── */}
      <div className="watch-meta">
        <div className="watch-meta-left">
          <div className="watch-meta-title">{title}</div>
          <div className="watch-meta-info">
            {rating  && <span className="detail-rating"><StarIcon /> {rating}</span>}
            {year    && <span>{year}</span>}
            {runtime && <span>{runtime}</span>}
            {type === "tv" && (
              <span className="tag tag-red">
                S{season} · E{episode}
                {item?.episodeName ? ` · ${item.episodeName}` : ""}
              </span>
            )}
          </div>
          {(details || item)?.overview && <p className="watch-meta-overview">{(details || item).overview}</p>}
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
            title={currentDownload
              ? (currentDownload.status === "downloading" ? "Downloading… click to view" : "Downloaded — click to view")
              : "Download for offline"}
            style={currentDownload ? {
              color: currentDownload.status === "downloading" ? "var(--red)" : "#4caf50",
              borderColor: currentDownload.status === "downloading" ? "rgba(229,9,20,0.3)" : "rgba(76,175,80,0.3)",
            } : undefined}
          >
            {currentDownload
              ? (currentDownload.status === "downloading" ? "↓ Downloading…" : "✓ Downloaded")
              : <><DownloadIcon /> Download</>}
          </button>
          <button className="btn btn-ghost" onClick={onBack}><BackIcon /> Back</button>
        </div>
      </div>

      {/* ── More Like This ───────────────────────────────────────────────── */}
      {related.length > 0 && (
        <div className="section" style={{ paddingTop: 8 }}>
          <div className="section-title">More Like This</div>
          <div className="cards-grid">
            {related.map((rel) => {
              const rType = rel.title ? "movie" : "tv";
              return (
                <div key={`${rType}_${rel.id}`} className="card"
                  onClick={() => onSelect?.({ ...rel, media_type: rType })} style={{ cursor:"pointer" }}>
                  <div className="card-poster">
                    {rel.poster_path
                      ? <img src={imgUrl(rel.poster_path)} alt={rel.title || rel.name} loading="lazy" />
                      : <div className="no-poster"><PlayIcon /></div>}
                    <div className="card-overlay"><div className="card-play"><PlayIcon /></div></div>
                    {rel.vote_average > 0 && <div className="card-badge">★ {rel.vote_average.toFixed(1)}</div>}
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
        <PremiumGate feature={gateModal} onUpgrade={handleUpgrade} onClose={() => setGateModal(null)} />
      )}
    </div>
  );
}