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
import DataMeterWidget from "../components/DataMeterWidget";

// ── Silence all TMDB / network error alerts — never expose internals ──────────
// Suppress any upstream setApiErrorHandlers callbacks silently
import { setApiErrorHandlers } from "../utils/api";
setApiErrorHandlers(
  () => { /* auth error — silent */ },
  () => { /* unreachable — silent */ }
);

// ── Embed injection ───────────────────────────────────────────────────────────
const _EMBED_CSS = `
[class*="loading"i],[class*="loader"i],[class*="fetching"i],[class*="preload"i],
[id*="loading"i],[id*="loader"i],[id*="fetching"i],
.spinner,.preloader,.lds-ring,.lds-spinner,.vjs-loading-spinner,
.jw-icon-loading,.plyr__loading{
  display:none!important;opacity:0!important;visibility:hidden!important;
}
video{opacity:1!important;visibility:visible!important;display:block!important;}
`;
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

// ── Autoplay enforcer — injected into webview/iframe after load ───────────────
// Clicks play buttons, unmutes, removes overlay blockers across major embed players
const _AUTOPLAY_JS = `(function(){
  if(window.__nsAuto)return; window.__nsAuto=true;
  function tryPlay(){
    // 1. Direct video element
    var v=document.querySelector('video');
    if(v){
      v.muted=false;
      if(v.paused){
        v.play().catch(function(){
          // Browsers block unmuted autoplay — retry muted then unmute
          v.muted=true;
          v.play().then(function(){ setTimeout(function(){ v.muted=false; },800); }).catch(function(){});
        });
      }
    }
    // 2. Common play button selectors across embed players
    var selectors=[
      '.jw-icon-display','[aria-label="Play"]','[title="Play"]',
      '.vjs-big-play-button','.plyr__control--overlaid',
      '.play-button','button.play','[class*="play"][class*="btn"]',
      '[class*="PlayBtn"]','[class*="play_btn"]',
      '[data-testid="play-button"]','.ytp-large-play-button',
    ];
    for(var i=0;i<selectors.length;i++){
      var btn=document.querySelector(selectors[i]);
      if(btn&&btn.offsetParent!==null){ btn.click(); break; }
    }
  }
  // Fire immediately, then retry a few times for slow-loading players
  tryPlay();
  var attempts=0;
  var id=setInterval(function(){
    attempts++;
    var v=document.querySelector('video');
    if(v&&!v.paused){ clearInterval(id); return; }
    tryPlay();
    if(attempts>=8) clearInterval(id);
  },800);
})()`;

// ── postMessage play/pause event normaliser ───────────────────────────────────
// Handles JW Player, VideoJS, Plyr, Vidlink, VidSrc, embed.su patterns
function parsePlayerMessage(data) {
  try {
    const d = typeof data === "string" ? JSON.parse(data) : data;
    if (!d || typeof d !== "object") return null;

    const evt = String(d.event || d.type || d.action || d.playbackState || d.state || "").toLowerCase();

    // Play signals
    if (
      evt === "play" || evt === "playing" || evt === "resume" ||
      evt === "started" || evt === "playbackstate_playing" ||
      d.playing === true || d.isPlaying === true ||
      d.playbackState === "playing"
    ) return "play";

    // Pause / stop signals
    if (
      evt === "pause" || evt === "paused" || evt === "stop" ||
      evt === "stopped" || evt === "ended" || evt === "complete" ||
      evt === "finish" || evt === "finished" || evt === "idle" ||
      evt === "playbackstate_paused" || evt === "playbackstate_ended" ||
      d.playing === false || d.isPlaying === false ||
      d.playbackState === "paused" || d.playbackState === "ended"
    ) return "pause";

    return null;
  } catch { return null; }
}

// ── Server toast ──────────────────────────────────────────────────────────────
function ServerToast({ status, sourceLabel }) {
  const [show, setShow] = useState(false);
  const [fade, setFade] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (status === "testing" || status === "retrying") { setShow(true); setFade(false); }
    else if (status === "found") {
      setFade(false);
      timerRef.current = setTimeout(() => {
        setFade(true);
        timerRef.current = setTimeout(() => setShow(false), 500);
      }, 2500);
    } else if (status === "failed") {
      setFade(false);
      timerRef.current = setTimeout(() => {
        setFade(true);
        timerRef.current = setTimeout(() => setShow(false), 500);
      }, 4000);
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
        <span>{status === "retrying" ? "Trying another server…" : "Finding best server…"}</span>
      </>) : status === "found" ? (<>
        <span style={{color:"#4caf50",fontSize:17,lineHeight:1}}>✓</span>
        <span>Playing on <strong>{sourceLabel}</strong></span>
      </>) : (<>
        <span style={{color:"#ff5252",fontSize:17,lineHeight:1}}>⚠</span>
        <span>Could not load — try another server</span>
      </>)}
    </div>
  );
}

// ── Skip Intro + Next Episode overlay ────────────────────────────────────────
function PlayerOverlayBtns({ showSkip, showNext, nextEpNum, onSkip, onNext }) {
  if (!showSkip && !showNext) return null;
  return (
    <div style={{
      position:"absolute",bottom:64,left:0,right:0,zIndex:20,
      display:"flex",alignItems:"flex-end",justifyContent:"space-between",
      padding:"0 20px",pointerEvents:"none",
    }}>
      <div style={{pointerEvents:"auto"}}>
        {showSkip && (
          <button onClick={onSkip} style={{
            background:"rgba(0,0,0,0.82)",backdropFilter:"blur(10px)",
            border:"2px solid rgba(255,255,255,0.4)",borderRadius:6,
            color:"#fff",fontSize:14,fontWeight:700,padding:"10px 22px",
            cursor:"pointer",letterSpacing:0.4,boxShadow:"0 4px 20px rgba(0,0,0,0.6)",
            animation:"skipPop 0.3s cubic-bezier(0.34,1.56,0.64,1)",
            display:"flex",alignItems:"center",gap:8,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
            Skip Intro
          </button>
        )}
      </div>
      <div style={{pointerEvents:"auto"}}>
        {showNext && (
          <button onClick={onNext} style={{
            background:"var(--red,#00b4a6)",borderRadius:7,
            border:"none",color:"#fff",fontSize:14,fontWeight:700,
            padding:"11px 22px",cursor:"pointer",
            display:"flex",alignItems:"center",gap:8,
            boxShadow:"0 4px 24px rgba(0,180,166,0.5)",
            animation:"skipPop 0.3s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            Next Episode
            {nextEpNum && <span style={{opacity:0.85}}>E{nextEpNum}</span>}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Episode thumbnail card ────────────────────────────────────────────────────
function EpisodeThumb({ ep, isActive, onPlay }) {
  return (
    <div
      onClick={onPlay}
      style={{
        flexShrink:0,width:210,borderRadius:10,overflow:"hidden",cursor:"pointer",
        border:isActive?"2px solid var(--red,#00b4a6)":"2px solid transparent",
        background:"rgba(255,255,255,0.03)",transition:"border-color 0.15s,transform 0.15s",
      }}
      onMouseEnter={(e)=>{ if(!isActive) e.currentTarget.style.borderColor="rgba(255,255,255,0.2)"; }}
      onMouseLeave={(e)=>{ if(!isActive) e.currentTarget.style.borderColor="transparent"; }}
    >
      <div style={{width:"100%",aspectRatio:"16/9",position:"relative",background:"rgba(255,255,255,0.06)"}}>
        {ep.still_path
          ? <img src={imgUrl(ep.still_path,"w300")} alt={ep.name}
              style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
          : <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",
              justifyContent:"center",color:"rgba(255,255,255,0.18)",fontSize:22}}>▶</div>
        }
        <div style={{
          position:"absolute",top:7,left:8,
          background:isActive?"var(--red,#00b4a6)":"rgba(0,0,0,0.78)",
          borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700,color:"#fff",letterSpacing:0.5,
        }}>E{ep.episode_number}</div>
        {isActive && (
          <div style={{position:"absolute",inset:0,background:"rgba(0,180,166,0.18)",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:34,height:34,borderRadius:"50%",background:"var(--red,#00b4a6)",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:13,boxShadow:"0 2px 16px rgba(0,180,166,0.7)"}}>▶</div>
          </div>
        )}
        {ep.runtime > 0 && (
          <div style={{position:"absolute",bottom:7,right:8,background:"rgba(0,0,0,0.75)",
            borderRadius:4,padding:"2px 6px",fontSize:10,color:"rgba(255,255,255,0.8)",fontWeight:600}}>
            {ep.runtime}m
          </div>
        )}
      </div>
      <div style={{padding:"9px 12px 11px"}}>
        <div style={{
          fontSize:12,fontWeight:700,lineHeight:1.35,
          color:isActive?"var(--red,#00b4a6)":"rgba(255,255,255,0.88)",
          overflow:"hidden",display:"-webkit-box",
          WebkitLineClamp:2,WebkitBoxOrient:"vertical",
        }}>{ep.name||`Episode ${ep.episode_number}`}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
export default function WatchPage({
  item, apiKey, onBack, onSelect, progress, saveProgress, onHistory,
  watched, onMarkWatched, onMarkUnwatched, onSave, isSaved,
  downloads, onDownloadStarted, onGoToDownloads,
  sourceId: preFoundSource, isPremium,
}) {
  const isElectron = !!window?.electron;
  const type    = item?.media_type === "tv" || !!item?.first_air_date ? "tv" : "movie";
  const title   = item?.title || item?.name || "";

  // ── Episode state ─────────────────────────────────────────────────────────
  const [currentSeason,  setCurrentSeason]  = useState(item?.season  ?? 1);
  const [currentEpisode, setCurrentEpisode] = useState(item?.episode ?? 1);

  useEffect(() => {
    setCurrentSeason(item?.season  ?? 1);
    setCurrentEpisode(item?.episode ?? 1);
  }, [item?.id]); // eslint-disable-line

  // ── Player state ──────────────────────────────────────────────────────────
  const [playerSource,      setPlayerSource]      = useState(() => storage.get("playerSource") || NON_ANIME_DEFAULT_SOURCE);
  const [autoSourceStatus,  setAutoSourceStatus]  = useState("testing");
  const [showSourceMenu,    setShowSourceMenu]     = useState(false);
  const [webviewLoading,    setWebviewLoading]     = useState(true);

  // ── Real play/pause state — the core of DataMeter accuracy ───────────────
  const [isActuallyPlaying, setIsActuallyPlaying] = useState(false);
  // Track whether we've received ANY real postMessage signal this session
  const receivedRealSignalRef = useRef(false);

  // ── Data + content state ──────────────────────────────────────────────────
  const [related,        setRelated]        = useState([]);
  const [relatedPage,    setRelatedPage]    = useState(1);
  const [relatedTotal,   setRelatedTotal]   = useState(1);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [details,        setDetails]        = useState(null);
  const [seasons,        setSeasons]        = useState([]);
  const [episodeList,    setEpisodeList]    = useState([]);
  const [trailerKey,     setTrailerKey]     = useState(null);
  const [showTrailer,    setShowTrailer]    = useState(false);
  const [menuPos,        setMenuPos]        = useState(null);
  const [m3u8Url,        setM3u8Url]        = useState(null);
  const [interceptedSubs,setInterceptedSubs]= useState([]);
  const [showDownload,   setShowDownload]   = useState(false);
  const [gateModal,      setGateModal]      = useState(null);
  const [pipOpen,        setPipOpen]        = useState(false);
  const [downloaderFolder,setDownloaderFolder] = useState(() => storage.get("downloaderFolder") || "");
  const [showSkipIntro,  setShowSkipIntro]  = useState(false);
  const [showNextEp,     setShowNextEp]     = useState(false);
  const [showSeasonMenu, setShowSeasonMenu] = useState(false);
  const [seasonMenuPos,  setSeasonMenuPos]  = useState(null);

  const webviewRef   = useRef(null);
  const iframeRef    = useRef(null);
  const sourceRef    = useRef(null);
  const seasonBtnRef = useRef(null);
  const carouselRef  = useRef(null);
  const pollRef      = useRef(null);
  const retryQueueRef = useRef([]);
  const retryIdxRef   = useRef(0);

  // ── Build retry queue ─────────────────────────────────────────────────────
  useEffect(() => {
    const all   = PLAYER_SOURCES.filter((s) => !s.async && !s.tag).map((s) => s.id);
    const start = all.indexOf(playerSource);
    retryQueueRef.current = start >= 0
      ? [...all.slice(start), ...all.slice(0, start)]
      : [playerSource, ...all.filter((id) => id !== playerSource)];
    retryIdxRef.current = 1;
  }, [item?.id, currentSeason, currentEpisode]);

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
  }, []);

  // ── Fetch show details + trailer ──────────────────────────────────────────
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
        if (type === "tv" && d.seasons) {
          setSeasons(d.seasons.filter((s) => s.season_number > 0));
        }
      })
      .catch(() => {}); // silent — no user-facing error
    return () => { mounted = false; };
  }, [item?.id, type, apiKey]);

  // ── Fetch episode list ────────────────────────────────────────────────────
  useEffect(() => {
    if (type !== "tv" || !item?.id || !apiKey) return;
    let mounted = true;
    setEpisodeList([]);
    tmdbFetch(`/tv/${item.id}/season/${currentSeason}`, apiKey)
      .then((d) => { if (mounted) setEpisodeList(d.episodes || []); })
      .catch(() => {}); // silent
    return () => { mounted = false; };
  }, [item?.id, type, currentSeason, apiKey]);

  // ── Scroll active episode into view ──────────────────────────────────────
  useEffect(() => {
    if (!carouselRef.current || !episodeList.length) return;
    const idx = episodeList.findIndex((e) => e.episode_number === currentEpisode);
    if (idx < 0) return;
    carouselRef.current.scrollTo({ left: Math.max(0, idx * 224 - 20), behavior: "smooth" });
  }, [currentEpisode, episodeList]);

  // ── Fetch related ─────────────────────────────────────────────────────────
  const fetchRelated = useCallback((page = 1) => {
    if (!item?.id || !apiKey) return;
    setRelatedLoading(true);
    tmdbFetch(`/${type}/${item.id}/recommendations?page=${page}`, apiKey)
      .then((d) => {
        const results = (d.results || []).map((r) => ({ ...r, media_type: r.title ? "movie" : "tv" }));
        setRelated((prev) => page === 1 ? results : [...prev, ...results]);
        setRelatedTotal(d.total_pages || 1);
        setRelatedPage(page);
      })
      .catch(() => {}) // silent
      .finally(() => setRelatedLoading(false));
  }, [item?.id, type, apiKey]);

  useEffect(() => { fetchRelated(1); }, [item?.id]); // eslint-disable-line

  // ── History ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!item) return;
    onHistory?.({ ...item, media_type: type, season: currentSeason, episode: currentEpisode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  // ── Initial source detection ──────────────────────────────────────────────
  useEffect(() => {
    if (!item?.id) return;
    if (preFoundSource) { setPlayerSource(preFoundSource); setAutoSourceStatus("found"); return; }
    let cancelled = false;
    setAutoSourceStatus("testing");
    if (typeof findWorkingSource === "function") {
      findWorkingSource(type, item.id, currentSeason, currentEpisode, playerSource)
        .then((id) => {
          if (cancelled) return;
          if (id && id !== playerSource) { setPlayerSource(id); storage.set("playerSource", id); }
          setAutoSourceStatus(id ? "found" : "failed");
        })
        .catch(() => { if (!cancelled) setAutoSourceStatus("failed"); }); // silent
    } else { setAutoSourceStatus("found"); }
    return () => { cancelled = true; };
  }, [item?.id, type, currentSeason, currentEpisode, preFoundSource]); // eslint-disable-line

  // ── Reset state on content/source change ─────────────────────────────────
  useEffect(() => {
    setM3u8Url(null);
    setInterceptedSubs([]);
    setShowSkipIntro(false);
    setShowNextEp(false);
    setIsActuallyPlaying(false);
    receivedRealSignalRef.current = false;
  }, [playerSource, item?.id, currentSeason, currentEpisode, type]);

  // ── Derived episode counts ────────────────────────────────────────────────
  const totalEpisodesInSeason = episodeList.length;
  const totalSeasons          = seasons.length;
  const hasNextEp = type === "tv" && (currentEpisode < totalEpisodesInSeason || currentSeason < totalSeasons);

  // ── Embed URL ─────────────────────────────────────────────────────────────
  const embedUrl = useMemo(() => {
    if (!item?.id) return "about:blank";
    return getSourceUrl(playerSource, type, item.id, currentSeason, currentEpisode);
  }, [playerSource, type, item?.id, currentSeason, currentEpisode]);

  useEffect(() => {
    setWebviewLoading(true);
    setIsActuallyPlaying(false);
    receivedRealSignalRef.current = false;
  }, [embedUrl]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── REAL PLAY/PAUSE DETECTION — METHOD A: postMessage (web + electron) ───
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const signal = parsePlayerMessage(e.data);
      if (!signal) return;
      receivedRealSignalRef.current = true;
      if (signal === "play")  setIsActuallyPlaying(true);
      if (signal === "pause") setIsActuallyPlaying(false);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [embedUrl]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── REAL PLAY/PAUSE DETECTION — METHOD B: Electron video.paused polling ──
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) return;
    if (webviewLoading || pipOpen) { setIsActuallyPlaying(false); return; }

    let lastState = null;
    let pollId = null;

    const poll = async () => {
      const wv = webviewRef.current;
      if (!wv) return;
      try {
        const result = await wv.executeJavaScript(
          `(()=>{
            const v = document.querySelector('video');
            if (!v || !v.duration || isNaN(v.duration) || v.duration === 0) return null;
            return { paused: v.paused, ended: v.ended, readyState: v.readyState };
          })()`
        );
        if (result === null) return; // video not ready yet — don't change state
        const playing = !result.paused && !result.ended && result.readyState >= 2;
        if (playing !== lastState) {
          lastState = playing;
          receivedRealSignalRef.current = true;
          setIsActuallyPlaying(playing);
        }
      } catch {} // webview not ready — silent
    };

    // First poll immediately, then every 2s
    poll();
    pollId = setInterval(poll, 2000);
    return () => { if (pollId) clearInterval(pollId); };
  }, [isElectron, webviewLoading, pipOpen, embedUrl]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── REAL PLAY/PAUSE DETECTION — METHOD C: Web fallback (5s assumption) ───
  // Sources that emit no postMessage → assume playing after 5s grace period.
  // Immediately overridden if a real pause postMessage arrives later.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isElectron) return; // Electron uses Method B
    if (webviewLoading) { setIsActuallyPlaying(false); return; }

    const timer = setTimeout(() => {
      // Only activate fallback if no real signal was received
      if (!receivedRealSignalRef.current) {
        setIsActuallyPlaying(true);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [isElectron, webviewLoading, embedUrl]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── AUTOPLAY ENGINE — fires after iframe/webview loads ───────────────────
  // Tries to auto-start the video in every embed source.
  // Works for movies AND TV episodes whenever content changes.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isElectron) return;
    // Electron: inject autoplay JS into webview after dom-ready
    const wv = webviewRef.current;
    if (!wv) return;

    const onDomReady = async () => {
      try { await wv.insertCSS(_EMBED_CSS); } catch {}
      try { await wv.executeJavaScript(_EMBED_JS); } catch {}
      // Slight delay so player initialises first
      setTimeout(async () => {
        try { await wv.executeJavaScript(_AUTOPLAY_JS); } catch {}
      }, 1200);
    };

    wv.addEventListener("dom-ready", onDomReady);
    return () => { try { wv.removeEventListener("dom-ready", onDomReady); } catch {} };
  }, [embedUrl, isElectron]);

  useEffect(() => {
    if (isElectron) return;
    // Web iframe: send play postMessage to iframe + inject via contentWindow
    if (webviewLoading) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const tryAutoplay = () => {
      try {
        // postMessage play command (some players listen for this)
        iframe.contentWindow?.postMessage({ event: "play", action: "play" }, "*");
        iframe.contentWindow?.postMessage({ type: "play" }, "*");
        // JW Player
        iframe.contentWindow?.postMessage(JSON.stringify({ method: "play" }), "*");
      } catch {}
    };

    // Fire on load + retry
    tryAutoplay();
    const t1 = setTimeout(tryAutoplay, 1500);
    const t2 = setTimeout(tryAutoplay, 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isElectron, webviewLoading, embedUrl]);

  // ─────────────────────────────────────────────────────────────────────────
  // ── BEAST ENGINE (Electron) — source validation + auto-retry ─────────────
  // ─────────────────────────────────────────────────────────────────────────
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
      clearTimeout(hardTimeout); // eslint-disable-line
      tryNextSource();
    };
    const onDomReady = async () => {
      try { await wv.insertCSS(_EMBED_CSS); } catch {}
      try { await wv.executeJavaScript(_EMBED_JS); } catch {}
      pollRef.current = setInterval(async () => {
        if (!active) { clearInterval(pollRef.current); return; }
        try {
          const r = await wv.executeJavaScript(
            `(()=>{const v=document.querySelector('video');if(!v)return{ready:false,err:false};` +
            `return{ready:v.readyState>=2&&v.duration>0&&!isNaN(v.duration),` +
            `err:v.networkState===3||!!(v.error&&v.error.code>0)};})()`
          );
          if (r.ready) markReady(); else if (r.err) onFail();
        } catch { markReady(); }
      }, 300);
    };
    wv.addEventListener("dom-ready", onDomReady);
    wv.addEventListener("did-fail-load", onFail);
    const hardTimeout = setTimeout(onFail, 12000);
    return () => {
      active = false;
      clearInterval(pollRef.current);
      clearTimeout(hardTimeout);
      try { wv.removeEventListener("dom-ready", onDomReady); } catch {}
      try { wv.removeEventListener("did-fail-load", onFail); } catch {}
    };
  }, [embedUrl, isElectron, tryNextSource, type]);

  // ── Web iframe load fallback ──────────────────────────────────────────────
  useEffect(() => {
    if (isElectron) return;
    let active = true;
    const tid = setTimeout(() => { if (active) setWebviewLoading(false); }, 8000);
    return () => { active = false; clearTimeout(tid); };
  }, [embedUrl, isElectron]);

  // ── Netflix-style: poll Electron video → Skip Intro / Next Episode ────────
  useEffect(() => {
    if (!isElectron) return;
    let pollId = null;
    const poll = async () => {
      const wv = webviewRef.current;
      if (!wv || webviewLoading || pipOpen) return;
      try {
        const r = await wv.executeJavaScript(
          `(()=>{const v=document.querySelector('video');` +
          `if(!v||!v.duration||v.paused)return null;` +
          `return{ct:v.currentTime,dur:v.duration};})()`
        );
        if (!r) return;
        const { ct, dur } = r;
        setShowSkipIntro(type === "tv" && ct >= 20 && ct <= 300);
        setShowNextEp(hasNextEp && (dur - ct <= 90 || ct / dur >= 0.92));
      } catch {}
    };
    pollId = setInterval(poll, 2000);
    return () => clearInterval(pollId);
  }, [isElectron, webviewLoading, pipOpen, type, hasNextEp]);

  // ── Electron listeners ────────────────────────────────────────────────────
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

  // ── Source menu ───────────────────────────────────────────────────────────
  const switchSource = useCallback((id) => {
    setShowSourceMenu(false);
    if (id === playerSource) return;
    const all   = PLAYER_SOURCES.filter((s) => !s.async && !s.tag).map((s) => s.id);
    const start = all.indexOf(id);
    retryQueueRef.current = start >= 0 ? [...all.slice(start), ...all.slice(0, start)] : [id, ...all.filter((x) => x !== id)];
    retryIdxRef.current   = 1;
    setPlayerSource(id);
    storage.set("playerSource", id);
  }, [playerSource]);

  useEffect(() => {
    if (!showSourceMenu && !showSeasonMenu) return;
    const close = (e) => {
      if (
        !sourceRef.current?.contains(e.target) &&
        !seasonBtnRef.current?.contains(e.target) &&
        !e.target.closest(".watch-source-dropdown") &&
        !e.target.closest(".season-dropdown-menu")
      ) { setShowSourceMenu(false); setShowSeasonMenu(false); }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showSourceMenu, showSeasonMenu]);

  // ── Episode navigation ────────────────────────────────────────────────────
  const goToEpisode = useCallback((s, e) => {
    setCurrentSeason(s);
    setCurrentEpisode(e);
    setShowNextEp(false);
    setShowSkipIntro(false);
  }, []);

  const handleNextEpisode = useCallback(() => {
    if (currentEpisode < totalEpisodesInSeason) {
      goToEpisode(currentSeason, currentEpisode + 1);
    } else if (currentSeason < totalSeasons) {
      goToEpisode(currentSeason + 1, 1);
    }
  }, [currentEpisode, currentSeason, totalEpisodesInSeason, totalSeasons, goToEpisode]);

  const handleSkipIntro = useCallback(() => {
    setShowSkipIntro(false);
    if (!isElectron) return;
    const wv = webviewRef.current;
    if (!wv) return;
    wv.executeJavaScript(`(()=>{const v=document.querySelector('video');if(v)v.currentTime+=90;})()`).catch(() => {});
  }, [isElectron]);

  // ── Derived values ────────────────────────────────────────────────────────
  const d            = details || item || {};
  const year         = (d.release_date || d.first_air_date || "").slice(0, 4);
  const currentLabel = PLAYER_SOURCES?.find((s) => s.id === playerSource)?.label ?? playerSource;
  const planId       = isPremium?.planId || (isPremium ? "premium" : "free");

  const currentDownload = useMemo(() => {
    if (!downloads?.length) return null;
    if (type === "movie") {
      return downloads.find((dl) =>
        dl.mediaType === "movie" &&
        (dl.tmdbId === item.id || dl.mediaId === item.id) &&
        (dl.status === "completed" || dl.status === "local" || dl.status === "downloading"));
    }
    return downloads.find((dl) =>
      dl.mediaType === "tv" &&
      (dl.tmdbId === item.id || dl.mediaId === item.id) &&
      dl.season === currentSeason && dl.episode === currentEpisode &&
      (dl.status === "completed" || dl.status === "local" || dl.status === "downloading"));
  }, [downloads, item?.id, type, currentSeason, currentEpisode]);

  const mediaName = useMemo(() => {
    const base = `${title}${year ? " (" + year + ")" : ""}`;
    return type === "tv"
      ? `${base} S${String(currentSeason).padStart(2,"0")} E${String(currentEpisode).padStart(2,"0")}`
      : base;
  }, [title, year, type, currentSeason, currentEpisode]);

  // Runtime for DataMeter
  const runtimeMinutes = useMemo(() => {
    if (type === "tv") {
      return episodeList.find((e) => e.episode_number === currentEpisode)?.runtime
        || d.episode_run_time?.[0]
        || null;
    }
    return d.runtime || null;
  }, [type, episodeList, currentEpisode, d]);

  const handleUpgrade = useCallback(() => window.dispatchEvent(new CustomEvent("novaspark:upgrade")), []);

  if (!item) return null;

  return (
    <div className="watch-page fade-in">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes skipPop {
          from { opacity:0; transform:translateY(12px) scale(0.92); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .ep-carousel::-webkit-scrollbar { display: none; }
        .ep-carousel { scrollbar-width: none; }
        .season-dropdown-menu {
          position:fixed; z-index:9999; background:rgba(12,18,20,0.97);
          border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:6px 0;
          min-width:160px; box-shadow:0 8px 32px rgba(0,0,0,0.7); backdrop-filter:blur(12px);
        }
        .season-dropdown-menu button {
          display:block; width:100%; text-align:left; padding:10px 18px;
          background:none; border:none; color:var(--text,#fff); font-size:14px;
          cursor:pointer; transition:background 0.15s; font-family:inherit;
        }
        .season-dropdown-menu button:hover { background:rgba(255,255,255,0.08); }
        .season-dropdown-menu button.active { color:var(--red,#00b4a6); font-weight:700; }
        .load-more-btn:hover { background: rgba(255,255,255,0.08) !important; }
        .watch-rel-card:hover .watch-rel-overlay { opacity:1 !important; }
      `}</style>

      {/* Only show server toast — no TMDB/network errors ever reach UI */}
      <ServerToast status={autoSourceStatus} sourceLabel={currentLabel} />

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="watch-topbar">
        <button className="btn btn-ghost" onClick={onBack} style={{gap:6}}><BackIcon /> Back</button>
        <div className="watch-topbar-title">
          {title}
          {type === "tv" && (
            <span className="watch-topbar-ep">&nbsp;·&nbsp;S{currentSeason} E{currentEpisode}</span>
          )}
        </div>
      </div>

      {/* ── Player ───────────────────────────────────────────────────────── */}
      <div className="watch-player-wrap" style={{background:"#000",position:"relative"}}>

        {webviewLoading && (
          <div style={{position:"absolute",inset:0,zIndex:5,background:"#000",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div className="spinner" />
          </div>
        )}

        {isElectron ? (
          <webview
            key={`wv-${playerSource}-${item.id}-s${currentSeason}e${currentEpisode}`}
            ref={webviewRef}
            src={embedUrl}
            partition="persist:player"
            allowpopups="true"
            plugins="true"
            nodeintegration="no"
            webpreferences="contextIsolation=yes,nodeIntegration=no,webSecurity=no,allowRunningInsecureContent=yes"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
            style={{position:"absolute",inset:0,width:"100%",height:"100%",border:"none",background:"#000",
              opacity:webviewLoading?0:1,transition:"opacity 0.3s ease"}}
          />
        ) : (
          <iframe
            key={`if-${playerSource}-${item.id}-s${currentSeason}e${currentEpisode}`}
            ref={iframeRef}
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            onLoad={() => setWebviewLoading(false)}
            style={{position:"absolute",inset:0,width:"100%",height:"100%",border:"none",background:"#000",
              opacity:webviewLoading?0:1,transition:"opacity 0.3s ease"}}
          />
        )}

        {pipOpen && (
          <div style={{position:"absolute",inset:0,zIndex:20,display:"flex",flexDirection:"column",
            alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.92)",gap:16}}>
            <PopOutIcon size={36} />
            <span style={{fontSize:15,color:"var(--text1)",fontWeight:600}}>Playing in pop-out window</span>
            <button className="player-overlay-btn" onClick={() => window.electron?.closePipWindow?.()}>
              Close pop-out &amp; return
            </button>
          </div>
        )}

        {/* Skip Intro + Next Episode */}
        {!webviewLoading && !pipOpen && (
          <PlayerOverlayBtns
            showSkip={showSkipIntro}
            showNext={showNextEp && hasNextEp}
            nextEpNum={currentEpisode < totalEpisodesInSeason ? currentEpisode + 1 : 1}
            onSkip={handleSkipIntro}
            onNext={handleNextEpisode}
          />
        )}

        {/* Controls bar */}
        <div className="watch-source-bar" style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <button
            ref={sourceRef}
            className="player-overlay-btn"
            style={{position:"static"}}
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
              style={pipOpen ? {color:"var(--red)"} : undefined}
            >
              <PopOutIcon />
            </button>
          )}

          {/* ── DataMeterWidget with REAL play state ── */}
          <DataMeterWidget
            isPlaying={!webviewLoading && !pipOpen}
            isActuallyPlaying={isActuallyPlaying && !webviewLoading && !pipOpen}
            runtimeMinutes={runtimeMinutes}
            genreIds={(d.genres || []).map((g) => g.id)}
            type={type}
          />
        </div>

        {showSourceMenu && menuPos && PLAYER_SOURCES && (
          <div
            className="source-dropdown source-dropdown--fixed watch-source-dropdown"
            style={{top:menuPos.top,left:menuPos.left}}
            onClick={(e) => e.stopPropagation()}
          >
            {PLAYER_SOURCES.map((src) => (
              <button key={src.id}
                className={"source-dropdown__item" + (playerSource === src.id ? " source-dropdown__item--active" : "")}
                onClick={() => switchSource(src.id)}>
                <span>{src.label}</span>
                {src.tag  && <span className="source-dropdown__tag">{src.tag}</span>}
                {src.note && <span className="source-dropdown__note">{src.note}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Episode Carousel ─────────────────────────────────────────────── */}
      {type === "tv" && episodeList.length > 0 && (
        <div style={{paddingTop:28,paddingBottom:4}}>
          <div style={{
            display:"flex",alignItems:"center",justifyContent:"space-between",
            paddingLeft:20,paddingRight:20,marginBottom:16,
          }}>
            <div className="section-title" style={{margin:0,padding:0}}>EPISODES</div>
            {seasons.length > 1 && (
              <div style={{position:"relative"}}>
                <button
                  ref={seasonBtnRef}
                  onClick={() => {
                    const rect = seasonBtnRef.current?.getBoundingClientRect();
                    if (rect) setSeasonMenuPos({ top: rect.bottom + 6, left: rect.right - 170 });
                    setShowSeasonMenu((v) => !v);
                  }}
                  style={{
                    background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.15)",
                    borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,
                    padding:"8px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,
                    fontFamily:"inherit",transition:"background 0.15s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background="rgba(255,255,255,0.12)"}
                  onMouseLeave={(e) => e.currentTarget.style.background="rgba(255,255,255,0.07)"}
                >
                  Season {currentSeason}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{opacity:0.7}}>
                    <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>
                </button>
                {showSeasonMenu && seasonMenuPos && (
                  <div className="season-dropdown-menu" style={{top:seasonMenuPos.top,left:seasonMenuPos.left}}>
                    {seasons.map((s) => (
                      <button
                        key={s.season_number}
                        className={currentSeason === s.season_number ? "active" : ""}
                        onClick={() => { goToEpisode(s.season_number, 1); setShowSeasonMenu(false); }}
                      >
                        {s.name && !s.name.startsWith("Season") ? s.name : `Season ${s.season_number}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            ref={carouselRef}
            className="ep-carousel"
            style={{
              display:"flex",gap:12,overflowX:"auto",overflowY:"hidden",
              paddingLeft:20,paddingRight:40,paddingBottom:8,
              maskImage:"linear-gradient(to right, black 85%, transparent 100%)",
              WebkitMaskImage:"linear-gradient(to right, black 85%, transparent 100%)",
            }}
          >
            {episodeList.map((ep) => (
              <EpisodeThumb
                key={ep.id || ep.episode_number}
                ep={ep}
                isActive={ep.episode_number === currentEpisode}
                onPlay={() => goToEpisode(currentSeason, ep.episode_number)}
              />
            ))}
            <div style={{flexShrink:0,width:20}} />
          </div>
        </div>
      )}

      {/* ── Meta / action bar ────────────────────────────────────────────── */}
      <div className="watch-meta">
        <div className="watch-meta-actions" style={{justifyContent:"flex-start"}}>
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
        <div className="section" style={{paddingTop:8}}>
          <div className="section-title">More Like This</div>
          <div className="cards-grid">
            {related.map((rel) => (
              <div
                key={`${rel.media_type}_${rel.id}`}
                className="card watch-rel-card"
                onClick={() => onSelect?.({ ...rel, media_type: rel.media_type })}
                style={{cursor:"pointer"}}
              >
                <div className="card-poster">
                  {rel.poster_path
                    ? <img src={imgUrl(rel.poster_path)} alt={rel.title||rel.name} loading="lazy"/>
                    : <div className="no-poster"><PlayIcon /></div>}
                  <div className="card-overlay watch-rel-overlay" style={{opacity:0,transition:"opacity 0.2s"}}>
                    <div className="card-play"><PlayIcon /></div>
                  </div>
                  {rel.vote_average > 0 && (
                    <div className="card-badge">★ {rel.vote_average.toFixed(1)}</div>
                  )}
                </div>
                <div className="card-info">
                  <div className="card-title">{rel.title||rel.name}</div>
                  <div className="card-year">{(rel.release_date||rel.first_air_date||"").slice(0,4)}</div>
                </div>
              </div>
            ))}
          </div>
          {relatedPage < relatedTotal && (
            <div style={{display:"flex",justifyContent:"center",marginTop:24}}>
              <button
                className="load-more-btn"
                onClick={() => fetchRelated(relatedPage + 1)}
                disabled={relatedLoading}
                style={{
                  background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",
                  borderRadius:8,color:"var(--text,#fff)",fontSize:14,fontWeight:600,
                  padding:"12px 36px",cursor:relatedLoading?"not-allowed":"pointer",
                  opacity:relatedLoading?0.6:1,transition:"background 0.2s",
                }}
              >{relatedLoading ? "Loading…" : "Load More"}</button>
            </div>
          )}
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
          season={type === "tv" ? currentSeason : null}
          episode={type === "tv" ? currentEpisode : null}
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