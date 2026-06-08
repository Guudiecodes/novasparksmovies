import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  PLAYER_SOURCES, getSourceUrl, tmdbFetch, imgUrl,
  NON_ANIME_DEFAULT_SOURCE, BROWSER_RESTRICTED_DEFAULT, NEEDS_INTERCEPT,
  findWorkingSource, buildRetryQueue, isRestrictedBrowser, getDefaultSource,
  invalidateSourceCache,
} from "../utils/api";
import { storage } from "../utils/storage";
import {
  BackIcon, StarIcon, SourceIcon, PlayIcon,
  BookmarkIcon, BookmarkFillIcon, TrailerIcon, PopOutIcon, DownloadIcon,
} from "../components/Icons";
import TrailerModal    from "../components/TrailerModal";
import DownloadModal   from "../components/DownloadModal";
import { canDownload, canPopOut, canSwitchSource } from "../utils/gate";
import PremiumGate     from "../components/PremiumGate";
import DataMeterWidget from "../components/DataMeterWidget";
import HLSPlayer       from "../components/HLSPlayer";
import { extractHLSForChrome, invalidateHLSCache } from "../utils/hlsExtractor";
import { setApiErrorHandlers } from "../utils/api";
setApiErrorHandlers(() => {}, () => {});

const BEAST_TIMEOUT = { tier1: 18000, tier2: 25000, tier3: 32000 };
const BEAST_SECOND_CHANCE_MS = 6000;
const MAX_FULL_CYCLES = 2;

const _EMBED_CSS = `
[class*="loading"i],[class*="loader"i],[class*="fetching"i],[class*="preload"i],
[id*="loading"i],[id*="loader"i],[id*="fetching"i],
.spinner,.preloader,.lds-ring,.lds-spinner,.vjs-loading-spinner,
.jw-icon-loading,.plyr__loading{display:none!important;opacity:0!important;visibility:hidden!important;}
video{opacity:1!important;visibility:visible!important;display:block!important;}
`;

const _EMBED_JS = `(function(){
  if(window.__ns)return;window.__ns=true;
  var BAD=['FETCHING, ONE MOMENT...','FETCHING','ONE MOMENT...','PLEASE WAIT','LOADING...','LOADING','BUFFERING',
    'SOURCE NOT FOUND','VIDEO NOT FOUND','MEDIA NOT FOUND','CONTENT NOT FOUND','FILE NOT FOUND','NOT FOUND','404',
    'NO SOURCE','NO VIDEO','COULD NOT CONNECT','CONNECTION ERROR','FAILED TO LOAD','LOAD ERROR','NETWORK ERROR',
    'SERVER ERROR','INTERNAL SERVER ERROR','503','502','500','VIDEO UNAVAILABLE','MEDIA UNAVAILABLE',
    'CONTENT UNAVAILABLE','EMBED ERROR','PLAYER ERROR','STREAM ERROR','STREAM NOT FOUND','API ERROR',
    'VIDSRC','VIDLINK','EMBEDSU','MOVIESAPI','AUTOEMBED','VIDSRC.CC','VIDSRC.NET','VIDSRC.TO','VIDSRC.FYI',
    'VIDFAST','SMASHY','VIDEASY','ERROR LOADING','ERROR FETCHING','UNABLE TO LOAD','UNABLE TO PLAY',
    'PLAYBACK ERROR','TRY AGAIN LATER','SOMETHING WENT WRONG','ACCESS DENIED','FORBIDDEN','REGION LOCKED',
    'GEO BLOCKED','PLEASE TRY ANOTHER SERVER','TRY ANOTHER SERVER','SWITCH SERVER',
    'THIS VIDEO IS NOT AVAILABLE','VIDEO NOT AVAILABLE','NOT AVAILABLE','CANNOT LOAD VIDEO',
    'CANNOT PLAY VIDEO','MEDIA ERROR','REFUSED TO CONNECT','CONNECTION REFUSED','ERR_CONNECTION_REFUSED',
    'VSEMBED','VSEMBED.RU','REFUSED'];
  function clean(){try{document.querySelectorAll('body *').forEach(function(el){
    if(!el.childElementCount){var t=(el.textContent||'').trim().toUpperCase();
    if(t.length>2&&t.length<200&&BAD.some(function(k){return t===k||t.startsWith(k+'.')||t.startsWith(k+':')||t.includes(k);})){
      var p=el;for(var i=0;i<5;i++){var par=p.parentElement;if(par&&par!==document.body&&par!==document.documentElement)p=par;else break;}
      p.style.cssText='display:none!important;opacity:0!important;pointer-events:none!important;visibility:hidden!important;';}}});}catch(e){}}
  clean();var obs=new MutationObserver(clean);obs.observe(document.body,{childList:true,subtree:true,characterData:true});
  setTimeout(function(){obs.disconnect();},18000);
})()`;

const _AUTOPLAY_JS = `(function(){
  if(window.__nsAuto)return;window.__nsAuto=true;
  function tryPlay(){var v=document.querySelector('video');
    if(v){v.muted=false;if(v.paused){v.play().catch(function(){v.muted=true;v.play().then(function(){setTimeout(function(){v.muted=false;},800);}).catch(function(){});});}}
    var selectors=['.jw-icon-display','[aria-label="Play"]','[title="Play"]','.vjs-big-play-button','.plyr__control--overlaid','.play-button','button.play','[class*="play"][class*="btn"]','[class*="PlayBtn"]','[class*="play_btn"]','[data-testid="play-button"]','.ytp-large-play-button'];
    for(var i=0;i<selectors.length;i++){var btn=document.querySelector(selectors[i]);if(btn&&btn.offsetParent!==null){btn.click();break;}}}
  tryPlay();var attempts=0;var id=setInterval(function(){attempts++;var v=document.querySelector('video');if(v&&!v.paused){clearInterval(id);return;}tryPlay();if(attempts>=8)clearInterval(id);},800);
})()`;

function parsePlayerMessage(data) {
  try {
    const d = typeof data === "string" ? JSON.parse(data) : data;
    if (!d || typeof d !== "object") return null;
    if (d.type === "PLAYER_EVENT" && d.data?.event) {
      const evt = String(d.data.event).toLowerCase();
      if (evt === "play" || evt === "playing") return "play";
      if (evt === "pause" || evt === "complete" || evt === "ended") return "pause";
    }
    const evt = String(d.event || d.type || d.action || d.playbackState || d.state || "").toLowerCase();
    if (evt === "play" || evt === "playing" || evt === "resume" || evt === "started" || d.playing === true || d.isPlaying === true || d.playbackState === "playing") return "play";
    if (evt === "pause" || evt === "paused" || evt === "stop" || evt === "stopped" || evt === "ended" || evt === "complete" || evt === "finish" || evt === "finished" || evt === "idle" || d.playing === false || d.isPlaying === false || d.playbackState === "paused" || d.playbackState === "ended") return "pause";
    return null;
  } catch { return null; }
}

// ── Scrolling Disclaimer Banner ───────────────────────────────────────────────
function DisclaimerBanner() {
  const text = "⚠  NovaSparks does not host, store, or distribute any media content. Stream availability and quality may vary by region and network conditions. We are not responsible for third-party content or advertisements.   ⚠";
  return (
    <div style={{
      background: "rgba(229,9,20,0.05)",
      borderBottom: "1px solid rgba(229,9,20,0.12)",
      padding: "5px 0",
      overflow: "hidden",
      position: "relative",
      flexShrink: 0,
    }}>
      <div style={{
        display: "inline-flex",
        animation: "disclaimerScroll 45s linear infinite",
        whiteSpace: "nowrap",
        willChange: "transform",
      }}>
        {[0, 1].map((i) => (
          <span key={i} style={{
            fontSize: 11, color: "rgba(255,255,255,0.42)",
            paddingRight: 80, letterSpacing: 0.2,
          }}>
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Stealth loading overlay ───────────────────────────────────────────────────
function StealthLoader({ status, attempt }) {
  const [show, setShow] = useState(false);
  const [fade, setFade] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (status === "testing" || status === "retrying") { setShow(true); setFade(false); }
    else if (status === "found") {
      setFade(false);
      timerRef.current = setTimeout(() => { setFade(true); timerRef.current = setTimeout(() => setShow(false), 500); }, 1800);
    } else if (status === "failed") {
      setFade(true); timerRef.current = setTimeout(() => setShow(false), 400);
    }
    return () => clearTimeout(timerRef.current);
  }, [status]);
  if (!show) return null;
  const isLoading = status === "testing" || status === "retrying";
  const messages = ["Connecting…", "Preparing stream…", "Loading content…", "Almost ready…", "Establishing connection…"];
  const msg = status === "retrying" ? messages[Math.min((attempt || 1) - 1, messages.length - 1)] : "Connecting…";
  return (
    <div style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
      background: "rgba(8,8,8,0.96)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 12, padding: "11px 22px", display: "flex", alignItems: "center", gap: 10,
      color: "#fff", fontSize: 13, fontWeight: 500,
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      boxShadow: "0 6px 32px rgba(0,0,0,0.7)",
      opacity: fade ? 0 : 1, transition: "opacity 0.45s ease", pointerEvents: "none",
    }}>
      {isLoading ? (
        <>
          <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
          <span>{msg}</span>
        </>
      ) : (
        <><span style={{ color: "#4caf50", fontSize: 17, lineHeight: 1 }}>✓</span><span>Ready</span></>
      )}
    </div>
  );
}

function BlackScreen({ visible }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 4, background: "#000",
      display: "flex", alignItems: "center", justifyContent: "center",
      opacity: visible ? 1 : 0, transition: "opacity 0.4s ease",
      pointerEvents: visible ? "auto" : "none",
    }}>
      {visible && <div style={{ width: 40, height: 40, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.08)", borderTopColor: "rgba(255,255,255,0.5)", animation: "spin 0.9s linear infinite" }} />}
    </div>
  );
}

function AllFailedOverlay({ onRetry, onBack }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10, background: "rgba(0,0,0,0.96)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 18, padding: "32px 24px", textAlign: "center",
    }}>
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8">
          <path d="M1 1l22 22M17 17H5a2 2 0 0 1-2-2V7m4-2h10a2 2 0 0 1 2 2v8"/>
        </svg>
      </div>
      <div style={{ maxWidth: 300 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.4, marginBottom: 8 }}>Having trouble loading</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.7 }}>We couldn't establish a connection. This can happen with slow networks or high demand. Tap retry to find a working stream.</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={onRetry} style={{ background: "var(--red,#e50914)", border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 700, padding: "11px 28px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          Try Again
        </button>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600, padding: "11px 22px", cursor: "pointer" }}>Go Back</button>
      </div>
    </div>
  );
}

function PlayerOverlayBtns({ showSkip, showNext, nextEpNum, onSkip, onNext }) {
  if (!showSkip && !showNext) return null;
  return (
    <div style={{ position: "absolute", bottom: 64, left: 0, right: 0, zIndex: 20, display: "flex", alignItems: "flex-end", justifyContent: "space-between", padding: "0 20px", pointerEvents: "none" }}>
      <div style={{ pointerEvents: "auto" }}>
        {showSkip && (
          <button onClick={onSkip} style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(10px)", border: "2px solid rgba(255,255,255,0.4)", borderRadius: 6, color: "#fff", fontSize: 14, fontWeight: 700, padding: "10px 22px", cursor: "pointer", letterSpacing: 0.4, boxShadow: "0 4px 20px rgba(0,0,0,0.6)", animation: "skipPop 0.3s cubic-bezier(0.34,1.56,0.64,1)", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            Skip Intro
          </button>
        )}
      </div>
      <div style={{ pointerEvents: "auto" }}>
        {showNext && (
          <button onClick={onNext} style={{ background: "var(--red,#e50914)", borderRadius: 7, border: "none", color: "#fff", fontSize: 14, fontWeight: 700, padding: "11px 22px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, animation: "skipPop 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}>
            Next Episode
            {nextEpNum && <span style={{ opacity: 0.85 }}>E{nextEpNum}</span>}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
        )}
      </div>
    </div>
  );
}

function EpisodeThumb({ ep, isActive, onPlay }) {
  return (
    <div onClick={onPlay} style={{ flexShrink: 0, width: 210, borderRadius: 10, overflow: "hidden", cursor: "pointer", border: isActive ? "2px solid var(--red,#e50914)" : "2px solid transparent", background: "rgba(255,255,255,0.03)", transition: "border-color 0.15s" }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = "transparent"; }}>
      <div style={{ width: "100%", aspectRatio: "16/9", position: "relative", background: "rgba(255,255,255,0.06)" }}>
        {ep.still_path
          ? <img src={imgUrl(ep.still_path, "w300")} alt={ep.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.18)", fontSize: 22 }}>▶</div>}
        <div style={{ position: "absolute", top: 7, left: 8, background: isActive ? "var(--red,#e50914)" : "rgba(0,0,0,0.78)", borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: 0.5 }}>E{ep.episode_number}</div>
        {isActive && <div style={{ position: "absolute", inset: 0, background: "rgba(229,9,20,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--red,#e50914)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, boxShadow: "0 2px 16px rgba(229,9,20,0.6)" }}>▶</div></div>}
        {ep.runtime > 0 && <div style={{ position: "absolute", bottom: 7, right: 8, background: "rgba(0,0,0,0.75)", borderRadius: 4, padding: "2px 6px", fontSize: 10, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{ep.runtime}m</div>}
      </div>
      <div style={{ padding: "9px 12px 11px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.35, color: isActive ? "var(--red,#e50914)" : "rgba(255,255,255,0.88)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{ep.name || `Episode ${ep.episode_number}`}</div>
      </div>
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
  const restricted = isRestrictedBrowser();

  const isChromePure = !isElectron &&
    typeof navigator !== "undefined" &&
    /Chrome/.test(navigator.userAgent) &&
    !/Electron/.test(navigator.userAgent) &&
    !navigator.brave && !window.opr;

  const useHLSPath = isChromePure;
  const isRestrictedForServers = isChromePure && restricted;

  const type  = item?.media_type === "tv" || !!item?.first_air_date ? "tv" : "movie";
  const title = item?.title || item?.name || "";

  const [currentSeason,  setCurrentSeason]  = useState(item?.season  ?? 1);
  const [currentEpisode, setCurrentEpisode] = useState(item?.episode ?? 1);
  useEffect(() => { setCurrentSeason(item?.season ?? 1); setCurrentEpisode(item?.episode ?? 1); }, [item?.id]); // eslint-disable-line

  const [playerSource, setPlayerSource] = useState(() => {
    const raw = storage.get("playerSource");
    const DEAD_SOURCES = ["embedsu"];
    const saved = DEAD_SOURCES.includes(raw) ? null : raw;
    if (saved) { if (isRestrictedForServers && NEEDS_INTERCEPT.includes(saved)) return BROWSER_RESTRICTED_DEFAULT; return saved; }
    return getDefaultSource();
  });

  const [autoSourceStatus,  setAutoSourceStatus]  = useState("testing");
  const [retryAttempt,      setRetryAttempt]       = useState(0);
  const [cycleCount,        setCycleCount]         = useState(0);
  const [showSourceMenu,    setShowSourceMenu]     = useState(false);
  const [webviewLoading,    setWebviewLoading]     = useState(true);
  const [isActuallyPlaying, setIsActuallyPlaying]  = useState(false);
  const receivedRealSignalRef = useRef(false);
  const sourceFailCountRef    = useRef({});

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
  const [hlsStream,      setHlsStream]      = useState(null);
  const [hlsLoading,     setHlsLoading]     = useState(false);
  const [hlsFailed,      setHlsFailed]      = useState(false);

  const webviewRef    = useRef(null);
  const iframeRef     = useRef(null);
  const sourceRef     = useRef(null);
  const seasonBtnRef  = useRef(null);
  const carouselRef   = useRef(null);
  const pollRef       = useRef(null);
  const retryQueueRef = useRef([]);
  const retryIdxRef   = useRef(0);
  const secondChanceRef = useRef(null);
  const webBeastReadyRef       = useRef(null);
  const webBeastFailRef        = useRef(null);
  const iframeLoadCallbackRef  = useRef(null);
  const iframeErrorCallbackRef = useRef(null);

  useEffect(() => {
    retryQueueRef.current = buildRetryQueue(type, playerSource);
    retryIdxRef.current   = 1;
    sourceFailCountRef.current = {};
  }, [item?.id, currentSeason, currentEpisode, type]); // eslint-disable-line

  const tryNextSource = useCallback(() => {
    clearTimeout(secondChanceRef.current);
    const cur = retryQueueRef.current[retryIdxRef.current - 1] || playerSource;
    sourceFailCountRef.current[cur] = (sourceFailCountRef.current[cur] || 0) + 1;
    const idx = retryIdxRef.current;
    if (idx >= retryQueueRef.current.length) {
      setCycleCount((prev) => {
        const next = prev + 1;
        if (next < MAX_FULL_CYCLES) {
          retryQueueRef.current = buildRetryQueue(type, getDefaultSource());
          retryIdxRef.current = 1;
          const firstId = retryQueueRef.current[0] || getDefaultSource();
          retryIdxRef.current = 1;
          setRetryAttempt((a) => a + 1);
          setAutoSourceStatus("retrying");
          setWebviewLoading(true);
          setPlayerSource(firstId);
          storage.set("playerSource", firstId);
        } else {
          setAutoSourceStatus("failed");
          setWebviewLoading(false);
          invalidateSourceCache(type, item?.id, currentSeason, currentEpisode);
        }
        return next;
      });
      return;
    }
    const nextId = retryQueueRef.current[idx];
    retryIdxRef.current += 1;
    setRetryAttempt((a) => a + 1);
    setAutoSourceStatus("retrying");
    setWebviewLoading(true);
    setPlayerSource(nextId);
    storage.set("playerSource", nextId);
  }, [playerSource, type, item?.id, currentSeason, currentEpisode]);

  const retryFromScratch = useCallback(() => {
    clearTimeout(secondChanceRef.current);
    sourceFailCountRef.current = {};
    const defaultSrc = getDefaultSource();
    retryQueueRef.current = buildRetryQueue(type, defaultSrc);
    retryIdxRef.current   = 1;
    setCycleCount(0); setRetryAttempt(0);
    setAutoSourceStatus("testing"); setWebviewLoading(true);
    setHlsStream(null); setHlsFailed(false);
    invalidateSourceCache(type, item?.id, currentSeason, currentEpisode);
    setPlayerSource(defaultSrc);
    storage.set("playerSource", defaultSrc);
  }, [type, item?.id, currentSeason, currentEpisode]);

  useEffect(() => {
    if (!item?.id || !apiKey) return;
    let mounted = true;
    tmdbFetch(`/${type}/${item.id}?append_to_response=credits,videos`, apiKey)
      .then((d) => {
        if (!mounted) return;
        setDetails(d);
        const trailer = d.videos?.results?.find((v) => v.type === "Trailer" && v.site === "YouTube") || d.videos?.results?.find((v) => v.site === "YouTube");
        if (trailer) setTrailerKey(trailer.key);
        if (type === "tv" && d.seasons) setSeasons(d.seasons.filter((s) => s.season_number > 0));
      }).catch(() => {});
    return () => { mounted = false; };
  }, [item?.id, type, apiKey]);

  useEffect(() => {
    if (type !== "tv" || !item?.id || !apiKey) return;
    let mounted = true;
    setEpisodeList([]);
    tmdbFetch(`/tv/${item.id}/season/${currentSeason}`, apiKey)
      .then((d) => { if (mounted) setEpisodeList(d.episodes || []); }).catch(() => {});
    return () => { mounted = false; };
  }, [item?.id, type, currentSeason, apiKey]);

  useEffect(() => {
    if (!carouselRef.current || !episodeList.length) return;
    const idx = episodeList.findIndex((e) => e.episode_number === currentEpisode);
    if (idx < 0) return;
    carouselRef.current.scrollTo({ left: Math.max(0, idx * 224 - 20), behavior: "smooth" });
  }, [currentEpisode, episodeList]);

  const fetchRelated = useCallback((page = 1) => {
    if (!item?.id || !apiKey) return;
    setRelatedLoading(true);
    tmdbFetch(`/${type}/${item.id}/recommendations?page=${page}`, apiKey)
      .then((d) => {
        const results = (d.results || []).map((r) => ({ ...r, media_type: r.title ? "movie" : "tv" }));
        setRelated((prev) => page === 1 ? results : [...prev, ...results]);
        setRelatedTotal(d.total_pages || 1);
        setRelatedPage(page);
      }).catch(() => {}).finally(() => setRelatedLoading(false));
  }, [item?.id, type, apiKey]);

  useEffect(() => { fetchRelated(1); }, [item?.id]); // eslint-disable-line

  useEffect(() => {
    if (!item) return;
    onHistory?.({ ...item, media_type: type, season: currentSeason, episode: currentEpisode });
  }, [item?.id]); // eslint-disable-line

  useEffect(() => {
    if (!item?.id) return;
    if (preFoundSource) {
      if (isRestrictedForServers && NEEDS_INTERCEPT.includes(preFoundSource)) { /* fall through */ }
      else { setPlayerSource(preFoundSource); setAutoSourceStatus("found"); return; }
    }
    let cancelled = false;
    setAutoSourceStatus("testing");
    if (typeof findWorkingSource === "function") {
      const preferSeed = isRestrictedForServers ? BROWSER_RESTRICTED_DEFAULT : playerSource;
      findWorkingSource(type, item.id, currentSeason, currentEpisode, preferSeed)
        .then((id) => {
          if (cancelled) return;
          if (id && id !== playerSource) { setPlayerSource(id); storage.set("playerSource", id); }
          if (!id) setAutoSourceStatus("testing");
        }).catch(() => { if (!cancelled) setAutoSourceStatus("testing"); });
    } else { setAutoSourceStatus("found"); }
    return () => { cancelled = true; };
  }, [item?.id, type, currentSeason, currentEpisode, preFoundSource]); // eslint-disable-line

  useEffect(() => {
    setM3u8Url(null); setInterceptedSubs([]);
    setShowSkipIntro(false); setShowNextEp(false);
    setIsActuallyPlaying(false); receivedRealSignalRef.current = false;
  }, [playerSource, item?.id, currentSeason, currentEpisode, type]);

  const totalEpisodesInSeason = episodeList.length;
  const totalSeasons = seasons.length;
  const hasNextEp = type === "tv" && (currentEpisode < totalEpisodesInSeason || currentSeason < totalSeasons);

  const embedUrl = useMemo(() => {
    if (!item?.id) return "about:blank";
    return getSourceUrl(playerSource, type, item.id, currentSeason, currentEpisode);
  }, [playerSource, type, item?.id, currentSeason, currentEpisode]);

  useEffect(() => { setWebviewLoading(true); setIsActuallyPlaying(false); receivedRealSignalRef.current = false; }, [embedUrl]);

  // HLS extraction (Chrome only)
  useEffect(() => {
    if (!useHLSPath || !item?.id) { setHlsStream(null); setHlsFailed(false); return; }
    let cancelled = false;
    setHlsStream(null); setHlsFailed(false); setHlsLoading(true); setWebviewLoading(true);
    extractHLSForChrome(item.id, type, currentSeason, currentEpisode)
      .then((result) => {
        if (cancelled) return;
        if (result?.url) { setHlsStream(result); setHlsLoading(false); }
        else { setHlsFailed(true); setHlsLoading(false); }
      }).catch(() => { if (!cancelled) { setHlsFailed(true); setHlsLoading(false); } });
    return () => { cancelled = true; };
  }, [item?.id, type, currentSeason, currentEpisode, useHLSPath]); // eslint-disable-line

  useEffect(() => { setHlsStream(null); setHlsFailed(false); }, [item?.id, currentSeason, currentEpisode]);

  useEffect(() => {
    const handler = (e) => {
      const signal = parsePlayerMessage(e.data);
      if (!signal) return;
      receivedRealSignalRef.current = true;
      if (signal === "play") { webBeastReadyRef.current?.(); setIsActuallyPlaying(true); }
      if (signal === "pause") setIsActuallyPlaying(false);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [embedUrl]);

  // Electron: poll webview for video state
  useEffect(() => {
    if (!isElectron) return;
    if (webviewLoading || pipOpen) { setIsActuallyPlaying(false); return; }
    let lastState = null;
    const poll = async () => {
      const wv = webviewRef.current; if (!wv) return;
      try {
        const wcId = wv.getWebContentsId?.();
        if (wcId && window.electron?.queryVideoProgress) {
          const prog = await window.electron.queryVideoProgress(wcId);
          if (prog && prog.duration > 0) { const playing = !prog.paused; if (playing !== lastState) { lastState = playing; receivedRealSignalRef.current = true; setIsActuallyPlaying(playing); } return; }
        }
        const result = await wv.executeJavaScript(`(()=>{const v=document.querySelector('video');if(!v||!v.duration||isNaN(v.duration)||v.duration===0)return null;return{paused:v.paused,ended:v.ended,readyState:v.readyState};})()`);
        if (result === null) return;
        const playing = !result.paused && !result.ended && result.readyState >= 2;
        if (playing !== lastState) { lastState = playing; receivedRealSignalRef.current = true; setIsActuallyPlaying(playing); }
      } catch {}
    };
    poll();
    const pollId = setInterval(poll, 2000);
    return () => clearInterval(pollId);
  }, [isElectron, webviewLoading, pipOpen, embedUrl]);

  // Browser: fallback playing signal after 3.5s
  useEffect(() => {
    if (isElectron) return;
    if (webviewLoading) { setIsActuallyPlaying(false); return; }
    const timer = setTimeout(() => { if (!receivedRealSignalRef.current) setIsActuallyPlaying(true); }, 3500);
    return () => clearTimeout(timer);
  }, [isElectron, webviewLoading, embedUrl]);

  useEffect(() => {
    if (!isElectron) return;
    const wv = webviewRef.current; if (!wv) return;
    const onDomReady = async () => {
      try { await wv.insertCSS(_EMBED_CSS); } catch {}
      try { await wv.executeJavaScript(_EMBED_JS); } catch {}
      setTimeout(async () => { try { await wv.executeJavaScript(_AUTOPLAY_JS); } catch {} }, 1200);
    };
    wv.addEventListener("dom-ready", onDomReady);
    return () => { try { wv.removeEventListener("dom-ready", onDomReady); } catch {} };
  }, [embedUrl, isElectron]);

  useEffect(() => {
    if (isElectron || webviewLoading) return;
    const iframe = iframeRef.current; if (!iframe) return;
    const tryAutoplay = () => {
      try { iframe.contentWindow?.postMessage({ event: "play", action: "play" }, "*"); iframe.contentWindow?.postMessage({ type: "play" }, "*"); } catch {}
    };
    tryAutoplay();
    const t1 = setTimeout(tryAutoplay, 1500);
    const t2 = setTimeout(tryAutoplay, 3500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isElectron, webviewLoading, embedUrl]);

  // Electron Beast Engine
  useEffect(() => {
    if (!isElectron) return;
    const wv = webviewRef.current; if (!wv) return;
    let active = true;
    clearInterval(pollRef.current); clearTimeout(secondChanceRef.current);
    const currentSrc = PLAYER_SOURCES.find((s) => s.id === playerSource);
    const tier = currentSrc?.tier ?? 2;
    const HARD_TIMEOUT_MS = BEAST_TIMEOUT[`tier${tier}`] ?? BEAST_TIMEOUT.tier2;
    const ABSOLUTE_CEILING_MS = HARD_TIMEOUT_MS + BEAST_SECOND_CHANCE_MS + 3000;

    const markReady = () => {
      if (!active) return; active = false;
      clearInterval(pollRef.current); clearTimeout(hardTimeoutId); clearTimeout(absoluteCeilingId); clearTimeout(secondChanceRef.current); // eslint-disable-line
      setAutoSourceStatus((s) => (s === "retrying" || s === "testing") ? "found" : s);
      setWebviewLoading(false);
    };
    const onFail = () => {
      if (!active) return; active = false;
      clearInterval(pollRef.current); clearTimeout(hardTimeoutId); clearTimeout(absoluteCeilingId); clearTimeout(secondChanceRef.current); // eslint-disable-line
      tryNextSource();
    };
    const enterSecondChance = () => {
      if (!active) return;
      clearInterval(pollRef.current);
      secondChanceRef.current = setTimeout(async () => {
        if (!active) return;
        const wv2 = webviewRef.current; if (!wv2) { onFail(); return; }
        try {
          const wcId = wv2.getWebContentsId?.();
          if (wcId && window.electron?.queryVideoProgress) { const prog = await window.electron.queryVideoProgress(wcId); if (prog && prog.duration > 0) { markReady(); return; } }
          const r = await wv2.executeJavaScript(`(()=>{const v=document.querySelector('video');if(!v)return{ready:false};return{ready:v.readyState>=2&&v.duration>0&&!isNaN(v.duration)};})()`);
          if (r?.ready) markReady(); else onFail();
        } catch { onFail(); }
      }, BEAST_SECOND_CHANCE_MS);
    };
    const absoluteCeilingId = setTimeout(() => {
      if (!active) return; active = false;
      clearInterval(pollRef.current); clearTimeout(secondChanceRef.current);
      tryNextSource();
    }, ABSOLUTE_CEILING_MS);
    const runPoll = async () => {
      if (!active) { clearInterval(pollRef.current); return; }
      const wv = webviewRef.current; if (!wv) return;
      try {
        const wcId = wv.getWebContentsId?.();
        if (wcId && window.electron?.queryVideoProgress) { const prog = await window.electron.queryVideoProgress(wcId); if (prog && prog.duration > 0) { markReady(); return; } }
        const r = await wv.executeJavaScript(`(()=>{const v=document.querySelector('video');if(!v)return{ready:false,err:false};return{ready:v.readyState>=2&&v.duration>0&&!isNaN(v.duration),err:v.networkState===3||!!(v.error&&v.error.code>0)};})()`);
        if (r.ready) { markReady(); return; }
        if (r.err && r.ready === false) { enterSecondChance(); return; }
      } catch {}
    };
    const onDomReady = async () => {
      try { await wv.insertCSS(_EMBED_CSS); } catch {}
      try { await wv.executeJavaScript(_EMBED_JS); } catch {}
      runPoll();
    };
    pollRef.current = setInterval(runPoll, 200);
    const hardTimeoutId = setTimeout(enterSecondChance, HARD_TIMEOUT_MS);
    const onLoadFail = (e) => { if (!e.isMainFrame || e.errorCode === -3) return; clearTimeout(hardTimeoutId); enterSecondChance(); }; // eslint-disable-line
    wv.addEventListener("dom-ready", onDomReady);
    wv.addEventListener("did-finish-load", runPoll);
    wv.addEventListener("did-fail-load", onLoadFail);
    return () => {
      active = false; clearInterval(pollRef.current); clearTimeout(hardTimeoutId); clearTimeout(absoluteCeilingId); clearTimeout(secondChanceRef.current);
      try { wv.removeEventListener("dom-ready", onDomReady); } catch {}
      try { wv.removeEventListener("did-finish-load", runPoll); } catch {}
      try { wv.removeEventListener("did-fail-load", onLoadFail); } catch {}
    };
  }, [embedUrl, isElectron, tryNextSource, playerSource, type]);

  // Browser Beast Engine
  useEffect(() => {
    if (isElectron) return;
    if (!embedUrl || embedUrl === "about:blank") { setWebviewLoading(false); return; }
    if (useHLSPath && (hlsLoading || (hlsStream && !hlsFailed))) return;
    let active = true, iframeHasLoaded = false;
    const PROBE_TIMEOUT = 800, LOAD_REVEAL_DELAY = 700, HARD_TIMEOUT_MS = 7000, SECOND_CHANCE_MS = 5000;
    let probeAbortCtrl = new AbortController();
    let probeTimerId = null, hardTimerId = null, revealTimerId = null, secondTimerId = null;
    const clearAll = () => { clearTimeout(probeTimerId); clearTimeout(hardTimerId); clearTimeout(revealTimerId); clearTimeout(secondTimerId); try { probeAbortCtrl.abort(); } catch {} };
    const onReady = () => { if (!active) return; active = false; clearAll(); setAutoSourceStatus((s) => (s === "testing" || s === "retrying") ? "found" : s); setWebviewLoading(false); };
    const onFail  = () => { if (!active) return; active = false; clearAll(); tryNextSource(); };
    const enterSecondChance = () => { if (!active) return; secondTimerId = setTimeout(() => { if (!active) return; if (iframeHasLoaded) onReady(); else onFail(); }, SECOND_CHANCE_MS); };
    webBeastReadyRef.current = onReady; webBeastFailRef.current = onFail;
    iframeLoadCallbackRef.current  = () => { if (!active) return; iframeHasLoaded = true; clearTimeout(hardTimerId); clearTimeout(secondTimerId); revealTimerId = setTimeout(() => { if (active) onReady(); }, LOAD_REVEAL_DELAY); };
    iframeErrorCallbackRef.current = () => { if (!active) return; clearTimeout(hardTimerId); enterSecondChance(); };
    probeTimerId = setTimeout(() => probeAbortCtrl.abort(), PROBE_TIMEOUT);
    fetch(embedUrl, { method: "HEAD", mode: "no-cors", signal: probeAbortCtrl.signal })
      .then(() => clearTimeout(probeTimerId))
      .catch((err) => { clearTimeout(probeTimerId); if (!active || err.name === "AbortError") return; enterSecondChance(); });
    hardTimerId = setTimeout(() => { if (!active) return; if (iframeHasLoaded) onReady(); else enterSecondChance(); }, HARD_TIMEOUT_MS);
    return () => {
      active = false; clearAll();
      if (webBeastReadyRef.current === onReady) webBeastReadyRef.current = null;
      if (webBeastFailRef.current === onFail) webBeastFailRef.current = null;
      iframeLoadCallbackRef.current = null; iframeErrorCallbackRef.current = null;
    };
  }, [embedUrl, isElectron, tryNextSource, isRestrictedForServers, hlsLoading, hlsStream, hlsFailed, useHLSPath]);

  useEffect(() => {
    if (!isElectron) return;
    const poll = async () => {
      const wv = webviewRef.current; if (!wv || webviewLoading || pipOpen) return;
      try {
        const r = await wv.executeJavaScript(`(()=>{const v=document.querySelector('video');if(!v||!v.duration||v.paused)return null;return{ct:v.currentTime,dur:v.duration};})()`);
        if (!r) return;
        setShowSkipIntro(type === "tv" && r.ct >= 20 && r.ct <= 300);
        setShowNextEp(hasNextEp && (r.dur - r.ct <= 90 || r.ct / r.dur >= 0.92));
      } catch {}
    };
    const pollId = setInterval(poll, 2000);
    return () => clearInterval(pollId);
  }, [isElectron, webviewLoading, pipOpen, type, hasNextEp]);

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
    return () => { if (h1) window.electron?.offPipOpened?.(h1); if (h2) window.electron?.offPipClosed?.(h2); };
  }, [isElectron]);

  const switchSource = useCallback((id) => {
    clearTimeout(secondChanceRef.current);
    setShowSourceMenu(false);
    if (id === playerSource) return;
    retryQueueRef.current = buildRetryQueue(type, id);
    retryIdxRef.current = 1; setCycleCount(0); setRetryAttempt(0);
    setAutoSourceStatus("testing"); setWebviewLoading(true);
    setHlsStream(null); setHlsFailed(false);
    setPlayerSource(id); storage.set("playerSource", id);
  }, [playerSource, type]);

  useEffect(() => {
    if (!showSourceMenu && !showSeasonMenu) return;
    const close = (e) => {
      if (!sourceRef.current?.contains(e.target) && !seasonBtnRef.current?.contains(e.target) && !e.target.closest(".watch-source-dropdown") && !e.target.closest(".season-dropdown-menu")) {
        setShowSourceMenu(false); setShowSeasonMenu(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showSourceMenu, showSeasonMenu]);

  const goToEpisode = useCallback((s, e) => { setCurrentSeason(s); setCurrentEpisode(e); setShowNextEp(false); setShowSkipIntro(false); }, []);
  const handleNextEpisode = useCallback(() => {
    if (currentEpisode < totalEpisodesInSeason) goToEpisode(currentSeason, currentEpisode + 1);
    else if (currentSeason < totalSeasons) goToEpisode(currentSeason + 1, 1);
  }, [currentEpisode, currentSeason, totalEpisodesInSeason, totalSeasons, goToEpisode]);
  const handleSkipIntro = useCallback(() => {
    setShowSkipIntro(false);
    if (!isElectron) return;
    const wv = webviewRef.current; if (!wv) return;
    wv.executeJavaScript(`(()=>{const v=document.querySelector('video');if(v)v.currentTime+=90;})()`).catch(() => {});
  }, [isElectron]);

  const d       = details || item || {};
  const year    = (d.release_date || d.first_air_date || "").slice(0, 4);
  const planId  = isPremium?.planId || (isPremium ? "premium" : "free");

  const visibleSources = useMemo(() => PLAYER_SOURCES.filter((src) => {
    if (src.async) return false;
    if (isRestrictedForServers && !src.browserSafe) return false;
    return true;
  }), [isRestrictedForServers]);

  const currentLabel = visibleSources.find((s) => s.id === playerSource)?.label
    ?? PLAYER_SOURCES.find((s) => s.id === playerSource)?.label ?? "Server";

  const currentDownload = useMemo(() => {
    if (!downloads?.length) return null;
    if (type === "movie") return downloads.find((dl) => dl.mediaType === "movie" && (dl.tmdbId === item.id || dl.mediaId === item.id) && (dl.status === "completed" || dl.status === "local" || dl.status === "downloading"));
    return downloads.find((dl) => dl.mediaType === "tv" && (dl.tmdbId === item.id || dl.mediaId === item.id) && dl.season === currentSeason && dl.episode === currentEpisode && (dl.status === "completed" || dl.status === "local" || dl.status === "downloading"));
  }, [downloads, item?.id, type, currentSeason, currentEpisode]);

  const mediaName = useMemo(() => {
    const base = `${title}${year ? " (" + year + ")" : ""}`;
    return type === "tv" ? `${base} S${String(currentSeason).padStart(2,"0")} E${String(currentEpisode).padStart(2,"0")}` : base;
  }, [title, year, type, currentSeason, currentEpisode]);

  const runtimeMinutes = useMemo(() => {
    if (type === "tv") return episodeList.find((e) => e.episode_number === currentEpisode)?.runtime || d.episode_run_time?.[0] || null;
    return d.runtime || null;
  }, [type, episodeList, currentEpisode, d]);

  const handleUpgrade = useCallback(() => window.dispatchEvent(new CustomEvent("novaspark:upgrade")), []);

  if (!item) return null;

  const showFailedOverlay = autoSourceStatus === "failed" && !webviewLoading && !hlsStream && !hlsLoading;
  const iframeShieldActive = isChromePure && !isElectron && !webviewLoading && hlsFailed && !hlsLoading;

  return (
    <div className="watch-page fade-in">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes skipPop { from { opacity:0; transform:translateY(12px) scale(0.92); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes disclaimerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

        .ep-carousel::-webkit-scrollbar { display: none; }
        .ep-carousel { scrollbar-width: none; }

        /* ── Server button icon fix ─────────────────────────── */
        .watch-server-btn { white-space: nowrap !important; }
        .watch-server-btn svg { width: 14px !important; height: 14px !important; flex-shrink: 0; display: block; }

        /* ── Season dropdown ─────────────────────────────────── */
        .season-dropdown-menu {
          position:fixed; z-index:9999; background:rgba(12,18,20,0.97);
          border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:6px 0;
          min-width:160px; box-shadow:0 8px 32px rgba(0,0,0,0.7); backdrop-filter:blur(12px);
        }
        .season-dropdown-menu button { display:block; width:100%; text-align:left; padding:10px 18px; background:none; border:none; color:var(--text,#fff); font-size:14px; cursor:pointer; transition:background 0.15s; font-family:inherit; }
        .season-dropdown-menu button:hover { background:rgba(255,255,255,0.08); }
        .season-dropdown-menu button.active { color:var(--red,#e50914); font-weight:700; }

        .load-more-btn:hover { background: rgba(255,255,255,0.08) !important; }
        .watch-rel-card:hover .watch-rel-overlay { opacity:1 !important; }

        /* ── PiP button ──────────────────────────────────────── */
        .topbar-pip-btn { display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.12); border-radius:8px; color:#fff; font-size:13px; font-weight:600; padding:7px 14px; cursor:pointer; transition:background 0.15s; font-family:inherit; white-space:nowrap; }
        .topbar-pip-btn:hover { background:rgba(255,255,255,0.13); }
        .topbar-pip-btn.active { color:var(--red,#e50914); border-color:rgba(229,9,20,0.35); }
        .topbar-pip-btn svg { width:14px !important; height:14px !important; }

        /* ── Responsive ──────────────────────────────────────── */
        @media (max-width: 768px) {
          .watch-topbar { padding: 8px 12px !important; gap: 6px !important; }
          .watch-topbar-title { font-size: 12px !important; }
          .watch-topbar-ep { display: none !important; }
          .watch-meta { padding: 12px 14px !important; }
          .watch-meta-actions { flex-wrap: wrap !important; gap: 6px !important; }
          .watch-meta-actions .btn { flex: 1 1 auto !important; font-size: 12px !important; padding: 8px 10px !important; min-width: 80px !important; justify-content: center !important; }
          .ep-carousel { padding-left: 12px !important; gap: 8px !important; }
          .cards-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .section { padding-left: 14px !important; padding-right: 14px !important; }
          .topbar-pip-btn span { display: none !important; }
          .topbar-pip-btn { padding: 7px 10px !important; }
        }
        @media (max-width: 480px) {
          .watch-topbar-title { font-size: 11px !important; max-width: 100px !important; }
          .watch-server-btn span:first-of-type { display: none; }
          .watch-topbar { gap: 4px !important; }
        }
      `}</style>

      <StealthLoader status={autoSourceStatus} attempt={retryAttempt} />

      {/* ── Scrolling Disclaimer ─────────────────────────────────── */}
      <DisclaimerBanner />

      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <div className="watch-topbar">
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6, flexShrink: 0 }}><BackIcon /> Back</button>
        <div className="watch-topbar-title" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
          {type === "tv" && <span className="watch-topbar-ep">&nbsp;·&nbsp;S{currentSeason} E{currentEpisode}</span>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* ── Server selector — fixed icon size ── */}
          <button
            ref={sourceRef}
            className="watch-server-btn"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600,
              padding: "7px 14px", cursor: "pointer", transition: "background 0.15s",
              fontFamily: "inherit", lineHeight: 1,
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
            onClick={() => {
              if (!canSwitchSource(planId)) { setGateModal("source"); return; }
              const rect = sourceRef.current?.getBoundingClientRect();
              if (rect) setMenuPos({ top: rect.bottom + 6, left: rect.left });
              setShowSourceMenu((v) => !v);
            }}
          >
            {/* Icon constrained to 14×14 */}
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, flexShrink: 0 }}>
              <SourceIcon size={14} />
            </span>
            <span>{hlsStream && !hlsFailed && useHLSPath ? "Direct" : currentLabel}</span>
            <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}>
              <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
            </svg>
          </button>

          <DataMeterWidget
            isPlaying={!webviewLoading && !pipOpen}
            isActuallyPlaying={isActuallyPlaying && !webviewLoading && !pipOpen}
            runtimeMinutes={runtimeMinutes}
            genreIds={(d.genres || []).map((g) => g.id)}
            type={type}
          />

          {isElectron && (
            <button
              className={`topbar-pip-btn${pipOpen ? " active" : ""}`}
              onClick={() => {
                if (pipOpen) { window.electron?.closePipWindow?.(); return; }
                if (!canPopOut(planId)) { setGateModal("pip"); return; }
                window.electron?.openPipWindow?.(embedUrl, title);
              }}
              title={pipOpen ? "Close pop-out" : "Pop out player"}
            >
              <PopOutIcon />
              <span style={{ fontSize: 12 }}>{pipOpen ? "Close" : "Pop out"}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Player ───────────────────────────────────────────────── */}
      <div className="watch-player-wrap" style={{ background: "#000", position: "relative" }}>
        <BlackScreen visible={webviewLoading && !showFailedOverlay} />
        {showFailedOverlay && <AllFailedOverlay onRetry={retryFromScratch} onBack={onBack} />}

        {isElectron ? (
          <webview
            key={`wv-${playerSource}-${item.id}-s${currentSeason}e${currentEpisode}`}
            ref={webviewRef} src={embedUrl} partition="persist:player"
            allowpopups="true" plugins="true" nodeintegration="no"
            webpreferences="contextIsolation=yes,nodeIntegration=no,webSecurity=no,allowRunningInsecureContent=yes"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", background: "#000", opacity: webviewLoading ? 0 : 1, transition: "opacity 0.35s ease", zIndex: 1 }}
          />
        ) : useHLSPath && hlsStream && !hlsFailed ? (
          <HLSPlayer
            key={`hls-${item.id}-s${currentSeason}e${currentEpisode}-${hlsStream.url}`}
            streamUrl={hlsStream.url} streamType={hlsStream.type} subtitles={hlsStream.subtitles || []}
            title={`${title}${type === "tv" ? ` · S${currentSeason}E${currentEpisode}` : ""}`}
            onReady={() => { setWebviewLoading(false); setAutoSourceStatus("found"); setIsActuallyPlaying(true); }}
            onError={() => { invalidateHLSCache(item.id, type, currentSeason, currentEpisode); setHlsFailed(true); setHlsStream(null); setWebviewLoading(true); }}
            onPlayStateChange={setIsActuallyPlaying}
            style={{ zIndex: 1 }}
          />
        ) : (
          <>
            <iframe
              key={`if-${playerSource}-${item.id}-s${currentSeason}e${currentEpisode}`}
              ref={iframeRef}
              src={(!useHLSPath || (hlsFailed && !hlsLoading)) ? embedUrl : "about:blank"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen referrerPolicy="no-referrer"
              onLoad={() => iframeLoadCallbackRef.current?.()}
              onError={() => iframeErrorCallbackRef.current?.()}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", background: "#000", opacity: webviewLoading ? 0 : 1, transition: "opacity 0.4s ease", pointerEvents: webviewLoading ? "none" : "auto" }}
            />
            {iframeShieldActive && (
              <>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "22%", zIndex: 2, pointerEvents: "all" }} />
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "6%", zIndex: 2, pointerEvents: "all" }} />
                <div style={{ position: "absolute", top: "22%", left: 0, width: "4%", bottom: "6%", zIndex: 2, pointerEvents: "all" }} />
                <div style={{ position: "absolute", top: "22%", right: 0, width: "4%", bottom: "6%", zIndex: 2, pointerEvents: "all" }} />
              </>
            )}
          </>
        )}

        {pipOpen && (
          <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.92)", gap: 16 }}>
            <PopOutIcon size={36} />
            <span style={{ fontSize: 15, color: "var(--text1)", fontWeight: 600 }}>Playing in pop-out window</span>
            <button className="player-overlay-btn" onClick={() => window.electron?.closePipWindow?.()}>Close pop-out &amp; return</button>
          </div>
        )}

        {!webviewLoading && !pipOpen && !showFailedOverlay && (
          <PlayerOverlayBtns
            showSkip={showSkipIntro}
            showNext={showNextEp && hasNextEp}
            nextEpNum={currentEpisode < totalEpisodesInSeason ? currentEpisode + 1 : 1}
            onSkip={handleSkipIntro}
            onNext={handleNextEpisode}
          />
        )}

        {showSourceMenu && menuPos && (
          <div className="source-dropdown source-dropdown--fixed watch-source-dropdown" style={{ top: menuPos.top, left: menuPos.left }} onClick={(e) => e.stopPropagation()}>
            {visibleSources.map((src) => (
              <button key={src.id} className={"source-dropdown__item" + (playerSource === src.id ? " source-dropdown__item--active" : "")} onClick={() => switchSource(src.id)}>
                <span>{src.label}</span>
                {src.tag && <span className="source-dropdown__tag">{src.tag}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Episodes carousel ────────────────────────────────────── */}
      {type === "tv" && episodeList.length > 0 && (
        <div style={{ paddingTop: 28, paddingBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 20, paddingRight: 20, marginBottom: 16 }}>
            <div className="section-title" style={{ margin: 0, padding: 0 }}>EPISODES</div>
            {seasons.length > 1 && (
              <div style={{ position: "relative" }}>
                <button ref={seasonBtnRef}
                  onClick={() => { const rect = seasonBtnRef.current?.getBoundingClientRect(); if (rect) setSeasonMenuPos({ top: rect.bottom + 6, left: rect.right - 170 }); setShowSeasonMenu((v) => !v); }}
                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 600, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", transition: "background 0.15s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}>
                  Season {currentSeason}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.7 }}>
                    <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                  </svg>
                </button>
                {showSeasonMenu && seasonMenuPos && (
                  <div className="season-dropdown-menu" style={{ top: seasonMenuPos.top, left: seasonMenuPos.left }}>
                    {seasons.map((s) => (
                      <button key={s.season_number} className={currentSeason === s.season_number ? "active" : ""}
                        onClick={() => { goToEpisode(s.season_number, 1); setShowSeasonMenu(false); }}>
                        {s.name && !s.name.startsWith("Season") ? s.name : `Season ${s.season_number}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div ref={carouselRef} className="ep-carousel" style={{ display: "flex", gap: 12, overflowX: "auto", overflowY: "hidden", paddingLeft: 20, paddingRight: 40, paddingBottom: 8, maskImage: "linear-gradient(to right, black 85%, transparent 100%)", WebkitMaskImage: "linear-gradient(to right, black 85%, transparent 100%)" }}>
            {episodeList.map((ep) => (
              <EpisodeThumb key={ep.id || ep.episode_number} ep={ep} isActive={ep.episode_number === currentEpisode} onPlay={() => goToEpisode(currentSeason, ep.episode_number)} />
            ))}
            <div style={{ flexShrink: 0, width: 20 }} />
          </div>
        </div>
      )}

      {/* ── Meta actions ─────────────────────────────────────────── */}
      <div className="watch-meta" style={{ paddingBottom: 8 }}>
        <div className="watch-meta-actions" style={{ justifyContent: "flex-start" }}>
          {trailerKey && <button className="btn btn-secondary" onClick={() => setShowTrailer(true)}><TrailerIcon /> Trailer</button>}
          {onSave && (
            <button className="btn btn-secondary" onClick={onSave}>
              {isSaved ? <BookmarkFillIcon /> : <BookmarkIcon />}{isSaved ? "Saved" : "Save"}
            </button>
          )}
          <button className="btn btn-secondary"
            onClick={() => { if (currentDownload) { onGoToDownloads?.(currentDownload.id); return; } if (!canDownload(planId)) { setGateModal("download"); return; } setShowDownload(true); }}
            style={currentDownload ? { color: currentDownload.status === "downloading" ? "var(--red)" : "#4caf50", borderColor: currentDownload.status === "downloading" ? "rgba(229,9,20,0.3)" : "rgba(76,175,80,0.3)" } : undefined}>
            {currentDownload ? (currentDownload.status === "downloading" ? "↓ Downloading…" : "✓ Downloaded") : <><DownloadIcon /> Download</>}
          </button>
          <button className="btn btn-ghost" onClick={onBack}><BackIcon /> Back</button>
        </div>
      </div>

      {/* ── More Like This ───────────────────────────────────────── */}
      {related.length > 0 && (
        <div className="section" style={{ paddingTop: 8, paddingBottom: 32 }}>
          <div className="section-title">More Like This</div>
          <div className="cards-grid">
            {related.map((rel) => (
              <div key={`${rel.media_type}_${rel.id}`} className="card watch-rel-card" onClick={() => onSelect?.({ ...rel, media_type: rel.media_type })} style={{ cursor: "pointer" }}>
                <div className="card-poster">
                  {rel.poster_path ? <img src={imgUrl(rel.poster_path)} alt={rel.title || rel.name} loading="lazy" /> : <div className="no-poster"><PlayIcon /></div>}
                  <div className="card-overlay watch-rel-overlay" style={{ opacity: 0, transition: "opacity 0.2s" }}><div className="card-play"><PlayIcon /></div></div>
                  {rel.vote_average > 0 && <div className="card-badge">★ {rel.vote_average.toFixed(1)}</div>}
                </div>
                <div className="card-info">
                  <div className="card-title">{rel.title || rel.name}</div>
                  <div className="card-year">{(rel.release_date || rel.first_air_date || "").slice(0, 4)}</div>
                </div>
              </div>
            ))}
          </div>
          {relatedPage < relatedTotal && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
              <button className="load-more-btn" onClick={() => fetchRelated(relatedPage + 1)} disabled={relatedLoading}
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, color: "var(--text,#fff)", fontSize: 14, fontWeight: 600, padding: "12px 36px", cursor: relatedLoading ? "not-allowed" : "pointer", opacity: relatedLoading ? 0.6 : 1, transition: "background 0.2s" }}>
                {relatedLoading ? "Loading…" : "Load More"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────── */}
      {showTrailer && trailerKey && <TrailerModal trailerKey={trailerKey} title={title} onClose={() => setShowTrailer(false)} />}
      {showDownload && (
        <DownloadModal onClose={() => setShowDownload(false)} m3u8Url={m3u8Url} subtitles={interceptedSubs} mediaName={mediaName}
          downloaderFolder={downloaderFolder} setDownloaderFolder={(folder) => { setDownloaderFolder(folder); storage.set("downloaderFolder", folder); }}
          onOpenSettings={() => {}} onDownloadStarted={onDownloadStarted}
          mediaId={item.id} mediaType={type}
          season={type === "tv" ? currentSeason : null} episode={type === "tv" ? currentEpisode : null}
          posterPath={d.poster_path} tmdbId={item.id} />
      )}
      {gateModal && <PremiumGate feature={gateModal} onUpgrade={handleUpgrade} onClose={() => setGateModal(null)} />}
    </div>
  );
}