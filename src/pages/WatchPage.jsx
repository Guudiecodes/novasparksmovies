import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  PLAYER_SOURCES, getSourceUrl, tmdbFetch, imgUrl,
  NON_ANIME_DEFAULT_SOURCE, BROWSER_RESTRICTED_DEFAULT, NEEDS_INTERCEPT,
  findWorkingSource, buildRetryQueue, isRestrictedBrowser, getDefaultSource,
  invalidateSourceCache,
  fetchAllNonEmbedSources, fetchOnlineSubtitles, M3U8_PROXY,
} from "../utils/api";
import { storage } from "../utils/storage";
import {
  BackIcon, StarIcon, SourceIcon, PlayIcon,
  BookmarkIcon, BookmarkFillIcon, TrailerIcon, PopOutIcon, DownloadIcon,
} from "../components/Icons";
import TrailerModal        from "../components/TrailerModal";
import DownloadModal       from "../components/DownloadModal";
import { canDownload, canPopOut, canSwitchSource } from "../utils/gate";
import PremiumGate         from "../components/PremiumGate";
import DataMeterWidget     from "../components/DataMeterWidget";
import HLSPlayer           from "../components/HLSPlayer";
import NovaSparksPlayer    from "../components/NovaSparksPlayer";
import { extractHLSForChrome, invalidateHLSCache } from "../utils/hlsExtractor";
import { setApiErrorHandlers } from "../utils/api";
setApiErrorHandlers(() => {}, () => {});

const BEAST_TIMEOUT = { tier1: 3500, tier2: 5000, tier3: 7000 };
const BEAST_SECOND_CHANCE_MS = 1500;
const MAX_FULL_CYCLES = 2;

// ── Embed CSS — hides loaders AND ad/cookie modal patterns ────────────────────
const _EMBED_CSS = `
[class*="loading"i],[class*="loader"i],[class*="fetching"i],[class*="preload"i],
[id*="loading"i],[id*="loader"i],[id*="fetching"i],
.spinner,.preloader,.lds-ring,.lds-spinner,.vjs-loading-spinner,
.jw-icon-loading,.plyr__loading{display:none!important;opacity:0!important;visibility:hidden!important;}
video{opacity:1!important;visibility:visible!important;display:block!important;}
[class*="adblock"i],[class*="adblocker"i],[class*="ad-block"i],[class*="ad-modal"i],
[class*="cookie-modal"i],[class*="cookie-banner"i],[class*="cookie-consent"i],[class*="consent-modal"i],
[class*="consent-popup"i],[class*="gdpr"i],[id*="adblock"i],[id*="adblocker"i],
[id*="cookie-banner"i],[id*="cookie-modal"i],[id*="consent"i],
[class*="popup"i][class*="ad"i],[class*="ad"i][class*="popup"i],
[class*="interstitial"i],[class*="overlay-ad"i],[class*="ad-overlay"i]{
  display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;}
`;

// ── Embed JS — kills error banners + ad modals/overlays aggressively ──────────
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

  var AD_KEYS=['TIRED OF ADS','GET OPEN ADBLOCKER','OPEN ADBLOCKER','ADBLOCKER','ADBLOCK DETECTED',
    'AD BLOCKER DETECTED','DISABLE YOUR ADBLOCK','DISABLE ADBLOCK','TURN OFF ADBLOCK',
    'WHITELIST THIS SITE','PLEASE DISABLE','INSTALL ADBLOCKER','REMOVE ADS',
    'COOKIE CONSENT','ACCEPT COOKIES','ACCEPT ALL COOKIES','MANAGE COOKIES',
    'WE USE COOKIES','THIS SITE USES COOKIES','ADVERTISEMENT','YOUR AD BLOCKER'];

  var HIDE='display:none!important;opacity:0!important;pointer-events:none!important;visibility:hidden!important;';

  function killAdOverlays(){
    try{
      // 1. Kill by class/id name patterns
      document.querySelectorAll(
        '[class*="modal"i],[class*="popup"i],[class*="adblock"i],[class*="ad-block"i],'
        +'[class*="adblocker"i],[class*="ad-overlay"i],[class*="interstitial"i],'
        +'[id*="adblock"i],[id*="popup"i],[id*="ad-modal"i],[class*="consent"i],'
        +'[class*="cookie-banner"i],[class*="cookie-modal"i],[class*="gdpr"i]'
      ).forEach(function(el){
        if(!el||!el.textContent)return;
        var t=el.textContent.toUpperCase();
        if(AD_KEYS.some(function(k){return t.indexOf(k)!==-1;})){
          el.style.cssText=HIDE;
        }
      });
      // 2. Kill high z-index fixed/absolute overlays containing ad text
      var all=document.querySelectorAll('body>*,body>*>*,body>*>*>*');
      for(var i=0;i<all.length;i++){
        try{
          var el=all[i];
          var s=window.getComputedStyle(el);
          var z=parseInt(s.zIndex)||0;
          if((s.position==='fixed'||s.position==='absolute')&&z>200){
            var t2=(el.textContent||'').toUpperCase();
            if(AD_KEYS.some(function(k){return t2.indexOf(k)!==-1;})){
              el.style.cssText=HIDE;
            }
          }
        }catch(e2){}
      }
      // 3. Kill ad iframes by src pattern
      document.querySelectorAll('iframe[src*="ads"],iframe[src*="adserv"],iframe[src*="doubleclick"],iframe[src*="googlesyndication"],iframe[id*="ad-"],iframe[class*="ad-"]').forEach(function(el){
        el.style.cssText=HIDE;
      });
    }catch(e){}
  }

  function clean(){
    try{document.querySelectorAll('body *').forEach(function(el){
      if(!el.childElementCount){var t=(el.textContent||'').trim().toUpperCase();
      if(t.length>2&&t.length<200&&BAD.some(function(k){return t===k||t.startsWith(k+'.')||t.startsWith(k+':')||t.indexOf(k)!==-1;})){
        var p=el;for(var i=0;i<5;i++){var par=p.parentElement;if(par&&par!==document.body&&par!==document.documentElement)p=par;else break;}
        p.style.cssText=HIDE;}}});}catch(e){}
    killAdOverlays();
  }

  clean();
  var obs=new MutationObserver(function(){clean();});
  obs.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['style','class','id']});
  // Keep running 2 minutes to catch late-injected ad modals
  setTimeout(function(){obs.disconnect();},120000);
})()`;

const _AUTOPLAY_JS = `(function(){
  if(window.__nsAuto)return;window.__nsAuto=true;
  var SELECTORS=['.jw-icon-display','[aria-label="Play"]','[aria-label="play"]','[title="Play"]','[title="play"]','.vjs-big-play-button','.plyr__control--overlaid','.play-button','button.play','[class*="play"][class*="btn"]','[class*="PlayBtn"]','[class*="play_btn"]','[data-testid="play-button"]','.ytp-large-play-button','.fp-play','[class*="playBtn"]','[class*="play-icon"]','button[class*="Play"]','div[class*="play"]>button','[role="button"][aria-label*="lay"]'];
  function clickPlay(){for(var i=0;i<SELECTORS.length;i++){var b=document.querySelector(SELECTORS[i]);if(b&&b.offsetWidth>0&&b.offsetHeight>0&&!b.disabled){try{b.click();}catch(e){}return true;}}return false;}
  function tryPlay(){
    var v=document.querySelector('video');
    if(v&&v.paused){
      v.muted=false;
      var p=v.play();
      if(p&&p.catch){p.catch(function(){v.muted=true;v.play().then(function(){v.muted=false;}).catch(function(){clickPlay();});});}
    } else if(!v){clickPlay();}
    else if(!v.paused){clearInterval(nsId);return;}
  }
  tryPlay();
  var nsId=setInterval(function(){
    var v=document.querySelector('video');
    if(v&&!v.paused&&v.readyState>=2){clearInterval(nsId);return;}
    tryPlay();
    nsCount++;if(nsCount>=16)clearInterval(nsId);
  },400);
  var nsCount=0;
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

  const useHLSPath = false;
  const isRestrictedForServers = isChromePure && restricted;

  const type  = item?.media_type === "tv" || !!item?.first_air_date ? "tv" : "movie";
  const title = item?.title || item?.name || "";

  const [currentSeason,  setCurrentSeason]  = useState(item?.season  ?? 1);
  const [currentEpisode, setCurrentEpisode] = useState(item?.episode ?? 1);
  useEffect(() => { setCurrentSeason(item?.season ?? 1); setCurrentEpisode(item?.episode ?? 1); }, [item?.id]); // eslint-disable-line

  const [playerSource, setPlayerSource] = useState(() => {
    // Dead sources — removed bad ad servers + legacy
    const DEAD_SOURCES = ["embedsu", "cinezo", "smashystream", "vapsrc", "twoembed", "vidbinge", "vidupto"];
    if (preFoundSource && !DEAD_SOURCES.includes(preFoundSource)) {
      if (!isRestrictedForServers || !NEEDS_INTERCEPT.includes(preFoundSource)) {
        storage.set("playerSource", preFoundSource);
        return preFoundSource;
      }
    }
    const raw   = storage.get("playerSource");
    const saved = DEAD_SOURCES.includes(raw) ? null : raw;
    if (saved) { if (isRestrictedForServers && NEEDS_INTERCEPT.includes(saved)) return BROWSER_RESTRICTED_DEFAULT; return saved; }
    return getDefaultSource();
  });

  const [autoSourceStatus,  setAutoSourceStatus]  = useState(() => {
    if (preFoundSource && (!isRestrictedForServers || !NEEDS_INTERCEPT.includes(preFoundSource))) return "found";
    return "testing";
  });
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

  const [isNonEmbedMode,   setIsNonEmbedMode]   = useState(() => storage.get("playerMode") === "nonembed");
  const [nonEmbedSources,  setNonEmbedSources]  = useState([]);
  const [nonEmbedStream,   setNonEmbedStream]   = useState(null);
  const [nonEmbedCaptions, setNonEmbedCaptions] = useState([]);
  const [nonEmbedFetching, setNonEmbedFetching] = useState(false);
  const [nonEmbedRetry,    setNonEmbedRetry]    = useState(0);
  const nonEmbedAbortRef     = useRef(null);
  const nonEmbedStreamIdxRef = useRef(0);

  const unifiedCaptions = useMemo(() =>
    nonEmbedCaptions
      .map((c) => ({
        url:     c.url  || c.file  || "",
        lang:    c.language || c.lang || "",
        display: c.display  || c.label || c.language || "Unknown",
        format:  c.type || c.format || "srt",
      }))
      .filter((c) => c.url),
  [nonEmbedCaptions]);

  const nsStreamUrl = useMemo(() => {
    if (isNonEmbedMode && nonEmbedStream) {
      return nonEmbedStream.format === "hls"
        ? `${M3U8_PROXY}${encodeURIComponent(nonEmbedStream.url)}`
        : nonEmbedStream.url;
    }
    return m3u8Url;
  }, [isNonEmbedMode, nonEmbedStream, m3u8Url]);

  const showNSPlayer = isElectron && !pipOpen && (
    (isNonEmbedMode && !!nonEmbedStream) ||
    (!isNonEmbedMode && !!m3u8Url)
  );

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
    const seedSource = preFoundSource || playerSource;
    retryQueueRef.current = buildRetryQueue(type, seedSource);
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

  const tryNextNonEmbedSource = useCallback(() => {
    const next = nonEmbedStreamIdxRef.current + 1;
    if (next < nonEmbedSources.length) {
      nonEmbedStreamIdxRef.current = next;
      setNonEmbedStream(nonEmbedSources[next]);
    } else {
      setAutoSourceStatus("failed");
      setWebviewLoading(false);
    }
  }, [nonEmbedSources]);

  const retryFromScratch = useCallback(() => {
    clearTimeout(secondChanceRef.current);
    if (isNonEmbedMode) {
      setAutoSourceStatus("testing");
      setWebviewLoading(true);
      nonEmbedStreamIdxRef.current = 0;
      setNonEmbedRetry((n) => n + 1);
      return;
    }
    sourceFailCountRef.current = {};
    const defaultSrc = getDefaultSource();
    retryQueueRef.current = buildRetryQueue(type, defaultSrc);
    retryIdxRef.current   = 1;
    setCycleCount(0); setRetryAttempt(0);
    setAutoSourceStatus("testing"); setWebviewLoading(true);
    setHlsStream(null); setHlsFailed(false);
    setM3u8Url(null); setInterceptedSubs([]);
    invalidateSourceCache(type, item?.id, currentSeason, currentEpisode);
    setPlayerSource(defaultSrc);
    storage.set("playerSource", defaultSrc);
  }, [isNonEmbedMode, type, item?.id, currentSeason, currentEpisode]);

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
    if (isNonEmbedMode) return;
    if (preFoundSource) {
      if (isRestrictedForServers && NEEDS_INTERCEPT.includes(preFoundSource)) { /* fall through */ }
      else { setPlayerSource(preFoundSource); setAutoSourceStatus("found"); return; }
    }
    let cancelled = false;
    if (autoSourceStatus !== "found") setAutoSourceStatus("testing");
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
  }, [item?.id, type, currentSeason, currentEpisode, preFoundSource, isNonEmbedMode]); // eslint-disable-line

  useEffect(() => {
    setM3u8Url(null); setInterceptedSubs([]);
    setShowSkipIntro(false); setShowNextEp(false);
    setIsActuallyPlaying(false); receivedRealSignalRef.current = false;
    setNonEmbedStream(null); setNonEmbedSources([]); setNonEmbedCaptions([]);
    nonEmbedStreamIdxRef.current = 0;
  }, [playerSource, item?.id, currentSeason, currentEpisode, type]);

  const totalEpisodesInSeason = episodeList.length;
  const totalSeasons = seasons.length;
  const hasNextEp = type === "tv" && (currentEpisode < totalEpisodesInSeason || currentSeason < totalSeasons);

  const embedUrl = useMemo(() => {
    if (!item?.id || isNonEmbedMode) return "about:blank";
    return getSourceUrl(playerSource, type, item.id, currentSeason, currentEpisode);
  }, [playerSource, type, item?.id, currentSeason, currentEpisode, isNonEmbedMode]);

  useEffect(() => { setWebviewLoading(true); setIsActuallyPlaying(false); receivedRealSignalRef.current = false; }, [embedUrl]);

  useEffect(() => {
    if (!useHLSPath || !item?.id || isNonEmbedMode) { setHlsStream(null); setHlsFailed(false); return; }
    let cancelled = false;
    setHlsStream(null); setHlsFailed(false); setHlsLoading(true); setWebviewLoading(true);
    extractHLSForChrome(item.id, type, currentSeason, currentEpisode)
      .then((result) => {
        if (cancelled) return;
        if (result?.url) { setHlsStream(result); setHlsLoading(false); }
        else { setHlsFailed(true); setHlsLoading(false); }
      }).catch(() => { if (!cancelled) { setHlsFailed(true); setHlsLoading(false); } });
    return () => { cancelled = true; };
  }, [item?.id, type, currentSeason, currentEpisode, useHLSPath, isNonEmbedMode]); // eslint-disable-line

  useEffect(() => { setHlsStream(null); setHlsFailed(false); }, [item?.id, currentSeason, currentEpisode]);

  useEffect(() => {
    if (!isNonEmbedMode || !item?.id) return;
    nonEmbedAbortRef.current?.abort();
    const ctrl = new AbortController();
    nonEmbedAbortRef.current = ctrl;
    nonEmbedStreamIdxRef.current = 0;
    setNonEmbedSources([]);
    setNonEmbedCaptions([]);
    setNonEmbedStream(null);
    setNonEmbedFetching(true);
    setAutoSourceStatus("testing");
    setWebviewLoading(true);
    let streamSet = false;
    fetchAllNonEmbedSources(
      type, item.id,
      type === "tv" ? currentSeason  : null,
      type === "tv" ? currentEpisode : null,
      {
        onSourceFound: (src) => {
          setNonEmbedSources((prev) => [...prev, src]);
          if (!streamSet) {
            streamSet = true;
            nonEmbedStreamIdxRef.current = 0;
            setNonEmbedStream(src);
            setAutoSourceStatus("found");
            setWebviewLoading(false);
          }
        },
        signal: ctrl.signal,
      }
    ).then(({ sources, captions }) => {
      if (ctrl.signal.aborted) return;
      setNonEmbedSources(sources);
      setNonEmbedCaptions((prev) => {
        const seen = new Set(prev.map((c) => c.url || c.file));
        return [...prev, ...captions.filter((c) => !seen.has(c.url || c.file))];
      });
      setNonEmbedFetching(false);
      if (!streamSet) {
        if (sources.length) {
          streamSet = true;
          setNonEmbedStream(sources[0]);
          setAutoSourceStatus("found");
          setWebviewLoading(false);
        } else {
          setAutoSourceStatus("failed");
          setWebviewLoading(false);
        }
      }
    }).catch(() => {
      if (!ctrl.signal.aborted) {
        setNonEmbedFetching(false);
        setAutoSourceStatus("failed");
        setWebviewLoading(false);
      }
    });
    fetchOnlineSubtitles(item.id).then((subs) => {
      if (ctrl.signal.aborted || !subs.length) return;
      setNonEmbedCaptions((prev) => {
        const seen = new Set(prev.map((c) => c.url));
        return [...prev, ...subs.filter((s) => !seen.has(s.url))];
      });
    }).catch(() => {});
    return () => ctrl.abort();
  }, [isNonEmbedMode, item?.id, type, currentSeason, currentEpisode, nonEmbedRetry]); // eslint-disable-line

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

  useEffect(() => {
    if (!isElectron || showNSPlayer || isNonEmbedMode) return;
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
  }, [isElectron, webviewLoading, pipOpen, embedUrl, showNSPlayer, isNonEmbedMode]);

  useEffect(() => {
    if (isElectron || isNonEmbedMode) return;
    if (webviewLoading) { setIsActuallyPlaying(false); return; }
    const timer = setTimeout(() => { if (!receivedRealSignalRef.current) setIsActuallyPlaying(true); }, 3500);
    return () => clearTimeout(timer);
  }, [isElectron, webviewLoading, embedUrl, isNonEmbedMode]);

  useEffect(() => {
    if (!isElectron || isNonEmbedMode) return;
    const wv = webviewRef.current; if (!wv) return;
    const onDomReady = async () => {
      try { await wv.insertCSS(_EMBED_CSS); } catch {}
      try { await wv.executeJavaScript(_EMBED_JS); } catch {}
      try { await wv.executeJavaScript(_AUTOPLAY_JS); } catch {}
      setTimeout(async () => { try { await wv.executeJavaScript(_AUTOPLAY_JS); } catch {} }, 600);
    };
    wv.addEventListener("dom-ready", onDomReady);
    return () => { try { wv.removeEventListener("dom-ready", onDomReady); } catch {} };
  }, [embedUrl, isElectron, isNonEmbedMode]);

  useEffect(() => {
    if (isElectron || isNonEmbedMode) return;
    const iframe = iframeRef.current; if (!iframe) return;
    const tryAutoplay = () => {
      try {
        iframe.contentWindow?.postMessage({ event: "play", action: "play" }, "*");
        iframe.contentWindow?.postMessage({ type: "play" }, "*");
        iframe.contentWindow?.postMessage({ event: "playing" }, "*");
        iframe.contentWindow?.postMessage({ command: "play" }, "*");
        iframe.contentWindow?.postMessage({ name: "play" }, "*");
      } catch {}
    };
    tryAutoplay();
    const t1 = setTimeout(tryAutoplay, 800);
    const t2 = setTimeout(tryAutoplay, 2000);
    const t3 = setTimeout(tryAutoplay, 4000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isElectron, embedUrl, isNonEmbedMode]);

  useEffect(() => {
    if (!isElectron || isNonEmbedMode) return;
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
      setTimeout(async () => {
        const wvFinal = webviewRef.current; if (!wvFinal || !active === false) return;
        try { await wvFinal.executeJavaScript(_AUTOPLAY_JS); } catch {}
      }, 300);
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
      if (m3u8Url) { setAutoSourceStatus((s) => (s === "retrying" || s === "testing") ? "found" : s); return; }
      tryNextSource();
    }, ABSOLUTE_CEILING_MS);
    const runPoll = async () => {
      if (!active) { clearInterval(pollRef.current); return; }
      const wv = webviewRef.current; if (!wv) return;
      if (m3u8Url) { markReady(); return; }
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
      try { await wv.executeJavaScript(_AUTOPLAY_JS); } catch {}
      runPoll();
      setTimeout(async () => { try { await wv.executeJavaScript(_AUTOPLAY_JS); } catch {} }, 600);
    };
    runPoll();
    pollRef.current = setInterval(runPoll, 100);
    const hardTimeoutId = setTimeout(enterSecondChance, HARD_TIMEOUT_MS);
    const onLoadFail = (e) => { if (!e.isMainFrame || e.errorCode === -3) return; clearTimeout(hardTimeoutId); enterSecondChance(); }; // eslint-disable-line
    wv.addEventListener("dom-ready", onDomReady);
    wv.addEventListener("did-finish-load", async () => { runPoll(); try { await wv.executeJavaScript(_AUTOPLAY_JS); } catch {} });
    wv.addEventListener("did-fail-load", onLoadFail);
    return () => {
      active = false; clearInterval(pollRef.current); clearTimeout(hardTimeoutId); clearTimeout(absoluteCeilingId); clearTimeout(secondChanceRef.current);
      try { wv.removeEventListener("dom-ready", onDomReady); } catch {}
      try { wv.removeEventListener("did-finish-load", () => {}); } catch {}
      try { wv.removeEventListener("did-fail-load", onLoadFail); } catch {}
    };
  }, [embedUrl, isElectron, isNonEmbedMode, tryNextSource, playerSource, type, m3u8Url]); // eslint-disable-line

  useEffect(() => {
    if (isElectron || isNonEmbedMode) return;
    if (!embedUrl || embedUrl === "about:blank") { setWebviewLoading(false); return; }
    if (useHLSPath && (hlsLoading || (hlsStream && !hlsFailed))) return;
    let active = true, iframeHasLoaded = false;
    const PROBE_TIMEOUT = 600, LOAD_REVEAL_DELAY = 200, HARD_TIMEOUT_MS = 3000, SECOND_CHANCE_MS = 1500;
    let probeAbortCtrl = new AbortController();
    let probeTimerId = null, hardTimerId = null, revealTimerId = null, secondTimerId = null;
    const clearAll = () => { clearTimeout(probeTimerId); clearTimeout(hardTimerId); clearTimeout(revealTimerId); clearTimeout(secondTimerId); try { probeAbortCtrl.abort(); } catch {} };
    const onReady = () => {
      if (!active) return; active = false; clearAll();
      setAutoSourceStatus((s) => (s === "testing" || s === "retrying") ? "found" : s);
      setWebviewLoading(false);
      setTimeout(() => {
        try {
          iframeRef.current?.contentWindow?.postMessage({ event: "play", action: "play" }, "*");
          iframeRef.current?.contentWindow?.postMessage({ type: "play" }, "*");
        } catch {}
      }, 150);
    };
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
  }, [embedUrl, isElectron, isNonEmbedMode, tryNextSource, isRestrictedForServers, hlsLoading, hlsStream, hlsFailed, useHLSPath]);

  useEffect(() => {
    if (!isElectron || showNSPlayer || isNonEmbedMode) return;
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
  }, [isElectron, webviewLoading, pipOpen, type, hasNextEp, showNSPlayer, isNonEmbedMode]);

  useEffect(() => {
    if (!window.electron) return;
    const h = window.electron.onM3u8Found((url) => {
      if (isNonEmbedMode) return;
      setM3u8Url((p) => p !== url ? url : p);
      setAutoSourceStatus("found");
      setWebviewLoading(false);
    });
    return () => window.electron.offM3u8Found(h);
  }, [isNonEmbedMode]);

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
    setM3u8Url(null); setInterceptedSubs([]);
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

  const browserNonEmbedUrl = nonEmbedStream
    ? (nonEmbedStream.format === "hls"
        ? `${M3U8_PROXY}${encodeURIComponent(nonEmbedStream.url)}`
        : nonEmbedStream.url)
    : null;

  const showFailedOverlay = autoSourceStatus === "failed" && !webviewLoading && !hlsStream && !hlsLoading && !m3u8Url && !nonEmbedStream;
  const iframeShieldActive = !isElectron && !isNonEmbedMode && !webviewLoading && !pipOpen;

  return (
    <div className="watch-page fade-in">
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes skipPop { from { opacity:0; transform:translateY(12px) scale(0.92); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes disclaimerScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .ep-carousel::-webkit-scrollbar { display: none; }
        .ep-carousel { scrollbar-width: none; }
        .watch-server-btn { white-space: nowrap !important; }
        .watch-server-btn svg { width: 14px !important; height: 14px !important; flex-shrink: 0; display: block; }
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
        .topbar-pip-btn { display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.12); border-radius:8px; color:#fff; font-size:13px; font-weight:600; padding:7px 14px; cursor:pointer; transition:background 0.15s; font-family:inherit; white-space:nowrap; }
        .topbar-pip-btn:hover { background:rgba(255,255,255,0.13); }
        .topbar-pip-btn.active { color:var(--red,#e50914); border-color:rgba(229,9,20,0.35); }
        .topbar-pip-btn svg { width:14px !important; height:14px !important; }
        .ns-player-badge { display:inline-flex; align-items:center; gap:4px; background:rgba(229,9,20,0.15); border:1px solid rgba(229,9,20,0.3); border-radius:6px; padding:3px 8px; font-size:11px; font-weight:700; color:#e50914; letter-spacing:.5px; }
        .adfree-btn { display:flex; align-items:center; gap:5px; border-radius:8px; font-size:12px; font-weight:600; padding:7px 12px; cursor:pointer; font-family:inherit; white-space:nowrap; transition:all 0.15s; border:1px solid; }
        .adfree-btn.off { background:rgba(255,255,255,0.07); border-color:rgba(255,255,255,0.12); color:rgba(255,255,255,0.6); }
        .adfree-btn.off:hover { background:rgba(255,255,255,0.12); color:#fff; }
        .adfree-btn.on { background:rgba(76,175,80,0.12); border-color:rgba(76,175,80,0.35); color:#4caf50; }
        .adfree-btn.on:hover { background:rgba(76,175,80,0.2); }
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
          .adfree-btn span.adfree-label { display: none !important; }
        }
        @media (max-width: 480px) {
          .watch-topbar-title { font-size: 11px !important; max-width: 100px !important; }
          .watch-server-btn span:first-of-type { display: none; }
          .watch-topbar { gap: 4px !important; }
        }
      `}</style>

      <StealthLoader status={autoSourceStatus} attempt={retryAttempt} />
      <DisclaimerBanner />

      <div className="watch-topbar">
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6, flexShrink: 0 }}><BackIcon /> Back</button>
        <div className="watch-topbar-title" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
          {type === "tv" && <span className="watch-topbar-ep">&nbsp;·&nbsp;S{currentSeason} E{currentEpisode}</span>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {showNSPlayer && (
            <span className="ns-player-badge">
              <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#e50914"/></svg>
              LIVE
            </span>
          )}

          <button
            className={`adfree-btn ${isNonEmbedMode ? "on" : "off"}`}
            onClick={() => {
              const next = !isNonEmbedMode;
              setIsNonEmbedMode(next);
              storage.set("playerMode", next ? "nonembed" : "embed");
              setAutoSourceStatus("testing");
              setWebviewLoading(true);
              if (!next) {
                setNonEmbedStream(null); setNonEmbedSources([]); setNonEmbedCaptions([]);
                nonEmbedStreamIdxRef.current = 0;
              } else {
                setNonEmbedRetry((n) => n + 1);
              }
            }}
            title={isNonEmbedMode ? "Switch to Embed Mode" : "Switch to AD-free Non-Embed Mode"}
          >
            {isNonEmbedMode ? (
              <>
                <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#4caf50"/></svg>
                <span className="adfree-label">AD-free</span>
                {nonEmbedStream?.quality && (
                  <span style={{ fontSize: 10, opacity: 0.8, letterSpacing: 0.3 }}>{nonEmbedStream.quality}</span>
                )}
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
                <span className="adfree-label">AD-free</span>
              </>
            )}
          </button>

          {!isNonEmbedMode && (
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
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, flexShrink: 0 }}>
                <SourceIcon size={14} />
              </span>
              <span>{hlsStream && !hlsFailed && useHLSPath ? "Direct" : currentLabel}</span>
              <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}>
                <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              </svg>
            </button>
          )}

          {isNonEmbedMode && nonEmbedSources.length > 1 && (
            <div style={{ position: "relative" }}>
              <button
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 600,
                  padding: "7px 12px", cursor: "pointer", fontFamily: "inherit",
                }}
                onClick={() => setShowSourceMenu((v) => !v)}
              >
                <SourceIcon size={13} />
                <span>{nonEmbedStream?.source || "Source"}</span>
                {nonEmbedStream?.quality && <span style={{ opacity: 0.6, fontSize: 11 }}>{nonEmbedStream.quality}</span>}
                <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.5 }}>
                  <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                </svg>
              </button>
              {showSourceMenu && (
                <div className="source-dropdown watch-source-dropdown" style={{ position: "fixed", top: "auto", right: 12, marginTop: 4, zIndex: 9999 }} onClick={(e) => e.stopPropagation()}>
                  {nonEmbedSources.map((src, i) => (
                    <button
                      key={`${src.url}-${i}`}
                      className={"source-dropdown__item" + (nonEmbedStream?.url === src.url ? " source-dropdown__item--active" : "")}
                      onClick={() => {
                        nonEmbedStreamIdxRef.current = i;
                        setNonEmbedStream(src);
                        setShowSourceMenu(false);
                      }}
                    >
                      <span>{src.source || `Source ${i + 1}`}</span>
                      {src.quality && <span className="source-dropdown__tag">{src.quality}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
                window.electron?.openPipWindow?.(isNonEmbedMode ? (nsStreamUrl || embedUrl) : embedUrl, title);
              }}
              title={pipOpen ? "Close pop-out" : "Pop out player"}
            >
              <PopOutIcon />
              <span style={{ fontSize: 12 }}>{pipOpen ? "Close" : "Pop out"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="watch-player-wrap" style={{ background: "#000", position: "relative" }}>
        <BlackScreen visible={webviewLoading && !showFailedOverlay && !showNSPlayer && !(isNonEmbedMode && !!nonEmbedStream)} />
        {showFailedOverlay && <AllFailedOverlay onRetry={retryFromScratch} onBack={onBack} />}

        {isElectron ? (
          <>
            {!isNonEmbedMode && (
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
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  border: "none", background: "#000",
                  opacity: (showNSPlayer || webviewLoading) ? 0 : 1,
                  pointerEvents: showNSPlayer ? "none" : "auto",
                  transition: "opacity 0.35s ease",
                  zIndex: 1,
                }}
              />
            )}
            {showNSPlayer && (
              <NovaSparksPlayer
                key={`nsp-${isNonEmbedMode ? "ne" : "em"}-${item.id}-s${currentSeason}e${currentEpisode}${isNonEmbedMode ? `-${nonEmbedStreamIdxRef.current}` : ""}`}
                streamUrl={nsStreamUrl}
                subtitles={
                  isNonEmbedMode
                    ? unifiedCaptions.map((c) => ({ url: c.url, lang: c.lang || "" }))
                    : interceptedSubs
                }
                title={`${title}${type === "tv" ? ` · S${currentSeason}E${currentEpisode}` : ""}`}
                onReady={() => { setWebviewLoading(false); setAutoSourceStatus("found"); setIsActuallyPlaying(true); }}
                onError={() => {
                  if (isNonEmbedMode) { tryNextNonEmbedSource(); }
                  else { setM3u8Url(null); setInterceptedSubs([]); setWebviewLoading(true); tryNextSource(); }
                }}
                onPlayStateChange={setIsActuallyPlaying}
                onTimeUpdate={(ct, dur) => {
                  if (!dur) return;
                  setShowSkipIntro(type === "tv" && ct >= 20 && ct <= 300);
                  setShowNextEp(hasNextEp && (dur - ct <= 90 || ct / dur >= 0.92));
                }}
                style={{ position: "absolute", inset: 0, zIndex: 2 }}
              />
            )}
          </>
        ) : isNonEmbedMode && browserNonEmbedUrl ? (
          <HLSPlayer
            key={`hls-ne-${item.id}-s${currentSeason}e${currentEpisode}-${nonEmbedStreamIdxRef.current}`}
            streamUrl={browserNonEmbedUrl}
            streamType={nonEmbedStream?.format || "hls"}
            subtitles={unifiedCaptions}
            title={`${title}${type === "tv" ? ` · S${currentSeason}E${currentEpisode}` : ""}`}
            onReady={() => { setWebviewLoading(false); setAutoSourceStatus("found"); setIsActuallyPlaying(true); }}
            onError={tryNextNonEmbedSource}
            onPlayStateChange={setIsActuallyPlaying}
            onTimeUpdate={(ct, dur) => {
              if (!dur) return;
              setShowSkipIntro(type === "tv" && ct >= 20 && ct <= 300);
              setShowNextEp(hasNextEp && (dur - ct <= 90 || ct / dur >= 0.92));
            }}
            style={{ position: "absolute", inset: 0, zIndex: 1 }}
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
              allowFullScreen
              referrerPolicy="origin"
              onLoad={() => iframeLoadCallbackRef.current?.()}
              onError={() => iframeErrorCallbackRef.current?.()}
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                border: "none", background: "#000",
                opacity: webviewLoading ? 0 : 1,
                transition: "opacity 0.4s ease",
                pointerEvents: webviewLoading ? "none" : "auto",
              }}
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

        {!isNonEmbedMode && showSourceMenu && menuPos && (
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

      {showTrailer && trailerKey && <TrailerModal trailerKey={trailerKey} title={title} onClose={() => setShowTrailer(false)} />}
      {showDownload && (
        <DownloadModal onClose={() => setShowDownload(false)}
          m3u8Url={isNonEmbedMode ? (nsStreamUrl || m3u8Url) : m3u8Url}
          subtitles={isNonEmbedMode ? unifiedCaptions.map((c) => ({ url: c.url, lang: c.lang })) : interceptedSubs}
          mediaName={mediaName}
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