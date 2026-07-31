import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  PLAYER_SOURCES, getSourceUrl, tmdbFetch, imgUrl,
  BROWSER_RESTRICTED_DEFAULT, NEEDS_INTERCEPT,
  findWorkingSource, buildRetryQueue, isRestrictedBrowser, getDefaultSource,
  invalidateSourceCache, fetchAllNonEmbedSources, fetchOnlineSubtitles, M3U8_PROXY,
} from "../utils/api";
import { storage } from "../utils/storage";
import {
  BackIcon, SourceIcon, PlayIcon,
  BookmarkIcon, BookmarkFillIcon, TrailerIcon, PopOutIcon, DownloadIcon,
} from "../components/Icons";
import TrailerModal     from "../components/TrailerModal";
import DownloadModal    from "../components/DownloadModal";
import { canDownload, canPopOut, canSwitchSource } from "../utils/gate";
import PremiumGate      from "../components/PremiumGate";
import DataMeterWidget  from "../components/DataMeterWidget";
import HLSPlayer        from "../components/HLSPlayer";
import NovaSparksPlayer from "../components/NovaSparksPlayer";
import { invalidateHLSCache } from "../utils/hlsExtractor";
import { setApiErrorHandlers } from "../utils/api";
setApiErrorHandlers(() => {}, () => {});

const MAX_CYCLES = 2;
const posKey = (type, id, s, e) =>
  `ns_pos_${type}_${id}${type === "tv" ? `_s${s}e${e}` : ""}`;

// Sources that never work — skipped globally
const DEAD = [
  "embedsu","cinezo","smashystream","vapsrc",
  "twoembed","vidbinge","vidupto","primesrc","vidcorenl",
];
// Sources that fail specifically in Electron (webview context)
const ELECTRON_DEAD = ["embed2","vidfast"];

const EMBED_CSS = `
[class*="adblock"i],[class*="adblocker"i],[class*="ad-block"i],[class*="ad-modal"i],
[class*="cookie-modal"i],[class*="cookie-banner"i],[class*="cookie-consent"i],
[class*="consent-modal"i],[class*="consent-popup"i],[class*="gdpr"i],
[id*="adblock"i],[id*="adblocker"i],[id*="cookie-modal"i],
[class*="popup"i][class*="ad"i],[class*="interstitial"i],[class*="overlay-ad"i],
a[href*="doubleclick"i],iframe[src*="doubleclick"],iframe[src*="googlesyndication"]{
  display:none!important;visibility:hidden!important;pointer-events:none!important;}`;

const EMBED_JS = `(function(){
  if(window.__ns)return;window.__ns=true;
  try{
    window.open=function(){return null;};
    document.addEventListener('click',function(e){
      var el=e.target;
      for(var i=0;i<6;i++){
        if(!el)break;
        if(el.tagName==='A'){
          var tgt=(el.target||'').toLowerCase();
          if(tgt==='_blank'||tgt==='_top'||tgt==='_parent'){
            try{var u=new URL(el.href||'');if(u.origin!==window.location.origin){e.preventDefault();e.stopImmediatePropagation();return;}}
            catch(er){e.preventDefault();e.stopImmediatePropagation();return;}
          }
          break;
        }
        el=el.parentElement;
      }
    },true);
  }catch(e){}
  var AD=['ADBLOCK DETECTED','AD BLOCKER DETECTED','DISABLE ADBLOCK','COOKIE CONSENT','ACCEPT ALL COOKIES','YOUR AD BLOCKER','SKIP AD'];
  var H='display:none!important;visibility:hidden!important;pointer-events:none!important;position:fixed!important;z-index:-9999!important;';
  function safe(el){try{if(!el||el.tagName==='VIDEO')return true;if(el.querySelector&&el.querySelector('video'))return true;var r=el.getBoundingClientRect();return r.width>=(window.innerWidth||1)*0.5&&r.height>=(window.innerHeight||1)*0.5;}catch(e){return true;}}
  function kill(){try{document.querySelectorAll('[class*="modal"i],[class*="popup"i],[class*="adblock"i],[class*="consent"i],[class*="cookie"i],[id*="adblock"i]').forEach(function(el){if(!el.textContent||safe(el))return;var t=el.textContent.toUpperCase();if(AD.some(function(k){return t.indexOf(k)!==-1;}))el.style.cssText=H;});}catch(e){}}
  kill();var obs=new MutationObserver(kill);obs.observe(document.body,{childList:true,subtree:true});setTimeout(function(){obs.disconnect();},60000);
})()`;

const AUTOPLAY_JS = `(function(){
  if(window.__nsAuto)return;window.__nsAuto=true;
  var S=['.jw-icon-display','[aria-label="Play"]','[title="Play"]','.vjs-big-play-button','.plyr__control--overlaid','button.play','[class*="PlayBtn"]','[data-testid="play-button"]','.ytp-large-play-button','[class*="playBtn"]','button[class*="Play"]'];
  function click(){for(var i=0;i<S.length;i++){var b=document.querySelector(S[i]);if(b&&b.offsetWidth>0&&!b.disabled){try{b.click();}catch(e){}return;}}}
  function tryPlay(){var v=document.querySelector('video');if(v&&v.paused){v.muted=false;var p=v.play();if(p&&p.catch)p.catch(function(){v.muted=true;v.play().catch(click);});}else if(!v){click();}else{clearInterval(id);}}
  tryPlay();var n=0,id=setInterval(function(){var v=document.querySelector('video');if(v&&!v.paused&&v.readyState>=2){clearInterval(id);return;}tryPlay();if(++n>=16)clearInterval(id);},400);
})()`;

function parseMsg(data) {
  try {
    const d = typeof data === "string" ? JSON.parse(data) : data;
    if (!d || typeof d !== "object") return null;
    if (d.type === "PLAYER_EVENT" && d.data?.event) {
      const ev = String(d.data.event).toLowerCase();
      if (ev === "play" || ev === "playing") return "play";
      if (ev === "pause" || ev === "complete" || ev === "ended") return "pause";
      if (ev === "error" || ev === "load_error") return "error";
    }
    const evt = String(d.event||d.type||d.action||d.playbackState||d.state||"").toLowerCase();
    if (["error","player_error","load_error","stream_error","media_error"].includes(evt)||d.error===true) return "error";
    if (["play","playing","resume","started"].includes(evt)||d.playing===true) return "play";
    if (["pause","paused","stop","stopped","ended","complete","idle"].includes(evt)||d.playing===false) return "pause";
    return null;
  } catch { return null; }
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */
function InfoStrip({ year, voteAverage, runtime, overview, genres }) {
  const [exp, setExp] = useState(false);
  const long = overview && overview.length > 200;
  return (
    <div style={{padding:"14px 20px 12px",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:10}}>
        {year&&<span style={{display:"inline-flex",alignItems:"center",fontSize:12,color:"rgba(255,255,255,.5)",background:"rgba(255,255,255,.06)",borderRadius:5,padding:"3px 8px"}}>{year}</span>}
        {voteAverage>0&&<span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:12,color:"#f5c518",background:"rgba(245,197,24,.08)",borderRadius:5,padding:"3px 8px",fontWeight:700}}><svg width="10" height="10" viewBox="0 0 24 24" fill="#f5c518"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>{voteAverage.toFixed(1)}</span>}
        {runtime>0&&<span style={{display:"inline-flex",alignItems:"center",fontSize:12,color:"rgba(255,255,255,.5)",background:"rgba(255,255,255,.06)",borderRadius:5,padding:"3px 8px"}}>{runtime} min</span>}
        {(genres||[]).slice(0,3).map(g=><span key={g.id} style={{display:"inline-flex",alignItems:"center",fontSize:11,color:"rgba(255,255,255,.4)",background:"rgba(255,255,255,.06)",borderRadius:5,padding:"3px 8px"}}>{g.name}</span>)}
      </div>
      {overview&&(
        <>
          <p style={{fontSize:13,color:"rgba(255,255,255,.5)",lineHeight:1.75,margin:0,
            display:long&&!exp?"-webkit-box":"block",
            WebkitLineClamp:long&&!exp?2:undefined,
            WebkitBoxOrient:long&&!exp?"vertical":undefined,
            overflow:long&&!exp?"hidden":undefined}}>{overview}</p>
          {long&&<button onClick={()=>setExp(v=>!v)} style={{background:"none",border:"none",color:"rgba(255,255,255,.35)",fontSize:12,cursor:"pointer",padding:"5px 0 0",fontFamily:"inherit"}}>{exp?"Show less ▲":"Read more ▼"}</button>}
        </>
      )}
    </div>
  );
}

function BlackScreen({ visible }) {
  return (
    <div style={{position:"absolute",inset:0,zIndex:4,background:"#000",display:"flex",alignItems:"center",justifyContent:"center",opacity:visible?1:0,transition:"opacity .35s ease",pointerEvents:visible?"auto":"none"}}>
      {visible&&<div style={{width:40,height:40,borderRadius:"50%",border:"3px solid rgba(255,255,255,.08)",borderTopColor:"rgba(255,255,255,.55)",animation:"wpSpin .9s linear infinite"}}/>}
    </div>
  );
}

function FailedOverlay({ onRetry, onBack }) {
  return (
    <div style={{position:"absolute",inset:0,zIndex:10,background:"rgba(0,0,0,.96)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:18,padding:"32px 24px",textAlign:"center"}}>
      <div style={{width:52,height:52,borderRadius:"50%",background:"rgba(255,255,255,.04)",border:"1.5px solid rgba(255,255,255,.10)",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.8"><path d="M1 1l22 22M17 17H5a2 2 0 0 1-2-2V7m4-2h10a2 2 0 0 1 2 2v8"/></svg>
      </div>
      <div>
        <p style={{fontSize:17,fontWeight:700,color:"#fff",margin:"0 0 8px"}}>Stream unavailable</p>
        <p style={{fontSize:13,color:"rgba(255,255,255,.45)",lineHeight:1.7,margin:0,maxWidth:280}}>All servers failed. Check your connection or try again.</p><div style={{display:"flex",alignItems:"center",gap:8,marginTop:14,padding:"9px 14px",borderRadius:10,background:"rgba(0,180,166,.08)",border:"1px solid rgba(0,180,166,.2)"}}><div style={{width:20,height:20,borderRadius:6,background:"linear-gradient(135deg,#00b4a6,#06201d)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:8,fontWeight:800,color:"#fff"}}>NS</span></div><span style={{fontSize:12,color:"rgba(255,255,255,.65)"}}>NS AI noticed this too - tap Retry and I will look for a better source.</span></div>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center"}}>
        <button onClick={onRetry} style={{background:"var(--red,#e50914)",border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:700,padding:"11px 28px",cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>Retry
        </button>
        <button onClick={onBack} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.10)",borderRadius:8,color:"rgba(255,255,255,.7)",fontSize:14,fontWeight:600,padding:"11px 22px",cursor:"pointer"}}>Back</button>
      </div>
    </div>
  );
}

function OverlayBtns({ showSkip, showNext, nextNum, onSkip, onNext }) {
  if (!showSkip && !showNext) return null;
  return (
    <div style={{position:"absolute",bottom:64,left:0,right:0,zIndex:20,display:"flex",alignItems:"flex-end",justifyContent:"space-between",padding:"0 20px",pointerEvents:"none"}}>
      <div style={{pointerEvents:"auto"}}>
        {showSkip&&<button onClick={onSkip} style={{background:"rgba(0,0,0,.85)",backdropFilter:"blur(10px)",border:"2px solid rgba(255,255,255,.4)",borderRadius:7,color:"#fff",fontSize:14,fontWeight:700,padding:"10px 22px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,animation:"wpPop .3s cubic-bezier(.34,1.56,.64,1)"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>Skip Intro
        </button>}
      </div>
      <div style={{pointerEvents:"auto"}}>
        {showNext&&<button onClick={onNext} style={{background:"var(--red,#e50914)",borderRadius:7,border:"none",color:"#fff",fontSize:14,fontWeight:700,padding:"11px 22px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,animation:"wpPop .3s cubic-bezier(.34,1.56,.64,1)"}}>
          Next Episode {nextNum&&<span style={{opacity:.85}}>E{nextNum}</span>}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
        </button>}
      </div>
    </div>
  );
}

function EpThumb({ ep, active, onPlay }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onPlay} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{flexShrink:0,width:210,borderRadius:10,overflow:"hidden",cursor:"pointer",border:active?"2px solid var(--red,#e50914)":"2px solid transparent",background:"rgba(255,255,255,.03)",transform:hov&&!active?"scale(1.025)":"scale(1)",transition:"all .18s",boxShadow:active?"0 0 0 1px rgba(229,9,20,.25)":hov?"0 4px 20px rgba(0,0,0,.5)":"none"}}>
      <div style={{width:"100%",aspectRatio:"16/9",position:"relative",background:"rgba(255,255,255,.06)"}}>
        {ep.still_path?<img src={imgUrl(ep.still_path,"w300")} alt={ep.name} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<div style={{width:"100%",height:"100%",background:"linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.02))"}}/>}
        <div style={{position:"absolute",top:7,left:8,background:active?"var(--red,#e50914)":"rgba(0,0,0,.75)",borderRadius:5,padding:"2px 8px",fontSize:11,fontWeight:700,color:"#fff"}}>E{ep.episode_number}</div>
        {active&&<div style={{position:"absolute",inset:0,background:"rgba(229,9,20,.10)"}}/>}
        {ep.runtime>0&&<div style={{position:"absolute",bottom:7,right:8,background:"rgba(0,0,0,.72)",borderRadius:4,padding:"2px 6px",fontSize:10,color:"rgba(255,255,255,.8)",fontWeight:600}}>{ep.runtime}m</div>}
      </div>
      <div style={{padding:"9px 12px 11px",fontSize:12,fontWeight:700,color:active?"var(--red,#e50914)":hov?"#fff":"rgba(255,255,255,.85)",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
        {ep.name||`Episode ${ep.episode_number}`}
      </div>
    </div>
  );
}

function IconRefresh({ spin }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0,animation:spin?"wpSpin .7s linear infinite":"none"}}><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>;
}

/* ── Main component ──────────────────────────────────────────────────────────── */
export default function WatchPage({
  item, apiKey, onBack, onSelect, onHistory,
  onSave, isSaved, downloads, onDownloadStarted, onGoToDownloads,
  sourceId: preFoundSource, isPremium,
}) {
  const isEl = !!window?.electron;
  const type  = item?.media_type === "tv" || !!item?.first_air_date ? "tv" : "movie";
  const title = item?.title || item?.name || "";

  const [season,  setSeason]  = useState(item?.season  ?? 1);
  const [episode, setEpisode] = useState(item?.episode ?? 1);
  useEffect(() => { setSeason(item?.season??1); setEpisode(item?.episode??1); }, [item?.id]); // eslint-disable-line

  const [src, setSrc] = useState(() => {
    if (preFoundSource && !DEAD.includes(preFoundSource) && !(isEl && ELECTRON_DEAD.includes(preFoundSource))) {
      storage.set("playerSource", preFoundSource); return preFoundSource;
    }
    const raw = storage.get("playerSource");
    const cleaned = DEAD.includes(raw) || (isEl && ELECTRON_DEAD.includes(raw)) ? null : raw;
    // ── NS AI: Electron defaults to ns14 as first source ──
    return cleaned || (isEl ? "peachify" : getDefaultSource());
  });

  // Web = direct HLS default. Electron = embed via webview (ad-blocked).
  const [nonEmbed, setNonEmbed] = useState(() => storage.get("playerMode") === "nonembed");

  const [status,   setStatus]   = useState(() => preFoundSource ? "found" : "testing");

  // -- NS AI page-awareness: mirror current playback status to shared storage --
  useEffect(() => {
    if (!item?.id) return;
    storage.set("ns_watch_status", { status, title, type, itemId: item.id, season, episode, ts: Date.now() });
  }, [status, item?.id, title, type, season, episode]);
  const [retryN,   setRetryN]   = useState(0);
  const [cycleN,   setCycleN]   = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [playing,  setPlaying]  = useState(false);
  const sigRef  = useRef(false);
  const failRef = useRef({});

  const [probePct,  setProbePct]  = useState(8);
  const [showBar,   setShowBar]   = useState(false);
  const [spinning,  setSpinning]  = useState(false);
  const [restoreT,  setRestoreT]  = useState(0);
  const [srcMenu,   setSrcMenu]   = useState(false);
  const [menuPos,   setMenuPos]   = useState(null);
  const [seasonMenu,setSeasonMenu]= useState(false);
  const [seasonPos, setSeasonPos] = useState(null);
  const [pip,       setPip]       = useState(false);
  const [skipIntro, setSkipIntro] = useState(false);
  const [nextEp,    setNextEp]    = useState(false);
  const [gate,      setGate]      = useState(null);
  const [showDl,    setShowDl]    = useState(false);
  const [showTrl,   setShowTrl]   = useState(false);
  const [dlFolder,  setDlFolder]  = useState(() => storage.get("downloaderFolder")||"");
  const [details,   setDetails]   = useState(null);
  const [seasons,   setSeasons]   = useState([]);
  const [eps,       setEps]       = useState([]);
  const [trailer,   setTrailer]   = useState(null);
  const [related,   setRelated]   = useState([]);
  const [relPage,   setRelPage]   = useState(1);
  const [relTotal,  setRelTotal]  = useState(1);
  const [relLoad,   setRelLoad]   = useState(false);
  const [m3u8,      setM3u8]      = useState(null);
  const [subs,      setSubs]      = useState([]);
  const [neSrcs,    setNeSrcs]    = useState([]);
  const [neStream,  setNeStream]  = useState(null);
  const [neCaps,    setNeCaps]    = useState([]);
  const [neRetry,   setNeRetry]   = useState(0);

  const m3u8Ref  = useRef(null);
  const neAbort  = useRef(null);
  const neIdx    = useRef(0);
  const neFailN  = useRef(0);
  const manRef   = useRef(false);
  const manId    = useRef(null);
  const queue    = useRef([]);
  const qIdx     = useRef(0);
  const sc       = useRef(null);
  const wvRef    = useRef(null);
  const iframeRef= useRef(null);
  const srcBtnRef= useRef(null);
  const neSrcRef = useRef(null);
  const seasonRef= useRef(null);
  const carouselRef=useRef(null);
  const ifLoad   = useRef(null);
  const ifErr    = useRef(null);

  const unifiedCaps = useMemo(() =>
    neCaps.map(c=>({url:c.url||c.file||"",lang:c.language||c.lang||"",display:c.display||c.label||c.language||"Unknown",format:c.type||c.format||"srt"})).filter(c=>c.url),
  [neCaps]);

  const nsUrl = useMemo(() => {
    if (nonEmbed&&neStream) return neStream.format==="hls"?`${M3U8_PROXY}${encodeURIComponent(neStream.url)}`:neStream.url;
    return m3u8;
  }, [nonEmbed,neStream,m3u8]);

  const showNS = isEl&&!pip&&((nonEmbed&&!!neStream)||(!nonEmbed&&!!m3u8));

  const d       = details||item||{};
  const year    = (d.release_date||d.first_air_date||"").slice(0,4);
  const planId  = isPremium?.planId||(isPremium?"premium":"free");

  // ── NS14 first in Electron dropdown, ns13 blocked ──
  const visSrcs = useMemo(() => {
    const list = PLAYER_SOURCES.filter(s => !s.async && !(isEl && ELECTRON_DEAD.includes(s.id)));
    if (!isEl) return list;
    return [...list].sort((a, b) => (a.id === "peachify" ? -1 : b.id === "peachify" ? 1 : 0));
  }, [isEl]);

  const curLabel= visSrcs.find(s=>s.id===src)?.label??PLAYER_SOURCES.find(s=>s.id===src)?.label??"Server";
  const totalEps= eps.length;
  const totalS  = seasons.length;
  const hasNext = type==="tv"&&(episode<totalEps||season<totalS);
  const runtime = useMemo(() => type==="tv"?eps.find(e=>e.episode_number===episode)?.runtime||d.episode_run_time?.[0]||null:d.runtime||null,[type,eps,episode,d]);
  const mediaName = useMemo(() => {
    const base = `${title}${year ? ` (${year})` : ""}`;
    return type === "tv" ? `${base} S${String(season).padStart(2,"0")} E${String(episode).padStart(2,"0")}` : base;
  }, [title,year,type,season,episode]);

  const embedUrl = useMemo(() => {
    if (!item?.id||nonEmbed) return "about:blank";
    return getSourceUrl(src,type,item.id,season,episode);
  }, [src,type,item?.id,season,episode,nonEmbed]);

  const curDl = useMemo(() => {
    if(!downloads?.length)return null;
    if(type==="movie")return downloads.find(dl=>dl.mediaType==="movie"&&(dl.tmdbId===item.id||dl.mediaId===item.id)&&["completed","local","downloading"].includes(dl.status));
    return downloads.find(dl=>dl.mediaType==="tv"&&(dl.tmdbId===item.id||dl.mediaId===item.id)&&dl.season===season&&dl.episode===episode&&["completed","local","downloading"].includes(dl.status));
  },[downloads,item?.id,type,season,episode]);

  // Load bar
  useEffect(() => {
    if(nonEmbed){setShowBar(false);return;}
    const total=Math.max(queue.current.length,1);
    if(status==="testing"){setProbePct(8);setShowBar(true);}
    else if(status==="retrying"){setProbePct(Math.max(10,Math.min(((retryN+1)/total)*100,88)));setShowBar(true);}
    else if(status==="found"){setProbePct(100);const t=setTimeout(()=>setShowBar(false),600);return()=>clearTimeout(t);}
    else setShowBar(false);
  },[status,retryN,nonEmbed]);

  useEffect(()=>{
    if(!item?.id)return;
    const s=storage.get(posKey(type,item.id,season,episode));
    setRestoreT(s?.time>10&&s?.dur>0&&(s.dur-s.time)>30?s.time:0);
  },[item?.id,type,season,episode]);

  useEffect(()=>{
    m3u8Ref.current=null;setM3u8(null);setSubs([]);setSkipIntro(false);setNextEp(false);
    setPlaying(false);sigRef.current=false;setNeStream(null);setNeSrcs([]);setNeCaps([]);neIdx.current=0;
  },[src,item?.id,season,episode,type]);

  useEffect(()=>{setLoading(true);setPlaying(false);sigRef.current=false;},[embedUrl]);

  useEffect(()=>{
    const seed = preFoundSource && !DEAD.includes(preFoundSource) && !(isEl && ELECTRON_DEAD.includes(preFoundSource))
      ? preFoundSource : src;
    const raw = buildRetryQueue(type,seed);
    queue.current = isEl ? raw.filter(id => !ELECTRON_DEAD.includes(id)) : raw;
    qIdx.current=1;failRef.current={};manRef.current=false;manId.current=null;neFailN.current=0;
    if(!nonEmbed){invalidateSourceCache(type,item?.id,season,episode);setStatus("testing");setCycleN(0);setRetryN(0);}
  },[item?.id,season,episode,type]); // eslint-disable-line

  // TMDB
  useEffect(()=>{
    if(!item?.id||!apiKey)return;let ok=true;
    tmdbFetch(`/${type}/${item.id}?append_to_response=credits,videos`,apiKey).then(data=>{
      if(!ok)return;setDetails(data);
      const t=data.videos?.results?.find(v=>v.type==="Trailer"&&v.site==="YouTube")||data.videos?.results?.find(v=>v.site==="YouTube");
      if(t)setTrailer(t.key);
      if(type==="tv"&&data.seasons)setSeasons(data.seasons.filter(s=>s.season_number>0));
    }).catch(()=>{});
    return()=>{ok=false;};
  },[item?.id,type,apiKey]);

  useEffect(()=>{
    if(type!=="tv"||!item?.id||!apiKey)return;let ok=true;setEps([]);
    tmdbFetch(`/tv/${item.id}/season/${season}`,apiKey).then(data=>{if(ok)setEps(data.episodes||[]);}).catch(()=>{});
    return()=>{ok=false;};
  },[item?.id,type,season,apiKey]);

  useEffect(()=>{
    if(!carouselRef.current||!eps.length)return;
    const idx=eps.findIndex(e=>e.episode_number===episode);if(idx<0)return;
    carouselRef.current.scrollTo({left:Math.max(0,idx*224-20),behavior:"smooth"});
  },[episode,eps]);

  const fetchRel=useCallback((page=1)=>{
    if(!item?.id||!apiKey)return;setRelLoad(true);
    tmdbFetch(`/${type}/${item.id}/recommendations?page=${page}`,apiKey).then(data=>{
      const res=(data.results||[]).map(r=>({...r,media_type:r.title?"movie":"tv"}));
      setRelated(prev=>page===1?res:[...prev,...res]);setRelTotal(data.total_pages||1);setRelPage(page);
    }).catch(()=>{}).finally(()=>setRelLoad(false));
  },[item?.id,type,apiKey]);

  useEffect(()=>{fetchRel(1);},[item?.id]); // eslint-disable-line
  useEffect(()=>{if(!item)return;onHistory?.({...item,media_type:type,season,episode});},[item?.id]); // eslint-disable-line

  useEffect(()=>{
    if(!item?.id||nonEmbed)return;
    if(isEl){
      if(preFoundSource&&!DEAD.includes(preFoundSource)&&!(isEl&&ELECTRON_DEAD.includes(preFoundSource))){setSrc(preFoundSource);storage.set("playerSource",preFoundSource);}
      setStatus("found");return;
    }
    if(preFoundSource){setSrc(preFoundSource);setStatus("found");return;}
    let cancelled=false;if(status!=="found")setStatus("testing");
    if(typeof findWorkingSource==="function"){
      findWorkingSource(type,item.id,season,episode,src).then(id=>{
        if(cancelled)return;
        const safe=id&&!(isEl&&ELECTRON_DEAD.includes(id));
        if(safe&&id!==src){setSrc(id);storage.set("playerSource",id);}
        if(!id)setStatus("testing");
      }).catch(()=>{if(!cancelled)setStatus("testing");});
    }else setStatus("found");
    return()=>{cancelled=true;};
  },[item?.id,type,season,episode,preFoundSource,nonEmbed]); // eslint-disable-line

  const nextSrc=useCallback(()=>{
    clearTimeout(sc.current);
    const cur=queue.current[qIdx.current-1]||src;
    failRef.current[cur]=(failRef.current[cur]||0)+1;
    if(manRef.current&&manId.current===cur){
      if((failRef.current[cur]||0)<2){setRetryN(a=>a+1);setStatus("retrying");setLoading(true);setSrc(cur);storage.set("playerSource",cur);return;}
      manRef.current=false;manId.current=null;
    }
    const idx=qIdx.current;
    if(idx>=queue.current.length){
      setCycleN(prev=>{
        const next=prev+1;
        if(next<MAX_CYCLES){
          const raw=buildRetryQueue(type,getDefaultSource());
          queue.current=isEl?raw.filter(id=>!ELECTRON_DEAD.includes(id)):raw;
          qIdx.current=1;const fid=queue.current[0]||getDefaultSource();
          setRetryN(a=>a+1);setStatus("retrying");setLoading(true);setSrc(fid);storage.set("playerSource",fid);
        }else{
          failRef.current={};const raw=buildRetryQueue(type,getDefaultSource());
          queue.current=isEl?raw.filter(id=>!ELECTRON_DEAD.includes(id)):raw;
          qIdx.current=1;setCycleN(0);setRetryN(0);setStatus("failed");setLoading(false);
        }
        return next;
      });
      return;
    }
    const nid=queue.current[idx];qIdx.current++;
    setRetryN(a=>a+1);setStatus("retrying");setLoading(true);setSrc(nid);storage.set("playerSource",nid);
  },[src,type,isEl]);

  const nextNeSrc=useCallback(()=>{
    const next=neIdx.current+1;
    if(next<neSrcs.length){neIdx.current=next;setNeStream(neSrcs[next]);}
    else{
      neFailN.current++;setNonEmbed(false);storage.set("playerMode","embed");
      neIdx.current=0;setNeStream(null);setNeSrcs([]);setNeCaps([]);
      setStatus("testing");setLoading(true);
      const def=getDefaultSource();const raw=buildRetryQueue(type,def);
      queue.current=isEl?raw.filter(id=>!ELECTRON_DEAD.includes(id)):raw;
      qIdx.current=1;setSrc(def);storage.set("playerSource",def);
    }
  },[neSrcs,type,isEl]);

  const refresh=useCallback(()=>{
    clearTimeout(sc.current);setSpinning(true);setTimeout(()=>setSpinning(false),900);
    if(nonEmbed){setStatus("testing");setLoading(true);neIdx.current=0;setNeRetry(n=>n+1);return;}
    failRef.current={};const def=getDefaultSource();
    const raw=buildRetryQueue(type,def);
    queue.current=isEl?raw.filter(id=>!ELECTRON_DEAD.includes(id)):raw;
    qIdx.current=1;setCycleN(0);setRetryN(0);setStatus("testing");setLoading(true);
    m3u8Ref.current=null;setM3u8(null);setSubs([]);
    invalidateSourceCache(type,item?.id,season,episode);setSrc(def);storage.set("playerSource",def);
  },[nonEmbed,type,item?.id,season,episode,isEl]);

  // -- NS AI: listen for a refresh request written to shared storage --
  useEffect(() => {
    const check = () => {
      const req = storage.get("ns_watch_refresh_request");
      if (req && req.itemId === item?.id) {
        storage.set("ns_watch_refresh_request", null);
        refresh();
      }
    };
    const id = setInterval(check, 1500);
    return () => clearInterval(id);
  }, [item?.id, refresh]);

  // Non-embed fetch
  useEffect(()=>{
    if(!nonEmbed||!item?.id)return;
    neAbort.current?.abort();const ctrl=new AbortController();neAbort.current=ctrl;neIdx.current=0;
    setNeSrcs([]);setNeCaps([]);setNeStream(null);setLoading(true);setStatus("testing");
    let set=false;
    fetchAllNonEmbedSources(type,item.id,type==="tv"?season:null,type==="tv"?episode:null,{
      onSourceFound:s=>{setNeSrcs(p=>[...p,s]);if(!set){set=true;neIdx.current=0;setNeStream(s);setStatus("found");setLoading(false);}},
      signal:ctrl.signal,
    }).then(({sources,captions})=>{
      if(ctrl.signal.aborted)return;setNeSrcs(sources);
      setNeCaps(p=>{const seen=new Set(p.map(c=>c.url||c.file));return[...p,...captions.filter(c=>!seen.has(c.url||c.file))];});
      if(!set){if(sources.length){set=true;setNeStream(sources[0]);setStatus("found");setLoading(false);}else{setStatus("failed");setLoading(false);}}
    }).catch(()=>{if(!ctrl.signal.aborted){setStatus("failed");setLoading(false);}});
    fetchOnlineSubtitles(item.id).then(ss=>{
      if(ctrl.signal.aborted||!ss.length)return;
      setNeCaps(p=>{const seen=new Set(p.map(c=>c.url));return[...p,...ss.filter(s=>!seen.has(s.url))];});
    }).catch(()=>{});
    return()=>ctrl.abort();
  },[nonEmbed,item?.id,type,season,episode,neRetry]); // eslint-disable-line

  // postMessage
  useEffect(()=>{
    const h=ev=>{const s=parseMsg(ev.data);if(!s)return;sigRef.current=true;if(s==="play")setPlaying(true);if(s==="pause")setPlaying(false);if(s==="error")nextSrc();};
    window.addEventListener("message",h);return()=>window.removeEventListener("message",h);
  },[embedUrl,nextSrc]);

  // ── Electron webview beast ────────────────────────────────────────────────
  useEffect(()=>{
    if(!isEl||nonEmbed)return;
    const wv=wvRef.current;if(!wv)return;
    if(!embedUrl||embedUrl==="about:blank"){setLoading(false);return;}
    if(m3u8Ref.current)return;

    let active=true,showT=null,failT=null,checkId=null;

    const tier=PLAYER_SOURCES.find(s=>s.id===src)?.tier??2;
    const SHOW_MS=tier===1?700:tier===2?1000:1600;
    const HARD_MS=18000;

    const markReady=()=>{
      if(!active)return;active=false;clearTimeout(showT);clearTimeout(failT);
      setStatus(s=>(s==="retrying"||s==="testing")?"found":s);setLoading(false);
      setTimeout(async()=>{try{await wv.executeJavaScript(AUTOPLAY_JS);}catch{}},300);
      let fc=0,cn=0,nc=0;
      checkId=setInterval(async()=>{
        cn++;if(cn>10){clearInterval(checkId);return;}
        if(m3u8Ref.current||sigRef.current){clearInterval(checkId);return;}
        try{
          const wcId=wv.getWebContentsId?.();
          if(wcId&&window.electron?.queryVideoProgress){const p=await window.electron.queryVideoProgress(wcId);if(p&&p.duration>0){clearInterval(checkId);return;}}
          const r=await wv.executeJavaScript(`(()=>{const v=document.querySelector('video');if(!v)return null;return{err:v.networkState===3||!!(v.error&&v.error.code>0),ok:v.readyState>=2&&v.duration>0&&!v.paused};})()`);
          if(!r){nc++;if(nc>=8&&!sigRef.current){clearInterval(checkId);nextSrc();}return;}
          nc=0;if(r.ok){clearInterval(checkId);return;}if(r.err){fc++;if(fc>=3){clearInterval(checkId);nextSrc();}}
        }catch{}
      },2500);
    };

    const onFail=()=>{if(!active)return;active=false;clearTimeout(showT);clearTimeout(failT);clearInterval(checkId);nextSrc();};

    const onDomReady=async()=>{
      try{await wv.insertCSS(EMBED_CSS);}catch{}
      try{await wv.executeJavaScript(EMBED_JS);}catch{}
      try{await wv.executeJavaScript(AUTOPLAY_JS);}catch{}
    };

    const onFinishLoad=()=>{clearTimeout(showT);showT=setTimeout(markReady,SHOW_MS);};
    const onFailLoad=(e)=>{if(e.isMainFrame===false||e.errorCode===-3)return;clearTimeout(showT);onFail();};

    failT=setTimeout(onFail,HARD_MS);
    wv.addEventListener("dom-ready",onDomReady);
    wv.addEventListener("did-finish-load",onFinishLoad);
    wv.addEventListener("did-fail-load",onFailLoad);

    return()=>{
      active=false;clearTimeout(showT);clearTimeout(failT);clearInterval(checkId);
      try{wv.removeEventListener("dom-ready",onDomReady);}catch{}
      try{wv.removeEventListener("did-finish-load",onFinishLoad);}catch{}
      try{wv.removeEventListener("did-fail-load",onFailLoad);}catch{}
    };
  },[embedUrl,isEl,nonEmbed,nextSrc,src]); // eslint-disable-line

  // Electron play-state poll
  useEffect(()=>{
    if(!isEl||showNS||nonEmbed||loading||pip)return;
    let c=false;
    const poll=async()=>{
      if(c)return;const wv=wvRef.current;if(!wv)return;
      try{
        const wcId=wv.getWebContentsId?.();
        if(wcId&&window.electron?.queryVideoProgress){const p=await window.electron.queryVideoProgress(wcId);if(p&&p.duration>0){sigRef.current=true;setPlaying(!p.paused);return;}}
        const r=await wv.executeJavaScript(`(()=>{const v=document.querySelector('video');if(!v||!v.duration||isNaN(v.duration))return null;return{paused:v.paused,ended:v.ended,readyState:v.readyState};})()`);
        if(!r)return;sigRef.current=true;setPlaying(!r.paused&&!r.ended&&r.readyState>=2);
      }catch{}
    };
    const id=setInterval(poll,2000);poll();return()=>{c=true;clearInterval(id);};
  },[isEl,loading,pip,embedUrl,showNS,nonEmbed]);

  // Electron skip/next detection
  useEffect(()=>{
    if(!isEl||showNS||nonEmbed||loading||pip)return;
    let c=false;
    const poll=async()=>{
      if(c)return;const wv=wvRef.current;if(!wv)return;
      try{const r=await wv.executeJavaScript(`(()=>{const v=document.querySelector('video');if(!v||!v.duration||v.paused)return null;return{ct:v.currentTime,dur:v.duration};})()`);if(!r)return;setSkipIntro(type==="tv"&&r.ct>=20&&r.ct<=300);setNextEp(hasNext&&(r.dur-r.ct<=90||r.ct/r.dur>=0.92));}catch{}
    };
    const id=setInterval(poll,2000);return()=>{c=true;clearInterval(id);};
  },[isEl,loading,pip,type,hasNext,showNS,nonEmbed]);

  // Web: grace period
  useEffect(()=>{
    if(isEl||nonEmbed)return;if(loading){setPlaying(false);return;}
    const t=setTimeout(()=>{if(!sigRef.current)setPlaying(true);},3500);return()=>clearTimeout(t);
  },[isEl,loading,embedUrl,nonEmbed]);

  // Web: iframe autoplay
  useEffect(()=>{
    if(isEl||nonEmbed)return;const f=iframeRef.current;if(!f)return;
    const go=()=>{try{f.contentWindow?.postMessage({event:"play",action:"play"},"*");f.contentWindow?.postMessage({type:"play"},"*");}catch{}};
    go();const t1=setTimeout(go,800),t2=setTimeout(go,2000),t3=setTimeout(go,4000);
    return()=>{clearTimeout(t1);clearTimeout(t2);clearTimeout(t3);};
  },[isEl,embedUrl,nonEmbed]);

  // M3U8 / subtitle / pip events
  useEffect(()=>{
    if(!window.electron)return;
    const h=window.electron.onM3u8Found(url=>{if(nonEmbed)return;m3u8Ref.current=url;setM3u8(p=>p!==url?url:p);setStatus("found");setLoading(false);});
    return()=>window.electron.offM3u8Found(h);
  },[nonEmbed]);

  useEffect(()=>{
    if(!window.electron)return;
    const h=window.electron.onSubtitleFound(({url,lang})=>{if(!url||!url.toLowerCase().includes(".vtt"))return;setSubs(p=>[...p.filter(s=>s.lang!==lang),{url,lang:lang||"unknown"}]);});
    return()=>window.electron.offSubtitleFound(h);
  },[]);

  useEffect(()=>{
    if(!isEl)return;
    const h1=window.electron?.onPipOpened?.(()=>setPip(true));
    const h2=window.electron?.onPipClosed?.(()=>setPip(false));
    return()=>{if(h1)window.electron?.offPipOpened?.(h1);if(h2)window.electron?.offPipClosed?.(h2);};
  },[isEl]);

  // Web iframe beast
  useEffect(()=>{
    if(isEl||nonEmbed)return;
    if(!embedUrl||embedUrl==="about:blank"){setLoading(false);return;}
    let active=true,loaded=false,probeFail=false;
    const isManual=manRef.current&&manId.current===src;
    const tier=PLAYER_SOURCES.find(s=>s.id===src)?.tier??2;
    const LT=isManual?14000:tier===1?5000:tier===2?7000:9000;
    const PG=isManual?5000:tier===1?3000:tier===2?4500:6000;
    let pk=null,pg=null,lt=null;const ac=new AbortController();
    const clear=()=>{clearTimeout(pk);clearTimeout(pg);clearTimeout(lt);try{ac.abort();}catch{}};
    const onR=()=>{if(!active)return;active=false;clear();setStatus(s=>(s==="testing"||s==="retrying")?"found":s);setLoading(false);setTimeout(()=>{try{iframeRef.current?.contentWindow?.postMessage({event:"play",action:"play"},"*");}catch{}},150);};
    const onF=()=>{if(!active)return;active=false;clear();nextSrc();};
    ifLoad.current=()=>{if(!active||probeFail)return;loaded=true;clearTimeout(lt);pg=setTimeout(()=>{if(active)onR();},PG);};
    ifErr.current=()=>{if(!active||loaded)return;clearTimeout(lt);setTimeout(()=>{if(active)onF();},300);};
    pk=setTimeout(()=>ac.abort(),900);
    fetch(embedUrl,{method:"HEAD",mode:"no-cors",signal:ac.signal}).then(()=>clearTimeout(pk)).catch(err=>{clearTimeout(pk);if(!active||err.name==="AbortError")return;probeFail=true;onF();});
    lt=setTimeout(()=>{if(!active||loaded)return;onF();},LT);
    return()=>{active=false;clear();ifLoad.current=null;ifErr.current=null;};
  },[embedUrl,isEl,nonEmbed,nextSrc,src]); // eslint-disable-line

  const switchSrc=useCallback(id=>{
    clearTimeout(sc.current);setSrcMenu(false);if(id===src)return;
    manRef.current=true;manId.current=id;
    const raw=buildRetryQueue(type,id);
    queue.current=isEl?raw.filter(i=>!ELECTRON_DEAD.includes(i)):raw;
    qIdx.current=1;setCycleN(0);setRetryN(0);setStatus("testing");setLoading(true);
    m3u8Ref.current=null;setM3u8(null);setSubs([]);setSrc(id);storage.set("playerSource",id);
  },[src,type,isEl]);

  useEffect(()=>{
    if(!srcMenu&&!seasonMenu)return;
    const c=ev=>{if(!srcBtnRef.current?.contains(ev.target)&&!neSrcRef.current?.contains(ev.target)&&!seasonRef.current?.contains(ev.target)&&!ev.target.closest("[data-nsd]")){setSrcMenu(false);setSeasonMenu(false);}};
    document.addEventListener("mousedown",c);return()=>document.removeEventListener("mousedown",c);
  },[srcMenu,seasonMenu]);

  const goEp=useCallback((s,e)=>{setSeason(s);setEpisode(e);setNextEp(false);setSkipIntro(false);setSeasonMenu(false);setSrcMenu(false);},[]);
  const goNext=useCallback(()=>{if(episode<totalEps)goEp(season,episode+1);else if(season<totalS)goEp(season+1,1);},[episode,season,totalEps,totalS,goEp]);
  const skipI=useCallback(()=>{
    setSkipIntro(false);if(!isEl)return;
    const wv=wvRef.current;if(!wv)return;
    wv.executeJavaScript(`(()=>{const v=document.querySelector('video');if(v)v.currentTime+=90;})()`).catch(()=>{});
  },[isEl]);

  const dropPos=useCallback((ref,n)=>{
    const b=ref?.current;if(!b)return null;const r=b.getBoundingClientRect();
    const h=Math.min(n*46+16,320);const below=window.innerHeight-r.bottom-8;
    return{top:below>=h?r.bottom+6:Math.max(8,r.top-h-6),left:Math.min(r.left,window.innerWidth-210)};
  },[]);

  const doUpgrade=useCallback(()=>window.dispatchEvent(new CustomEvent("novaspark:upgrade")),[]);

  if(!item)return null;

  const neUrl=neStream?(neStream.format==="hls"?`${M3U8_PROXY}${encodeURIComponent(neStream.url)}`:neStream.url):null;
  const showFailed=status==="failed"&&!loading&&!m3u8&&!neStream;
  const ddStyle={position:"fixed",top:menuPos?.top??60,left:menuPos?.left??0,zIndex:99999,background:"rgba(10,14,18,.98)",border:"1px solid rgba(255,255,255,.1)",borderRadius:10,padding:"6px 0",minWidth:195,maxHeight:320,overflowY:"auto",boxShadow:"0 10px 40px rgba(0,0,0,.85)",backdropFilter:"blur(16px)"};
  const ddItem={display:"flex",width:"100%",textAlign:"left",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 18px",background:"none",border:"none",fontSize:13,cursor:"pointer",fontFamily:"inherit",transition:"background .12s"};

  return (
    <div className="watch-page fade-in">
      <style>{`
        @keyframes wpSpin{to{transform:rotate(360deg);}}
        @keyframes wpPop{from{opacity:0;transform:translateY(10px) scale(.93);}to{opacity:1;transform:translateY(0) scale(1);}}
        @keyframes wpScroll{0%{transform:translateX(0);}100%{transform:translateX(-50%);}}
        @keyframes wpShim{0%{left:-45%;}100%{left:120%;}}
        @keyframes wpPulse{0%,100%{opacity:.7;}50%{opacity:1;}}

        .watch-player-wrap{
          position:relative;width:100%;height:0;
          padding-bottom:56.25%;overflow:hidden;background:#000;
        }
        .watch-player-wrap iframe,
        .watch-player-wrap > div{
          position:absolute;top:0;left:0;
          width:100%;height:100%;
          border:none;background:#000;display:block;
        }
        .watch-player-wrap webview{
          position:absolute;top:0;left:0;
          width:100%;height:100%;
          border:none;background:#000;
          display:inline-flex;
        }

        .wp-dd-i:hover{background:rgba(255,255,255,.07)!important;}
        .wp-sdd{position:fixed;z-index:99999;background:rgba(10,14,18,.98);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:6px 0;min-width:160px;box-shadow:0 10px 40px rgba(0,0,0,.85);backdrop-filter:blur(16px);}
        .wp-sdd button{display:block;width:100%;text-align:left;padding:10px 18px;background:none;border:none;color:var(--text,#fff);font-size:14px;cursor:pointer;transition:background .15s;font-family:inherit;}
        .wp-sdd button:hover{background:rgba(255,255,255,.08);}
        .wp-sdd button.on{color:var(--red,#e50914);font-weight:700;}
        .wp-epc{display:flex;gap:12px;overflow-x:auto;overflow-y:hidden;padding:0 20px 8px;scrollbar-width:none;}
        .wp-epc::-webkit-scrollbar{display:none;}
        .wp-rel:hover .wp-rel-ov{opacity:1!important;}
        .wp-ref{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:rgba(255,255,255,.75);font-size:13px;font-weight:600;padding:7px 14px;cursor:pointer;transition:all .15s;font-family:inherit;white-space:nowrap;line-height:1;flex-shrink:0;}
        .wp-ref:hover{background:rgba(255,255,255,.13);color:#fff;}
        .wp-mode{display:flex;align-items:center;gap:5px;border-radius:8px;font-size:12px;font-weight:600;padding:7px 12px;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .15s;border:1px solid;flex-shrink:0;}
        .wp-mode.on{background:rgba(76,175,80,.12);border-color:rgba(76,175,80,.35);color:#4caf50;}
        .wp-mode.off{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.12);color:rgba(255,255,255,.6);}
        .wp-mode.off:hover{background:rgba(255,255,255,.12);color:#fff;}
        .wp-src{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#fff;font-size:13px;font-weight:600;padding:7px 14px;cursor:pointer;transition:background .15s;font-family:inherit;line-height:1;flex-shrink:0;white-space:nowrap;}
        .wp-src:hover{background:rgba(255,255,255,.12);}
        .wp-pip{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#fff;font-size:13px;font-weight:600;padding:7px 14px;cursor:pointer;transition:background .15s;font-family:inherit;white-space:nowrap;}
        .wp-pip:hover{background:rgba(255,255,255,.13);}
        .wp-pip.on{color:var(--red,#e50914);border-color:rgba(229,9,20,.35);}
        .wp-live{display:inline-flex;align-items:center;gap:4px;background:rgba(229,9,20,.15);border:1px solid rgba(229,9,20,.3);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;color:#e50914;}

        @media(max-width:768px){
          .watch-topbar{padding:8px 10px!important;gap:5px!important;}
          .watch-topbar-title{font-size:13px!important;max-width:130px!important;}
          .watch-topbar-ep{display:none!important;}
          .wp-ref span.rl{display:none!important;}
          .wp-ref{padding:7px 10px!important;}
          .wp-pip span{display:none!important;}
          .wp-pip{padding:7px 10px!important;}
          .wp-live{display:none!important;}
          .cards-grid{grid-template-columns:repeat(2,1fr)!important;}
          .wp-epc>div{width:165px!important;}
          .wp-mode span.ml{display:none!important;}
        }
        @media(max-width:540px){
          .watch-topbar-title{font-size:11px!important;max-width:90px!important;}
          .wp-pip{display:none!important;}
          .cards-grid{grid-template-columns:repeat(2,1fr)!important;gap:8px!important;}
          .wp-src span.sl{display:none!important;}
          .wp-src{padding:7px 10px!important;}
        }
      `}</style>

      {/* Disclaimer */}
      <div style={{background:"rgba(229,9,20,.05)",borderBottom:"1px solid rgba(229,9,20,.10)",padding:"4px 0",overflow:"hidden",display:"flex",alignItems:"center"}}>
        <div style={{flex:1,overflow:"hidden"}}>
          <div style={{display:"inline-flex",animation:"wpScroll 50s linear infinite",whiteSpace:"nowrap"}}>
            {[0,1].map(i=><span key={i} style={{fontSize:11,color:"rgba(255,255,255,.38)",paddingRight:80}}>⚠  NovaSparks does not host, store, or distribute any media content.</span>)}
          </div>
        </div>
      </div>

      {/* Topbar */}
      <div className="watch-topbar">
        <button className="btn btn-ghost" onClick={onBack} style={{gap:6,flexShrink:0}}><BackIcon/> Back</button>
        <div className="watch-topbar-title" style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {title}{type==="tv"&&<span className="watch-topbar-ep">&nbsp;·&nbsp;S{season} E{episode}</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {showNS&&<span className="wp-live"><svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="#e50914"/></svg>LIVE</span>}

          <button className="wp-ref" onClick={refresh}>
            <IconRefresh spin={spinning}/><span className="rl">Refresh</span>
          </button>

          <button className={`wp-mode ${nonEmbed?"on":"off"}`}
            onClick={()=>{const n=!nonEmbed;setNonEmbed(n);storage.set("playerMode",n?"nonembed":"embed");setStatus("testing");setLoading(true);setMenuPos(null);setSrcMenu(false);if(!n){setNeStream(null);setNeSrcs([]);setNeCaps([]);neIdx.current=0;}else setNeRetry(x=>x+1);}}>
            {nonEmbed
              ?<><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#4caf50"/></svg><span className="ml">{isEl?"AD-free":"Direct"}</span>{neStream?.quality&&<span style={{fontSize:10,opacity:.8}}>{neStream.quality}</span>}</>
              :<><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg><span className="ml">{isEl?"AD-free":"Embed"}</span></>
            }
          </button>

          {!nonEmbed&&(showBar?(
            <div style={{position:"relative",display:"flex",alignItems:"center",gap:6,minWidth:120,height:34,borderRadius:8,overflow:"hidden",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.14)",padding:"0 14px",flexShrink:0}}>
              <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${probePct}%`,background:status==="found"?"linear-gradient(90deg,rgba(76,175,80,.3),rgba(76,175,80,.5))":"linear-gradient(90deg,rgba(229,9,20,.22),rgba(229,9,20,.42))",transition:"width .5s",borderRadius:8}}/>
              {status!=="found"&&<div style={{position:"absolute",top:0,bottom:0,width:"42%",background:"linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent)",animation:"wpShim 1.9s infinite ease-in-out"}}/>}
              <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"center",gap:6}}>
                {status==="found"
                  ?<><span style={{color:"#4caf50",fontSize:15,fontWeight:700}}>✓</span><span style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.9)",whiteSpace:"nowrap"}}>{curLabel}</span></>
                  :<><div style={{width:10,height:10,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,.18)",borderTopColor:"rgba(255,255,255,.85)",animation:"wpSpin .65s linear infinite",flexShrink:0}}/><span style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,.72)",whiteSpace:"nowrap",animation:"wpPulse 1.8s infinite"}}>{retryN===0?"Finding…":`Server ${retryN+1}`}</span></>
                }
              </div>
            </div>
          ):(
            <button ref={srcBtnRef} className="wp-src"
              onClick={()=>{if(!canSwitchSource(planId)){setGate("source_switch");return;}const p=dropPos(srcBtnRef,visSrcs.length);if(p)setMenuPos(p);setSrcMenu(v=>!v);}}>
              <SourceIcon size={14}/><span className="sl">{curLabel}</span>
              <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" style={{opacity:.5}}><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
            </button>
          ))}

          {nonEmbed&&neSrcs.length>1&&(
            <button ref={neSrcRef} className="wp-src"
              onClick={()=>{if(!canSwitchSource(planId)){setGate("source_switch");return;}const p=dropPos(neSrcRef,neSrcs.length);if(p)setMenuPos(p);setSrcMenu(v=>!v);}}>
              <SourceIcon size={13}/><span>{neStream?.source||"Source"}</span>
              {neStream?.quality&&<span style={{opacity:.6,fontSize:11}}>{neStream.quality}</span>}
              <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" style={{opacity:.5}}><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
            </button>
          )}

          <DataMeterWidget isPlaying={!loading&&!pip} isActuallyPlaying={playing&&!loading&&!pip} runtimeMinutes={runtime} genreIds={(d.genres||[]).map(g=>g.id)} type={type}/>

          {isEl&&(
            <button className={`wp-pip${pip?" on":""}`}
              onClick={()=>{if(pip){window.electron?.closePipWindow?.();return;}if(!canPopOut(planId)){setGate("pip");return;}window.electron?.openPipWindow?.(nonEmbed?(nsUrl||embedUrl):embedUrl,title);}}>
              <PopOutIcon/><span>{pip?"Close":"Pop out"}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Player ── */}
      <div className="watch-player-wrap" style={{overflow:"hidden",position:"relative"}}>
        <BlackScreen visible={loading&&!showFailed&&!showNS&&!(nonEmbed&&!!neStream)}/>
        {showFailed&&<FailedOverlay onRetry={refresh} onBack={onBack}/>}

        {isEl?(
          <>
            {!nonEmbed&&!showNS&&!pip&&(
              <webview
                key={`wv-${src}-${item.id}-s${season}e${episode}`}
                ref={wvRef}
                src={embedUrl}
                partition="persist:player"
                allowpopups="true"
                plugins="true"
                nodeintegration="false"
                webpreferences="contextIsolation=yes,nodeIntegration=no,webSecurity=no,allowRunningInsecureContent=yes,backgroundThrottling=false"
                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
                width="100%"
                height="100%"
                style={{
                  position:'absolute',top:0,left:0,
                  width:'100%',height:'100%',
                  opacity:loading?0:1,transition:'opacity .35s ease'
                }}
              />
            )}
            {showNS&&(
              <NovaSparksPlayer
                key={`ns-${nonEmbed?"ne":"em"}-${item.id}-s${season}e${episode}${nonEmbed?`-${neIdx.current}`:""}`}
                streamUrl={nsUrl} startTime={restoreT}
                subtitles={nonEmbed?unifiedCaps.map(c=>({url:c.url,lang:c.lang||""})):subs}
                title={`${title}${type==="tv"?` · S${season}E${episode}`:""}`}
                onReady={()=>{setLoading(false);setStatus("found");setPlaying(true);}}
                onError={()=>{if(nonEmbed)nextNeSrc();else{m3u8Ref.current=null;setM3u8(null);setSubs([]);setLoading(true);nextSrc();}}}
                onPlayStateChange={setPlaying}
                onTimeUpdate={(ct,dur)=>{
                  if(!dur)return;
                  if(ct>10&&dur>60)storage.set(posKey(type,item.id,season,episode),{time:ct,dur,ts:Date.now()});
                  setSkipIntro(type==="tv"&&ct>=20&&ct<=300);
                  setNextEp(hasNext&&(dur-ct<=90||ct/dur>=0.92));
                }}
                style={{position:"absolute",inset:0,zIndex:2}}
              />
            )}
          </>
        ):nonEmbed&&neUrl?(
          <HLSPlayer
            key={`hls-ne-${item.id}-s${season}e${episode}-${neIdx.current}`}
            streamUrl={neUrl} streamType={neStream?.format||"hls"} subtitles={unifiedCaps} startTime={restoreT}
            title={`${title}${type==="tv"?` · S${season}E${episode}`:""}`}
            onReady={()=>{setLoading(false);setStatus("found");setPlaying(true);}}
            onError={nextNeSrc} onPlayStateChange={setPlaying}
            onTimeUpdate={(ct,dur)=>{if(!dur)return;if(ct>10&&dur>60)storage.set(posKey(type,item.id,season,episode),{time:ct,dur,ts:Date.now()});setSkipIntro(type==="tv"&&ct>=20&&ct<=300);setNextEp(hasNext&&(dur-ct<=90||ct/dur>=0.92));}}
            style={{position:"absolute",inset:0,zIndex:1}}
          />
        ):(
          <>
            <iframe
              key={`if-${src}-${item.id}-s${season}e${episode}`} ref={iframeRef}
              src={embedUrl}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen referrerPolicy="origin"
              onLoad={()=>ifLoad.current?.()}
              onError={()=>ifErr.current?.()}
              style={{position:"absolute",top:0,right:0,bottom:0,left:0,border:"none",background:"#000",opacity:loading?0:1,transition:"opacity .4s ease",pointerEvents:loading?"none":"auto"}}
            />
          </>
        )}

        {pip&&(
          <div style={{position:"absolute",inset:0,zIndex:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,.92)",gap:16}}>
            <PopOutIcon size={36}/>
            <span style={{fontSize:15,color:"var(--text1)",fontWeight:600}}>Playing in pop-out window</span>
            <button className="player-overlay-btn" onClick={()=>window.electron?.closePipWindow?.()}>Close pop-out &amp; return</button>
          </div>
        )}

        {!loading&&!pip&&!showFailed&&<OverlayBtns showSkip={skipIntro} showNext={nextEp&&hasNext} nextNum={episode<totalEps?episode+1:1} onSkip={skipI} onNext={goNext}/>}

        {srcMenu&&menuPos&&(
          <div data-nsd="1" style={ddStyle} onClick={e=>e.stopPropagation()}>
            {(nonEmbed?neSrcs:visSrcs).map((s,i)=>{
              const active=nonEmbed?neStream?.url===s.url:src===s.id;
              const lbl=nonEmbed?(s.source||`Source ${i+1}`):s.label;
              const tag=nonEmbed?s.quality:s.tag;
              return(
                <button key={nonEmbed?`${s.url}-${i}`:s.id} className="wp-dd-i"
                  style={{...ddItem,color:active?"#e50914":"rgba(255,255,255,.85)",fontWeight:active?700:500}}
                  onClick={()=>{if(!canSwitchSource(planId)){setGate("source_switch");setSrcMenu(false);return;}if(nonEmbed){manRef.current=true;manId.current=s.url;neIdx.current=i;setNeStream(s);}else switchSrc(s.id);setSrcMenu(false);}}>
                  <span>{lbl}</span>
                  <div style={{display:"flex",alignItems:"center",gap:5}}>
                    {tag&&<span style={{fontSize:10,fontWeight:700,background:"rgba(229,9,20,.12)",color:"#e50914",border:"1px solid rgba(229,9,20,.22)",borderRadius:4,padding:"2px 6px"}}>{tag}</span>}
                    {active&&<span style={{color:"#e50914",fontSize:12,fontWeight:700}}>✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Below player ── */}
      {(d?.overview||year||d?.vote_average>0)&&<InfoStrip year={year} voteAverage={d?.vote_average} runtime={runtime} overview={d?.overview} genres={d?.genres||[]}/>}

      {type==="tv"&&eps.length>0&&(
        <div style={{paddingTop:28,paddingBottom:4}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",marginBottom:16}}>
            <div className="section-title" style={{margin:0,padding:0}}>EPISODES</div>
            {seasons.length>1&&(
              <div style={{position:"relative"}}>
                <button ref={seasonRef}
                  onClick={()=>{const p=dropPos(seasonRef,seasons.length);if(p)setSeasonPos({top:p.top,left:p.left-10});setSeasonMenu(v=>!v);}}
                  style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.15)",borderRadius:8,color:"#fff",fontSize:13,fontWeight:600,padding:"8px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontFamily:"inherit"}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.12)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.07)"}>
                  Season {season}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{opacity:.7}}><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                </button>
                {seasonMenu&&seasonPos&&(
                  <div className="wp-sdd" data-nsd="1" style={{top:seasonPos.top,left:seasonPos.left}}>
                    {seasons.map(s=>(
                      <button key={s.season_number} className={season===s.season_number?"on":""}
                        onClick={()=>{goEp(s.season_number,1);setSeasonMenu(false);}}>
                        {s.name&&!s.name.startsWith("Season")?s.name:`Season ${s.season_number}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div ref={carouselRef} className="wp-epc" style={{maskImage:"linear-gradient(to right,black 85%,transparent 100%)",WebkitMaskImage:"linear-gradient(to right,black 85%,transparent 100%)",paddingRight:40}}>
            {eps.map(ep=><EpThumb key={ep.id||ep.episode_number} ep={ep} active={ep.episode_number===episode} onPlay={()=>goEp(season,ep.episode_number)}/>)}
            <div style={{flexShrink:0,width:20}}/>
          </div>
        </div>
      )}

      <div className="watch-meta" style={{paddingBottom:8}}>
        <div className="watch-meta-actions" style={{justifyContent:"flex-start"}}>
          {trailer&&<button className="btn btn-secondary" onClick={()=>setShowTrl(true)}><TrailerIcon/> Trailer</button>}
          {onSave&&<button className="btn btn-secondary" onClick={onSave}>{isSaved?<BookmarkFillIcon/>:<BookmarkIcon/>}{isSaved?"Saved":"Save"}</button>}
          <button className="btn btn-secondary"
            onClick={()=>{if(curDl){onGoToDownloads?.(curDl.id);return;}if(!canDownload(planId)){setGate("download");return;}setShowDl(true);}}
            style={curDl?{color:curDl.status==="downloading"?"var(--red)":"#4caf50",borderColor:curDl.status==="downloading"?"rgba(229,9,20,.3)":"rgba(76,175,80,.3)"}:undefined}>
            {curDl?(curDl.status==="downloading"?"↓ Downloading…":"✓ Downloaded"):<><DownloadIcon/> Download</>}
          </button>
          <button className="btn btn-ghost" onClick={onBack}><BackIcon/> Back</button>
        </div>
      </div>

      {related.length>0&&(
        <div className="section" style={{paddingTop:8,paddingBottom:32}}>
          <div className="section-title">More Like This</div>
          <div className="cards-grid">
            {related.map(r=>(
              <div key={`${r.media_type}_${r.id}`} className="card wp-rel" onClick={()=>onSelect?.({...r,media_type:r.media_type})} style={{cursor:"pointer"}}>
                <div className="card-poster">
                  {r.poster_path?<img src={imgUrl(r.poster_path)} alt={r.title||r.name} loading="lazy"/>:<div className="no-poster"><PlayIcon/></div>}
                  <div className="card-overlay wp-rel-ov" style={{opacity:0,transition:"opacity .2s"}}><div className="card-play"><PlayIcon/></div></div>
                  {r.vote_average>0&&<div className="card-badge">★ {r.vote_average.toFixed(1)}</div>}
                </div>
                <div className="card-info">
                  <div className="card-title">{r.title||r.name}</div>
                  <div className="card-year">{(r.release_date||r.first_air_date||"").slice(0,4)}</div>
                </div>
              </div>
            ))}
          </div>
          {relPage<relTotal&&(
            <div style={{display:"flex",justifyContent:"center",marginTop:24}}>
              <button onClick={()=>fetchRel(relPage+1)} disabled={relLoad}
                style={{background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",borderRadius:8,color:"var(--text,#fff)",fontSize:14,fontWeight:600,padding:"12px 36px",cursor:relLoad?"not-allowed":"pointer",opacity:relLoad?0.6:1,transition:"background .2s"}}>
                {relLoad?"Loading…":"Load More"}
              </button>
            </div>
          )}
        </div>
      )}

      {showTrl&&trailer&&<TrailerModal trailerKey={trailer} title={title} onClose={()=>setShowTrl(false)}/>}
      {showDl&&(
        <DownloadModal onClose={()=>setShowDl(false)}
          m3u8Url={nonEmbed?(nsUrl||m3u8):m3u8}
          subtitles={nonEmbed?unifiedCaps.map(c=>({url:c.url,lang:c.lang})):subs}
          mediaName={mediaName} downloaderFolder={dlFolder}
          setDownloaderFolder={f=>{setDlFolder(f);storage.set("downloaderFolder",f);}}
          onOpenSettings={()=>{}} onDownloadStarted={onDownloadStarted}
          mediaId={item.id} mediaType={type}
          season={type==="tv"?season:null} episode={type==="tv"?episode:null}
          posterPath={d.poster_path} tmdbId={item.id}/>
      )}
      {gate&&<PremiumGate feature={gate} onUpgrade={doUpgrade} onClose={()=>setGate(null)}/>}
    </div>
  );
}