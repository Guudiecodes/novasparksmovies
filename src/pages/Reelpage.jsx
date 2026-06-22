/**
 * ReelPage.jsx — NovaSpark Shorts
 * Desktop: Pixel-accurate YouTube Shorts layout — portrait card, circular action rail, nav arrow
 * Mobile:  Full-screen vertical swipe (TikTok/YT Shorts mobile) — rendered via a body portal so it
 *          always sits above (and fully covers) the app's topbar / sidebar / bottom-nav, regardless
 *          of how those are mounted. Unmounting this page automatically restores them — no other
 *          file needs to change.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const TMDB_BASE    = "https://api.themoviedb.org/3";
const TMDB_IMG     = "https://image.tmdb.org/t/p";
const SHARE_BASE   = "https://novasparks-gen.vercel.app";
const START_OFFSET = 30;
const CLIP_END     = 60;
const NINETY_DAYS  = 90 * 24 * 60 * 60 * 1000;
const IS_ELECTRON  = typeof window !== "undefined" && !!window.electronAPI;
const HEADER_H     = 56;   // px — matches YouTube header height

// ─── UTILS ───────────────────────────────────────────────────────────────────
function fmtCount(n) {
  if (!n) return "0";
  if (n >= 1e6)  return (n/1e6).toFixed(1).replace(".0","") + "M";
  if (n >= 1000) return (n/1000).toFixed(1).replace(".0","") + "K";
  return n.toLocaleString();
}
function getWatchState(reel) {
  if (!reel?.release_date) return "watch";
  const d = new Date(reel.release_date).getTime() - Date.now();
  if (d > NINETY_DAYS) return "coming_soon";
  if (d > 0)           return "notify";
  return "watch";
}
function formatDate(s) { return s ? new Date(s).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) : ""; }
function buildYTSrc(id) {
  return "https://www.youtube.com/embed/" + id + "?" + new URLSearchParams({
    autoplay:"1",mute:"1",controls:"0",modestbranding:"1",rel:"0",
    showinfo:"0",iv_load_policy:"3",disablekb:"1",fs:"0",playsinline:"1",
    enablejsapi:"1",start:String(START_OFFSET),end:String(CLIP_END),
    hl:"en",cc_lang_pref:"en",cc_load_policy:"0",vq:"small",
  });
}
function imgSrc(path, size="w342") { return path ? `${TMDB_IMG}/${size}${path}` : null; }
function ytMsg(ifr, obj) { try { ifr?.contentWindow?.postMessage(JSON.stringify(obj),"*"); } catch {} }
function shuffle(arr, seed) {
  const a=[...arr]; let s=seed>>>0;
  for(let i=a.length-1;i>0;i--){s=Math.imul(s^(s>>>15),s|1);s^=s+Math.imul(s^(s>>>7),s|61);[a[i],a[(s>>>0)%(i+1)]]=[a[(s>>>0)%(i+1)],a[i]];}
  return a;
}

// ─── SESSION POOL ─────────────────────────────────────────────────────────────
const _seen=new Set(),_seenM=new Set(),_pool=[];
let _fetch=false;
const _SEED=Date.now(),_pg=[1,1,1,1,1];
const SOURCES=[
  (k,p)=>`${TMDB_BASE}/trending/movie/week?api_key=${k}&page=${p}&language=en-US`,
  (k,p)=>`${TMDB_BASE}/movie/popular?api_key=${k}&page=${p}&language=en-US`,
  (k,p)=>`${TMDB_BASE}/movie/top_rated?api_key=${k}&page=${p}&language=en-US`,
  (k,p)=>`${TMDB_BASE}/movie/upcoming?api_key=${k}&page=${p}&language=en-US`,
  (k,p)=>`${TMDB_BASE}/movie/now_playing?api_key=${k}&page=${p}&language=en-US`,
];
const GENRES={28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",878:"Sci-Fi",53:"Thriller",10752:"War",37:"Western"};
function bestTrailer(vids) {
  const r=(vids||[]).filter(v=>v.site==="YouTube"&&v.key&&(v.iso_639_1==="en"||!v.iso_639_1)&&(v.type==="Trailer"||v.type==="Teaser"));
  return r.find(v=>v.type==="Trailer"&&v.official&&v.iso_639_1==="en")?.key||r.find(v=>v.type==="Trailer"&&v.iso_639_1==="en")?.key||r.find(v=>v.type==="Teaser"&&v.iso_639_1==="en")?.key||r.find(v=>v.iso_639_1==="en")?.key||null;
}
async function fillPool(key) {
  if(_fetch)return;_fetch=true;
  try {
    const si=Math.floor(Math.random()*SOURCES.length),pg=_pg[si]++;
    let movies=[];
    try{const r=await fetch(SOURCES[si](key,pg));if(r.ok){const d=await r.json();movies=(d.results||[]).filter(m=>m.original_language==="en"&&!_seenM.has(m.id));}}catch{}
    if(!movies.length)return;
    movies.forEach(m=>_seenM.add(m.id));
    const items=[];
    for(let i=0;i<movies.length;i+=5){
      const s=await Promise.allSettled(movies.slice(i,i+5).map(m=>fetch(`${TMDB_BASE}/movie/${m.id}/videos?api_key=${key}&language=en-US`).then(r=>r.ok?r.json():{results:[]}).then(d=>({m,v:d.results||[]})).catch(()=>({m,v:[]}))));
      for(const r of s){if(r.status!=="fulfilled")continue;const{m,v}=r.value;const ytId=bestTrailer(v);if(!ytId||_seen.has(ytId))continue;items.push({id:ytId,youtubeId:ytId,tmdb_id:m.id,title:m.title||m.original_title||"Untitled",overview:m.overview||"",genres:(m.genre_ids||[]).slice(0,2).map(id=>GENRES[id]).filter(Boolean),rating:m.vote_average?+m.vote_average.toFixed(1):null,release_date:m.release_date||null,backdrop:m.backdrop_path||null,poster:m.poster_path||null,tmdbObj:m,watchingNow:100+((m.id*137)%1800),likes:Math.floor(5000+Math.random()*95000),_score:(m.vote_average||5)*Math.log((m.vote_count||1)+1)});}
    }
    if(!items.length)return;
    _pool.push(...shuffle(items,_SEED^(_pool.length*2654435761)).sort((a,b)=>b._score-a._score));
  } finally{_fetch=false;}
}
async function fetchReels(key,n=12){
  for(let a=0;a<4&&_pool.length<n;a++){await fillPool(key);if(!_pool.length)await new Promise(r=>setTimeout(r,600));}
  const out=[];while(out.length<n&&_pool.length>0){const r=_pool.shift();if(_seen.has(r.id))continue;_seen.add(r.id);out.push(r);}
  if(_pool.length<15)setTimeout(()=>fillPool(key),200);
  return out;
}

// ─── HAPTICS ──────────────────────────────────────────────────────────────────
const hap={
  light:()=>{try{navigator.vibrate?.(8);}catch{}},
  save: ()=>{try{navigator.vibrate?.([15,30,60]);}catch{}},
};

// ─── SHARE ───────────────────────────────────────────────────────────────────
async function doShare(reel){
  const url=reel.tmdb_id?`${SHARE_BASE}/reel?v=${reel.tmdb_id}`:SHARE_BASE;
  if(navigator.share){try{await navigator.share({title:reel.title,url});return "shared";}catch(e){if(e.name==="AbortError")return "aborted";}}
  try{await navigator.clipboard.writeText(url);return "copied";}catch{return "failed";}
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
function ProgressBar({active,onComplete}){
  const [pct,set]=useState(0),raf=useRef(null),t0=useRef(null),done=useRef(false);
  useEffect(()=>{
    cancelAnimationFrame(raf.current);
    if(!active){set(0);done.current=false;return;}
    done.current=false;t0.current=performance.now();
    const tick=now=>{const n=Math.min(((now-t0.current)/30000)*100,100);set(n);if(n>=100){if(!done.current){done.current=true;onComplete?.();}}else raf.current=requestAnimationFrame(tick);};
    raf.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf.current);
  },[active]); // eslint-disable-line
  return(
    <div style={{position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,0.12)",zIndex:30,pointerEvents:"none"}}>
      <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#00b4a6,#00d4ff)",transition:"width 0.12s linear"}}/>
    </div>
  );
}

// ─── YT PLAYER ───────────────────────────────────────────────────────────────
function WebYTPlayer({videoId,active,muted,onBlocked,backdrop,poster,preload}){
  const ifrRef=useRef(null);
  const [injected,setInjected]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [playing,setPlaying]=useState(false);
  const [spinDone,setSpinDone]=useState(false);
  const aRef=useRef(active),mRef=useRef(muted),blocked=useRef(false),psRef=useRef(-1);
  useEffect(()=>{aRef.current=active;},[active]);
  useEffect(()=>{mRef.current=muted;},[muted]);
  useEffect(()=>{if(active||preload)setInjected(true);},[active,preload]);
  useEffect(()=>{setLoaded(false);setPlaying(false);setSpinDone(false);blocked.current=false;psRef.current=-1;if(!active&&!preload)setInjected(false);},[videoId]); // eslint-disable-line
  const applyMute=useCallback(()=>{const f=ifrRef.current;if(!f)return;mRef.current?ytMsg(f,{event:"command",func:"mute",args:[]}):(ytMsg(f,{event:"command",func:"unMute",args:[]}),ytMsg(f,{event:"command",func:"setVolume",args:[100]}));},[]);
  useEffect(()=>{
    const fn=e=>{if(!e.data)return;try{const d=typeof e.data==="string"?JSON.parse(e.data):e.data;let st;if(d?.event==="onStateChange")st=d.info;if(d?.event==="infoDelivery")st=d?.info?.playerState;if(st!=null)psRef.current=st;if(st===1){if(aRef.current){setPlaying(true);setSpinDone(true);}}if(st===0&&aRef.current&&!blocked.current){blocked.current=true;setPlaying(false);onBlocked?.();}if(d?.event==="onError"&&aRef.current&&!blocked.current){blocked.current=true;onBlocked?.();}}catch{}};
    window.addEventListener("message",fn);return()=>window.removeEventListener("message",fn);
  },[onBlocked]);
  useEffect(()=>{if(!loaded||!ifrRef.current)return;const f=ifrRef.current;ytMsg(f,{event:"listening"});ytMsg(f,{event:"command",func:"addEventListener",args:["onStateChange"]});ytMsg(f,{event:"command",func:"addEventListener",args:["onError"]});},[loaded]);
  useEffect(()=>{
    if(!loaded||!ifrRef.current)return;const f=ifrRef.current;
    if(active){ytMsg(f,{event:"command",func:"playVideo",args:[]});if(psRef.current===1){setPlaying(true);setSpinDone(true);}applyMute();const t1=setTimeout(applyMute,350),t2=setTimeout(applyMute,800);return()=>{clearTimeout(t1);clearTimeout(t2);};}
    ytMsg(f,{event:"command",func:"pauseVideo",args:[]});ytMsg(f,{event:"command",func:"mute",args:[]});
  },[active,loaded,applyMute]); // eslint-disable-line
  useEffect(()=>{if(!loaded||!ifrRef.current||!active)return;applyMute();const t=setTimeout(applyMute,350);return()=>clearTimeout(t);},[muted,loaded,applyMute]); // eslint-disable-line
  useEffect(()=>{if(!active||!loaded)return;const t=setTimeout(()=>setSpinDone(true),7000);return()=>clearTimeout(t);},[active,loaded,videoId]); // eslint-disable-line
  const bg=imgSrc(backdrop,"w1280")||imgSrc(poster,"w780");
  const showCover=!(active&&playing);
  return(
    <div style={{position:"absolute",inset:0,background:"#000",overflow:"hidden"}}>
      {injected&&<iframe key={videoId} ref={ifrRef} src={buildYTSrc(videoId)} allow="autoplay;encrypted-media" allowFullScreen={false} frameBorder="0" scrolling="no" onLoad={()=>setLoaded(true)} style={{position:"absolute",top:"-22%",left:"-12%",width:"124%",height:"144%",border:"none",pointerEvents:"none",zIndex:2}}/>}
      {/* Cover image — hides YouTube UI until video plays */}
      <div style={{position:"absolute",inset:0,zIndex:5,background:bg?"none":"#111",backgroundImage:bg?`url(${bg})`:"none",backgroundSize:"cover",backgroundPosition:"center",opacity:showCover?1:0,transition:"opacity 0.4s ease",pointerEvents:"none"}}/>
      {/* Vignette */}
      <div style={{position:"absolute",inset:0,zIndex:6,pointerEvents:"none",background:"linear-gradient(to bottom,rgba(0,0,0,0.4) 0%,transparent 25%,transparent 50%,rgba(0,0,0,0.6) 75%,rgba(0,0,0,0.92) 100%)"}}/>
      {/* Spinner */}
      {active&&!spinDone&&<div style={{position:"absolute",inset:0,zIndex:25,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}><div style={{width:44,height:44,borderRadius:"50%",border:"2.5px solid rgba(255,255,255,0.08)",borderTopColor:"#00b4a6",animation:"ns-spin 0.8s linear infinite"}}/></div>}
    </div>
  );
}
function ElectronPlayer({videoId,active,muted,onBlocked,backdrop,poster,preload}){
  const vRef=useRef(null);
  const [url,setUrl]=useState(null),[playing,setPlaying]=useState(false),[spinDone,setSpinDone]=useState(false),[fetching,setFetching]=useState(false),[err,setErr]=useState(false);
  const aRef=useRef(active),idRef=useRef(videoId),blocked=useRef(false);
  useEffect(()=>{aRef.current=active;},[active]);useEffect(()=>{idRef.current=videoId;},[videoId]);
  useEffect(()=>{setUrl(null);setPlaying(false);setSpinDone(false);setFetching(false);setErr(false);blocked.current=false;if(vRef.current){vRef.current.pause();vRef.current.src="";}},[videoId]);
  useEffect(()=>{if((!active&&!preload)||url||fetching||err)return;if(!window.electronAPI?.getTrailerStream){setErr(true);return;}setFetching(true);const cid=videoId;window.electronAPI.getTrailerStream(videoId).then(r=>{if(idRef.current!==cid)return;r?.url?setUrl(r.url):(setErr(true),aRef.current&&!blocked.current&&(blocked.current=true,setTimeout(()=>onBlocked?.(),3000)));}).catch(()=>{if(idRef.current!==cid)return;setErr(true);aRef.current&&!blocked.current&&(blocked.current=true,setTimeout(()=>onBlocked?.(),3000));}).finally(()=>{if(idRef.current===cid)setFetching(false);});},[active,preload,videoId]); // eslint-disable-line
  useEffect(()=>{const v=vRef.current;if(!v||!url)return;active?v.play().catch(()=>{}):(v.pause(),v.muted=true);},[active,url]);
  useEffect(()=>{if(vRef.current)vRef.current.muted=muted;},[muted]);
  const bg=imgSrc(backdrop,"w1280")||imgSrc(poster,"w780");
  return(
    <div style={{position:"absolute",inset:0,background:"#000",overflow:"hidden"}}>
      {url&&<video ref={vRef} src={url} autoPlay muted={muted} playsInline onCanPlay={()=>setSpinDone(true)} onPlaying={()=>{setPlaying(true);setSpinDone(true);}} onEnded={()=>{aRef.current&&!blocked.current&&(blocked.current=true,setPlaying(false),onBlocked?.());}} onError={()=>{setErr(true);aRef.current&&!blocked.current&&(blocked.current=true,setTimeout(()=>onBlocked?.(),2500));}} style={{position:"absolute",top:"-22%",left:"-12%",width:"124%",height:"144%",objectFit:"cover",zIndex:2,pointerEvents:"none"}}/>}
      <div style={{position:"absolute",inset:0,zIndex:5,background:bg?"none":"#111",backgroundImage:bg?`url(${bg})`:"none",backgroundSize:"cover",backgroundPosition:"center",opacity:(active&&playing)?0:1,transition:"opacity 0.4s ease",pointerEvents:"none"}}/>
      <div style={{position:"absolute",inset:0,zIndex:6,pointerEvents:"none",background:"linear-gradient(to bottom,rgba(0,0,0,0.4) 0%,transparent 25%,transparent 50%,rgba(0,0,0,0.6) 75%,rgba(0,0,0,0.92) 100%)"}}/>
      {(fetching||(!spinDone&&active&&!err))&&<div style={{position:"absolute",inset:0,zIndex:25,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:44,height:44,borderRadius:"50%",border:"2.5px solid rgba(255,255,255,0.08)",borderTopColor:"#00b4a6",animation:"ns-spin 0.8s linear infinite"}}/></div>}
    </div>
  );
}
const Player = IS_ELECTRON ? ElectronPlayer : WebYTPlayer;

// ─── DESKTOP: Circular action button ─────────────────────────────────────────
function ActionBtn({icon, label, count, active, danger, onClick}){
  const [pop,setPop]=useState(false);
  const accentColor = danger ? "#f44" : active ? "#00b4a6" : undefined;
  return(
    <button onClick={()=>{setPop(true);setTimeout(()=>setPop(false),200);onClick?.();}}
      style={{all:"unset",display:"flex",flexDirection:"column",alignItems:"center",gap:7,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}
      onMouseEnter={e=>{e.currentTarget.querySelector(".ns-ab-circle").style.background=danger?"rgba(255,68,68,0.12)":active?"rgba(0,180,166,0.18)":"rgba(255,255,255,0.14)";}}
      onMouseLeave={e=>{e.currentTarget.querySelector(".ns-ab-circle").style.background=active?"rgba(0,180,166,0.1)":"rgba(255,255,255,0.08)";}}
    >
      <div className="ns-ab-circle" style={{width:48,height:48,borderRadius:"50%",background:active?"rgba(0,180,166,0.1)":danger?"rgba(255,68,68,0.08)":"rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",color:accentColor||"rgba(255,255,255,0.87)",transform:pop?"scale(0.82)":"scale(1)",transition:"transform 0.15s cubic-bezier(0.34,1.56,0.64,1), background 0.15s, color 0.15s",flexShrink:0}}>
        {icon}
      </div>
      {count!=null && <span style={{fontSize:13,fontWeight:600,color:accentColor||"rgba(255,255,255,0.7)",lineHeight:1,textAlign:"center",letterSpacing:0.1}}>{fmtCount(count)}</span>}
      <span style={{fontSize:12,color:accentColor||"rgba(255,255,255,0.45)",lineHeight:1,textAlign:"center"}}>{label}</span>
    </button>
  );
}

// ─── DESKTOP: Nav arrow button ────────────────────────────────────────────────
function NavBtn({dir,disabled,onClick}){
  const [hov,setHov]=useState(false);
  return(
    <button onClick={!disabled?onClick:undefined} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{all:"unset",width:48,height:48,borderRadius:"50%",background:disabled?"rgba(255,255,255,0.04)":hov?"rgba(255,255,255,0.16)":"rgba(255,255,255,0.08)",border:`1.5px solid ${disabled?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.1)"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:disabled?"default":"pointer",color:disabled?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.88)",transition:"background 0.15s, color 0.15s"}}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {dir==="up"?<polyline points="18 15 12 9 6 15"/>:<polyline points="6 9 12 15 18 9"/>}
      </svg>
    </button>
  );
}

// ─── DESKTOP: Watch button ────────────────────────────────────────────────────
function WatchBtn({reel,onClick}){
  const st=getWatchState(reel);
  const [hov,setHov]=useState(false);
  if(st==="coming_soon") return(
    <span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:6,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",fontSize:12,color:"rgba(255,255,255,0.4)",fontFamily:"'DM Sans',sans-serif"}}>
      Coming {formatDate(reel.release_date)}
    </span>
  );
  return(
    <button onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={()=>onClick(reel,st)}
      style={{all:"unset",display:"inline-flex",alignItems:"center",gap:7,padding:"8px 18px",borderRadius:6,cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:13,fontWeight:700,letterSpacing:0.3,transition:"all 0.15s",background:st==="notify"?"rgba(167,139,250,0.14)":"rgba(0,180,166,0.18)",color:st==="notify"?"#a78bfa":"#00e5cc",border:`1.5px solid ${st==="notify"?"rgba(167,139,250,0.35)":"rgba(0,229,204,0.35)"}`,transform:hov?"scale(1.03)":"scale(1)"}}>
      {st==="notify"
        ?<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>Notify Me</>
        :<><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>Watch Now</>
      }
    </button>
  );
}

// ─── MOBILE: action button ────────────────────────────────────────────────────
function MobBtn({children,label,count,active,onClick}){
  const [pop,setPop]=useState(false);
  const stop=e=>{e.stopPropagation();e.nativeEvent?.stopImmediatePropagation?.();};
  return(
    <button onPointerDown={stop} onPointerUp={stop} onPointerMove={stop} onPointerCancel={stop} onTouchStart={stop} onTouchEnd={stop} onTouchMove={stop} onTouchCancel={stop}
      onClick={e=>{stop(e);setPop(true);setTimeout(()=>setPop(false),150);onClick();}}
      style={{all:"unset",display:"flex",flexDirection:"column",alignItems:"center",gap:5,cursor:"pointer",WebkitTapHighlightColor:"transparent",userSelect:"none",touchAction:"none"}}>
      <div style={{width:48,height:48,display:"flex",alignItems:"center",justifyContent:"center",color:active?"#00b4a6":"rgba(255,255,255,0.9)",transform:pop?"scale(0.6)":"scale(1)",transition:"transform 0.15s cubic-bezier(0.34,1.56,0.64,1), color 0.15s",filter:active?"drop-shadow(0 0 6px rgba(0,180,166,0.7))":"none"}}>
        {children}
      </div>
      <span style={{fontSize:11,fontWeight:600,color:active?"#00b4a6":"rgba(255,255,255,0.4)",fontFamily:"'DM Mono',monospace",letterSpacing:0.8,textTransform:"uppercase",lineHeight:1}}>
        {count!=null?fmtCount(count):label}
      </span>
    </button>
  );
}

// ─── MOBILE: Swipe indicator ──────────────────────────────────────────────────
function SwipeHint({dir,opacity}){
  if(!dir||opacity<=0) return null;
  const r=dir==="right";
  return(
    <div style={{position:"absolute",inset:0,zIndex:55,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:r?"flex-start":"flex-end",padding:"0 24px",opacity,transition:"opacity 0.05s"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,background:r?"rgba(0,180,166,0.16)":"rgba(167,139,250,0.16)",border:`1.5px solid ${r?"rgba(0,180,166,0.45)":"rgba(167,139,250,0.45)"}`,borderRadius:18,padding:"14px 18px",backdropFilter:"blur(6px)"}}>
        {r?<svg width="26" height="26" viewBox="0 0 24 24" fill="#00b4a6"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>:<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>}
        <span style={{fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",fontFamily:"'DM Mono',monospace",color:r?"#00b4a6":"#a78bfa"}}>{r?"Save":"Back"}</span>
      </div>
    </div>
  );
}

// ─── MOBILE: Info overlay (hold) ─────────────────────────────────────────────
function InfoSheet({reel,visible,onClose}){
  if(!visible||!reel) return null;
  return(
    <div style={{position:"absolute",inset:0,zIndex:70,background:"rgba(0,0,0,0.9)",backdropFilter:"blur(16px)",display:"flex",flexDirection:"column",justifyContent:"flex-end",padding:"0 20px 72px",animation:"ns-slide-up 0.3s cubic-bezier(0.22,1,0.36,1) both"}}
      onClick={e=>{e.stopPropagation();onClose();}}>
      <div onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
          {reel.genres.map(g=><span key={g} style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:600,color:"rgba(255,255,255,0.6)",letterSpacing:0.4}}>{g}</span>)}
          {reel.rating&&<span style={{background:"rgba(241,196,15,0.08)",border:"1px solid rgba(241,196,15,0.2)",borderRadius:20,padding:"3px 10px",fontSize:10,fontWeight:700,color:"#f1c40f"}}>★ {reel.rating}</span>}
        </div>
        <h2 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(30px,7vw,52px)",fontWeight:400,margin:"0 0 10px",color:"#fff",letterSpacing:1.5,lineHeight:0.95}}>{reel.title}</h2>
        {reel.overview&&<p style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,lineHeight:1.65,color:"rgba(255,255,255,0.6)",marginBottom:20,maxWidth:460}}>{reel.overview}</p>}
        <button onClick={onClose} style={{all:"unset",display:"inline-flex",alignItems:"center",gap:6,padding:"8px 16px",background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,fontSize:12,fontFamily:"'DM Sans',sans-serif",fontWeight:600,color:"rgba(255,255,255,0.5)",cursor:"pointer"}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Close
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function ReelPage({apiKey, onSelect, onSave, savedItems=[], onNavigate, onSearch}){
  const [reels,     setReels]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [moreLoad,  setMoreLoad]  = useState(false);
  const [idx,       setIdx]       = useState(0);
  const [muted,     setMuted]     = useState(true);
  const [toast,     setToast]     = useState(null);
  const [saveFlash, setSaveFlash] = useState(false);
  const [swipe,     setSwipe]     = useState({dir:null,opacity:0});
  const [interacted,setInteracted]= useState(false);
  // per-reel
  const [liked,     setLiked]     = useState(false);
  const [likeN,     setLikeN]     = useState(0);
  const [disliked,  setDisliked]  = useState(false);
  const [shareS,    setShareS]    = useState(null);
  const [showInfo,  setShowInfo]  = useState(false);

  const containerRef=useRef(null),idxRef=useRef(0),reelsRef=useRef([]),savedRef=useRef(savedItems),canNav=useRef(true),wheelLock=useRef(false),hadInteract=useRef(false);
  const [desktop,setDesktop]=useState(()=>window.innerWidth>800);

  useEffect(()=>{const mq=window.matchMedia("(min-width:801px)");const h=e=>setDesktop(e.matches);mq.addEventListener("change",h);return()=>mq.removeEventListener("change",h);},[]);
  useEffect(()=>{idxRef.current=idx;},[idx]);
  useEffect(()=>{reelsRef.current=reels;},[reels]);
  useEffect(()=>{savedRef.current=savedItems;},[savedItems]);

  // Reset per-reel state on idx change
  useEffect(()=>{
    const r=reelsRef.current[idxRef.current];
    setLiked(false);
    setLikeN(r?r.likes:0);
    setDisliked(false);
    setShareS(null);
    setShowInfo(false);
  },[idx]);

  // Lock body scroll while Shorts is mounted (mobile/tablet renders via a body
  // portal, so this also guarantees nothing behind it can scroll into view)
  useEffect(()=>{
    if(desktop)return;
    const prevOverflow=document.body.style.overflow,prevHeight=document.documentElement.style.overflow;
    document.body.style.overflow="hidden";
    document.documentElement.style.overflow="hidden";
    return()=>{document.body.style.overflow=prevOverflow;document.documentElement.style.overflow=prevHeight;};
  },[desktop]);

  const goTo=useCallback(n=>{if(!canNav.current)return;const len=reelsRef.current.length;if(!len)return;const c=Math.max(0,Math.min(n,len-1));if(c===idxRef.current)return;canNav.current=false;idxRef.current=c;setIdx(c);setTimeout(()=>{canNav.current=true;},420);},[]);
  const firstInteract=useCallback(()=>{if(!hadInteract.current){hadInteract.current=true;setInteracted(true);setMuted(false);}},[]);
  const isSaved=useCallback(r=>{const tid=r?.tmdb_id||r?.tmdbObj?.id;return(savedRef.current||[]).some(s=>String(s.id)===String(tid));},[]);
  const saveReel=useCallback(r=>{const item=r.tmdbObj?{...r.tmdbObj,media_type:"movie"}:{id:r.tmdb_id,title:r.title,media_type:"movie"};onSave?.(item);setToast("Saved to Watchlist");setTimeout(()=>setToast(null),2000);},[onSave]);
  const watchReel=useCallback((r,st)=>{const item=r.tmdbObj?{...r.tmdbObj,media_type:"movie"}:{id:r.tmdb_id,title:r.title,media_type:"movie"};if(st==="notify"){setToast(`Notify: ${r.title}`);setTimeout(()=>setToast(null),2200);return;}onSelect?.(item);},[onSelect]);
  const blocked=useCallback(()=>goTo(idxRef.current+1),[goTo]);
  const share=useCallback(async()=>{const r=await doShare(reelsRef.current[idxRef.current]);if(r==="copied"||r==="shared"){setShareS(r);setTimeout(()=>setShareS(null),2000);}},[]);

  // Load
  useEffect(()=>{if(!apiKey)return;let dead=false;setLoading(true);fetchReels(apiKey,14).then(d=>{if(!dead){setReels(d);setLoading(false);}}).catch(()=>{if(!dead)setLoading(false);});return()=>{dead=true;};},[apiKey]);
  useEffect(()=>{if(moreLoad||!reels.length||idx<reels.length-4)return;setMoreLoad(true);fetchReels(apiKey,10).then(d=>{setReels(p=>[...p,...d]);setMoreLoad(false);}).catch(()=>setMoreLoad(false));},[idx,reels.length,moreLoad]); // eslint-disable-line

  // Keyboard
  useEffect(()=>{const h=e=>{if(e.key==="ArrowDown"||e.key==="j")goTo(idxRef.current+1);if(e.key==="ArrowUp"||e.key==="k")goTo(idxRef.current-1);if(e.key==="m")setMuted(v=>!v);};window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);},[goTo]);

  // Wheel
  useEffect(()=>{const el=containerRef.current;if(!el)return;const fn=e=>{e.preventDefault();if(wheelLock.current||Math.abs(e.deltaY)<20)return;wheelLock.current=true;hap.light();goTo(idxRef.current+(e.deltaY>0?1:-1));setTimeout(()=>{wheelLock.current=false;},650);};el.addEventListener("wheel",fn,{passive:false});return()=>el.removeEventListener("wheel",fn);},[goTo]);

  // Mobile touch
  useEffect(()=>{
    if(desktop)return;
    const el=containerRef.current;if(!el)return;
    const g={on:false,x0:0,y0:0,x1:0,y1:0,dir:null};
    const start=e=>{firstInteract();if(e.target.closest("button,a,[data-ns]"))return;if(e.touches.length!==1)return;const t=e.touches[0];g.on=true;g.dir=null;g.x0=g.x1=t.clientX;g.y0=g.y1=t.clientY;};
    const move=e=>{if(!g.on)return;e.preventDefault();const t=e.touches[0];g.x1=t.clientX;g.y1=t.clientY;const dx=g.x1-g.x0,dy=g.y1-g.y0;if(!g.dir&&(Math.abs(dx)>10||Math.abs(dy)>10))g.dir=Math.abs(dy)>=Math.abs(dx)?"v":"h";if(g.dir==="h")setSwipe({dir:dx>0?"right":"left",opacity:Math.min(Math.abs(dx)/120,1)*0.95});};
    const end=()=>{if(!g.on)return;g.on=false;setSwipe({dir:null,opacity:0});const dx=g.x1-g.x0,dy=g.y1-g.y0;if(g.dir==="v"&&Math.abs(dy)>50){hap.light();goTo(idxRef.current+(dy<0?1:-1));}else if(g.dir==="h"&&dx>80){const r=reelsRef.current[idxRef.current];if(r&&!isSaved(r)){hap.save();saveReel(r);setSaveFlash(true);setTimeout(()=>setSaveFlash(false),700);}}else if(g.dir==="h"&&dx<-80){hap.light();goTo(idxRef.current-1);}g.dir=null;};
    el.addEventListener("touchstart",start,{passive:true});
    el.addEventListener("touchmove",move,{passive:false});
    el.addEventListener("touchend",end,{passive:true});
    el.addEventListener("touchcancel",end,{passive:true});
    return()=>{el.removeEventListener("touchstart",start);el.removeEventListener("touchmove",move);el.removeEventListener("touchend",end);el.removeEventListener("touchcancel",end);};
  },[desktop,goTo,firstInteract,isSaved,saveReel]);

  const nav=id=>id==="search"?onSearch?.():onNavigate?.(id);
  const visible=i=>i>=idx-1&&i<=idx+2;
  const cur=reels[idx]??null;
  const curSaved=cur?isSaved(cur):false;
  const nextReel=reels[idx+1]??null;

  // ── SHARED SPINNER ────────────────────────────────────────────────────────
  const spinner=(
    <div style={{position:"absolute",inset:0,zIndex:5,background:"linear-gradient(120deg,#0a0a0a 25%,#141414 50%,#0a0a0a 75%)",backgroundSize:"400% 400%",animation:"ns-shimmer 1.8s ease infinite",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <div style={{width:42,height:42,borderRadius:"50%",border:"2.5px solid rgba(255,255,255,0.06)",borderTopColor:"#00b4a6",animation:"ns-spin 0.8s linear infinite"}}/>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:3,color:"rgba(255,255,255,0.14)",textTransform:"uppercase"}}>Loading</span>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // DESKTOP — YouTube Shorts layout
  // ══════════════════════════════════════════════════════════════════════════
  if(desktop){
    return(
      <div ref={containerRef} style={{position:"fixed",top:0,bottom:0,left:"var(--sidebar,54px)",right:0,background:"#0f0f0f",display:"flex",flexDirection:"column",fontFamily:"'DM Sans','Helvetica Neue',sans-serif",overflow:"hidden"}}>
        <style>{`
          @keyframes ns-spin    { to{transform:rotate(360deg);} }
          @keyframes ns-shimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }
          @keyframes ns-fadein  { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:translateY(0);} }
          @keyframes ns-slide-up{ from{transform:translateY(100%);opacity:0;} to{transform:translateY(0);opacity:1;} }
          .ns-ab-circle{ transition: background 0.15s !important; }
        `}</style>

        {/* ── Header (YouTube Shorts style) ── */}
        <div style={{height:HEADER_H,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",borderBottom:"1px solid rgba(255,255,255,0.07)",background:"#0f0f0f",zIndex:10}}>
          {/* Left: back */}
          <button onClick={()=>nav("home")} style={{all:"unset",display:"flex",alignItems:"center",gap:10,cursor:"pointer",color:"rgba(255,255,255,0.72)",fontSize:14,fontWeight:500,padding:"6px 10px 6px 6px",borderRadius:8,transition:"color 0.15s,background 0.15s"}}
            onMouseEnter={e=>{e.currentTarget.style.color="#fff";e.currentTarget.style.background="rgba(255,255,255,0.06)";}}
            onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.72)";e.currentTarget.style.background="transparent";}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>

          {/* Center: NS Shorts branding */}
          <div style={{display:"flex",alignItems:"center",gap:10,position:"absolute",left:"50%",transform:"translateX(-50%)"}}>
        
            <span style={{fontSize:9,fontWeight:800,letterSpacing:1,background:"linear-gradient(135deg,#f5a623,#e74c3c)",borderRadius:4,padding:"2px 6px",color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>WORLD</span>
          </div>

          {/* Right: mute + search */}
          <div style={{display:"flex",gap:6}}>
            {[
              {icon:muted?<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>:<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>,
               active:!muted,action:()=>{setMuted(m=>!m);if(!interacted){setInteracted(true);hadInteract.current=true;}}},
              {icon:<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
               action:()=>nav("search")},
            ].map((b,i)=>(
              <button key={i} onClick={b.action} style={{all:"unset",width:38,height:38,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:b.active?"#00b4a6":"rgba(255,255,255,0.7)",transition:"background 0.15s,color 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)";}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                {b.icon}
              </button>
            ))}
          </div>
        </div>

        {/* ── Main: centered layout ── */}
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>

          {/* GROUP: video + actions + nav — all flex-row, bottom-aligned */}
          <div style={{display:"flex",alignItems:"flex-end",gap:20}}>

            {/* VIDEO CARD */}
            <div style={{flexShrink:0,display:"flex",flexDirection:"column"}}>
              {/* Card */}
              <div style={{position:"relative",height:`min(calc(100vh - ${HEADER_H}px - 32px), 720px)`,aspectRatio:"9/16",borderRadius:12,overflow:"hidden",background:"#000",flexShrink:0}} key="card">
                {loading&&spinner}

                {/* Reel stack — translates vertically within card */}
                {!loading&&reels.map((r,i)=>{
                  if(!visible(i))return null;
                  return(
                    <div key={`${r.id}-${i}`} style={{position:"absolute",inset:0,transform:`translateY(${(i-idx)*100}%)`,transition:"transform 0.36s cubic-bezier(0.4,0,0.2,1)",willChange:"transform",zIndex:i===idx?2:1}}>
                      <Player videoId={r.youtubeId} active={i===idx} muted={muted} onBlocked={i===idx?blocked:undefined} backdrop={r.backdrop} poster={r.poster} preload={i===idx+1}/>
                      {/* Info overlay inside card — YouTube Shorts style */}
                      {i===idx&&cur&&(
                        <div style={{position:"absolute",bottom:0,left:0,right:0,zIndex:20,padding:"80px 14px 14px",pointerEvents:"none",animation:"ns-fadein 0.35s ease both",background:"linear-gradient(to top,rgba(0,0,0,0.88) 0%,rgba(0,0,0,0.6) 40%,transparent 75%)"}}>
                          {/* Channel row: avatar + title + watch btn */}
                          <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:8,pointerEvents:"auto"}}>
                            <div style={{width:32,height:32,borderRadius:"50%",overflow:"hidden",flexShrink:0,background:"rgba(255,255,255,0.1)",border:"1.5px solid rgba(255,255,255,0.15)"}}>
                              {cur.poster&&<img src={imgSrc(cur.poster,"w92")} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
                            </div>
                            <span style={{fontWeight:700,fontSize:13,color:"#fff",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cur.title}</span>
                            <WatchBtn reel={cur} onClick={watchReel}/>
                          </div>
                          {/* Description */}
                          {cur.overview&&<p style={{fontSize:12,color:"rgba(255,255,255,0.65)",lineHeight:1.45,margin:"0 0 7px",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{cur.overview}</p>}
                          {/* Genre hashtags */}
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {cur.genres.map(g=><span key={g} style={{fontSize:12,fontWeight:600,color:"#00b4a6",letterSpacing:0.1}}>#{g.toLowerCase().replace(/ /g,"-")}</span>)}
                            {cur.rating&&<span style={{fontSize:12,fontWeight:600,color:"rgba(241,196,15,0.85)"}}>★{cur.rating}</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <ProgressBar active={!loading&&reels.length>0} onComplete={blocked}/>
              </div>
            </div>

            {/* ACTION RAIL — right of video, bottom-aligned */}
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20,paddingBottom:16,flexShrink:0}}>
              {/* Like */}
              <ActionBtn active={liked} count={likeN} label="Like"
                icon={<svg width="24" height="24" viewBox="0 0 24 24" fill={liked?"#00b4a6":"none"} stroke={liked?"#00b4a6":"rgba(255,255,255,0.87)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>}
                onClick={()=>{hap.light();setLiked(v=>{setLikeN(c=>v?c-1:c+1);return !v;});}}
              />
              {/* Dislike */}
              <ActionBtn danger={disliked} label="Dislike"
                icon={<svg width="24" height="24" viewBox="0 0 24 24" fill={disliked?"#f44":"none"} stroke={disliked?"#f44":"rgba(255,255,255,0.87)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>}
                onClick={()=>{hap.light();setDisliked(v=>{if(v)return false;setLiked(false);return true;});}}
              />
              {/* Save / Bookmark */}
              <ActionBtn active={curSaved} label={curSaved?"Saved":"Save"}
                icon={curSaved?<svg width="22" height="22" viewBox="0 0 24 24" fill="#00b4a6"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>:<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.87)" strokeWidth="1.8" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>}
                onClick={()=>{hap.save();if(cur)saveReel(cur);}}
              />
              {/* Share */}
              <ActionBtn active={!!shareS} label={shareS?"Copied":"Share"}
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.87)" strokeWidth="1.8" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>}
                onClick={share}
              />
              {/* More / Details */}
              <ActionBtn label="More"
                icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.87)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>}
                onClick={()=>cur&&onSelect?.({...cur.tmdbObj,media_type:"movie"})}
              />
              {/* Next video thumbnail — YouTube shows this */}
              {nextReel&&(
                <button onClick={()=>goTo(idx+1)} title="Next video" style={{all:"unset",cursor:"pointer",marginTop:4}}>
                  <div style={{width:48,height:72,borderRadius:7,overflow:"hidden",background:"#222",border:"1.5px solid rgba(255,255,255,0.12)",position:"relative",transition:"border-color 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(0,180,166,0.5)"}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"}>
                    {nextReel.poster&&<img src={imgSrc(nextReel.poster,"w92")} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>}
                    <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.25)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="white" opacity="0.8"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* NAV ARROWS — right of action rail */}
            <div style={{display:"flex",flexDirection:"column",gap:10,paddingBottom:16,flexShrink:0}}>
              <NavBtn dir="up"   disabled={idx===0||loading}         onClick={()=>{hap.light();goTo(idx-1);}}/>
              <NavBtn dir="down" disabled={idx>=reels.length-1||loading} onClick={()=>{hap.light();goTo(idx+1);}}/>
            </div>

          </div>{/* end group */}

          {/* Empty state */}
          {!loading&&!reels.length&&<div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,background:"#0f0f0f"}}><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:2,color:"rgba(255,255,255,0.15)"}}>No Shorts</span></div>}
        </div>

        {/* Toast */}
        {toast&&<div style={{position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",zIndex:100,background:"rgba(10,10,10,0.9)",border:"1px solid rgba(0,180,166,0.2)",borderRadius:8,padding:"9px 18px",display:"flex",alignItems:"center",gap:8,animation:"ns-fadein 0.2s ease both",whiteSpace:"nowrap",pointerEvents:"none"}}><svg width="13" height="13" viewBox="0 0 24 24" fill="#00b4a6"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg><span style={{fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:0.8,color:"#00b4a6",textTransform:"uppercase"}}>{toast}</span></div>}
        {moreLoad&&<div style={{position:"fixed",bottom:20,right:20,zIndex:10,pointerEvents:"none"}}><div style={{width:18,height:18,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.06)",borderTopColor:"#00b4a6",animation:"ns-spin 0.8s linear infinite"}}/></div>}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MOBILE / TABLET — full-screen vertical, portaled to <body>
  // Rendering this subtree as a direct child of <body> (instead of wherever
  // the router mounts the page) guarantees it is a true fixed full-viewport
  // layer: no ancestor's transform/overflow/stacking context can clip or bury
  // it, and nothing else (topbar, sidebar, bottom-nav) can render above it.
  // The instant this component unmounts, the portal node is removed and the
  // app's normal chrome is back exactly as it was — no flags, no other files.
  // ══════════════════════════════════════════════════════════════════════════
  return createPortal(
    <div ref={containerRef} onClick={firstInteract} style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"#000",overflow:"hidden",touchAction:"none",overscrollBehavior:"none",userSelect:"none",WebkitUserSelect:"none",fontFamily:"'DM Sans','Helvetica Neue',sans-serif",zIndex:2147483647}}>
      <style>{`
        @keyframes ns-spin    { to{transform:rotate(360deg);} }
        @keyframes ns-shimmer { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }
        @keyframes ns-fadein  { from{opacity:0;} to{opacity:1;} }
        @keyframes ns-slide-up{ from{transform:translateY(100%);opacity:0;} to{transform:translateY(0);opacity:1;} }
        @keyframes ns-hintfade{ 0%{opacity:0;} 15%{opacity:1;} 75%{opacity:1;} 100%{opacity:0;} }
        @keyframes ns-flash   { 0%{opacity:0;} 15%{opacity:1;} 70%{opacity:.5;} 100%{opacity:0;} }
        .ns-mob-rail { position:absolute; right:10px; bottom:100px; z-index:30; display:flex; flex-direction:column; align-items:center; gap:18px; touch-action:none; }
        .ns-mob-info { position:absolute; bottom:0; left:0; right:72px; z-index:30; padding:0 14px 82px 16px; pointer-events:none; box-sizing:border-box; }
      `}</style>

      {loading&&spinner}

      {!loading&&reels.map((r,i)=>{
        if(!visible(i)) return null;
        const isA=i===idx,rSaved=isSaved(r);
        return(
          <div key={`${r.id}-${i}`} style={{position:"absolute",inset:0,transform:`translateY(${(i-idx)*100}%)`,transition:"transform 0.36s cubic-bezier(0.4,0,0.2,1)",willChange:"transform",zIndex:isA?2:1}}>
            <Player videoId={r.youtubeId} active={isA} muted={muted} onBlocked={isA?blocked:undefined} backdrop={r.backdrop} poster={r.poster} preload={i===idx+1}/>
            <ProgressBar active={isA} onComplete={blocked}/>
            <SwipeHint dir={isA?swipe.dir:null} opacity={isA?swipe.opacity:0}/>
            {isA&&saveFlash&&<div style={{position:"absolute",inset:0,zIndex:66,pointerEvents:"none",background:"rgba(0,180,166,0.08)",animation:"ns-flash 0.6s ease both"}}/>}

            {/* Mobile action rail */}
            <div className="ns-mob-rail" data-ns onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
              <MobBtn active={isA&&liked} count={isA?likeN:r.likes} onClick={()=>{if(isA){hap.light();setLiked(v=>{setLikeN(c=>v?c-1:c+1);return !v;});}}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill={isA&&liked?"#00b4a6":"none"} stroke={isA&&liked?"#00b4a6":"rgba(255,255,255,0.9)"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              </MobBtn>
              <MobBtn active={rSaved} label={rSaved?"Saved":"Save"} onClick={()=>{hap.save();saveReel(r);}}>
                {rSaved?<svg width="24" height="24" viewBox="0 0 24 24" fill="#00b4a6"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>:<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>}
              </MobBtn>
              <MobBtn active={isA&&!!shareS} label={isA&&shareS?"Copied":"Share"} onClick={isA?share:()=>{}}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </MobBtn>
              <MobBtn active={false} label="Mute" onClick={()=>{hap.light();setMuted(m=>!m);if(!interacted){setInteracted(true);hadInteract.current=true;}}}>
                {muted?<svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>:<svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>}
              </MobBtn>
            </div>

            {/* Mobile bottom info */}
            <div className="ns-mob-info">
              <div style={{display:"flex",gap:5,marginBottom:7,flexWrap:"wrap"}}>
                {r.genres.map(g=><span key={g} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:"3px 9px",fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.65)",letterSpacing:0.8,textTransform:"uppercase",fontFamily:"'DM Mono',monospace"}}>{g}</span>)}
                {r.rating&&<span style={{background:"rgba(241,196,15,0.07)",border:"1px solid rgba(241,196,15,0.2)",borderRadius:20,padding:"3px 8px",fontSize:9,fontWeight:700,color:"#f1c40f",fontFamily:"'DM Mono',monospace"}}>★ {r.rating}</span>}
              </div>
              <h2 style={{margin:"0 0 7px",fontFamily:"'Bebas Neue',sans-serif",fontSize:"clamp(24px,7vw,44px)",fontWeight:400,letterSpacing:1.5,lineHeight:0.95,color:"#fff",textShadow:"0 2px 20px rgba(0,0,0,0.9)",wordBreak:"break-word",animation:isA?"ns-fadein 0.4s ease both":"none"}}>{r.title}</h2>
              {r.overview&&<p style={{margin:"0 0 10px",fontFamily:"'DM Sans',sans-serif",fontSize:12,lineHeight:1.55,color:"rgba(255,255,255,0.5)",textShadow:"0 1px 6px rgba(0,0,0,0.9)",pointerEvents:"none",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{r.overview}</p>}
              <div style={{pointerEvents:"auto"}}>
                {isA&&<WatchBtn reel={r} onClick={watchReel}/>}
              </div>
            </div>

            {isA&&<InfoSheet reel={r} visible={showInfo} onClose={()=>setShowInfo(false)}/>}
          </div>
        );
      })}

      {/* Mobile top bar — this is the ONLY top bar visible while in Shorts */}
      <div style={{position:"absolute",top:0,left:0,right:0,zIndex:50,background:"linear-gradient(to bottom,rgba(0,0,0,0.7) 0%,transparent 100%)",pointerEvents:"none"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 14px 32px",pointerEvents:"auto"}}>
          <button onClick={()=>nav("home")} style={{all:"unset",width:36,height:36,borderRadius:"50%",background:"rgba(0,0,0,0.35)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"rgba(255,255,255,0.9)"}}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{display:"flex",alignItems:"center",gap:7,pointerEvents:"none"}}>
            <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:19,letterSpacing:2.5,color:"#fff"}}><span style={{color:"#00b4a6"}}>NS</span> Shorts</span>
            <span style={{fontSize:8,fontWeight:800,letterSpacing:0.8,background:"linear-gradient(135deg,#f5a623,#e74c3c)",borderRadius:4,padding:"2px 5px",color:"#fff",fontFamily:"'DM Sans',sans-serif"}}>WORLD</span>
          </div>
          <button onClick={()=>nav("search")} style={{all:"unset",width:36,height:36,borderRadius:"50%",background:"rgba(0,0,0,0.35)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"rgba(255,255,255,0.9)"}}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
      </div>

      {/* Hint */}
      {!interacted&&!loading&&reels.length>0&&<div style={{position:"absolute",bottom:140,left:"50%",transform:"translateX(-50%)",zIndex:60,pointerEvents:"none",display:"flex",alignItems:"center",gap:8,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:22,padding:"7px 16px",animation:"ns-hintfade 3.5s ease 1.2s both",whiteSpace:"nowrap"}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(255,255,255,0.4)"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
        <span style={{fontSize:10,color:"rgba(255,255,255,0.45)",fontFamily:"'DM Sans',sans-serif"}}>Tap anywhere for sound</span>
      </div>}

      {/* Toast */}
      {toast&&<div style={{position:"absolute",top:72,left:"50%",transform:"translateX(-50%)",zIndex:75,pointerEvents:"none",background:"rgba(5,5,5,0.88)",border:"1px solid rgba(0,180,166,0.2)",borderRadius:8,padding:"9px 18px",display:"flex",alignItems:"center",gap:8,animation:"ns-fadein 0.2s ease both",whiteSpace:"nowrap"}}><svg width="13" height="13" viewBox="0 0 24 24" fill="#00b4a6"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg><span style={{fontFamily:"'DM Mono',monospace",fontSize:11,letterSpacing:0.8,color:"#00b4a6",textTransform:"uppercase"}}>{toast}</span></div>}
      {moreLoad&&<div style={{position:"absolute",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:50,pointerEvents:"none"}}><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.06)",borderTopColor:"#00b4a6",animation:"ns-spin 0.8s linear infinite"}}/></div>}
    </div>,
    document.body
  );
}