/**
 * ReelPage.jsx — NovaSpark Cinema Reels
 *
 * ELECTRON : Kinocheck embed in <webview partition="persist:trailer">
 *            Auto-unmuted. Polls <video> for state via executeJavaScript.
 * WEB      : youtube-nocookie iframe + postMessage (unchanged).
 *
 * DESIGN   : Cinema-grade dark luxury. Full-bleed video. Every pixel earns its place.
 */
import { useState, useEffect, useRef, useCallback } from "react";

// ─── ENV ─────────────────────────────────────────────────────────────────────
const IS_ELECTRON = typeof window !== "undefined" && !!window.electron;

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const KINO         = "https://api.kinocheck.com";
const TMDB         = "https://api.themoviedb.org/3";
const START_OFFSET = 20;
const END_BUFFER   = 10;

// ─── NAV CONFIG ──────────────────────────────────────────────────────────────
const NAV = [
  { id:"home",      label:"Home",
    icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg> },
  { id:"search",    label:"Search",
    icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
  { id:"history",   label:"Library",
    icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> },
  { id:"downloads", label:"Downloads",
    icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> },
  { id:"settings",  label:"Settings",
    icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
];

// ─── URL BUILDERS ────────────────────────────────────────────────────────────

function buildKinoSrc(videoId) {
  // Kinocheck embed — no YouTube bot detection, plays clean in Electron webview
  return `https://api.kinocheck.com/embed?yt=${videoId}&autoplay=1&muted=0`;
}

function buildYTSrc(videoId) {
  const p = new URLSearchParams({
    autoplay:"1", mute:"0", controls:"0", modestbranding:"1",
    rel:"0", showinfo:"0", iv_load_policy:"3", disablekb:"1",
    fs:"0", playsinline:"1", loop:"1", playlist:videoId,
    enablejsapi:"1", start:String(START_OFFSET), hl:"en",
    origin: typeof window !== "undefined" ? window.location.origin : "",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${p}`;
}

function ytMsg(iframe, obj) {
  iframe?.contentWindow?.postMessage(JSON.stringify(obj), "*");
}

// ─── DATA ────────────────────────────────────────────────────────────────────

function parseKino(raw) {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw)
    .filter(([k]) => !isNaN(Number(k)))
    .map(([, v]) => v)
    .filter((v) => v?.youtube_video_id);
}

function cleanTitle(raw) {
  if (!raw) return "Movie";
  return raw
    .replace(/\s+(Official\s+)?(Trailer|Teaser|Clip|Featurette|Spot)[^|–\-]*/i,"")
    .replace(/\s+(German|Deutsch|English|French|Español|Italiano)[^|]*/i,"")
    .replace(/\s*[|(–\-].*/,"")
    .replace(/\s*\(\d{4}\).*/,"")
    .trim() || raw.split(/\s+/).slice(0,4).join(" ");
}

async function fetchReels(apiKey, page = 1) {
  let items = [];
  try {
    const r = await fetch(`${KINO}/trailers/trending?limit=20&page=${page}`,{ headers:{ Accept:"application/json" } });
    if (r.ok) items = parseKino(await r.json());
  } catch {}
  try {
    const r2 = await fetch(`${KINO}/trailers/latest?limit=20`,{ headers:{ Accept:"application/json" } });
    if (r2.ok) {
      const extra = parseKino(await r2.json());
      const seen  = new Set(items.map((x) => x.youtube_video_id));
      items = [...items, ...extra.filter((x) => !seen.has(x.youtube_video_id))];
    }
  } catch {}

  const reels = items.map((item) => ({
    id:       item.youtube_video_id,
    youtubeId:item.youtube_video_id,
    tmdb_id:  item.resource?.tmdb_id || null,
    title:    cleanTitle(item.title),
    genres:   (item.genres || []).slice(0,2),
    rating:null, duration:null, tmdbObj:null,
  }));

  await Promise.allSettled(
    reels.filter((r) => r.tmdb_id).slice(0,8).map(async (r) => {
      try {
        const res = await fetch(`${TMDB}/movie/${r.tmdb_id}?api_key=${apiKey}`);
        if (!res.ok) return;
        const d = await res.json();
        r.title    = d.title    || r.title;
        r.rating   = d.vote_average ? +d.vote_average.toFixed(1) : null;
        r.duration = d.runtime  || null;
        r.tmdbObj  = d;
      } catch {}
    })
  );
  return reels;
}

// ─── PROGRESS BAR ────────────────────────────────────────────────────────────

function ProgressBar({ active, duration }) {
  const [pct, setPct]   = useState(0);
  const rafRef          = useRef(null);
  const startRef        = useRef(null);
  const totalMs = Math.max(60000,(((duration||2.5)*60) - START_OFFSET - END_BUFFER)*1000);

  useEffect(() => {
    if (!active){ setPct(0); cancelAnimationFrame(rafRef.current); return; }
    startRef.current = performance.now();
    const tick = (now) => {
      const next = Math.min(((now - startRef.current)/totalMs)*100, 100);
      setPct(next);
      if (next < 100) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  },[active, totalMs]);

  return (
    <div style={{ position:"absolute",bottom:0,left:0,right:0,height:3,background:"rgba(255,255,255,0.08)",zIndex:40 }}>
      <div style={{
        height:"100%", width:`${pct}%`,
        background:"linear-gradient(90deg,#00e5cc,#00b4ff,#a78bfa)",
        boxShadow:"0 0 8px rgba(0,229,204,0.6)",
        transition:"width 0.12s linear",
        borderRadius:"0 2px 2px 0",
      }}/>
    </div>
  );
}

// ─── PLAYER ──────────────────────────────────────────────────────────────────

function YTPlayer({ videoId, active, muted, onBlocked }) {
  const iframeRef  = useRef(null);
  const webviewRef = useRef(null);
  const [ready,     setReady]    = useState(false);
  const [loaded,    setLoaded]   = useState(false);
  const blockedRef  = useRef(false);
  const activeRef   = useRef(active);
  const readyRef    = useRef(false);

  useEffect(() => { activeRef.current = active; },[active]);
  useEffect(() => { readyRef.current  = ready;  },[ready]);

  useEffect(() => {
    setReady(false); setLoaded(false);
    blockedRef.current = false; readyRef.current = false;
  },[videoId]);

  // ── ELECTRON ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!IS_ELECTRON) return;
    const wv = webviewRef.current;
    if (!wv || !loaded) return;

    const CHECK = `(function(){
      var v=document.querySelector('video');
      if(!v) return 'loading';
      if(v.error) return 'error';
      if(v.ended) return 'ended';
      if(!v.paused && v.readyState>=2 && v.currentTime>0) return 'playing';
      return 'loading';
    })()`;

    const applyMute = (m) => {
      const js = m
        ? `(function(){var v=document.querySelector('video');if(v)v.muted=true;})()`
        : `(function(){var v=document.querySelector('video');if(v){v.muted=false;v.volume=1;}})()`; 
      wv.executeJavaScript(js).catch(()=>{});
    };

    // Nudge play + unmute after page settles
    const nudge = setTimeout(() => {
      if (wv.isDestroyed?.()) return;
      wv.executeJavaScript(`(function(){var v=document.querySelector('video');if(v&&v.paused){v.play().catch(function(){});}})()`).catch(()=>{});
      applyMute(muted);
    }, 1200);

    const poll = setInterval(() => {
      if (wv.isDestroyed?.()){ clearInterval(poll); return; }
      wv.executeJavaScript(CHECK).then((state) => {
        if (!activeRef.current) return;
        if (state === "playing" && !readyRef.current) setReady(true);
        if ((state === "ended" || state === "error") && !blockedRef.current){
          blockedRef.current = true; clearInterval(poll); onBlocked?.();
        }
      }).catch(()=>{});
    }, 700);

    // Hard reveal at 5s — never leave user staring at spinner
    const hard = setTimeout(() => { if (!readyRef.current) setReady(true); }, 5000);

    return () => { clearTimeout(nudge); clearInterval(poll); clearTimeout(hard); };
  },[loaded, videoId]); // eslint-disable-line

  useEffect(() => {
    if (!IS_ELECTRON) return;
    const wv = webviewRef.current;
    if (!wv || !loaded || wv.isDestroyed?.()) return;
    const js = muted
      ? `(function(){var v=document.querySelector('video');if(v)v.muted=true;})()`
      : `(function(){var v=document.querySelector('video');if(v){v.muted=false;v.volume=1;}})()`;
    wv.executeJavaScript(js).catch(()=>{});
  },[muted, loaded]);

  // ── WEB ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (IS_ELECTRON) return;
    if (!loaded || !iframeRef.current) return;
    const ifr = iframeRef.current;
    ytMsg(ifr,{event:"listening"});
    ytMsg(ifr,{event:"command",func:"addEventListener",args:["onStateChange"]});
    ytMsg(ifr,{event:"command",func:"addEventListener",args:["onError"]});
    const t = setTimeout(() => {
      if (active){
        ytMsg(ifr,{event:"command",func:"playVideo",args:[]});
        ytMsg(ifr,{event:"command",func:muted?"mute":"unMute",args:[]});
        if (!muted) ytMsg(ifr,{event:"command",func:"setVolume",args:[100]});
      } else {
        ytMsg(ifr,{event:"command",func:"pauseVideo",args:[]});
      }
    },300);
    return () => clearTimeout(t);
  },[loaded]); // eslint-disable-line

  useEffect(() => {
    if (IS_ELECTRON) return;
    if (!loaded || !iframeRef.current) return;
    const ifr = iframeRef.current;
    if (active){
      ytMsg(ifr,{event:"command",func:"playVideo",args:[]});
      ytMsg(ifr,{event:"command",func:muted?"mute":"unMute",args:[]});
      if (!muted) ytMsg(ifr,{event:"command",func:"setVolume",args:[100]});
    } else {
      ytMsg(ifr,{event:"command",func:"pauseVideo",args:[]});
    }
  },[active,muted]); // eslint-disable-line

  useEffect(() => {
    if (IS_ELECTRON) return;
    const fn = (e) => {
      if (!e.data) return;
      try {
        const d = typeof e.data==="string" ? JSON.parse(e.data) : e.data;
        if (d?.event==="onStateChange"&&d?.info===1){ if(activeRef.current) setReady(true); }
        if (d?.event==="onStateChange"&&d?.info===0){ if(activeRef.current&&!blockedRef.current){ blockedRef.current=true; onBlocked?.(); } }
        if (d?.event==="onError"){ if(activeRef.current&&!blockedRef.current){ blockedRef.current=true; onBlocked?.(); } }
        if (d?.event==="infoDelivery"){
          if(d?.info?.playerState===1&&activeRef.current) setReady(true);
          if(d?.info?.playerState===0&&activeRef.current&&!blockedRef.current){ blockedRef.current=true; onBlocked?.(); }
        }
      } catch {}
    };
    window.addEventListener("message",fn);
    return () => window.removeEventListener("message",fn);
  },[onBlocked]);

  useEffect(() => {
    if (IS_ELECTRON) return;
    if (!active||!loaded) return;
    const t = setTimeout(() => { if(!readyRef.current) setReady(true); },7000);
    return () => clearTimeout(t);
  },[active,loaded,videoId]);

  const embedStyle = {
    position:"absolute",
    // oversized to crop out YT controls/letterbox — video always fills frame
    top:"-15%", left:"-8%",
    width:"116%", height:"130%",
    border:"none", pointerEvents:"none",
  };

  return (
    <div style={{ position:"absolute",inset:0,background:"#000",overflow:"hidden" }}>

      {IS_ELECTRON ? (
        <webview
          ref={webviewRef}
          src={buildKinoSrc(videoId)}
          partition="persist:trailer"
          allowpopups="false"
          onLoad={() => setLoaded(true)}
          style={embedStyle}
        />
      ) : (
        <iframe
          ref={iframeRef}
          src={buildYTSrc(videoId)}
          allow="autoplay; encrypted-media"
          allowFullScreen
          frameBorder="0"
          title={videoId}
          onLoad={() => setLoaded(true)}
          style={embedStyle}
        />
      )}

      {/* Cinematic vignette — top and bottom */}
      <div style={{
        position:"absolute",inset:0,zIndex:6,pointerEvents:"none",
        background:`
          linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 25%),
          linear-gradient(to top,    rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.6) 20%, rgba(0,0,0,0.2) 45%, transparent 65%)
        `,
      }}/>

      {/* Loading state — fades away when ready */}
      <div style={{
        position:"absolute",inset:0,zIndex:25,
        background:"#050505",
        pointerEvents:"none",
        opacity: ready ? 0 : 1,
        transition: ready ? "opacity 0.7s cubic-bezier(0.4,0,0.2,1)" : "none",
      }}>
        {!ready && (
          <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16 }}>
            {/* Cinematic loading ring */}
            <div style={{ position:"relative",width:48,height:48 }}>
              <div style={{ position:"absolute",inset:0,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.05)" }}/>
              <div style={{ position:"absolute",inset:0,borderRadius:"50%",border:"1.5px solid transparent",borderTopColor:"#00e5cc",animation:"rs 0.8s linear infinite" }}/>
              <div style={{ position:"absolute",inset:6,borderRadius:"50%",border:"1px solid transparent",borderTopColor:"rgba(167,139,250,0.6)",animation:"rs 1.3s linear infinite reverse" }}/>
            </div>
            <span style={{ fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:3,color:"rgba(255,255,255,0.2)",textTransform:"uppercase" }}>
              Loading
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ACTION BUTTON ───────────────────────────────────────────────────────────

function ActionBtn({ children, label, active, count, onClick }) {
  const [pop, setPop] = useState(false);
  return (
    <button
      onClick={(e)=>{ e.stopPropagation(); setPop(true); setTimeout(()=>setPop(false),160); onClick(); }}
      style={{ all:"unset",display:"flex",flexDirection:"column",alignItems:"center",gap:5,cursor:"pointer",WebkitTapHighlightColor:"transparent" }}
    >
      <div style={{
        width:46,height:46,borderRadius:"50%",
        display:"flex",alignItems:"center",justifyContent:"center",
        background: active ? "rgba(0,229,204,0.15)" : "rgba(8,8,8,0.55)",
        backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        border: active ? "1.5px solid rgba(0,229,204,0.55)" : "1.5px solid rgba(255,255,255,0.1)",
        color: active ? "#00e5cc" : "rgba(255,255,255,0.9)",
        transform: pop ? "scale(0.7)" : "scale(1)",
        transition:"transform 0.15s cubic-bezier(0.34,1.56,0.64,1),background 0.2s,border-color 0.2s,box-shadow 0.2s",
        boxShadow: active ? "0 0 16px rgba(0,229,204,0.25)" : "0 4px 12px rgba(0,0,0,0.4)",
        marginBottom: " 20% ",
      }}>
        {children}
      </div>
      {(label||count!==undefined) && (
        <span style={{
          fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",
          color: active ? "#00e5cc" : "rgba(255,255,255,0.35)",
          fontFamily:"'DM Mono',monospace",lineHeight:1,
          transition:"color 0.2s",
        }}>
          {count!==undefined ? count : label}
        </span>
      )}
    </button>
  );
}

// ─── REEL CARD ───────────────────────────────────────────────────────────────

function ReelCard({ reel, active, muted, onToggleMute, onWatch, onSave, saved, onBlocked }) {
  const [liked,     setLiked]    = useState(false);
  const [likeCount, setLikeCount]= useState(()=>Math.floor(Math.random()*12000)+400);
  const [heart,     setHeart]    = useState(false);
  const [ripple,    setRipple]   = useState(null);
  const lastTap = useRef(0);

  // Double-tap like with ripple
  const handleTap = (e) => {
    const now = Date.now();
    if (now - lastTap.current < 280){
      const rect = e.currentTarget.getBoundingClientRect();
      setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: now });
      setTimeout(()=>setRipple(null),600);
      if (!liked) setLikeCount((c)=>c+1);
      setLiked(true); setHeart(true);
      setTimeout(()=>setHeart(false),800);
    }
    lastTap.current = now;
  };

  const fmt = (n) => n>=1000 ? `${(n/1000).toFixed(1)}k` : String(n);

  return (
    <div
      style={{ position:"absolute",inset:0,background:"#000",overflow:"hidden" }}
      onClick={handleTap}
    >
      <YTPlayer videoId={reel.youtubeId} active={active} muted={muted} onBlocked={onBlocked}/>
      <ProgressBar active={active} duration={reel.duration}/>

      {/* Double-tap ripple */}
      {ripple && (
        <div style={{
          position:"absolute",
          left:ripple.x - 60, top:ripple.y - 60,
          width:120, height:120,
          borderRadius:"50%",
          background:"rgba(255,255,255,0.12)",
          zIndex:45,pointerEvents:"none",
          animation:"ripple-burst 0.5s ease-out forwards",
        }}/>
      )}

      {/* Double-tap heart */}
      {heart && (
        <div style={{
          position:"absolute",top:"42%",left:"50%",
          transform:"translate(-50%,-50%)",
          zIndex:46,pointerEvents:"none",
          fontSize:72,lineHeight:1,
          filter:"drop-shadow(0 0 20px rgba(255,64,96,0.8))",
          animation:"heart-pop 0.75s cubic-bezier(0.34,1.56,0.64,1) forwards",
        }}>❤️</div>
      )}

      {/*
        ═══════════════════════════════════════════════════════
        LAYOUT SYSTEM
        ───────────────────────────────────────────────────────
        Desktop/Tablet  → right rail (vertical, right side)
                          bottom info (left-aligned, clears rail)
        Mobile portrait → action row above info, full-width info
        ═══════════════════════════════════════════════════════
      */}

      {/* BOTTOM CONTENT WRAPPER */}
      <div className="rc-bottom">

        {/* META ROW */}
        <div className="rc-meta">
          {reel.genres.map((g)=>(
            <span key={g} className="rc-tag">{g}</span>
          ))}
          {reel.rating && (
            <span className="rc-rating">★ {reel.rating}</span>
          )}
        </div>

        {/* TITLE */}
        <h2 className="rc-title" style={{ animation: active ? "slide-up 0.45s cubic-bezier(0.22,1,0.36,1) both" : "none" }}>
          {reel.title}
        </h2>

        {/* WATCH BUTTON — always visible, never blocked */}
        <button
          className="rc-watch"
          onClick={(e)=>{ e.stopPropagation(); onWatch(reel); }}
          onPointerDown={(e)=>e.currentTarget.style.transform="scale(0.94)"}
          onPointerUp={(e)=>e.currentTarget.style.transform="scale(1)"}
          onPointerLeave={(e)=>e.currentTarget.style.transform="scale(1)"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Watch Now
        </button>
      </div>

      {/* ACTION RAIL */}
      <div className="rc-rail">
        <ActionBtn count={fmt(likeCount)} active={liked}
          onClick={()=>setLiked((v)=>{ if(!v) setLikeCount((c)=>c+1); return !v; })}>
          <svg width="20" height="20" viewBox="0 0 24 24"
            fill={liked?"#ff4060":"none"} stroke={liked?"#ff4060":"currentColor"}
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </ActionBtn>

        <ActionBtn label="Save" active={saved} onClick={()=>onSave(reel)}>
          {saved
            ? <svg width="19" height="19" viewBox="0 0 24 24" fill="#00e5cc"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
            : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          }
        </ActionBtn>

        <ActionBtn label="Share" active={false}
          onClick={()=>navigator.share?.({title:reel.title,url:`https://www.youtube.com/watch?v=${reel.youtubeId}`}).catch(()=>{})}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </ActionBtn>

        <ActionBtn label={muted?"Unmute":"Sound"} active={!muted} onClick={onToggleMute}>
          {muted
            ? <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
            : <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          }
        </ActionBtn>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ReelPage({ apiKey, onSelect, onSave, savedItems=[], onNavigate, onSearch }) {
  const [reels,       setReels]      = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [moreLoad,    setMoreLoad]   = useState(false);
  const [page,        setPage]       = useState(1);
  const [hasMore,     setHasMore]    = useState(true);
  const [idx,         setIdx]        = useState(0);
  // DEFAULT: unmuted — user must explicitly mute
  const [muted,       setMuted]      = useState(false);

  const wrapRef  = useRef(null);
  const snapping = useRef(false);
  const ty0 = useRef(0), ty1 = useRef(0);

  // Initial load
  useEffect(() => {
    if (!apiKey) return;
    let dead = false;
    setLoading(true);
    fetchReels(apiKey,1)
      .then((d)=>{ if(!dead){ setReels(d); setHasMore(d.length>=10); setLoading(false); } })
      .catch(()=>{ if(!dead) setLoading(false); });
    return ()=>{ dead=true; };
  },[apiKey]);

  // Infinite load
  useEffect(() => {
    if (!hasMore||moreLoad||reels.length===0||idx<reels.length-4) return;
    setMoreLoad(true);
    fetchReels(apiKey,page+1)
      .then((d)=>{
        const fresh = d.filter((r)=>!reels.some((x)=>x.id===r.id));
        setReels((p)=>[...p,...fresh]);
        setPage((p)=>p+1);
        setHasMore(fresh.length>=8);
        setMoreLoad(false);
      })
      .catch(()=>setMoreLoad(false));
  },[idx,reels.length,hasMore,moreLoad]); // eslint-disable-line

  const goTo = useCallback((n)=>{
    if (snapping.current) return;
    const c = Math.max(0,Math.min(n,reels.length-1));
    if (c===idx) return;
    snapping.current = true;
    setIdx(c);
    wrapRef.current?.scrollTo({ top:c*wrapRef.current.clientHeight, behavior:"smooth" });
    setTimeout(()=>{ snapping.current=false; },420);
  },[idx,reels.length]);

  const handleBlocked = useCallback(()=>goTo(idx+1),[goTo,idx]);

  // Keyboard nav
  useEffect(() => {
    const h = (e)=>{
      if(e.key==="ArrowDown"||e.key==="j") goTo(idx+1);
      if(e.key==="ArrowUp"||e.key==="k")   goTo(idx-1);
      if(e.key==="m") setMuted((v)=>!v);
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[idx,goTo]);

  // Mouse wheel
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let acc=0, t=null;
    const h=(e)=>{
      e.preventDefault();
      acc+=e.deltaY;
      clearTimeout(t);
      t=setTimeout(()=>{ if(Math.abs(acc)>30) goTo(idx+(acc>0?1:-1)); acc=0; },50);
    };
    el.addEventListener("wheel",h,{passive:false});
    return ()=>{ el.removeEventListener("wheel",h); clearTimeout(t); };
  },[idx,goTo]);

  // Touch swipe
  const onTouchStart = (e)=>{ ty0.current=e.touches[0].clientY; };
  const onTouchMove  = (e)=>{ ty1.current=e.touches[0].clientY; };
  const onTouchEnd   = ()=>{ const d=ty0.current-ty1.current; if(Math.abs(d)>38) goTo(idx+(d>0?1:-1)); };

  const handleWatch = (reel)=>{
    const item = reel.tmdbObj ? {...reel.tmdbObj,media_type:"movie"} : {id:reel.tmdb_id,title:reel.title,media_type:"movie"};
    onSelect?.(item);
  };
  const handleSave = (reel)=>{
    const item = reel.tmdbObj ? {...reel.tmdbObj,media_type:"movie"} : {id:reel.tmdb_id,title:reel.title,media_type:"movie"};
    onSave?.(item);
  };
  const handleNav = (id)=>{ if(id==="search") onSearch?.(); else onNavigate?.(id); };
  const shouldRender = (i)=> i>=idx-1 && i<=idx+1;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;700&family=DM+Mono:wght@500&display=swap');

        /* ── KEYFRAMES ── */
        @keyframes rs         { to { transform:rotate(360deg); } }
        @keyframes slide-up   { from{transform:translateY(18px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes heart-pop  { 0%{transform:translate(-50%,-50%) scale(0);opacity:1} 55%{transform:translate(-50%,-50%) scale(1.4);opacity:1} 100%{transform:translate(-50%,-50%) scale(1);opacity:0} }
        @keyframes ripple-burst { 0%{transform:scale(0);opacity:0.5} 100%{transform:scale(3);opacity:0} }
        @keyframes shimmer    { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes fade-in    { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }

        /* ── SCROLL CONTAINER ── */
        .rp-scroll { -ms-overflow-style:none; scrollbar-width:none; }
        .rp-scroll::-webkit-scrollbar { display:none; }

        /* ── NAV ── */
        .rp-nav-btn {
          all:unset; display:flex; align-items:center; gap:6px; cursor:pointer;
          padding:5px 12px; border-radius:8px; font-size:11.5px; font-weight:500;
          font-family:'DM Sans',sans-serif; letter-spacing:0.3px;
          color:rgba(255,255,255,0.45); transition:color 0.15s,background 0.15s;
          white-space:nowrap; -webkit-tap-highlight-color:transparent;
        }
        .rp-nav-btn:hover  { color:#fff; background:rgba(255,255,255,0.08); }
        .rp-nav-btn:active { transform:scale(0.92); }

        /* ════════════════════════════════════════════════
           REEL CARD LAYOUT — responsive two-zone system
           ════════════════════════════════════════════════ */

        /* BOTTOM ZONE: sits above the progress bar, left column */
        .rc-bottom {
          position: absolute;
          bottom: 0;
          left: 0;
          z-index: 30;
          padding: 0 0 32px 20px;
          /* Right padding clears the vertical action rail */
          padding-right: 84px;
          pointer-events: none;
          max-width: 100%;
          box-sizing: border-box;
        }

        .rc-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          margin-bottom: 10px;
        }

        .rc-tag {
          background: rgba(255,255,255,0.09);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 30px;
          padding: 3px 11px;
          font-size: 10px;
          font-weight: 700;
          color: rgba(255,255,255,0.85);
          letter-spacing: 0.8px;
          font-family: 'DM Mono',monospace;
          text-transform: uppercase;
        }

        .rc-rating {
          background: rgba(241,196,15,0.1);
          border: 1px solid rgba(241,196,15,0.28);
          border-radius: 30px;
          padding: 3px 10px;
          font-size: 10px;
          font-weight: 700;
          color: #f1c40f;
          font-family: 'DM Mono',monospace;
        }

        .rc-title {
          margin: 0 0 16px 0;
          font-family: 'Bebas Neue', sans-serif;
          font-size: clamp(28px, 6vw, 52px);
          font-weight: 400;
          letter-spacing: 1.5px;
          line-height: 0.95;
          color: #fff;
          text-shadow: 0 2px 24px rgba(0,0,0,0.8), 0 0 1px rgba(0,0,0,0.9);
          word-break: break-word;
        }

        .rc-watch {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          background: linear-gradient(135deg, #00e5cc 0%, #00b4ff 60%, #a78bfa 100%);
          border: none;
          border-radius: 12px;
          color: #000;
          font-size: 13px;
          font-weight: 700;
          font-family: 'DM Sans', sans-serif;
          padding: 12px 26px;
          cursor: pointer;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          -webkit-tap-highlight-color: transparent;
          transition: transform 0.12s, box-shadow 0.2s;
          box-shadow: 0 4px 20px rgba(0,229,204,0.35), 0 2px 8px rgba(0,0,0,0.4);
          white-space: nowrap;
        }
        .rc-watch:hover {
          box-shadow: 0 6px 28px rgba(0,229,204,0.5), 0 2px 8px rgba(0,0,0,0.4);
        }

        /* ACTION RAIL: vertical column, right side */
        .rc-rail {
          position: absolute;
          right: 12px;
          bottom: 36px;
          z-index: 30;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 18px;
        }

        /* ── TABLET (600px – 900px) ── */
        @media (max-width: 900px) {
          .rc-bottom { padding-bottom: 28px; padding-left: 16px; padding-right: 78px; }
          .rc-rail   { right: 10px; bottom: 30px; gap: 15px; }
          .rc-title  { font-size: clamp(24px, 7vw, 42px); margin-bottom: 14px; }
          .rc-watch  { font-size: 12px; padding: 10px 22px; }
        }

        /* ── MOBILE PORTRAIT (≤ 520px) ── */
        @media (max-width: 520px) {
          /* Info takes full width — rail goes above */
          .rc-bottom {
            padding-right: 16px;
            padding-left: 14px;
            padding-bottom: 24px;
          }

          .rc-title { font-size: clamp(22px, 8vw, 34px); margin-bottom: 12px; letter-spacing: 1px; }

          .rc-watch { font-size: 12px; padding: 10px 20px; gap: 7px; border-radius: 10px; }

          /* Rail floats as horizontal row, anchored right, just above info */
          .rc-rail {
            flex-direction: row;
            right: 0;
            left: 0;
            bottom: auto;
            top: auto;
            /* Position above the info block — info is ~160px from bottom */
            bottom: 195px;
            justify-content: flex-end;
            padding-right: 14px;
            gap: 10px;
          }
        }

        /* ── LARGE SCREEN (> 1280px) ── */
        @media (min-width: 1280px) {
          .rc-bottom { padding-left: 32px; padding-bottom: 44px; padding-right: 100px; }
          .rc-rail   { right: 24px; bottom: 50px; gap: 22px; }
          .rc-title  { margin-bottom: 22px; }
          .rc-watch  { font-size: 14px; padding: 13px 30px; }
        }

        /* ── ULTRA-WIDE (> 1800px) ── */
        @media (min-width: 1800px) {
          .rc-bottom { padding-left: 48px; }
          .rc-rail   { right: 36px; }
        }
      `}</style>

      <div style={{
        position:"fixed", top:0, bottom:0,
        left:"var(--sidebar,0px)", right:0,
        background:"#000", overflow:"hidden",
        fontFamily:"'DM Sans','Helvetica Neue',sans-serif",
        zIndex:10,
      }}>
        {/* SCROLL STACK */}
        <div
          ref={wrapRef}
          className="rp-scroll"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{ width:"100%",height:"100%",overflowY:"scroll",scrollSnapType:"y mandatory",WebkitOverflowScrolling:"touch" }}
        >
          {/* SKELETON LOADING */}
          {loading && [0,1].map((i)=>(
            <div key={i} style={{
              width:"100%",height:"100%",flexShrink:0,scrollSnapAlign:"start",
              background:"linear-gradient(120deg,#0a0a0a 25%,#141414 50%,#0a0a0a 75%)",
              backgroundSize:"400% 400%",animation:"shimmer 1.6s ease infinite",
              display:"flex",alignItems:"center",justifyContent:"center",
            }}>
              {i===0 && (
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:14 }}>
                  <div style={{ position:"relative",width:44,height:44 }}>
                    <div style={{ position:"absolute",inset:0,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.04)" }}/>
                    <div style={{ position:"absolute",inset:0,borderRadius:"50%",border:"1.5px solid transparent",borderTopColor:"#00e5cc",animation:"rs 0.8s linear infinite" }}/>
                  </div>
                  <span style={{ fontSize:10,letterSpacing:3,color:"rgba(255,255,255,0.18)",textTransform:"uppercase",fontFamily:"'DM Mono',monospace" }}>
                    Curating Reels
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* REEL CARDS */}
          {!loading && reels.map((reel,i)=>(
            <div key={`${reel.id}-${i}`} style={{
              width:"100%",height:"100%",flexShrink:0,scrollSnapAlign:"start",
              position:"relative",overflow:"hidden",background:"#000",
            }}>
              {shouldRender(i) && (
                <ReelCard
                  reel={reel} active={i===idx} muted={muted}
                  onToggleMute={()=>setMuted((m)=>!m)}
                  onWatch={handleWatch} onSave={handleSave}
                  saved={(savedItems||[]).some((s)=>s.id===reel.tmdb_id)}
                  onBlocked={i===idx ? handleBlocked : undefined}
                />
              )}
            </div>
          ))}

          {/* EMPTY STATE */}
          {!loading && reels.length===0 && (
            <div style={{
              width:"100%",height:"100%",flexShrink:0,scrollSnapAlign:"start",
              background:"#050505",display:"flex",flexDirection:"column",
              alignItems:"center",justifyContent:"center",gap:16,
              animation:"fade-in 0.5s ease both",
            }}>
              <div style={{ fontSize:40 }}>📡</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif",fontSize:24,letterSpacing:2,color:"rgba(255,255,255,0.2)" }}>
                No Reels Found
              </div>
              <div style={{ fontSize:13,color:"rgba(255,255,255,0.22)",textAlign:"center",maxWidth:220,lineHeight:1.7,fontFamily:"'DM Sans',sans-serif" }}>
                Check your connection and try again.
              </div>
            </div>
          )}

          {/* LOAD MORE SPINNER */}
          {moreLoad && (
            <div style={{ width:"100%",height:80,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#000" }}>
              <div style={{ width:22,height:22,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.05)",borderTopColor:"#00e5cc",animation:"rs 0.8s linear infinite" }}/>
            </div>
          )}
        </div>

        {/* TOP NAV BAR */}
        <div style={{
          position:"absolute",top:0,left:0,right:0,zIndex:50,
          background:"linear-gradient(to bottom,rgba(0,0,0,0.9) 0%,rgba(0,0,0,0.3) 60%,transparent 100%)",
          pointerEvents:"none",
        }}>
          <div style={{
            display:"flex",alignItems:"center",
            padding:"14px 16px 22px",gap:2,
            overflowX:"auto",scrollbarWidth:"none",
            pointerEvents:"auto",
          }}>
            {NAV.map((n)=>(
              <button key={n.id} className="rp-nav-btn" onClick={()=>handleNav(n.id)}>
                {n.icon}{n.label}
              </button>
            ))}
          </div>
        </div>

        {/* REEL COUNTER — top right */}
        {!loading && reels.length>0 && (
          <div style={{
            position:"absolute",top:16,right:16,zIndex:51,
            fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:1.5,
            color:"rgba(255,255,255,0.28)",textTransform:"uppercase",
            pointerEvents:"none",
            animation:"fade-in 0.4s ease both",
          }}>
            {idx+1} / {reels.length}
          </div>
        )}
      </div>
    </>
  );
}