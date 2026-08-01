import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { canUseShorts, canDownload, incrementFreeDailyUsage, recordFeatureUse } from "../utils/premium";
import PremiumGate from "../components/PremiumGate";
import PushAd from "../components/PushAd";
// import PopunderAd from "../components/PopunderAd";

const TMDB_BASE    = "https://api.themoviedb.org/3";
const TMDB_IMG     = "https://image.tmdb.org/t/p";
const NINETY_DAYS  = 90 * 24 * 60 * 60 * 1000;
const IS_ELECTRON  = typeof window !== "undefined" && !!window.electronAPI;
const HEADER_H     = 56;
const TAP_MS       = 300;
const TAP_PX       = 44;
const SWIPE_Y_PX   = 90;
const SWIPE_Y_VEL  = 0.30;
const SWIPE_X_PX   = 70;
const DRAG_RESIST  = 0.38;
const DIR_LOCK_DEG = 35;

// ─── RESPONSIVE SIZE TOKENS ───────────────────────────────────────────────────
// One clamp() per token, reused everywhere an icon or tap target appears —
// phones settle at the floor, desktops settle at the ceiling, and only the
// narrow tablet-width band in between actually interpolates. Plain JS strings
// rather than CSS custom properties on purpose: several surfaces below render
// through createPortal (SearchOverlay) straight onto document.body, outside
// this component's own DOM subtree, so a CSS var defined on the page root
// would never cascade to them. A shared string constant has no such boundary.
const ICON_XS   = "clamp(11px,2.6vw,14px)";
const ICON_SM   = "clamp(14px,3vw,17px)";
const ICON_MD   = "clamp(16px,3.6vw,22px)";
const ICON_LG   = "clamp(20px,4.6vw,27px)";
const TARGET_SM = "clamp(32px,7.5vw,38px)";
const TARGET_MD = "clamp(40px,9vw,48px)";
const TARGET_LG = "clamp(44px,10vw,52px)";
const TARGET_XL = "clamp(52px,13vw,64px)";
const CARD_W    = "clamp(84px,24vw,116px)";
const CARD_H    = "clamp(126px,36vw,174px)";
const REL_W     = "clamp(76px,20vw,100px)";
const REL_H     = "clamp(114px,30vw,150px)";
const THUMB_W   = "clamp(40px,10vw,54px)";
const THUMB_H   = "clamp(60px,15vw,80px)";
const DOCK_W    = "clamp(38px,9vw,48px)";
const DOCK_H    = "clamp(57px,13.5vw,72px)";

// ─── UTILS ─────────────────────────────────────────────────────────────────────
function fmtCount(n) {
  if (!n) return "0";
  if (n >= 1e6)  return (n/1e6).toFixed(1).replace(".0","")+"M";
  if (n >= 1000) return (n/1000).toFixed(1).replace(".0","")+"K";
  return n.toLocaleString();
}
function getWatchState(reel) {
  if (!reel?.release_date) return "watch";
  const d = new Date(reel.release_date).getTime() - Date.now();
  if (d > NINETY_DAYS) return "coming_soon";
  if (d > 0)           return "notify";
  return "watch";
}
function formatDate(s) {
  return s ? new Date(s).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) : "";
}
function buildYTSrc(id) {
  // No start/end clip params — the trailer plays its real, full length.
  // Completion is driven by the player's actual reported end, not a guess.
  return "https://www.youtube.com/embed/"+id+"?"+new URLSearchParams({
    autoplay:"1",mute:"1",controls:"0",modestbranding:"1",rel:"0",
    showinfo:"0",iv_load_policy:"3",disablekb:"1",fs:"0",playsinline:"1",
    enablejsapi:"1",hl:"en",cc_lang_pref:"en",cc_load_policy:"0",
  });
}
function imgSrc(path,size="w342"){ return path ? `${TMDB_IMG}/${size}${path}` : null; }
function ytMsg(ifr,obj){ try{ ifr?.contentWindow?.postMessage(JSON.stringify(obj),"*"); }catch{} }

// ─── PRNG + POOL ───────────────────────────────────────────────────────────────
function mulberry32(seed){
  let a=seed>>>0;
  return ()=>{ a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296; };
}
function shuffle(arr,seed){
  const rng=mulberry32(seed),a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
const _seen=new Set(),_seenM=new Set(),_pool=[];
let _fetch=false;
const _SEED=Date.now(),_pg=[1,1,1,1,1];
let _shuffleCalls=0;
const SOURCES=[
  (k,p)=>`${TMDB_BASE}/trending/movie/week?api_key=${k}&page=${p}&language=en-US`,
  (k,p)=>`${TMDB_BASE}/movie/popular?api_key=${k}&page=${p}&language=en-US`,
  (k,p)=>`${TMDB_BASE}/movie/top_rated?api_key=${k}&page=${p}&language=en-US`,
  (k,p)=>`${TMDB_BASE}/movie/upcoming?api_key=${k}&page=${p}&language=en-US`,
  (k,p)=>`${TMDB_BASE}/movie/now_playing?api_key=${k}&page=${p}&language=en-US`,
];
const GENRES={
  28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",
  99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",
  27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",878:"Sci-Fi",
  53:"Thriller",10752:"War",37:"Western",
};
function bestTrailer(vids){
  const r=(vids||[]).filter(v=>v.site==="YouTube"&&v.key&&(v.iso_639_1==="en"||!v.iso_639_1)&&(v.type==="Trailer"||v.type==="Teaser"));
  return r.find(v=>v.type==="Trailer"&&v.official&&v.iso_639_1==="en")?.key||r.find(v=>v.type==="Trailer"&&v.iso_639_1==="en")?.key||r.find(v=>v.type==="Teaser"&&v.iso_639_1==="en")?.key||r.find(v=>v.iso_639_1==="en")?.key||null;
}
async function fillPool(key){
  if(_fetch)return;_fetch=true;
  try{
    const si=Math.floor(Math.random()*SOURCES.length),pg=_pg[si]++;
    let movies=[];
    try{const r=await fetch(SOURCES[si](key,pg));if(r.ok){const d=await r.json();movies=(d.results||[]).filter(m=>m.original_language==="en"&&!_seenM.has(m.id));}}catch{}
    if(!movies.length)return;
    movies.forEach(m=>_seenM.add(m.id));
    const items=[];
    for(let i=0;i<movies.length;i+=5){
      const s=await Promise.allSettled(movies.slice(i,i+5).map(m=>fetch(`${TMDB_BASE}/movie/${m.id}/videos?api_key=${key}&language=en-US`).then(r=>r.ok?r.json():{results:[]}).then(d=>({m,v:d.results||[]})).catch(()=>({m,v:[]}))));
      for(const r of s){
        if(r.status!=="fulfilled")continue;
        const{m,v}=r.value;const ytId=bestTrailer(v);
        if(!ytId||_seen.has(ytId))continue;
        items.push({id:ytId,youtubeId:ytId,tmdb_id:m.id,title:m.title||m.original_title||"Untitled",overview:m.overview||"",genres:(m.genre_ids||[]).slice(0,2).map(id=>GENRES[id]).filter(Boolean),rating:m.vote_average?+m.vote_average.toFixed(1):null,release_date:m.release_date||null,backdrop:m.backdrop_path||null,poster:m.poster_path||null,tmdbObj:m,likes:Math.floor(5000+Math.random()*95000),_score:(m.vote_average||5)*Math.log((m.vote_count||1)+1)});
      }
    }
    if(!items.length)return;
    _shuffleCalls++;
    _pool.push(...shuffle(items,_SEED^Math.imul(_shuffleCalls,2654435761)).sort((a,b)=>b._score-a._score));
  }finally{_fetch=false;}
}
async function fetchReels(key,n=14){
  for(let a=0;a<4&&_pool.length<n;a++){await fillPool(key);if(!_pool.length)await new Promise(r=>setTimeout(r,600));}
  const out=[];
  while(out.length<n&&_pool.length>0){const r=_pool.shift();if(_seen.has(r.id))continue;_seen.add(r.id);out.push(r);}
  if(_pool.length<15)setTimeout(()=>fillPool(key),200);
  return out;
}
function makeReel(item,ytId,mediaType="movie"){
  return{id:ytId,youtubeId:ytId,tmdb_id:item.id,title:item.title||item.name||"Untitled",overview:item.overview||"",genres:(item.genre_ids||[]).slice(0,2).map(id=>GENRES[id]).filter(Boolean),rating:item.vote_average?+item.vote_average.toFixed(1):null,release_date:item.release_date||item.first_air_date||null,backdrop:item.backdrop_path||null,poster:item.poster_path||null,tmdbObj:{...item,media_type:mediaType},likes:Math.floor(5000+Math.random()*95000),_score:0};
}
const hap={light:()=>{try{navigator.vibrate?.(8);}catch{}},save:()=>{try{navigator.vibrate?.([15,30,60]);}catch{}}};

// ─── ATOMS ─────────────────────────────────────────────────────────────────────
function PauseFlash({state}){
  if(!state)return null;
  const isPause=state.type==="pause";
  return(<div key={state.key} style={{position:"absolute",inset:0,zIndex:24,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><div style={{width:TARGET_XL,height:TARGET_XL,borderRadius:"50%",background:"rgba(0,0,0,0.48)",display:"flex",alignItems:"center",justifyContent:"center",animation:state.persistent?"ns-pause-in 0.22s ease both":"ns-flash-ping 0.55s ease both"}}>{isPause?<svg style={{width:ICON_LG,height:ICON_LG}} viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>:<svg style={{width:ICON_LG,height:ICON_LG}} viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>}</div></div>);
}
function BurstPing({x,y}){
  return(<div style={{position:"absolute",left:x,top:y,transform:"translate(-50%,-50%)",zIndex:65,pointerEvents:"none",animation:"ns-burst-ping 0.6s ease both"}}><svg style={{width:TARGET_XL,height:TARGET_XL}} viewBox="0 0 24 24" fill="#00e5cc"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg></div>);
}
// Purely a readout of real playback position (currentTime/duration), reported
// live by whichever Player is active. There is no independent clock here and
// no side effect: this component cannot advance the reel by itself, so what
// the person sees always matches what's actually happening in the video —
// a 90-second trailer fills over 90 real seconds, a 20-second teaser over 20.
function ProgressBar({active,currentTime=0,duration=0}){
  const known=active&&duration>0&&isFinite(duration);
  const pct=known?Math.min(100,Math.max(0,(currentTime/duration)*100)):0;
  return(<div style={{position:"absolute",bottom:0,left:0,right:0,height:2.5,background:"rgba(255,255,255,0.1)",zIndex:30,pointerEvents:"none"}}><div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#00b4a6,#00d4ff)",transition:"width 0.2s linear"}}/></div>);
}

// ─── WEB YT PLAYER ─────────────────────────────────────────────────────────────
function WebYTPlayer({videoId,active,muted,paused,onBlocked,onProgress,backdrop,poster,preload}){
  const ifrRef=useRef(null);
  const[injected,setInjected]=useState(false),[loaded,setLoaded]=useState(false),[playing,setPlaying]=useState(false),[spinDone,setSpinDone]=useState(false);
  const aRef=useRef(active),mRef=useRef(muted),blocked=useRef(false),psRef=useRef(-1);
  useEffect(()=>{aRef.current=active;},[active]);
  useEffect(()=>{mRef.current=muted;},[muted]);
  useEffect(()=>{if(active||preload)setInjected(true);},[active,preload]);
  useEffect(()=>{setLoaded(false);setPlaying(false);setSpinDone(false);blocked.current=false;psRef.current=-1;if(!active&&!preload)setInjected(false);},[videoId]); // eslint-disable-line
  const applyMute=useCallback(()=>{const f=ifrRef.current;if(!f)return;mRef.current?ytMsg(f,{event:"command",func:"mute",args:[]}):(ytMsg(f,{event:"command",func:"unMute",args:[]}),ytMsg(f,{event:"command",func:"setVolume",args:[100]}));},[]);
  useEffect(()=>{
    // Single postMessage channel does double duty: player state (state 0 is a
    // real "ended" — the one and only trigger that advances the reel) AND the
    // live currentTime/duration YouTube already streams as part of this same
    // "listening" info feed once addEventListener(onStateChange) is wired up.
    // No separate polling, no assumed duration — one source of truth for both
    // what the progress bar shows and when the reel actually moves on.
    const fn=e=>{
      if(!e.data)return;
      try{
        const d=typeof e.data==="string"?JSON.parse(e.data):e.data;
        let st;
        if(d?.event==="onStateChange")st=d.info;
        if(d?.event==="infoDelivery"){
          st=d?.info?.playerState;
          const ct=d?.info?.currentTime,du=d?.info?.duration;
          if(aRef.current&&typeof ct==="number"&&typeof du==="number"&&du>0)onProgress?.(ct,du);
        }
        if(st!=null)psRef.current=st;
        if(st===1&&aRef.current){setPlaying(true);setSpinDone(true);}
        if(st===0&&aRef.current&&!blocked.current){blocked.current=true;setPlaying(false);onBlocked?.();}
        if(d?.event==="onError"&&aRef.current&&!blocked.current){blocked.current=true;onBlocked?.();}
      }catch{}
    };
    window.addEventListener("message",fn);return()=>window.removeEventListener("message",fn);
  },[onBlocked,onProgress]);
  useEffect(()=>{if(!loaded||!ifrRef.current)return;const f=ifrRef.current;ytMsg(f,{event:"listening"});ytMsg(f,{event:"command",func:"addEventListener",args:["onStateChange"]});ytMsg(f,{event:"command",func:"addEventListener",args:["onError"]});},[loaded]);
  useEffect(()=>{
    if(!loaded||!ifrRef.current)return;const f=ifrRef.current;
    if(active){ytMsg(f,{event:"command",func:"playVideo",args:[]});if(psRef.current===1){setPlaying(true);setSpinDone(true);}applyMute();const t1=setTimeout(applyMute,350),t2=setTimeout(applyMute,900);return()=>{clearTimeout(t1);clearTimeout(t2);};}
    ytMsg(f,{event:"command",func:"pauseVideo",args:[]});ytMsg(f,{event:"command",func:"mute",args:[]});
  },[active,loaded,applyMute]); // eslint-disable-line
  useEffect(()=>{if(!loaded||!ifrRef.current||!active)return;applyMute();const t=setTimeout(applyMute,350);return()=>clearTimeout(t);},[muted,loaded,applyMute]); // eslint-disable-line
  useEffect(()=>{if(!loaded||!ifrRef.current||!active)return;ytMsg(ifrRef.current,{event:"command",func:paused?"pauseVideo":"playVideo",args:[]});},[paused,active,loaded]);
  useEffect(()=>{if(!active||!loaded)return;const t=setTimeout(()=>setSpinDone(true),7000);return()=>clearTimeout(t);},[active,loaded,videoId]); // eslint-disable-line
  const bg=imgSrc(backdrop,"w1280")||imgSrc(poster,"w780");
  return(
    <div style={{position:"absolute",inset:0,background:"#000",overflow:"hidden"}}>
      {injected&&<iframe key={videoId} ref={ifrRef} src={buildYTSrc(videoId)} allow="autoplay;encrypted-media" allowFullScreen={false} frameBorder="0" scrolling="no" onLoad={()=>setLoaded(true)} style={{position:"absolute",top:"-22%",left:"-12%",width:"124%",height:"144%",border:"none",pointerEvents:"none",zIndex:2}}/>}
      <div style={{position:"absolute",inset:0,zIndex:5,background:bg?"none":"#111",backgroundImage:bg?`url(${bg})`:"none",backgroundSize:"cover",backgroundPosition:"center top",opacity:(active&&playing)?0:1,transition:"opacity 0.5s ease",pointerEvents:"none"}}/>
      <div style={{position:"absolute",inset:0,zIndex:6,pointerEvents:"none",background:"linear-gradient(to bottom,rgba(0,0,0,0.45) 0%,transparent 22%,transparent 48%,rgba(0,0,0,0.55) 72%,rgba(0,0,0,0.94) 100%)"}}/>
      {active&&!spinDone&&<div style={{position:"absolute",inset:0,zIndex:25,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><div style={{width:44,height:44,borderRadius:"50%",border:"2.5px solid rgba(255,255,255,0.07)",borderTopColor:"#00b4a6",animation:"ns-spin 0.8s linear infinite"}}/></div>}
    </div>
  );
}

// ─── ELECTRON PLAYER ─────────────────────────────────────────────────────────
function ElectronPlayer({videoId,active,muted,paused,onBlocked,onProgress,backdrop,poster,preload}){
  const vRef=useRef(null);
  const[url,setUrl]=useState(null),[playing,setPlaying]=useState(false),[spinDone,setSpinDone]=useState(false),[err,setErr]=useState(false);
  const aRef=useRef(active),idRef=useRef(videoId),blocked=useRef(false),fetchingRef=useRef(false);
  useEffect(()=>{aRef.current=active;},[active]);
  useEffect(()=>{idRef.current=videoId;},[videoId]);

  // Hard reset — new videoId wipes everything
  useEffect(()=>{
    const v=vRef.current;
    setUrl(null);setPlaying(false);setSpinDone(false);setErr(false);
    blocked.current=false;fetchingRef.current=false;
    if(v){v.pause();v.removeAttribute("src");v.load();}
  },[videoId]);

  useEffect(()=>{
    if(!active&&!preload)return;
    if(url||fetchingRef.current||err)return;
    if(!window.electronAPI?.getTrailerStream){setErr(true);return;}
    const cid=videoId;
    fetchingRef.current=true;
    window.electronAPI.getTrailerStream(videoId)
      .then(r=>{
        if(idRef.current!==cid)return;
        fetchingRef.current=false;
        if(r?.url){setUrl(r.url);}
        else{setErr(true);if(aRef.current&&!blocked.current){blocked.current=true;setTimeout(()=>onBlocked?.(),2500);}}
      })
      .catch(()=>{
        if(idRef.current!==cid)return;
        fetchingRef.current=false;
        setErr(true);
        if(aRef.current&&!blocked.current){blocked.current=true;setTimeout(()=>onBlocked?.(),2500);}
      });
  },[active,preload,videoId,url,err]); // eslint-disable-line

  useEffect(()=>{
    const v=vRef.current;if(!v||!url)return;
    v.src=url;v.load();
    if(!active)return;
    const t=setTimeout(()=>{
      v.muted=false;
      v.play().catch(()=>{v.muted=true;v.play().catch(()=>{});});
    },80);
    return()=>clearTimeout(t);
  },[url]); // eslint-disable-line

  useEffect(()=>{
    const v=vRef.current;if(!v||!url)return; // url checked — not in deps intentionally
    if(active){v.play().catch(()=>{v.muted=true;v.play().catch(()=>{});});}
    else{v.pause();v.muted=true;}
  },[active,url]);

  // Mute sync — use property not attribute (avoids React boolean-attr bug)
  useEffect(()=>{const v=vRef.current;if(v)v.muted=muted;},[muted]);

  useEffect(()=>{
    const v=vRef.current;if(!v||!url||!active)return;
    if(paused)v.pause();else v.play().catch(()=>{});
  },[paused,active,url]);

  const bg=imgSrc(backdrop,"w1280")||imgSrc(poster,"w780");
  const showSpin=!spinDone&&active&&!err;
  return(
    <div style={{position:"absolute",inset:0,background:"#000",overflow:"hidden"}}>
      {/* key=videoId forces element recreation on track change;
          no muted prop — handled entirely via ref to avoid React bug.
          onLoadedMetadata + onTimeUpdate give real duration/currentTime
          straight from the element — the most reliable source available,
          used to drive the progress bar and, via onEnded below, the one
          and only real completion signal that advances the reel. */}
      <video key={videoId} ref={vRef} playsInline preload="auto"
        onLoadedMetadata={e=>{if(aRef.current)onProgress?.(0,e.target.duration);}}
        onTimeUpdate={e=>{if(aRef.current&&isFinite(e.target.duration))onProgress?.(e.target.currentTime,e.target.duration);}}
        onCanPlayThrough={()=>setSpinDone(true)}
        onPlaying={()=>{setPlaying(true);setSpinDone(true);}}
        onEnded={()=>{if(aRef.current&&!blocked.current){blocked.current=true;setPlaying(false);onBlocked?.();}}}
        onStalled={()=>{const v=vRef.current;if(v&&v.src&&aRef.current){v.load();v.play().catch(()=>{});}}}
        onError={()=>{setErr(true);if(aRef.current&&!blocked.current){blocked.current=true;setTimeout(()=>onBlocked?.(),2000);}}}
        style={{position:"absolute",top:"-22%",left:"-12%",width:"124%",height:"144%",objectFit:"cover",zIndex:2,pointerEvents:"none"}}
      />
      <div style={{position:"absolute",inset:0,zIndex:5,background:bg?"none":"#111",backgroundImage:bg?`url(${bg})`:"none",backgroundSize:"cover",backgroundPosition:"center top",opacity:(active&&playing)?0:1,transition:"opacity 0.5s ease",pointerEvents:"none"}}/>
      <div style={{position:"absolute",inset:0,zIndex:6,pointerEvents:"none",background:"linear-gradient(to bottom,rgba(0,0,0,0.45) 0%,transparent 22%,transparent 48%,rgba(0,0,0,0.55) 72%,rgba(0,0,0,0.94) 100%)"}}/>
      {showSpin&&<div style={{position:"absolute",inset:0,zIndex:25,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:44,height:44,borderRadius:"50%",border:"2.5px solid rgba(255,255,255,0.06)",borderTopColor:"#00b4a6",animation:"ns-spin 0.8s linear infinite"}}/></div>}
      {err&&active&&<div style={{position:"absolute",inset:0,zIndex:25,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10}}><svg style={{width:ICON_LG,height:ICON_LG}} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span style={{fontSize:11,color:"rgba(255,255,255,0.3)",fontFamily:"'DM Mono',monospace",letterSpacing:1.5,textTransform:"uppercase"}}>Stream unavailable</span></div>}
    </div>
  );
}
const Player = IS_ELECTRON ? ElectronPlayer : WebYTPlayer;

// ─── SEARCH QUEUE STRIP ───────────────────────────────────────────────────────
function SearchQueueStrip({items,idx,onSelect}){
  const ref=useRef(null);
  useEffect(()=>{ref.current?.children[idx]?.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"});},[idx]);
  if(!items.length)return null;
  return(
    <div style={{background:"rgba(0,0,0,0.92)",backdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.06)",padding:"10px 14px 22px",flexShrink:0}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:1.6,color:"rgba(255,255,255,0.2)",textTransform:"uppercase",fontFamily:"'DM Mono',monospace",marginBottom:9}}>Result {idx+1} of {items.length}</div>
      <div ref={ref} style={{display:"flex",gap:7,overflowX:"auto",scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
        {items.map((item,i)=>(
          <button key={item.id} onClick={()=>onSelect(i)} style={{all:"unset",cursor:"pointer",flexShrink:0,position:"relative",width:THUMB_W,height:THUMB_H,borderRadius:6,overflow:"hidden",background:"#1a1a1a",border:`1.5px solid ${i===idx?"#00b4a6":"rgba(255,255,255,0.07)"}`,transform:i===idx?"scale(1.12)":"scale(1)",transition:"border-color 0.15s,transform 0.18s"}}>
            {item.poster_path?<img src={imgSrc(item.poster_path,"w92")} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<div style={{width:"100%",height:"100%",background:"#222"}}/>}
            {i===idx&&<div style={{position:"absolute",inset:0,background:"rgba(0,180,166,0.22)"}}/>}
            {i===idx&&<div style={{position:"absolute",bottom:4,left:"50%",transform:"translateX(-50%)",display:"flex",gap:2,alignItems:"flex-end",height:9}}>{[0,1,2].map(b=><div key={b} style={{width:2,background:"#00e5cc",borderRadius:1,animation:"ns-bar-pulse 0.9s ease-in-out infinite",animationDelay:`${b*0.16}s`,height:"100%"}}/>)}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchResultCard({item,onOpen}){
  const[h,setH]=useState(false);
  const type=item.media_type==="tv"?"tv":"movie";
  const title=item.title||item.name||"";
  const year=(item.release_date||item.first_air_date||"").slice(0,4);
  return(
    <div style={{width:CARD_W,flexShrink:0,userSelect:"none",cursor:"pointer"}}
      onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)}
      onClick={onOpen}>
      <div style={{width:CARD_W,height:CARD_H,borderRadius:9,overflow:"hidden",background:"#111",border:`1px solid ${h?"rgba(0,180,166,0.5)":"rgba(255,255,255,0.06)"}`,position:"relative",transform:h?"translateY(-4px) scale(1.04)":"none",transition:"all 0.2s cubic-bezier(.34,1.1,.64,1)",boxShadow:h?"0 14px 32px rgba(0,0,0,0.75)":"none"}}>
        {item.poster_path
          ?<img src={imgSrc(item.poster_path,"w300")} alt={title} loading="lazy" draggable={false} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
          :<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.06)",fontSize:24}}>◉</div>}
        {type==="tv"&&<div style={{position:"absolute",top:5,left:5,background:"rgba(167,139,250,0.92)",borderRadius:4,padding:"2px 6px",fontSize:8,fontWeight:800,color:"#fff",letterSpacing:0.6}}>TV</div>}
        {item.vote_average>0&&<div style={{position:"absolute",top:5,right:5,background:"rgba(0,0,0,0.9)",borderRadius:5,padding:"2px 5px",fontSize:10,fontWeight:700,color:"#f5c518"}}>★ {item.vote_average.toFixed(1)}</div>}
        {h&&(
          <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,0.7) 0%,transparent 55%)",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:7}}>
            <div style={{width:TARGET_SM,height:TARGET_SM,borderRadius:"50%",background:"rgba(0,0,0,0.55)",border:"1.5px solid rgba(255,255,255,0.28)",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(6px)"}}>
              <svg style={{width:ICON_XS,height:ICON_XS,marginLeft:1}} viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        )}
      </div>
      <div style={{marginTop:5,fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.72)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
      {year&&<div style={{fontSize:10,color:"rgba(255,255,255,0.24)",marginTop:1}}>{year}</div>}
    </div>
  );
}

// ─── SEARCH OVERLAY ──────────────────────────────────────────────────────────
function SearchOverlay({open,apiKey,onClose,onAddToMain}){
  const[mode,setMode]=useState("grid");
  const[q,setQ]=useState("");
  const[results,setResults]=useState([]);
  const[trending,setTrending]=useState([]);
  const[sLoading,setSLoading]=useState(false);
  const[pQueue,setPQueue]=useState([]);
  const[pIdx,setPIdx]=useState(0);
  const[trailers,setTrailers]=useState({});
  const[pMuted,setPMuted]=useState(false);
  const[pPaused,setPPaused]=useState(false);
  const inputRef=useRef(null),timerRef=useRef(null),reqId=useRef(0);
  const tCache=useRef({}),pQueueRef=useRef([]),pIdxRef=useRef(0);

  useEffect(()=>{pQueueRef.current=pQueue;},[pQueue]);
  useEffect(()=>{pIdxRef.current=pIdx;},[pIdx]);

  useEffect(()=>{if(!open){setMode("grid");setQ("");setResults([]);setPQueue([]);setPIdx(0);setTrailers({});tCache.current={};}},[open]);
  useEffect(()=>{if(open&&mode==="grid")setTimeout(()=>inputRef.current?.focus(),130);},[open,mode]);
  useEffect(()=>{
    if(!open||!apiKey||trending.length)return;
    fetch(`${TMDB_BASE}/trending/all/week?api_key=${apiKey}&language=en-US`).then(r=>r.json()).then(d=>setTrending((d.results||[]).filter(x=>x.poster_path&&(x.media_type==="movie"||x.media_type==="tv")).slice(0,16))).catch(()=>{});
  },[open,apiKey]); // eslint-disable-line

  const doSearch=useCallback(async(query)=>{
    if(!query.trim()||!apiKey){setResults([]);return;}
    const id=++reqId.current;setSLoading(true);
    try{const r=await fetch(`${TMDB_BASE}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US&page=1`);const d=await r.json();if(reqId.current!==id)return;setResults((d.results||[]).filter(x=>(x.media_type==="movie"||x.media_type==="tv")&&x.poster_path).slice(0,20));}
    catch{}finally{if(reqId.current===id)setSLoading(false);}
  },[apiKey]);

  const handleInput=val=>{setQ(val);clearTimeout(timerRef.current);if(val.length>1)timerRef.current=setTimeout(()=>doSearch(val),350);else{setResults([]);setSLoading(false);}};

  const fetchTrailerFor=useCallback(async(item)=>{
    if(!item||item.id in tCache.current)return;
    tCache.current[item.id]="loading";
    const type=item.media_type==="tv"?"tv":"movie";
    try{
      const r=await fetch(`${TMDB_BASE}/${type}/${item.id}/videos?api_key=${apiKey}&language=en-US`);
      const d=await r.json();const ytId=bestTrailer(d.results||[])||null;
      tCache.current[item.id]=ytId;setTrailers(t=>({...t,[item.id]:ytId}));
    }catch{tCache.current[item.id]=null;setTrailers(t=>({...t,[item.id]:null}));}
  },[apiKey]);

  const prefetch=useCallback((q,i)=>{fetchTrailerFor(q[i]);if(i+1<q.length)fetchTrailerFor(q[i+1]);if(i-1>=0)fetchTrailerFor(q[i-1]);},[fetchTrailerFor]);

  const openPlayer=useCallback((items,startIdx)=>{
    setPQueue(items);pQueueRef.current=items;setPIdx(startIdx);pIdxRef.current=startIdx;setPPaused(false);setMode("player");prefetch(items,startIdx);
  },[prefetch]);

  const goPlayer=useCallback((dir)=>{
    const next=pIdxRef.current+dir,q=pQueueRef.current;
    if(next<0||next>=q.length)return;
    setPIdx(next);pIdxRef.current=next;setPPaused(false);prefetch(q,next);
  },[prefetch]);

  useEffect(()=>{
    if(!open||mode!=="player")return;
    const h=e=>{if(e.key==="ArrowRight"||e.key==="ArrowDown")goPlayer(1);if(e.key==="ArrowLeft"||e.key==="ArrowUp")goPlayer(-1);if(e.key==="Escape")setMode("grid");if(e.key===" "){e.preventDefault();setPPaused(p=>!p);}};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[open,mode,goPlayer]);

  const display=q.length>1?results:trending;
  const sLabel=sLoading?"Searching…":q.length>1?`${results.length} result${results.length===1?"":"s"}`:"Trending this week";

  if(!open)return null;

  // ── PLAYER MODE ─────────────────────────────────────────────────────────────
  if(mode==="player"){
    const item=pQueue[pIdx];
    const ytKey=item?.id in trailers?trailers[item.id]:undefined;
    const isLoadingT=ytKey===undefined;
    const noTrailer=ytKey===null;
    const bg=imgSrc(item?.backdrop_path,"w1280")||imgSrc(item?.poster_path,"w780");
    const itemGenres=(item?.genre_ids||[]).slice(0,2).map(id=>GENRES[id]).filter(Boolean);

    return createPortal(
      <div style={{position:"fixed",inset:0,zIndex:2147483645,background:"#000",display:"flex",flexDirection:"column",fontFamily:"'DM Sans',sans-serif"}}>
        <style>{`@keyframes ns-spin{to{transform:rotate(360deg)}}@keyframes ns-bar-pulse{0%,100%{transform:scaleY(0.3)}50%{transform:scaleY(1)}}@keyframes ns-slide-fade{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{position:"relative",flex:1,overflow:"hidden"}}>
          {typeof ytKey==="string"&&ytKey&&<Player key={ytKey} videoId={ytKey} active={true} muted={pMuted} paused={pPaused} onBlocked={()=>goPlayer(1)} backdrop={item?.backdrop_path} poster={item?.poster_path} preload={false}/>}
          {(isLoadingT||noTrailer)&&(
            <div style={{position:"absolute",inset:0,backgroundImage:bg?`url(${bg})`:"none",backgroundSize:"cover",backgroundPosition:"center",backgroundColor:"#111"}}>
              <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.68)"}}/>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,zIndex:1}}>
                {isLoadingT&&<><div style={{width:40,height:40,borderRadius:"50%",border:"2.5px solid rgba(255,255,255,0.06)",borderTopColor:"#00b4a6",animation:"ns-spin 0.8s linear infinite"}}/><span style={{fontSize:10,color:"rgba(255,255,255,0.35)",fontFamily:"'DM Mono',monospace",letterSpacing:2,textTransform:"uppercase"}}>Loading trailer</span></>}
                {noTrailer&&<><svg style={{width:ICON_LG,height:ICON_LG}} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span style={{fontSize:13,color:"rgba(255,255,255,0.3)",fontFamily:"'DM Sans',sans-serif"}}>No trailer available</span><button onClick={()=>goPlayer(1)} style={{all:"unset",marginTop:6,display:"inline-flex",alignItems:"center",gap:6,padding:"7px 16px",borderRadius:6,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",fontSize:12,color:"rgba(255,255,255,0.6)",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:600}}>Next →</button></>}
              </div>
            </div>
          )}
          {/* Top bar */}
          <div style={{position:"absolute",top:0,left:0,right:0,zIndex:30,background:"linear-gradient(to bottom,rgba(0,0,0,0.78) 0%,transparent 100%)",padding:"14px 16px 48px",display:"flex",alignItems:"center",gap:10}}>
            <button onClick={()=>setMode("grid")} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:7,color:"rgba(255,255,255,0.82)",fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",padding:"6px 8px",borderRadius:8,transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Search results
            </button>
            <span style={{flex:1}}/>
            <button onClick={()=>setPPaused(p=>!p)} style={{all:"unset",cursor:"pointer",width:TARGET_SM,height:TARGET_SM,borderRadius:"50%",background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.8)"}}>
              {pPaused?<svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>:<svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>}
            </button>
            <button onClick={()=>setPMuted(m=>!m)} style={{all:"unset",cursor:"pointer",width:TARGET_SM,height:TARGET_SM,borderRadius:"50%",background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.8)"}}>
              {pMuted?<svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>:<svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>}
            </button>
            <button onClick={onClose} style={{all:"unset",cursor:"pointer",width:TARGET_SM,height:TARGET_SM,borderRadius:"50%",background:"rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          {/* Side nav */}
          {pIdx>0&&<button onClick={()=>goPlayer(-1)} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",all:"unset",cursor:"pointer",width:TARGET_LG,height:TARGET_LG,borderRadius:"50%",background:"rgba(0,0,0,0.45)",border:"1.5px solid rgba(255,255,255,0.14)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20,color:"rgba(255,255,255,0.85)",backdropFilter:"blur(8px)"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.7)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(0,0,0,0.45)"}><svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>}
          {pIdx<pQueue.length-1&&<button onClick={()=>goPlayer(1)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",all:"unset",cursor:"pointer",width:TARGET_LG,height:TARGET_LG,borderRadius:"50%",background:"rgba(0,0,0,0.45)",border:"1.5px solid rgba(255,255,255,0.14)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20,color:"rgba(255,255,255,0.85)",backdropFilter:"blur(8px)"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.7)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(0,0,0,0.45)"}><svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>}
          {/* Bottom info */}
          <div style={{position:"absolute",bottom:0,left:0,right:0,zIndex:25,background:"linear-gradient(to top,rgba(0,0,0,0.97) 0%,rgba(0,0,0,0.7) 50%,transparent 100%)",padding:"90px 18px 18px",animation:"ns-slide-fade 0.3s ease both"}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10,alignItems:"center"}}>
              {itemGenres.map(g=><span key={g} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:0.4}}>{g}</span>)}
              {item?.vote_average>0&&<span style={{background:"rgba(241,196,15,0.08)",border:"1px solid rgba(241,196,15,0.22)",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,color:"#f1c40f"}}>★ {item.vote_average.toFixed(1)}</span>}
              {item?.media_type==="tv"&&<span style={{background:"rgba(167,139,250,0.12)",border:"1px solid rgba(167,139,250,0.28)",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,color:"#a78bfa",letterSpacing:0.4}}>TV Series</span>}
            </div>
            <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(26px,5.5vw,50px)",fontWeight:400,margin:"0 0 6px",color:"#fff",letterSpacing:1.5,lineHeight:1}}>{item?.title||item?.name}</h2>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",fontFamily:"'DM Mono',monospace",letterSpacing:0.5,marginBottom:8}}>{(item?.release_date||item?.first_air_date||"").slice(0,4)}</div>
            {item?.overview&&<p style={{fontSize:12,color:"rgba(255,255,255,0.52)",lineHeight:1.55,margin:"0 0 14px",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",maxWidth:500}}>{item.overview}</p>}
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <button onClick={()=>{onAddToMain(item);onClose();}} style={{all:"unset",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7,padding:"9px 22px",borderRadius:7,background:"rgba(0,180,166,0.18)",border:"1.5px solid rgba(0,229,204,0.36)",color:"#00e5cc",fontSize:13,fontWeight:700,letterSpacing:0.3,transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(0,180,166,0.3)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(0,180,166,0.18)"}><svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Watch Now</button>
              {pIdx<pQueue.length-1&&<button onClick={()=>goPlayer(1)} style={{all:"unset",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,padding:"9px 16px",borderRadius:7,background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.65)",fontSize:12,fontWeight:600,transition:"background 0.15s",fontFamily:"'DM Sans',sans-serif"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.07)"}>Next →</button>}
            </div>
          </div>
        </div>
        <SearchQueueStrip items={pQueue} idx={pIdx} onSelect={i=>{setPIdx(i);pIdxRef.current=i;setPPaused(false);prefetch(pQueue,i);}}/>
      </div>,document.body
    );
  }

  // ── GRID MODE — wrap layout, responsive cards, same as HomePage's .ns-row.
  // Not a CSS grid: HomePage uses flex-wrap with flexible-width children, so
  // the search grid does the same instead of a responsive minmax() grid that
  // stretches cards to fill columns. Card size itself scales with viewport
  // via CARD_W/CARD_H rather than a single fixed pixel size. ──────────────────
  return createPortal(
    <div style={{position:"fixed",inset:0,zIndex:2147483644,background:"rgba(4,4,4,0.97)",backdropFilter:"blur(24px)",display:"flex",flexDirection:"column",fontFamily:"'DM Sans','Helvetica Neue',sans-serif",animation:"ns-srch-in 0.22s cubic-bezier(0.22,1,0.36,1) both"}}>
      <style>{`@keyframes ns-spin{to{transform:rotate(360deg)}}@keyframes ns-srch-in{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}@keyframes ns-card-pop{from{opacity:0;transform:scale(0.93) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}@keyframes ns-bar-pulse{0%,100%{transform:scaleY(0.3)}50%{transform:scaleY(1)}}`}</style>
      {/* Search bar */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"calc(14px + env(safe-area-inset-top)) 14px 12px",borderBottom:"1px solid rgba(255,255,255,0.07)",background:"rgba(8,8,8,0.8)",backdropFilter:"blur(20px)",flexShrink:0}}>
        <button
          onClick={onClose}
          onPointerUp={e=>{e.stopPropagation();}}
          onTouchEnd={e=>{e.stopPropagation();}}
          style={{all:"unset",cursor:"pointer",flexShrink:0,width:TARGET_SM,height:TARGET_SM,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:"50%",color:"rgba(255,255,255,0.65)",transition:"background 0.15s,color 0.15s",touchAction:"manipulation"}}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.09)";e.currentTarget.style.color="#fff";}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,0.65)";}}>
          <svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{flex:1,position:"relative"}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.28)",pointerEvents:"none",display:"flex"}}><svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <input ref={inputRef} value={q} onChange={e=>handleInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")doSearch(q);if(e.key==="Escape")onClose();}} placeholder="Search movies, shows…" style={{width:"100%",display:"block",boxSizing:"border-box",background:"rgba(255,255,255,0.07)",border:"1.5px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"9px 34px 9px 34px",color:"#fff",fontSize:"clamp(14px,3.6vw,15px)",fontFamily:"inherit",outline:"none",transition:"border-color 0.15s"}} onFocus={e=>e.target.style.borderColor="rgba(0,180,166,0.55)"} onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.1)"}/>
          {q&&<button onClick={()=>handleInput("")} style={{all:"unset",position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",cursor:"pointer",color:"rgba(255,255,255,0.35)",display:"flex",padding:4}}><svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
        </div>
      </div>
      {/* Label */}
      <div style={{padding:"11px 16px 7px",flexShrink:0,display:"flex",alignItems:"center",gap:8}}>
        {sLoading&&<div style={{width:11,height:11,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.08)",borderTopColor:"#00b4a6",animation:"ns-spin 0.7s linear infinite",flexShrink:0}}/>}
        <span style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"rgba(255,255,255,0.22)",textTransform:"uppercase",fontFamily:"'DM Mono',monospace"}}>{sLabel}</span>
      </div>
      {/* Grid — flex-wrap of responsive cards, matching HomePage's .ns-row */}
      <div style={{flex:1,overflowY:"auto",padding:"4px 16px calc(48px + env(safe-area-inset-bottom))",WebkitOverflowScrolling:"touch"}}>
        {sLoading&&!display.length&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:"14px 10px"}}>
            {Array.from({length:16}).map((_,i)=>(
              <div key={i} style={{width:CARD_W,animation:"ns-card-pop 0.24s ease both",animationDelay:`${i*0.02}s`}}>
                <div style={{width:CARD_W,height:CARD_H,borderRadius:9,background:"rgba(255,255,255,0.04)"}}/>
                <div style={{marginTop:6,height:10,borderRadius:3,background:"rgba(255,255,255,0.05)",width:"80%"}}/>
              </div>
            ))}
          </div>
        )}
        {!sLoading&&q.length>1&&!results.length&&(<div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"70px 20px",textAlign:"center"}}><svg style={{width:44,height:44}} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span style={{fontSize:13,color:"rgba(255,255,255,0.25)"}}>No results for "{q}"</span></div>)}
        {!!display.length&&(
          <div style={{display:"flex",flexWrap:"wrap",gap:"14px 10px"}}>
            {display.map((item,i)=>(
            <div key={item.id} style={{animation:"ns-card-pop 0.22s ease both",animationDelay:`${Math.min(i*0.02,0.3)}s`}}>
                <SearchResultCard item={item} onOpen={()=>openPlayer(display,i)}/>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,document.body
  );
}

// ─── RELATED CAROUSEL ─────────────────────────────────────────────────────────
function RelatedCarousel({items,onSelect}){
  if(!items?.length)return null;
  return(
    <div style={{marginTop:22}}>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"rgba(255,255,255,0.28)",textTransform:"uppercase",fontFamily:"'DM Mono',monospace",marginBottom:11}}>More Like This</div>
      <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:6,scrollbarWidth:"none",WebkitOverflowScrolling:"touch",marginLeft:-20,marginRight:-20,paddingLeft:20,paddingRight:20}}>
        {items.map(item=>(
          <button key={item.id} onClick={e=>{e.stopPropagation();onSelect(item);}} style={{all:"unset",cursor:"pointer",flexShrink:0,display:"flex",flexDirection:"column",gap:5,width:REL_W}}>
            <div style={{width:REL_W,height:REL_H,borderRadius:7,overflow:"hidden",background:"#1a1a1a",border:"1.5px solid rgba(255,255,255,0.08)",transition:"border-color 0.15s",position:"relative"}} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(0,180,166,0.48)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"}>
              {item.poster_path?<img src={imgSrc(item.poster_path,"w185")} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>:<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(255,255,255,0.08)"}}><svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="currentColor"><path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2z"/></svg></div>}
              <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 55%)",pointerEvents:"none"}}/>
            </div>
            <div style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",textAlign:"center"}}>{item.title||item.name}</div>
            {item.vote_average>0&&<span style={{fontSize:9,color:"#f1c40f",fontWeight:700,textAlign:"center"}}>★ {item.vote_average.toFixed(1)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── INFO SHEET ───────────────────────────────────────────────────────────────
function InfoSheet({reel,visible,onClose,related,onRelatedSelect}){
  if(!visible||!reel)return null;
  return(
    <div style={{position:"absolute",inset:0,zIndex:70,background:"rgba(0,0,0,0.92)",backdropFilter:"blur(18px)",display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:"0 20px 76px",animation:"ns-slide-up 0.3s cubic-bezier(0.22,1,0.36,1) both",overflowY:"auto"}} onClick={e=>{e.stopPropagation();onClose();}}>
      <div onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12,alignItems:"center"}}>
          {reel.genres.map(g=><span key={g} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:0.4}}>{g}</span>)}
          {reel.rating&&<span style={{background:"rgba(241,196,15,0.08)",border:"1px solid rgba(241,196,15,0.2)",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,color:"#f1c40f"}}>★ {reel.rating}</span>}
        </div>
        <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(28px,7vw,52px)",fontWeight:400,margin:"0 0 10px",color:"#fff",letterSpacing:1.5,lineHeight:0.95}}>{reel.title}</h2>
        {reel.overview&&<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,lineHeight:1.65,color:"rgba(255,255,255,0.58)",marginBottom:12,maxWidth:460}}>{reel.overview}</p>}
        <RelatedCarousel items={related||[]} onSelect={onRelatedSelect}/>
        <button onClick={onClose} style={{all:"unset",marginTop:20,display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,fontSize:12,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:"rgba(255,255,255,0.45)",cursor:"pointer"}}><svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Close</button>
      </div>
    </div>
  );
}

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────
function ActionBtn({icon,label,count,active,onClick}){
  const[pop,setPop]=useState(false);const color=active?"#00b4a6":undefined;
  return(<button onClick={()=>{setPop(true);setTimeout(()=>setPop(false),200);onClick?.();}} style={{all:"unset",display:"flex",flexDirection:"column",alignItems:"center",gap:7,cursor:"pointer",WebkitTapHighlightColor:"transparent"}} onMouseEnter={e=>e.currentTarget.querySelector(".ns-ab-c").style.background=active?"rgba(0,180,166,0.2)":"rgba(255,255,255,0.14)"} onMouseLeave={e=>e.currentTarget.querySelector(".ns-ab-c").style.background=active?"rgba(0,180,166,0.1)":"rgba(255,255,255,0.08)"}>
    <div className="ns-ab-c" style={{width:TARGET_MD,height:TARGET_MD,borderRadius:"50%",background:active?"rgba(0,180,166,0.1)":"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",color:color||"rgba(255,255,255,0.87)",transform:pop?"scale(0.8)":"scale(1)",transition:"transform 0.15s cubic-bezier(0.34,1.56,0.64,1),background 0.15s",flexShrink:0}}>{icon}</div>
    {count!=null&&<span style={{fontSize:13,fontWeight:600,color:color||"rgba(255,255,255,0.7)",lineHeight:1,letterSpacing:0.1}}>{fmtCount(count)}</span>}
    <span style={{fontSize:12,color:color||"rgba(255,255,255,0.42)",lineHeight:1}}>{label}</span>
  </button>);
}
function NavBtn({dir,disabled,onClick}){
  const[hov,setHov]=useState(false);
  return(<button onClick={!disabled?onClick:undefined} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{all:"unset",width:TARGET_MD,height:TARGET_MD,borderRadius:"50%",background:disabled?"rgba(255,255,255,0.04)":hov?"rgba(255,255,255,0.16)":"rgba(255,255,255,0.08)",border:`1.5px solid ${disabled?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.1)"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:disabled?"default":"pointer",color:disabled?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.88)",transition:"background 0.15s"}}><svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{dir==="up"?<polyline points="18 15 12 9 6 15"/>:<polyline points="6 9 12 15 18 9"/>}</svg></button>);
}
function WatchBtn({reel,onClick}){
  const st=getWatchState(reel);const[hov,setHov]=useState(false);
  if(st==="coming_soon")return<span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:6,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",fontSize:12,color:"rgba(255,255,255,0.38)",fontFamily:"'DM Sans',sans-serif"}}>Coming {formatDate(reel.release_date)}</span>;
  return(<button onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={e=>{e.stopPropagation();onClick(reel,st);}} style={{all:"unset",display:"inline-flex",alignItems:"center",gap:7,padding:"8px 18px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,letterSpacing:0.3,transition:"all 0.15s",background:st==="notify"?"rgba(167,139,250,0.14)":"rgba(0,180,166,0.18)",color:st==="notify"?"#a78bfa":"#00e5cc",border:`1.5px solid ${st==="notify"?"rgba(167,139,250,0.35)":"rgba(0,229,204,0.35)"}`,transform:hov?"scale(1.04)":"scale(1)"}}>{st==="notify"?<><svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>Notify Me</>:<><svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Watch Now</>}</button>);
}
function MobBtn({children,label,count,active,onClick}){
  const[pop,setPop]=useState(false);const stop=e=>{e.stopPropagation();e.nativeEvent?.stopImmediatePropagation?.();};
  return(<button onPointerDown={stop} onPointerUp={stop} onPointerMove={stop} onPointerCancel={stop} onTouchStart={stop} onTouchEnd={stop} onTouchMove={stop} onTouchCancel={stop} onClick={e=>{stop(e);setPop(true);setTimeout(()=>setPop(false),150);onClick();}} style={{all:"unset",display:"flex",flexDirection:"column",alignItems:"center",gap:5,cursor:"pointer",WebkitTapHighlightColor:"transparent",userSelect:"none",touchAction:"none"}}>
    <div style={{width:TARGET_MD,height:TARGET_MD,display:"flex",alignItems:"center",justifyContent:"center",color:active?"#00b4a6":"rgba(255,255,255,0.9)",transform:pop?"scale(0.58)":"scale(1)",transition:"transform 0.15s cubic-bezier(0.34,1.56,0.64,1),color 0.15s"}}>{children}</div>
    <span style={{fontSize:11,fontWeight:600,color:active?"#00b4a6":"rgba(255,255,255,0.38)",fontFamily:"'DM Mono',monospace",letterSpacing:0.8,textTransform:"uppercase",lineHeight:1}}>{count!=null?fmtCount(count):label}</span>
  </button>);
}
function SwipeHint({dir,opacity}){
  if(!dir||opacity<=0)return null;const r=dir==="right";
  return(<div style={{position:"absolute",inset:0,zIndex:55,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:r?"flex-start":"flex-end",padding:"0 22px",opacity,transition:"opacity 0.05s"}}><div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,background:r?"rgba(0,180,166,0.14)":"rgba(167,139,250,0.14)",border:`1.5px solid ${r?"rgba(0,180,166,0.45)":"rgba(167,139,250,0.45)"}`,borderRadius:18,padding:"14px 18px",backdropFilter:"blur(8px)"}}>{r?<svg style={{width:ICON_LG,height:ICON_LG}} viewBox="0 0 24 24" fill="#00b4a6"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>:<svg style={{width:ICON_LG,height:ICON_LG}} viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>}<span style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",fontFamily:"'DM Mono',monospace",color:r?"#00b4a6":"#a78bfa"}}>{r?"Save":"Back"}</span></div></div>);
}
function GestureRow({icon,text}){
  const ic={updown:<svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round"><polyline points="7 8 12 3 17 8"/><polyline points="7 16 12 21 17 16"/></svg>,right:<svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round"><polyline points="9 6 15 12 9 18"/></svg>,tap:<svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" opacity="0.35"/></svg>,doubletap:<svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="12" r="2.2"/><circle cx="15" cy="12" r="2.2" opacity="0.5"/></svg>}[icon];
  return(<div style={{display:"flex",alignItems:"center",gap:9}}><span style={{flexShrink:0,width:ICON_SM,height:ICON_SM,display:"flex",alignItems:"center",justifyContent:"center"}}>{ic}</span><span style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.76)",fontFamily:"'DM Sans',sans-serif",letterSpacing:0.1,whiteSpace:"nowrap"}}>{text}</span></div>);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
export default function ReelPage({apiKey,onSelect,onSave,savedItems=[],onNavigate,isPremium}){
  const planId = isPremium?.planId || (isPremium ? "premium" : "free");
  const[reels,setReels]       =useState([]);
  const[loading,setLoading]   =useState(true);
  const[moreLoad,setMoreLoad] =useState(false);
  const[idx,setIdx]           =useState(0);
  const[muted,setMuted]       =useState(false);
  const[toast,setToast]       =useState(null);
  const[saveFlash,setSaveFlash]=useState(false);
  const[swipe,setSwipe]       =useState({dir:null,opacity:0});
  const[interacted,setInteracted]=useState(false);
  const[showInfo,setShowInfo] =useState(false);
  const[paused,setPaused]     =useState(false);
  const[flash,setFlash]       =useState(null);
  const[burst,setBurst]       =useState(null);
  const[searchOpen,setSearchOpen]=useState(false);
  const[related,setRelated]   =useState([]);
  const[peekY,setPeekY]       =useState(0);
  const[snapAnim,setSnapAnim] =useState(true);
  const[showDock,setShowDock] =useState(false);
  const[downloading,setDownloading]=useState(false);
  const[dlProgress,setDlProgress]=useState(0);
  const[showGate,setShowGate]=useState(null);
  // Real playback position for the active reel only — {currentTime, duration}
  // in seconds, reported live by whichever Player is mounted (web or
  // Electron). This is the entire "how far through are we" state; nothing
  // else approximates it.
  const[progress,setProgress] =useState({currentTime:0,duration:0});

  const containerRef=useRef(null),idxRef=useRef(0),reelsRef=useRef([]),savedRef=useRef(savedItems),canNav=useRef(true),wheelLock=useRef(false),hadInteract=useRef(false),lastTap=useRef({t:0,x:0,y:0});
  const[desktop,setDesktop]=useState(()=>window.innerWidth>800);

  useEffect(()=>{const mq=window.matchMedia("(min-width:801px)");const h=e=>setDesktop(e.matches);mq.addEventListener("change",h);return()=>mq.removeEventListener("change",h);},[]);
  useEffect(()=>{idxRef.current=idx;},[idx]);
  useEffect(()=>{reelsRef.current=reels;},[reels]);
  useEffect(()=>{savedRef.current=savedItems;},[savedItems]);

  useEffect(()=>{setShowInfo(false);setPaused(false);setFlash(null);setRelated([]);setDownloading(false);setDlProgress(0);setProgress({currentTime:0,duration:0});},[idx]);

  // Related fetch
  useEffect(()=>{
    const cur=reelsRef.current[idxRef.current];if(!cur?.tmdb_id||!apiKey)return;
    let dead=false;
    (async()=>{try{let r=await fetch(`${TMDB_BASE}/movie/${cur.tmdb_id}/recommendations?api_key=${apiKey}&language=en-US`);let d=await r.json();let items=(d.results||[]).filter(m=>m.poster_path).slice(0,12);if(!items.length){r=await fetch(`${TMDB_BASE}/movie/${cur.tmdb_id}/similar?api_key=${apiKey}&language=en-US`);d=await r.json();items=(d.results||[]).filter(m=>m.poster_path).slice(0,12);}if(!dead)setRelated(items);}catch{}})();
    return()=>{dead=true;};
  },[idx,apiKey]); // eslint-disable-line

  useEffect(()=>{if(desktop)return;const po=document.body.style.overflow,pe=document.documentElement.style.overflow;document.body.style.overflow="hidden";document.documentElement.style.overflow="hidden";return()=>{document.body.style.overflow=po;document.documentElement.style.overflow=pe;};},[desktop]);

  // Electron download progress
  useEffect(()=>{if(!IS_ELECTRON||!window.electronAPI?.onDownloadProgress)return;const unsub=window.electronAPI.onDownloadProgress(p=>{setDlProgress(p);if(p>=100)setTimeout(()=>{setDownloading(false);setDlProgress(0);},1200);});return()=>unsub?.();},[]);

  const showToast=useCallback((msg,ms=2200)=>{setToast(msg);setTimeout(()=>setToast(null),ms);},[]);
  const firstInteract=useCallback(()=>{if(!hadInteract.current){hadInteract.current=true;setInteracted(true);}},[]);

  const goTo=useCallback(n=>{
    firstInteract();if(!canNav.current)return;
    const len=reelsRef.current.length;if(!len)return;
    const c=Math.max(0,Math.min(n,len-1));if(c===idxRef.current)return;
    const forward=c>idxRef.current;
    if(forward){if(!canUseShorts()){setShowGate("shorts");return;}incrementFreeDailyUsage("shorts");}
    if(c>idxRef.current&&!canUseShorts()){setShowGate("shorts");return;}
    canNav.current=false;idxRef.current=c;setIdx(c);setTimeout(()=>{canNav.current=true;},380);
    recordFeatureUse("shorts");
  },[firstInteract]);

  const togglePause=useCallback(()=>{
    firstInteract();
    setPaused(p=>{const next=!p;hap.light();if(!next){const key=Date.now();setFlash({type:"play",key});setTimeout(()=>setFlash(f=>f?.key===key?null:f),550);}else setFlash(null);return next;});
  },[firstInteract]);

  const isSaved=useCallback(r=>{const tid=r?.tmdb_id||r?.tmdbObj?.id;return(savedRef.current||[]).some(s=>String(s.id)===String(tid));},[]);
  const saveReel=useCallback(r=>{const item=r.tmdbObj?{...r.tmdbObj,media_type:"movie"}:{id:r.tmdb_id,title:r.title,media_type:"movie"};onSave?.(item);showToast("Saved to Watchlist");},[onSave,showToast]);
  const watchReel=useCallback((r,st)=>{const item=r.tmdbObj?{...r.tmdbObj,media_type:"movie"}:{id:r.tmdb_id,title:r.title,media_type:"movie"};if(st==="notify"){showToast(`Notify: ${r.title}`);return;}onSelect?.(item);},[onSelect,showToast]);
  // The one and only place a reel advances on its own. This is only ever
  // called by a Player reporting a real end-of-playback (YouTube state 0, or
  // the <video> element's native "ended" event) — never by a clock. If a
  // trailer runs 22 seconds, this fires at 22 seconds; if it runs 2:10, this
  // fires at 2:10. There is no other path that can trigger an unattended
  // advance, which is what made the old fixed-length timer feel like a glitch.
  const blocked=useCallback(()=>goTo(idxRef.current+1),[goTo]);
  const handleProgress=useCallback((currentTime,duration)=>{setProgress({currentTime,duration});},[]);

  const downloadReel=useCallback(()=>{
    const cur=reelsRef.current[idxRef.current];if(!cur||!IS_ELECTRON)return;
    if(!canDownload()){setShowGate("download");return;}
    setDownloading(true);setDlProgress(0);
    window.electronAPI?.downloadTrailer?.(cur.youtubeId,cur.title)?.catch(()=>{setDownloading(false);showToast("Download failed");});
  },[showToast]);

  const injectReel=useCallback(async(item,mediaType="movie")=>{
    if(!apiKey)return;showToast(`Loading ${item.title||item.name}…`);
    const insertAt=idxRef.current; // capture NOW — before any await
    try{
      const r=await fetch(`${TMDB_BASE}/${mediaType}/${item.id}/videos?api_key=${apiKey}&language=en-US`);
      const d=await r.json();const ytId=bestTrailer(d.results||[]);
      if(!ytId){showToast("No trailer found");return;}
      const reel=makeReel(item,ytId,mediaType);
      setReels(prev=>{const arr=[...prev];arr.splice(insertAt+1,0,reel);return arr;});
      await new Promise(res=>setTimeout(res,80));
      goTo(insertAt+1);
      showToast(`▶  ${reel.title}`);
    }catch{showToast("Failed to load");}
  },[apiKey,goTo,showToast]);

  const handleSearchSelect=useCallback(item=>{setSearchOpen(false);injectReel(item,item.media_type==="tv"?"tv":"movie");},[injectReel]);
  const handleRelatedSelect=useCallback(item=>{setShowInfo(false);injectReel(item,"movie");},[injectReel]);

  // Load
  useEffect(()=>{if(!apiKey)return;let dead=false;setLoading(true);fetchReels(apiKey,14).then(d=>{if(!dead){setReels(d);setLoading(false);}}).catch(()=>{if(!dead)setLoading(false);});return()=>{dead=true;};},[apiKey]);
  useEffect(()=>{
    if(moreLoad||!reels.length||idx<reels.length-4)return;setMoreLoad(true);
    fetchReels(apiKey,10).then(d=>{setReels(p=>{const have=new Set(p.map(x=>x.tmdb_id));return[...p,...d.filter(x=>!have.has(x.tmdb_id))];});setMoreLoad(false);}).catch(()=>setMoreLoad(false));
  },[idx,reels.length,moreLoad]); // eslint-disable-line

  // Keyboard
  useEffect(()=>{
    const h=e=>{if(e.key==="ArrowDown"||e.key==="j")goTo(idxRef.current+1);if(e.key==="ArrowUp"||e.key==="k")goTo(idxRef.current-1);if(e.key==="m")setMuted(v=>!v);if(e.key==="i")setShowInfo(v=>!v);if(e.key==="/"){e.preventDefault();setSearchOpen(true);}if(e.key===" "){e.preventDefault();togglePause();}};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[goTo,togglePause]);

  // Desktop wheel
  useEffect(()=>{
    const el=containerRef.current;if(!el||!desktop)return;
    const fn=e=>{e.preventDefault();if(wheelLock.current||Math.abs(e.deltaY)<30)return;wheelLock.current=true;hap.light();goTo(idxRef.current+(e.deltaY>0?1:-1));setTimeout(()=>{wheelLock.current=false;},680);};
    el.addEventListener("wheel",fn,{passive:false});return()=>el.removeEventListener("wheel",fn);
  },[goTo,desktop]);

  // Smart mobile touch — velocity + peek
  useEffect(()=>{
    if(desktop)return;const el=containerRef.current;if(!el)return;
    const g={on:false,x0:0,y0:0,x1:0,y1:0,t0:0,dir:null};
    const onStart=e=>{if(e.target.closest("button,a,[data-ns]"))return;if(e.touches.length!==1)return;firstInteract();const t=e.touches[0];g.on=true;g.dir=null;g.x0=g.x1=t.clientX;g.y0=g.y1=t.clientY;g.t0=Date.now();setSnapAnim(false);};
    const onMove=e=>{if(!g.on)return;e.preventDefault();const t=e.touches[0];g.x1=t.clientX;g.y1=t.clientY;const dx=g.x1-g.x0,dy=g.y1-g.y0;if(!g.dir&&(Math.abs(dx)>10||Math.abs(dy)>10)){const angle=Math.atan2(Math.abs(dx),Math.abs(dy))*180/Math.PI;g.dir=angle<DIR_LOCK_DEG?"v":"h";}if(g.dir==="v"){const screen=window.innerHeight,soft=screen*0.28,abs=Math.abs(dy),resist=abs<soft?abs:soft+(abs-soft)*DRAG_RESIST;setPeekY(Math.sign(dy)*resist);}else if(g.dir==="h"){setSwipe({dir:dx>0?"right":"left",opacity:Math.min(Math.abs(dx)/110,1)});}};
    const onEnd=()=>{
      if(!g.on)return;g.on=false;setSwipe({dir:null,opacity:0});
      const dx=g.x1-g.x0,dy=g.y1-g.y0,dt=Math.max(Date.now()-g.t0,1),vel=Math.abs(dy)/dt;
      setSnapAnim(true);
      if(g.dir==="v"){const snap=Math.abs(dy)>SWIPE_Y_PX||vel>SWIPE_Y_VEL;requestAnimationFrame(()=>{setPeekY(0);if(snap){hap.light();goTo(idxRef.current+(dy<0?1:-1));}});}
      else if(g.dir==="h"&&dx>SWIPE_X_PX){const r=reelsRef.current[idxRef.current];if(r&&!isSaved(r)){hap.save();saveReel(r);setSaveFlash(true);setTimeout(()=>setSaveFlash(false),700);}}
      else if(g.dir==="h"&&dx<-SWIPE_X_PX){hap.light();goTo(idxRef.current-1);}
      else if(!g.dir){const now=Date.now(),last=lastTap.current,dist=Math.hypot(g.x1-last.x,g.y1-last.y);if(now-last.t<TAP_MS&&dist<TAP_PX){lastTap.current={t:0,x:0,y:0};const key=now;setBurst({x:g.x1,y:g.y1,key});setTimeout(()=>setBurst(b=>b?.key===key?null:b),650);const r=reelsRef.current[idxRef.current];if(r){hap.save();saveReel(r);setSaveFlash(true);setTimeout(()=>setSaveFlash(false),700);}}else{lastTap.current={t:now,x:g.x1,y:g.y1};togglePause();}}
      g.dir=null;
    };
    el.addEventListener("touchstart",onStart,{passive:true});el.addEventListener("touchmove",onMove,{passive:false});el.addEventListener("touchend",onEnd,{passive:true});el.addEventListener("touchcancel",onEnd,{passive:true});
    return()=>{el.removeEventListener("touchstart",onStart);el.removeEventListener("touchmove",onMove);el.removeEventListener("touchend",onEnd);el.removeEventListener("touchcancel",onEnd);};
  },[desktop,goTo,firstInteract,isSaved,saveReel,togglePause]); // eslint-disable-line

  const nav=id=>id==="search"?setSearchOpen(true):onNavigate?.(id);
  const visible=i=>i>=idx-1&&i<=idx+2;
  const cur=reels[idx]??null;const curSaved=cur?isSaved(cur):false;const nextReel=reels[idx+1]??null;

  const G=`
    @keyframes ns-spin{to{transform:rotate(360deg)}}
    @keyframes ns-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    @keyframes ns-fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes ns-slide-up{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes ns-flash-ping{0%{opacity:0;transform:scale(0.6)}30%{opacity:1;transform:scale(1.12)}100%{opacity:0;transform:scale(1.3)}}
    @keyframes ns-pause-in{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}
    @keyframes ns-burst-ping{0%{opacity:0;transform:translate(-50%,-50%) scale(0.4)}25%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.3)}}
    @keyframes ns-hintfade{0%{opacity:0}10%{opacity:1}80%{opacity:1}100%{opacity:0}}
    @keyframes ns-toast-in{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
    @keyframes ns-flash{0%{opacity:0}15%{opacity:1}70%{opacity:.5}100%{opacity:0}}
    @keyframes ns-bar-pulse{0%,100%{transform:scaleY(0.35)}50%{transform:scaleY(1)}}
    .ns-ab-c{transition:background 0.15s !important}
    ::-webkit-scrollbar{display:none}
  `;

  const spinner=(
    <div style={{position:"absolute",inset:0,zIndex:5,background:"linear-gradient(120deg,#0a0a0a 25%,#141414 50%,#0a0a0a 75%)",backgroundSize:"400% 400%",animation:"ns-shimmer 1.8s ease infinite",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <div style={{width:42,height:42,borderRadius:"50%",border:"2.5px solid rgba(255,255,255,0.06)",borderTopColor:"#00b4a6",animation:"ns-spin 0.8s linear infinite"}}/>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:3,color:"rgba(255,255,255,0.12)",textTransform:"uppercase"}}>Loading</span>
      </div>
    </div>
  );

  // ═══ DESKTOP ═══════════════════════════════════════════════════════════════
  if(desktop){
    return(
      <div ref={containerRef} style={{position:"fixed",top:0,bottom:0,left:"var(--sidebar,54px)",right:0,background:"#0f0f0f",display:"flex",flexDirection:"column",fontFamily:"'DM Sans','Helvetica Neue',sans-serif",overflow:"hidden"}}>
        <style>{G}</style>
        <PushAd planId={planId} />{/* <PopunderAd /> */}
        {/* Header */}
        <div style={{height:HEADER_H,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",borderBottom:"1px solid rgba(255,255,255,0.07)",background:"#0f0f0f",zIndex:10}}>
          <button onClick={()=>nav("home")} style={{all:"unset",display:"flex",alignItems:"center",gap:10,cursor:"pointer",color:"rgba(255,255,255,0.7)",fontSize:14,fontWeight:500,padding:"6px 10px 6px 6px",borderRadius:8,transition:"color 0.15s,background 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.color="#fff";e.currentTarget.style.background="rgba(255,255,255,0.06)";}} onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.7)";e.currentTarget.style.background="transparent";}}>
            <svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{display:"flex",alignItems:"center",gap:10,position:"absolute",left:"50%",transform:"translateX(-50%)"}}>
            <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:19,letterSpacing:2.5,color:"#fff"}}><span style={{color:"#00b4a6"}}>NS</span> Shorts</span>
            <span style={{fontSize:9,fontWeight:800,letterSpacing:1,background:"linear-gradient(135deg,#f5a623,#e74c3c)",borderRadius:4,padding:"2px 6px",color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>WORLD</span>
          </div>
          <div style={{display:"flex",gap:4}}>
            {[{icon:muted?<svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>:<svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>,active:!muted,action:()=>{setMuted(m=>!m);firstInteract();}},
              {icon:<svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,action:()=>setSearchOpen(true)},
            ].map((b,i)=>(
              <button key={i} onClick={b.action} style={{all:"unset",width:TARGET_SM,height:TARGET_SM,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:b.active?"#00b4a6":"rgba(255,255,255,0.7)",transition:"background 0.15s,color 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{b.icon}</button>
            ))}
          </div>
        </div>
        {/* Main */}
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:20}}>
            {/* Video card */}
            <div style={{flexShrink:0}}>
              <div onClick={e=>{if(e.target.closest("button,a,[data-ns]"))return;togglePause();}} style={{position:"relative",height:`min(calc(100vh - ${HEADER_H}px - 32px), 720px)`,aspectRatio:"9/16",borderRadius:12,overflow:"hidden",background:"#000",cursor:"pointer"}}>
                {showGate&&<PremiumGate feature={showGate} onClose={()=>setShowGate(null)}/>}
      {loading&&spinner}
                {!loading&&reels.map((r,i)=>{
                  if(!visible(i))return null;
                  return(
                    <div key={`${r.id}-${i}`} style={{position:"absolute",inset:0,transform:`translateY(${(i-idx)*100}%)`,transition:"transform 0.34s cubic-bezier(0.4,0,0.2,1)",willChange:"transform",zIndex:i===idx?2:1}}>
                      <Player videoId={r.youtubeId} active={i===idx} muted={muted} paused={i===idx?paused:false} onBlocked={i===idx?blocked:undefined} onProgress={i===idx?handleProgress:undefined} backdrop={r.backdrop} poster={r.poster} preload={i===idx+1}/>
                      {i===idx&&paused&&<PauseFlash state={{type:"pause",key:"persist",persistent:true}}/>}
                      {i===idx&&flash&&<PauseFlash state={flash}/>}
                      {i===idx&&cur&&(
                        <div style={{position:"absolute",bottom:0,left:0,right:0,zIndex:20,padding:"80px 14px 14px",pointerEvents:"none",animation:"ns-fadein 0.35s ease both",background:"linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.6) 40%,transparent 75%)"}}>
                          <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:8,pointerEvents:"auto"}}>
                            <div style={{width:32,height:32,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:"rgba(255,255,255,0.1)",border:"1.5px solid rgba(255,255,255,0.15)"}}>{cur.poster&&<img src={imgSrc(cur.poster,"w92")} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}</div>
                            <span style={{fontWeight:700,fontSize:13,color:"#fff",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cur.title}</span>
                            <WatchBtn reel={cur} onClick={watchReel}/>
                          </div>
                          {cur.overview&&<p style={{fontSize:12,color:"rgba(255,255,255,0.62)",lineHeight:1.45,margin:"0 0 7px",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{cur.overview}</p>}
                          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                            {cur.genres.map(g=><span key={g} style={{fontSize:12,fontWeight:600,color:"#00b4a6"}}>#{g.toLowerCase().replace(/ /g,"-")}</span>)}
                            {cur.rating&&<span style={{fontSize:12,fontWeight:600,color:"rgba(241,196,15,0.85)"}}>★{cur.rating}</span>}
                          </div>
                        </div>
                      )}
                      {i===idx&&<InfoSheet reel={cur} visible={showInfo} onClose={()=>setShowInfo(false)} related={related} onRelatedSelect={handleRelatedSelect}/>}
                    </div>
                  );
                })}
                <ProgressBar active={!loading&&reels.length>0} currentTime={progress.currentTime} duration={progress.duration}/>
              </div>
            </div>
            {/* Action rail */}
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20,paddingBottom:16,flexShrink:0}}>
              <ActionBtn active={curSaved} label={curSaved?"Saved":"Save"} icon={curSaved?<svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="#00b4a6"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>:<svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.87)" strokeWidth="1.8" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>} onClick={()=>{hap.save();if(cur)saveReel(cur);}}/>
              <ActionBtn active={showInfo} label="Details" icon={<svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.87)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>} onClick={()=>setShowInfo(v=>!v)}/>
              {IS_ELECTRON&&<ActionBtn active={downloading} label={downloading?`${dlProgress||0}%`:"Download"} icon={downloading?<svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="#00e5cc" strokeWidth="2" strokeLinecap="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>:<svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.87)" strokeWidth="1.8" strokeLinecap="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>} onClick={downloadReel}/>}
              {nextReel&&<button onClick={()=>goTo(idx+1)} style={{all:"unset",cursor:"pointer",marginTop:4}}><div style={{width:THUMB_W,height:THUMB_H,borderRadius:7,overflow:"hidden",background:"#222",border:"1.5px solid rgba(255,255,255,0.12)",position:"relative",transition:"border-color 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(0,180,166,0.5)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"}>{nextReel.poster&&<img src={imgSrc(nextReel.poster,"w92")} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"center",justifyContent:"center"}}><svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="white" opacity="0.8"><path d="M8 5v14l11-7z"/></svg></div></div></button>}
            </div>
            {/* Nav arrows */}
            <div style={{display:"flex",flexDirection:"column",gap:10,paddingBottom:16,flexShrink:0}}>
              <NavBtn dir="up" disabled={idx===0||loading} onClick={()=>{hap.light();goTo(idx-1);}}/>
              <NavBtn dir="down" disabled={idx>=reels.length-1||loading} onClick={()=>{hap.light();goTo(idx+1);}}/>
            </div>
          </div>
          {!interacted&&!loading&&reels.length>0&&<div style={{position:"absolute",bottom:18,left:"50%",transform:"translateX(-50%)",zIndex:40,pointerEvents:"none",display:"flex",alignItems:"center",gap:10,background:"rgba(10,10,10,0.88)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:20,padding:"8px 18px",animation:"ns-hintfade 5s ease 1s both",whiteSpace:"nowrap"}}><span style={{fontSize:11,color:"rgba(255,255,255,0.65)",fontFamily:"'DM Sans',sans-serif"}}>Scroll or ↑ ↓ to browse · Click to pause · / to search</span></div>}
          {!loading&&!reels.length&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}><svg style={{width:40,height:40}} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:2,color:"rgba(255,255,255,0.12)"}}>No Shorts</span></div>}
        </div>
        {toast&&<div style={{position:"fixed",top:20,right:20,zIndex:100,maxWidth:280,background:"rgba(10,10,10,0.92)",border:"1px solid rgba(0,180,166,0.2)",borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:8,animation:"ns-toast-in 0.22s cubic-bezier(.34,1.4,.64,1) both"}}><svg style={{width:ICON_XS,height:ICON_XS,flexShrink:0}} viewBox="0 0 24 24" fill="#00b4a6"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg><span style={{flex:1,fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:0.8,color:"#00b4a6",textTransform:"uppercase"}}>{toast}</span><button onClick={()=>setToast(null)} style={{all:"unset",cursor:"pointer",color:"rgba(255,255,255,0.4)",flexShrink:0,display:"flex"}}><svg style={{width:11,height:11}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>}
        {moreLoad&&<div style={{position:"fixed",bottom:20,right:20,zIndex:10,pointerEvents:"none"}}><div style={{width:18,height:18,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.06)",borderTopColor:"#00b4a6",animation:"ns-spin 0.8s linear infinite"}}/></div>}
        {IS_ELECTRON&&downloading&&dlProgress>0&&<div style={{position:"fixed",bottom:0,left:"var(--sidebar,54px)",right:0,height:2,background:"rgba(255,255,255,0.06)",zIndex:200}}><div style={{height:"100%",width:`${dlProgress}%`,background:"linear-gradient(90deg,#00b4a6,#00d4ff)",transition:"width 0.3s ease"}}/></div>}
        {showGate && <PremiumGate feature={showGate} onClose={()=>setShowGate(null)} />}
        <SearchOverlay open={searchOpen} apiKey={apiKey} onClose={()=>setSearchOpen(false)} onAddToMain={handleSearchSelect}/>
      </div>
    );
  }

  // ═══ MOBILE ═════════════════════════════════════════════════════════════════
  return createPortal(
    <div ref={containerRef} style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#000",overflow:"hidden",touchAction:"none",overscrollBehavior:"none",userSelect:"none",WebkitUserSelect:"none",fontFamily:"'DM Sans','Helvetica Neue',sans-serif",zIndex:2147483647}}>
      <style>{`${G} .ns-mob-rail{position:absolute;right:8px;bottom:calc(100px + env(safe-area-inset-bottom));z-index:30;display:flex;flex-direction:column;align-items:center;gap:18px;touch-action:none;} .ns-mob-info{position:absolute;bottom:0;left:0;right:60px;z-index:30;padding:0 14px calc(72px + env(safe-area-inset-bottom)) 16px;pointer-events:none;box-sizing:border-box;} .ns-mob-topbtn{touch-action:manipulation;}`}</style>
      <PushAd planId={planId} />{/* <PopunderAd /> */}
      {showGate&&<PremiumGate feature={showGate} onClose={()=>setShowGate(null)}/>}
      {loading&&spinner}
      {!loading&&reels.map((r,i)=>{
        if(!visible(i))return null;
        const isA=i===idx,rSaved=isSaved(r);
        return(
          <div key={`${r.id}-${i}`} style={{position:"absolute",inset:0,transform:`translateY(calc(${(i-idx)*100}% + ${peekY}px))`,transition:snapAnim?"transform 0.32s cubic-bezier(0.4,0,0.2,1)":"none",willChange:"transform",zIndex:isA?2:1}}>
            <Player videoId={r.youtubeId} active={isA} muted={muted} paused={isA?paused:false} onBlocked={isA?blocked:undefined} onProgress={isA?handleProgress:undefined} backdrop={r.backdrop} poster={r.poster} preload={i===idx+1}/>
            <ProgressBar active={isA} currentTime={isA?progress.currentTime:0} duration={isA?progress.duration:0}/>
            <SwipeHint dir={isA?swipe.dir:null} opacity={isA?swipe.opacity:0}/>
            {isA&&saveFlash&&<div style={{position:"absolute",inset:0,zIndex:66,pointerEvents:"none",background:"rgba(0,180,166,0.08)",animation:"ns-flash 0.6s ease both"}}/>}
            {isA&&paused&&<PauseFlash state={{type:"pause",key:"persist",persistent:true}}/>}
            {isA&&flash&&<PauseFlash state={flash}/>}
            {isA&&burst&&<BurstPing x={burst.x} y={burst.y}/>}
            {/* Mobile rail */}
            <div className="ns-mob-rail" data-ns onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
              <MobBtn active={rSaved} label={rSaved?"Saved":"Save"} onClick={()=>{hap.save();saveReel(r);}}>
                {rSaved?<svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="#00b4a6"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>:<svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>}
              </MobBtn>
              <MobBtn active={false} label={muted?"Unmute":"Mute"} onClick={()=>{hap.light();setMuted(m=>!m);firstInteract();}}>
                {muted?<svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>:<svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>}
              </MobBtn>
              <MobBtn active={isA&&showInfo} label="Info" onClick={()=>{if(isA){hap.light();setShowInfo(v=>!v);}}}>
                <svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke={isA&&showInfo?"#00b4a6":"rgba(255,255,255,0.9)"} strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </MobBtn>
              {IS_ELECTRON&&<MobBtn active={downloading} label={downloading?`${dlProgress||0}%`:"Download"} onClick={()=>{if(isA)downloadReel();}}>
                {downloading?<svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="#00e5cc" strokeWidth="2" strokeLinecap="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>:<svg style={{width:ICON_MD,height:ICON_MD}} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>}
              </MobBtn>}
            </div>
            {/* Caption */}
            <div className="ns-mob-info">
              <div style={{display:"flex",gap:5,marginBottom:6,flexWrap:"wrap",alignItems:"center"}}>
                {r.genres.slice(0,2).map(g=><span key={g} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"3px 9px",fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.65)",letterSpacing:0.8,textTransform:"uppercase",fontFamily:"'DM Mono',monospace"}}>{g}</span>)}
                {r.rating&&<span style={{background:"rgba(241,196,15,0.07)",border:"1px solid rgba(241,196,15,0.2)",borderRadius:20,padding:"3px 8px",fontSize:9,fontWeight:700,color:"#f1c40f",fontFamily:"'DM Mono',monospace"}}>★ {r.rating}</span>}
              </div>
              <h2 style={{margin:"0 0 9px",fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(18px,5.5vw,26px)",fontWeight:400,letterSpacing:1,lineHeight:1.1,color:"#fff",textShadow:"0 2px 18px rgba(0,0,0,0.92)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",animation:isA?"ns-fadein 0.4s ease both":"none"}}>{r.title}</h2>
              <div style={{pointerEvents:"auto"}}>{isA&&<WatchBtn reel={r} onClick={watchReel}/>}</div>
            </div>
            {isA&&<InfoSheet reel={r} visible={showInfo} onClose={()=>setShowInfo(false)} related={related} onRelatedSelect={handleRelatedSelect}/>}
            {/* Mobile dock overlay */}
            {isA&&showDock&&(
              <div style={{position:"absolute",bottom:0,left:0,right:0,zIndex:75,background:"rgba(0,0,0,0.94)",backdropFilter:"blur(16px)",padding:"14px 16px calc(80px + env(safe-area-inset-bottom))",animation:"ns-slide-up 0.25s cubic-bezier(0.22,1,0.36,1) both"}} data-ns onClick={e=>e.stopPropagation()}>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:"rgba(255,255,255,0.2)",textTransform:"uppercase",fontFamily:"'DM Mono',monospace",marginBottom:10}}>Queue · {idx+1} / {reels.length}</div>
                <div style={{display:"flex",gap:6,overflowX:"auto",scrollbarWidth:"none"}}>
                  {reels.map((rr,ii)=>(
                    <button key={`dk-${rr.id}-${ii}`} onClick={()=>{hap.light();goTo(ii);setShowDock(false);}} style={{all:"unset",cursor:"pointer",flexShrink:0,width:DOCK_W,height:DOCK_H,borderRadius:6,overflow:"hidden",background:"#1a1a1a",border:`1.5px solid ${ii===idx?"#00b4a6":"rgba(255,255,255,0.07)"}`,transform:ii===idx?"scale(1.1)":"scale(1)",transition:"border-color 0.15s,transform 0.15s",position:"relative"}}>
                      {(rr.poster||rr.backdrop)&&<img src={imgSrc(rr.poster||rr.backdrop,"w92")} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
                      {ii===idx&&<div style={{position:"absolute",inset:0,background:"rgba(0,180,166,0.22)"}}/>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {/* Mobile top bar — search + dock buttons use pointerUp+stopPropagation the
          same way MobBtn does, so a tap starting on them can't be swallowed by
          the full-screen gesture layer's touch-action:none siblings. Padding-top
          adds the device's safe-area inset so these buttons clear a notch or
          Dynamic Island instead of sitting under it. */}
      <div style={{position:"absolute",top:0,left:0,right:0,zIndex:50,background:"linear-gradient(to bottom,rgba(0,0,0,0.72) 0%,transparent 100%)",pointerEvents:"none"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"calc(14px + env(safe-area-inset-top)) 14px 32px",pointerEvents:"auto"}}>
          <button
            className="ns-mob-topbtn"
            onPointerDown={e=>e.stopPropagation()}
            onPointerUp={e=>{e.stopPropagation();nav("home");}}
            onTouchStart={e=>e.stopPropagation()}
            onTouchEnd={e=>e.stopPropagation()}
            onClick={e=>{e.stopPropagation();nav("home");}}
            style={{all:"unset",width:TARGET_SM,height:TARGET_SM,borderRadius:"50%",background:"rgba(0,0,0,0.38)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"rgba(255,255,255,0.9)"}}>
            <svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{display:"flex",alignItems:"center",gap:7,pointerEvents:"none"}}><span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:19,letterSpacing:2.5,color:"#fff"}}><span style={{color:"#00b4a6"}}>NS</span> Shorts</span><span style={{fontSize:8,fontWeight:800,letterSpacing:0.8,background:"linear-gradient(135deg,#f5a623,#e74c3c)",borderRadius:4,padding:"2px 5px",color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>WORLD</span></div>
          <div style={{display:"flex",gap:6}}>
            <button
              className="ns-mob-topbtn"
              onPointerDown={e=>e.stopPropagation()}
              onPointerUp={e=>{e.stopPropagation();setShowDock(v=>!v);}}
              onTouchStart={e=>e.stopPropagation()}
              onTouchEnd={e=>e.stopPropagation()}
              onClick={e=>{e.stopPropagation();setShowDock(v=>!v);}}
              style={{all:"unset",width:TARGET_SM,height:TARGET_SM,borderRadius:"50%",background:"rgba(0,0,0,0.38)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"rgba(255,255,255,0.9)"}}>
              <svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
            <button
              className="ns-mob-topbtn"
              onPointerDown={e=>e.stopPropagation()}
              onPointerUp={e=>{e.stopPropagation();setSearchOpen(true);}}
              onTouchStart={e=>e.stopPropagation()}
              onTouchEnd={e=>{e.stopPropagation();setSearchOpen(true);}}
              onClick={e=>{e.stopPropagation();setSearchOpen(true);}}
              style={{all:"unset",width:TARGET_SM,height:TARGET_SM,borderRadius:"50%",background:"rgba(0,0,0,0.38)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"rgba(255,255,255,0.9)"}}>
              <svg style={{width:ICON_SM,height:ICON_SM}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
          </div>
        </div>
      </div>
      {!interacted&&!loading&&reels.length>0&&(
        <div style={{position:"absolute",bottom:170,left:"50%",transform:"translateX(-50%)",zIndex:60,pointerEvents:"none",display:"flex",flexDirection:"column",gap:9,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(14px)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:16,padding:"14px 20px",animation:"ns-hintfade 5.5s ease 1s both",minWidth:210}}>
          <GestureRow icon="updown" text="Swipe up / down to browse"/>
          <GestureRow icon="right"  text="Swipe right to save"/>
          <GestureRow icon="tap"    text="Tap to pause / play"/>
          <GestureRow icon="doubletap" text="Double-tap for quick save"/>
        </div>
      )}
      {toast&&<div style={{position:"absolute",top:72,left:"50%",transform:"translateX(-50%)",zIndex:75,pointerEvents:"none",background:"rgba(5,5,5,0.9)",border:"1px solid rgba(0,180,166,0.2)",borderRadius:8,padding:"9px 18px",display:"flex",alignItems:"center",gap:8,animation:"ns-fadein 0.2s ease both",whiteSpace:"nowrap"}}><svg style={{width:ICON_XS,height:ICON_XS}} viewBox="0 0 24 24" fill="#00b4a6"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg><span style={{fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:0.8,color:"#00b4a6",textTransform:"uppercase"}}>{toast}</span></div>}
      {moreLoad&&<div style={{position:"absolute",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:50,pointerEvents:"none"}}><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.06)",borderTopColor:"#00b4a6",animation:"ns-spin 0.8s linear infinite"}}/></div>}
      {IS_ELECTRON&&downloading&&dlProgress>0&&<div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:"rgba(255,255,255,0.06)",zIndex:200}}><div style={{height:"100%",width:`${dlProgress}%`,background:"linear-gradient(90deg,#00b4a6,#00d4ff)",transition:"width 0.3s ease"}}/></div>}
      {showGate && <PremiumGate feature={showGate} onClose={()=>setShowGate(null)} />}
      <SearchOverlay open={searchOpen} apiKey={apiKey} onClose={()=>setSearchOpen(false)} onAddToMain={handleSearchSelect}/>
    </div>,
    document.body
  );
}