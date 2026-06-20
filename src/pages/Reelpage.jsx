/**
 * ReelPage.jsx — NovaSpark Cinema Reels
 * Visual redesign: YouTube Shorts–style top bar (back · brand · search).
 * All gesture, player, audio, and scroll logic is unchanged.
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTS ─────────────────────────────────────────────────────────────
const TMDB_BASE    = "https://api.themoviedb.org/3";
const TMDB_IMG     = "https://image.tmdb.org/t/p";
const SHARE_BASE   = "https://novasparks-gen.vercel.app";
const START_OFFSET = 30;
const CLIP_END     = 60;
const NINETY_DAYS  = 90 * 24 * 60 * 60 * 1000;
const IS_ELECTRON  = typeof window !== "undefined" && !!window.electronAPI;

// ─── DATE UTILS ──────────────────────────────────────────────────────────────
function getWatchState(reel) {
  if (!reel.release_date) return "watch";
  const diff = new Date(reel.release_date).getTime() - Date.now();
  if (diff > NINETY_DAYS) return "coming_soon";
  if (diff > 0)           return "notify";
  return "watch";
}
function formatReleaseDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ─── URL BUILDERS ────────────────────────────────────────────────────────────
function buildYTSrc(videoId) {
  const p = new URLSearchParams({
    autoplay: "1", mute: "1", controls: "0", modestbranding: "1",
    rel: "0", showinfo: "0", iv_load_policy: "3", disablekb: "1",
    fs: "0", playsinline: "1", enablejsapi: "1",
    start: String(START_OFFSET), end: String(CLIP_END),
    hl: "en", cc_lang_pref: "en", cc_load_policy: "0", vq: "small",
  });
  return `https://www.youtube.com/embed/${videoId}?${p}`;
}
function backdropUrl(path, size = "w780") { return path ? `${TMDB_IMG}/${size}${path}` : null; }
function posterUrl(path,   size = "w342") { return path ? `${TMDB_IMG}/${size}${path}` : null; }
function ytMsg(iframe, obj) { try { iframe?.contentWindow?.postMessage(JSON.stringify(obj), "*"); } catch {} }

// ─── SHUFFLE ─────────────────────────────────────────────────────────────────
function seededShuffle(arr, seed) {
  const a = [...arr]; let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    [a[i], a[(s >>> 0) % (i + 1)]] = [a[(s >>> 0) % (i + 1)], a[i]];
  }
  return a;
}

// ─── SESSION STATE ────────────────────────────────────────────────────────────
const _seenIds = new Set(), _seenMovies = new Set(), _pool = [];
let _fetching = false;
const _SEED = Date.now();
const _tmdbPages = [1, 1, 1, 1, 1];

const TMDB_SOURCES = [
  (k,p) => `${TMDB_BASE}/trending/movie/week?api_key=${k}&page=${p}&language=en-US`,
  (k,p) => `${TMDB_BASE}/movie/popular?api_key=${k}&page=${p}&language=en-US`,
  (k,p) => `${TMDB_BASE}/movie/top_rated?api_key=${k}&page=${p}&language=en-US`,
  (k,p) => `${TMDB_BASE}/movie/upcoming?api_key=${k}&page=${p}&language=en-US`,
  (k,p) => `${TMDB_BASE}/movie/now_playing?api_key=${k}&page=${p}&language=en-US`,
];
const GENRE_MAP = {
  28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",
  99:"Documentary",18:"Drama",10751:"Family",14:"Fantasy",36:"History",
  27:"Horror",10402:"Music",9648:"Mystery",10749:"Romance",878:"Sci-Fi",
  10770:"TV Movie",53:"Thriller",10752:"War",37:"Western",
};
function pickBestTrailer(videos) {
  const r = (videos||[]).filter(v=>v.site==="YouTube"&&v.key&&(v.iso_639_1==="en"||!v.iso_639_1)&&(v.type==="Trailer"||v.type==="Teaser"));
  return r.find(v=>v.type==="Trailer"&&v.official&&v.iso_639_1==="en")?.key ||
         r.find(v=>v.type==="Trailer"&&v.iso_639_1==="en")?.key ||
         r.find(v=>v.type==="Teaser"&&v.iso_639_1==="en")?.key ||
         r.find(v=>v.iso_639_1==="en")?.key || null;
}
function recencyBoost(d) {
  if (!d) return 1;
  return (Date.now()-new Date(d).getTime())/(365.25*24*3600*1000) <= 2 ? 1.2 : 1;
}
function isDiscovery(m) { return m.vote_count>50&&m.vote_count<800&&m.vote_average>=7.0; }

async function fillPool(apiKey) {
  if (_fetching) return;
  _fetching = true;
  try {
    const si = Math.floor(Math.random()*TMDB_SOURCES.length);
    const pg = _tmdbPages[si]++;
    let movies = [];
    try {
      const r = await fetch(TMDB_SOURCES[si](apiKey, pg));
      if (r.ok) {
        const d = await r.json();
        movies = (d.results||[]).filter(m=>m.original_language==="en"&&!_seenMovies.has(m.id));
      }
    } catch {}
    if (!movies.length) return;
    movies.forEach(m=>_seenMovies.add(m.id));
    const reels = [];
    for (let i=0; i<movies.length; i+=5) {
      const settled = await Promise.allSettled(
        movies.slice(i,i+5).map(m=>
          fetch(`${TMDB_BASE}/movie/${m.id}/videos?api_key=${apiKey}&language=en-US`)
            .then(r=>r.ok?r.json():{results:[]})
            .then(d=>({movie:m,videos:d.results||[]}))
            .catch(()=>({movie:m,videos:[]}))
        )
      );
      for (const res of settled) {
        if (res.status!=="fulfilled") continue;
        const {movie:m,videos} = res.value;
        const youtubeId = pickBestTrailer(videos);
        if (!youtubeId||_seenIds.has(youtubeId)) continue;
        reels.push({
          id:youtubeId, youtubeId, tmdb_id:m.id,
          title:m.title||m.original_title||"Unknown",
          overview:m.overview||"",
          genres:(m.genre_ids||[]).slice(0,2).map(id=>GENRE_MAP[id]).filter(Boolean),
          rating:m.vote_average?+m.vote_average.toFixed(1):null,
          duration:m.runtime||null, release_date:m.release_date||null,
          backdrop:m.backdrop_path||null, poster:m.poster_path||null,
          tmdbObj:m, discovery:isDiscovery(m),
          watchingNow:80+((m.id*137)%920),
          _score:(m.vote_average||5)*Math.log((m.vote_count||1)+1)*recencyBoost(m.release_date),
        });
      }
    }
    if (!reels.length) return;
    const sorted = seededShuffle(reels,_SEED^(_pool.length*2654435761)).sort((a,b)=>b._score-a._score);
    const top=sorted.slice(0,Math.ceil(sorted.length/2));
    const disc=sorted.slice(Math.ceil(sorted.length/2));
    const mixed=[];
    for (let i=0;i<Math.max(top.length,disc.length);i++){
      if(i<top.length) mixed.push(top[i]);
      if(i<disc.length) mixed.push(disc[i]);
    }
    _pool.push(...mixed);
  } finally { _fetching=false; }
}

async function fetchReels(apiKey, count=12) {
  for (let a=0;a<4&&_pool.length<count;a++){
    await fillPool(apiKey);
    if (!_pool.length) await new Promise(r=>setTimeout(r,600));
  }
  const result=[];
  while(result.length<count&&_pool.length>0){
    const reel=_pool.shift();
    if(_seenIds.has(reel.id)) continue;
    _seenIds.add(reel.id);
    result.push(reel);
  }
  if(_pool.length<15) setTimeout(()=>fillPool(apiKey),200);
  return result;
}

// ─── HAPTICS ─────────────────────────────────────────────────────────────────
const haptic = {
  light:   () => { try { navigator.vibrate?.(8);          } catch {} },
  medium:  () => { try { navigator.vibrate?.(20);         } catch {} },
  success: () => { try { navigator.vibrate?.([10,50,10]); } catch {} },
  save:    () => { try { navigator.vibrate?.([15,30,60]); } catch {} },
};

// ─── SHARE ───────────────────────────────────────────────────────────────────
async function shareReel(reel) {
  const url  = reel.tmdb_id ? `${SHARE_BASE}/reel?v=${reel.tmdb_id}` : SHARE_BASE;
  const text = reel.overview ? `${reel.title} — ${reel.overview.slice(0,100).trim()}...` : reel.title;
  if (navigator.share) {
    try { await navigator.share({ title:reel.title, text, url }); return "shared"; }
    catch (e) { if (e.name==="AbortError") return "aborted"; }
  }
  try { await navigator.clipboard.writeText(url); return "copied"; } catch { return "failed"; }
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
function ProgressBar({ active, onComplete }) {
  const [pct, setPct] = useState(0);
  const rafRef        = useRef(null);
  const startRef      = useRef(null);
  const doneRef       = useRef(false);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    if (!active) { setPct(0); doneRef.current=false; return; }
    doneRef.current  = false;
    startRef.current = performance.now();
    const tick = (now) => {
      const next = Math.min(((now - startRef.current) / 30000) * 100, 100);
      setPct(next);
      if (next >= 100) {
        if (!doneRef.current) { doneRef.current=true; onComplete?.(); }
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]); // eslint-disable-line

  return (
    <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, background:"rgba(255,255,255,0.06)", zIndex:40, pointerEvents:"none" }}>
      <div style={{ height:"100%", width:`${pct}%`, background:"linear-gradient(90deg,#00e5cc,#00b4ff,#a78bfa)", transition:"width 0.1s linear", borderRadius:"0 1px 1px 0" }}/>
    </div>
  );
}

// ─── WEB YT PLAYER ───────────────────────────────────────────────────────────
function WebYTPlayer({ videoId, active, muted, onBlocked, backdrop, poster, preload }) {
  const iframeRef                           = useRef(null);
  const [iframeInjected, setIframeInjected] = useState(false);
  const [loaded,         setLoaded]         = useState(false);
  const [videoPlaying,   setVideoPlaying]   = useState(false);
  const [spinnerDone,    setSpinnerDone]    = useState(false);

  const activeRef      = useRef(active);
  const mutedRef       = useRef(muted);
  const blockedRef     = useRef(false);
  const playerStateRef = useRef(-1);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { mutedRef.current  = muted;  }, [muted]);

  useEffect(() => { if (active || preload) setIframeInjected(true); }, [active, preload]);

  useEffect(() => {
    setLoaded(false); setVideoPlaying(false); setSpinnerDone(false);
    blockedRef.current = false; playerStateRef.current = -1;
    if (!active && !preload) setIframeInjected(false);
  }, [videoId]); // eslint-disable-line

  const applyMuteState = useCallback(() => {
    const ifr = iframeRef.current;
    if (!ifr) return;
    if (mutedRef.current) {
      ytMsg(ifr, { event:"command", func:"mute", args:[] });
    } else {
      ytMsg(ifr, { event:"command", func:"unMute",    args:[] });
      ytMsg(ifr, { event:"command", func:"setVolume", args:[100] });
    }
  }, []);

  useEffect(() => {
    const fn = (e) => {
      if (!e.data) return;
      try {
        const d = typeof e.data==="string" ? JSON.parse(e.data) : e.data;
        let state;
        if (d?.event === "onStateChange") state = d.info;
        if (d?.event === "infoDelivery")  state = d?.info?.playerState;
        if (state !== undefined && state !== null) playerStateRef.current = state;
        if (state === 1) { if (activeRef.current) { setVideoPlaying(true); setSpinnerDone(true); } }
        if (state === 0 && activeRef.current && !blockedRef.current) {
          blockedRef.current = true; setVideoPlaying(false); onBlocked?.();
        }
        if (d?.event === "onError" && activeRef.current && !blockedRef.current) {
          blockedRef.current = true; onBlocked?.();
        }
      } catch {}
    };
    window.addEventListener("message", fn);
    return () => window.removeEventListener("message", fn);
  }, [onBlocked]);

  useEffect(() => {
    if (!loaded || !iframeRef.current) return;
    const ifr = iframeRef.current;
    ytMsg(ifr, { event:"listening" });
    ytMsg(ifr, { event:"command", func:"addEventListener", args:["onStateChange"] });
    ytMsg(ifr, { event:"command", func:"addEventListener", args:["onError"] });
  }, [loaded]);

  useEffect(() => {
    if (!loaded || !iframeRef.current) return;
    const ifr = iframeRef.current;
    if (active) {
      ytMsg(ifr, { event:"command", func:"playVideo", args:[] });
      if (playerStateRef.current === 1) { setVideoPlaying(true); setSpinnerDone(true); }
      applyMuteState();
      const t1 = setTimeout(applyMuteState, 350);
      const t2 = setTimeout(applyMuteState, 800);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else {
      ytMsg(ifr, { event:"command", func:"pauseVideo", args:[] });
      ytMsg(ifr, { event:"command", func:"mute",       args:[] });
    }
  }, [active, loaded, applyMuteState]); // eslint-disable-line

  useEffect(() => {
    if (!loaded || !iframeRef.current || !active) return;
    applyMuteState();
    const t = setTimeout(applyMuteState, 350);
    return () => clearTimeout(t);
  }, [muted, loaded, applyMuteState]); // eslint-disable-line

  useEffect(() => {
    if (!active || !loaded) return;
    const t = setTimeout(() => setSpinnerDone(true), 7000);
    return () => clearTimeout(t);
  }, [active, loaded, videoId]); // eslint-disable-line

  const bgImage      = backdropUrl(backdrop, "w1280") || posterUrl(poster, "w780");
  const coverVisible = !(active && videoPlaying);

  return (
    <div style={{ position:"absolute", inset:0, background:"#000", overflow:"hidden" }}>
      {iframeInjected && (
        <iframe
          key={videoId} ref={iframeRef} src={buildYTSrc(videoId)}
          allow="autoplay; encrypted-media" allowFullScreen={false}
          frameBorder="0" scrolling="no" title="reel"
          onLoad={() => setLoaded(true)}
          style={{ position:"absolute", top:"-22%", left:"-12%", width:"124%", height:"144%", border:"none", pointerEvents:"none", display:"block", zIndex:2 }}
        />
      )}
      <div style={{
        position:"absolute", inset:0, zIndex:5,
        backgroundColor:"#0a0a12",
        backgroundImage: bgImage ? `url(${bgImage})` : undefined,
        backgroundSize:"cover", backgroundPosition:"center",
        filter: bgImage ? "brightness(0.5) saturate(1.1)" : undefined,
        opacity: coverVisible ? 1 : 0,
        transition:"opacity 0.45s ease", pointerEvents:"none", willChange:"opacity",
      }}/>
      <div style={{
        position:"absolute", inset:0, zIndex:6, pointerEvents:"none",
        background:`
          linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 22%),
          linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 15%, rgba(0,0,0,0.1) 45%, transparent 65%)
        `,
      }}/>
      {active && !spinnerDone && (
        <div style={{ position:"absolute", inset:0, zIndex:25, pointerEvents:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ position:"relative", width:52, height:52 }}>
            <div style={{ position:"absolute", inset:0, borderRadius:"50%", border:"1.5px solid rgba(255,255,255,0.06)"}}/>
            <div style={{ position:"absolute", inset:0, borderRadius:"50%", border:"1.5px solid transparent", borderTopColor:"#00e5cc", animation:"spin 0.8s linear infinite"}}/>
            <div style={{ position:"absolute", inset:7, borderRadius:"50%", border:"1px solid transparent", borderTopColor:"rgba(167,139,250,0.5)", animation:"spin 1.4s linear infinite reverse"}}/>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ELECTRON PLAYER ─────────────────────────────────────────────────────────
function ElectronVideoPlayer({ videoId, active, muted, onBlocked, backdrop, poster, preload }) {
  const videoRef                          = useRef(null);
  const [streamUrl,  setStreamUrl]        = useState(null);
  const [videoPlaying, setVideoPlaying]   = useState(false);
  const [spinnerDone,  setSpinnerDone]    = useState(false);
  const [fetching,   setFetching]         = useState(false);
  const [fetchError, setFetchError]       = useState(false);
  const activeRef  = useRef(active);
  const videoIdRef = useRef(videoId);
  const blockedRef = useRef(false);

  useEffect(() => { activeRef.current  = active;  }, [active]);
  useEffect(() => { videoIdRef.current = videoId; }, [videoId]);

  useEffect(() => {
    setStreamUrl(null); setVideoPlaying(false); setSpinnerDone(false);
    setFetching(false); setFetchError(false); blockedRef.current=false;
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src=""; }
  }, [videoId]);

  useEffect(() => {
    if ((!active&&!preload)||streamUrl||fetching||fetchError) return;
    if (!window.electronAPI?.getTrailerStream) { setFetchError(true); return; }
    setFetching(true);
    const cid = videoId;
    window.electronAPI.getTrailerStream(videoId)
      .then(r => {
        if (videoIdRef.current!==cid) return;
        if (r?.url) { setStreamUrl(r.url); }
        else { setFetchError(true); if(activeRef.current&&!blockedRef.current){blockedRef.current=true;setTimeout(()=>onBlocked?.(),3000);} }
      })
      .catch(()=>{ if(videoIdRef.current!==cid)return; setFetchError(true); if(activeRef.current&&!blockedRef.current){blockedRef.current=true;setTimeout(()=>onBlocked?.(),3000);} })
      .finally(()=>{ if(videoIdRef.current===cid) setFetching(false); });
  }, [active, preload, videoId]); // eslint-disable-line

  useEffect(() => {
    const v=videoRef.current;
    if (!v||!streamUrl) return;
    if (active) v.play().catch(()=>{}); else { v.pause(); v.muted=true; }
  }, [active, streamUrl]);

  useEffect(() => { if (videoRef.current) videoRef.current.muted=muted; }, [muted]);

  const bgImage = backdropUrl(backdrop,"w1280")||posterUrl(poster,"w780");

  return (
    <div style={{ position:"absolute", inset:0, background:"#000", overflow:"hidden" }}>
      {streamUrl && (
        <video ref={videoRef} src={streamUrl} autoPlay muted={muted} playsInline
          onCanPlay={()=>setSpinnerDone(true)}
          onPlaying={()=>{ setVideoPlaying(true); setSpinnerDone(true); }}
          onEnded={()=>{ if(activeRef.current&&!blockedRef.current){blockedRef.current=true;setVideoPlaying(false);onBlocked?.();} }}
          onError={()=>{ setFetchError(true); if(activeRef.current&&!blockedRef.current){blockedRef.current=true;setTimeout(()=>onBlocked?.(),2500);} }}
          style={{ position:"absolute", top:"-22%", left:"-12%", width:"124%", height:"144%", objectFit:"cover", zIndex:2, pointerEvents:"none" }}
        />
      )}
      <div style={{ position:"absolute", inset:0, zIndex:5, backgroundColor:"#0a0a12", backgroundImage:bgImage?`url(${bgImage})`:undefined, backgroundSize:"cover", backgroundPosition:"center", filter:bgImage?"brightness(0.5)":undefined, opacity:(active&&videoPlaying)?0:1, transition:"opacity 0.45s ease", pointerEvents:"none" }}/>
      <div style={{ position:"absolute", inset:0, zIndex:6, pointerEvents:"none", background:`linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, transparent 22%),linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 15%, rgba(0,0,0,0.1) 45%, transparent 65%)` }}/>
      {(fetching||(!spinnerDone&&active&&!fetchError)) && (
        <div style={{ position:"absolute", inset:0, zIndex:25, pointerEvents:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ position:"relative", width:52, height:52 }}>
            <div style={{ position:"absolute", inset:0, borderRadius:"50%", border:"1.5px solid rgba(255,255,255,0.06)"}}/>
            <div style={{ position:"absolute", inset:0, borderRadius:"50%", border:"1.5px solid transparent", borderTopColor:"#00e5cc", animation:"spin 0.8s linear infinite"}}/>
            <div style={{ position:"absolute", inset:7, borderRadius:"50%", border:"1px solid transparent", borderTopColor:"rgba(167,139,250,0.5)", animation:"spin 1.4s linear infinite reverse"}}/>
          </div>
        </div>
      )}
      {fetchError&&!streamUrl&&active&&(
        <div style={{ position:"absolute", bottom:160, left:"50%", transform:"translateX(-50%)", zIndex:25, pointerEvents:"none", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(12px)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"7px 16px", fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:2, color:"rgba(255,255,255,0.2)", textTransform:"uppercase", whiteSpace:"nowrap" }}>
          Trailer unavailable
        </div>
      )}
    </div>
  );
}

// ─── UNIFIED PLAYER ──────────────────────────────────────────────────────────
function YTPlayer(props) {
  return IS_ELECTRON ? <ElectronVideoPlayer {...props}/> : <WebYTPlayer {...props}/>;
}

// ─── SWIPE INDICATOR ─────────────────────────────────────────────────────────
function SwipeIndicator({ dir, opacity }) {
  if (!dir || opacity <= 0) return null;
  const isRight = dir === "right";
  return (
    <div style={{ position:"absolute", inset:0, zIndex:55, pointerEvents:"none", display:"flex", alignItems:"center", justifyContent:isRight?"flex-start":"flex-end", padding:"0 28px", opacity, transition:"opacity 0.05s" }}>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, background:isRight?"rgba(0,229,204,0.18)":"rgba(167,139,250,0.18)", border:`1.5px solid ${isRight?"rgba(0,229,204,0.5)":"rgba(167,139,250,0.5)"}`, borderRadius:20, padding:"14px 20px", backdropFilter:"blur(8px)" }}>
        {isRight
          ? <svg width="28" height="28" viewBox="0 0 24 24" fill="#00e5cc"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
          : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        }
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:1.2, textTransform:"uppercase", fontFamily:"'DM Mono',monospace", color:isRight?"#00e5cc":"#a78bfa" }}>
          {isRight?"Save":"Back"}
        </span>
      </div>
    </div>
  );
}

// ─── ACTION BUTTON ────────────────────────────────────────────────────────────
function ActionBtn({ children, label, active, count, onClick }) {
  const [pop, setPop] = useState(false);
  const stopAll = e => { e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation?.(); };
  const handle  = e => { stopAll(e); setPop(true); setTimeout(()=>setPop(false),150); onClick(); };
  return (
    <button
      onPointerDown={stopAll} onPointerUp={stopAll} onPointerMove={stopAll} onPointerCancel={stopAll}
      onTouchStart={stopAll}  onTouchEnd={stopAll}  onTouchMove={stopAll}   onTouchCancel={stopAll}
      onClick={handle}
      style={{ all:"unset", display:"flex", flexDirection:"column", alignItems:"center", gap:6, cursor:"pointer", WebkitTapHighlightColor:"transparent", userSelect:"none", touchAction:"none" }}
    >
      <div style={{ width:48, height:48, display:"flex", alignItems:"center", justifyContent:"center", color:active?"#00e5cc":"rgba(255,255,255,0.92)", transform:pop?"scale(0.60)":"scale(1)", transition:"transform 0.15s cubic-bezier(0.34,1.56,0.64,1), color 0.18s", filter:active?"drop-shadow(0 0 8px rgba(0,229,204,0.7))":"drop-shadow(0 2px 8px rgba(0,0,0,0.9))" }}>
        {children}
      </div>
      {(label||count!==undefined) && (
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:1, textTransform:"uppercase", color:active?"#00e5cc":"rgba(255,255,255,0.4)", fontFamily:"'DM Mono',monospace", lineHeight:1, transition:"color 0.18s", textShadow:"0 1px 6px rgba(0,0,0,0.95)" }}>
          {count!==undefined ? count : label}
        </span>
      )}
    </button>
  );
}

// ─── WATCH BUTTON ─────────────────────────────────────────────────────────────
function WatchButton({ reel, onClick }) {
  const state = getWatchState(reel);
  const cfg = {
    watch:      { label:"Watch Now", style:{ background:"linear-gradient(135deg,#00e5cc 0%,#00b4ff 55%,#a78bfa 100%)", color:"#000", boxShadow:"0 4px 22px rgba(0,229,204,0.3),0 2px 8px rgba(0,0,0,0.5)" },
                  icon:<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> },
    notify:     { label:`Notify Me · ${formatReleaseDate(reel.release_date)}`, style:{ background:"rgba(167,139,250,0.18)", color:"#a78bfa", border:"1.5px solid rgba(167,139,250,0.45)" },
                  icon:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> },
    coming_soon:{ label:`Coming · ${formatReleaseDate(reel.release_date)}`, style:{ background:"rgba(255,255,255,0.06)", color:"rgba(255,255,255,0.5)", border:"1.5px solid rgba(255,255,255,0.12)", cursor:"default" },
                  icon:<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  }[state];
  return (
    <button
      onPointerDown={e=>{ e.stopPropagation(); if(state!=="coming_soon") e.currentTarget.style.transform="scale(0.94)"; }}
      onPointerUp={e=>{ e.currentTarget.style.transform="scale(1)"; }}
      onPointerLeave={e=>{ e.currentTarget.style.transform="scale(1)"; }}
      onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}
      onTouchMove={e=>e.stopPropagation()} onTouchCancel={e=>e.stopPropagation()}
      onClick={e=>{ e.stopPropagation(); if(state!=="coming_soon") onClick(reel,state); }}
      style={{ all:"unset", pointerEvents:"auto", display:"inline-flex", alignItems:"center", gap:7, borderRadius:10, padding:"11px 20px", fontSize:11, fontWeight:800, fontFamily:"'DM Sans',sans-serif", letterSpacing:0.7, textTransform:"uppercase", WebkitTapHighlightColor:"transparent", transition:"box-shadow 0.2s,transform 0.1s", whiteSpace:"nowrap", touchAction:"manipulation", ...cfg.style }}
    >
      {cfg.icon}{cfg.label}
    </button>
  );
}

// ─── INFO OVERLAY ─────────────────────────────────────────────────────────────
function InfoOverlay({ reel, visible, onClose }) {
  if (!visible||!reel) return null;
  return (
    <div
      style={{ position:"absolute", inset:0, zIndex:70, background:"rgba(0,0,0,0.88)", backdropFilter:"blur(20px)", display:"flex", flexDirection:"column", justifyContent:"flex-end", padding:"0 24px 80px", animation:"slide-up-full 0.35s cubic-bezier(0.22,1,0.36,1) both" }}
      onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()}
      onTouchEnd={e=>e.stopPropagation()} onClick={e=>{ e.stopPropagation(); onClose(); }}
    >
      <div onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:14 }}>
          {reel.genres.map(g=><span key={g} style={{ background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:30, padding:"3px 11px", fontSize:9, fontWeight:700, fontFamily:"'DM Mono',monospace", letterSpacing:1, color:"rgba(255,255,255,0.65)", textTransform:"uppercase" }}>{g}</span>)}
          {reel.rating&&<span style={{ background:"rgba(241,196,15,0.08)", border:"1px solid rgba(241,196,15,0.25)", borderRadius:30, padding:"3px 10px", fontSize:9, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"#f1c40f" }}>★ {reel.rating}</span>}
          {reel.discovery&&<span style={{ background:"rgba(0,229,204,0.1)", border:"1px solid rgba(0,229,204,0.3)", borderRadius:30, padding:"3px 11px", fontSize:9, fontWeight:700, fontFamily:"'DM Mono',monospace", letterSpacing:1, color:"#00e5cc", textTransform:"uppercase" }}>Hidden Gem</span>}
        </div>
        <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"clamp(32px,8vw,58px)", fontWeight:400, margin:"0 0 12px", color:"#fff", letterSpacing:1.5, lineHeight:0.95 }}>{reel.title}</h2>
        {reel.release_date&&<p style={{ fontFamily:"'DM Mono',monospace", fontSize:10.5, letterSpacing:1.8, color:"rgba(255,255,255,0.35)", marginBottom:12, textTransform:"uppercase" }}>{formatReleaseDate(reel.release_date)}</p>}
        {reel.overview&&<p style={{ fontFamily:"'DM Sans',sans-serif", fontSize:14, lineHeight:1.65, color:"rgba(255,255,255,0.65)", marginBottom:24, maxWidth:480 }}>{reel.overview}</p>}
        <button onClick={onClose} style={{ all:"unset", display:"inline-flex", alignItems:"center", gap:6, padding:"9px 18px", background:"rgba(255,255,255,0.07)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:8, fontSize:11, fontFamily:"'DM Sans',sans-serif", fontWeight:600, color:"rgba(255,255,255,0.55)", letterSpacing:0.5, cursor:"pointer" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Close
        </button>
      </div>
    </div>
  );
}

// ─── REEL CARD ────────────────────────────────────────────────────────────────
function ReelCard({ reel, active, muted, preload, onToggleMute, onWatch, onSave, saved, onBlocked, swipeDir, swipeOpacity, saveFlash }) {
  const [liked,      setLiked]      = useState(false);
  const [likeCount,  setLikeCount]  = useState(()=>Math.floor(Math.random()*18000)+800);
  const [heart,      setHeart]      = useState(false);
  const [shareState, setShareState] = useState(null);
  const [showInfo,   setShowInfo]   = useState(false);
  const lastTap      = useRef(0);
  const longPressRef = useRef(null);

  const handleTap = () => {
    const now=Date.now(), dt=now-lastTap.current;
    lastTap.current=now;
    if (dt<300) {
      haptic.success();
      if (!liked) setLikeCount(c=>c+1);
      setLiked(true); setHeart(true);
      setTimeout(()=>setHeart(false),900);
    }
  };
  const handlePD = (e) => {
    if (e.target.closest("button,a,[data-gesture-stop]")) return;
    longPressRef.current=setTimeout(()=>{ haptic.medium(); setShowInfo(true); },550);
  };
  const cancelLP = () => clearTimeout(longPressRef.current);

  const handleShare = async () => {
    haptic.light();
    const r=await shareReel(reel);
    if (r==="copied"||r==="shared"){ setShareState(r); setTimeout(()=>setShareState(null),2000); }
  };
  const fmt = n => n>=1000?`${(n/1000).toFixed(1)}k`:String(n);

  return (
    <div style={{ position:"absolute", inset:0, background:"#000", overflow:"hidden" }}
      onClick={handleTap} onPointerDown={handlePD} onPointerUp={cancelLP}
      onPointerLeave={cancelLP} onPointerCancel={cancelLP}
    >
      <YTPlayer videoId={reel.youtubeId} active={active} muted={muted}
        onBlocked={onBlocked} backdrop={reel.backdrop} poster={reel.poster} preload={preload}/>
      <ProgressBar active={active} onComplete={onBlocked}/>
      <SwipeIndicator dir={swipeDir} opacity={swipeOpacity||0}/>

      {saveFlash&&<div style={{ position:"absolute", inset:0, zIndex:66, pointerEvents:"none", background:"rgba(0,229,204,0.08)", animation:"flash 0.6s ease both" }}/>}
      {heart&&(
        <div style={{ position:"absolute", top:"42%", left:"50%", transform:"translate(-50%,-50%)", zIndex:46, pointerEvents:"none", animation:"heart-pop 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards" }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="#ff4060"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </div>
      )}
      {shareState&&(
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:60, pointerEvents:"none", background:"rgba(0,0,0,0.75)", backdropFilter:"blur(16px)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, padding:"10px 20px", fontFamily:"'DM Mono',monospace", fontSize:11, letterSpacing:1.5, color:"#00e5cc", textTransform:"uppercase", animation:"fade-in 0.25s ease both", whiteSpace:"nowrap" }}>
          {shareState==="copied"?"Link Copied":"Shared"}
        </div>
      )}

      {/* Action rail */}
      <div className="rc-rail" data-gesture-stop
        onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()}
        onPointerMove={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}
        onTouchEnd={e=>e.stopPropagation()}    onTouchMove={e=>e.stopPropagation()}
        onTouchCancel={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
      >
        <ActionBtn count={fmt(likeCount)} active={liked} onClick={()=>{ haptic.medium(); setLiked(v=>{if(!v)setLikeCount(c=>c+1);return !v;}); }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill={liked?"#ff4060":"none"} stroke={liked?"#ff4060":"rgba(255,255,255,0.92)"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </ActionBtn>
        <ActionBtn label={saved?"Saved":"Save"} active={saved} onClick={()=>{ haptic.save(); onSave(reel); }}>
          {saved
            ?<svg width="24" height="24" viewBox="0 0 24 24" fill="#00e5cc"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
            :<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="1.7" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          }
        </ActionBtn>
        <ActionBtn label={shareState?"Copied":"Share"} active={!!shareState} onClick={handleShare}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="1.7" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </ActionBtn>
        <ActionBtn label={muted?"Muted":"Sound"} active={!muted} onClick={()=>{ haptic.light(); onToggleMute(); }}>
          {muted
            ?<svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
            :<svg width="24" height="24" viewBox="0 0 24 24" fill="rgba(255,255,255,0.92)"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          }
        </ActionBtn>
        <ActionBtn label="Info" active={showInfo} onClick={()=>{ haptic.light(); setShowInfo(true); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.92)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        </ActionBtn>
      </div>

      {/* Bottom metadata */}
      <div className="rc-bottom">
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8, animation:active?"fade-in 0.4s ease 0.1s both":"none" }}>
          <div style={{ display:"flex" }}>
            {[0,1,2].map(i=><div key={i} style={{ width:18, height:18, borderRadius:"50%", background:`hsl(${i*60+180},60%,55%)`, border:"1.5px solid rgba(0,0,0,0.5)", marginLeft:i>0?-6:0 }}/>)}
          </div>
          <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:11, color:"rgba(255,255,255,0.45)", letterSpacing:0.2, textShadow:"0 1px 6px rgba(0,0,0,0.9)" }}>
            {reel.watchingNow?.toLocaleString()} watching now
          </span>
        </div>
        <div className="rc-meta">
          {reel.genres.map(g=><span key={g} className="rc-tag">{g}</span>)}
          {reel.rating&&<span className="rc-rating"><svg width="8" height="8" viewBox="0 0 24 24" fill="#f1c40f" style={{ display:"inline", verticalAlign:"middle", marginRight:3 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>{reel.rating}</span>}
          {reel.discovery&&<span style={{ background:"rgba(0,229,204,0.1)", border:"1px solid rgba(0,229,204,0.3)", borderRadius:30, padding:"3px 10px", fontSize:9, fontWeight:700, fontFamily:"'DM Mono',monospace", letterSpacing:1, color:"#00e5cc", textTransform:"uppercase" }}>Hidden Gem</span>}
        </div>
        <h2 className="rc-title" style={{ animation:active?"slide-up 0.45s cubic-bezier(0.22,1,0.36,1) both":"none" }}>{reel.title}</h2>
        {reel.overview&&<p className="rc-overview" style={{ animation:active?"slide-up 0.55s cubic-bezier(0.22,1,0.36,1) 0.06s both":"none" }}>{reel.overview.length>110?reel.overview.slice(0,110).trim()+"...":reel.overview}</p>}
        <div style={{ animation:active?"slide-up 0.6s cubic-bezier(0.22,1,0.36,1) 0.1s both":"none", pointerEvents:"auto" }}>
          <WatchButton reel={reel} onClick={onWatch}/>
        </div>
      </div>

      <InfoOverlay reel={reel} visible={showInfo} onClose={()=>setShowInfo(false)}/>
    </div>
  );
}

// ─── MAIN REEL PAGE ───────────────────────────────────────────────────────────
export default function ReelPage({ apiKey, onSelect, onSave, savedItems=[], onNavigate, onSearch }) {
  const [reels,         setReels]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [moreLoad,      setMoreLoad]      = useState(false);
  const [idx,           setIdx]           = useState(0);
  const [muted,         setMuted]         = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [saveToast,     setSaveToast]     = useState(null);
  const [saveFlash,     setSaveFlash]     = useState(false);
  const [swipeState,    setSwipeState]    = useState({ dir:null, opacity:0 });

  const containerRef     = useRef(null);
  const idxRef           = useRef(0);
  const reelsRef         = useRef([]);
  const savedRef         = useRef(savedItems);
  const canNavRef        = useRef(true);
  const wheelLockRef     = useRef(false);
  const hasInteractedRef = useRef(false);

  useEffect(() => { idxRef.current   = idx;        }, [idx]);
  useEffect(() => { reelsRef.current = reels;      }, [reels]);
  useEffect(() => { savedRef.current = savedItems; }, [savedItems]);

  const goTo = useCallback((n) => {
    if (!canNavRef.current) return;
    const len = reelsRef.current.length;
    if (!len) return;
    const c = Math.max(0, Math.min(n, len - 1));
    if (c === idxRef.current) return;
    canNavRef.current = false;
    idxRef.current    = c;
    setIdx(c);
    setTimeout(() => { canNavRef.current = true; }, 420);
  }, []);

  const handleFirstInteraction = useCallback(() => {
    if (!hasInteractedRef.current) {
      hasInteractedRef.current = true;
      setHasInteracted(true);
      setMuted(false);
    }
  }, []);

  const isSavedFn = useCallback((reel) => {
    const tid = reel.tmdb_id || reel.tmdbObj?.id;
    return (savedRef.current||[]).some(s=>String(s.id)===String(tid));
  }, []);

  const handleSave = useCallback((reel) => {
    const item = reel.tmdbObj
      ? { ...reel.tmdbObj, media_type:"movie" }
      : { id:reel.tmdb_id, title:reel.title, media_type:"movie" };
    onSave?.(item);
    setSaveToast(reel.title);
    setTimeout(()=>setSaveToast(null), 2000);
  }, [onSave]);

  const handleWatch = useCallback((reel, state) => {
    const item = reel.tmdbObj
      ? { ...reel.tmdbObj, media_type:"movie" }
      : { id:reel.tmdb_id, title:reel.title, media_type:"movie" };
    if (state==="notify") {
      haptic.success();
      setSaveToast(`Notify: ${reel.title}`);
      setTimeout(()=>setSaveToast(null), 2200);
      return;
    }
    onSelect?.(item);
  }, [onSelect]);

  const handleBlocked = useCallback(() => goTo(idxRef.current + 1), [goTo]);

  // Load reels
  useEffect(() => {
    if (!apiKey) return;
    let dead = false;
    setLoading(true);
    fetchReels(apiKey, 12)
      .then(d=>{ if(!dead){ setReels(d); setLoading(false); }})
      .catch(()=>{ if(!dead) setLoading(false); });
    return ()=>{ dead=true; };
  }, [apiKey]);

  useEffect(() => {
    if (moreLoad||!reels.length||idx<reels.length-4) return;
    setMoreLoad(true);
    fetchReels(apiKey, 10)
      .then(d=>{ setReels(p=>[...p,...d]); setMoreLoad(false); })
      .catch(()=>setMoreLoad(false));
  }, [idx, reels.length, moreLoad]); // eslint-disable-line

  // Keyboard
  useEffect(() => {
    const h = (e) => {
      if (e.key==="ArrowDown"||e.key==="j"){ haptic.light(); goTo(idxRef.current+1); }
      if (e.key==="ArrowUp"  ||e.key==="k"){ haptic.light(); goTo(idxRef.current-1); }
      if (e.key==="m") setMuted(v=>!v);
    };
    window.addEventListener("keydown", h);
    return ()=>window.removeEventListener("keydown", h);
  }, [goTo]);

  // Mouse wheel
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      if (wheelLockRef.current||Math.abs(e.deltaY)<20) return;
      wheelLockRef.current = true;
      haptic.light();
      goTo(idxRef.current+(e.deltaY>0?1:-1));
      setTimeout(()=>{ wheelLockRef.current=false; }, 650);
    };
    el.addEventListener("wheel", onWheel, { passive:false });
    return ()=>el.removeEventListener("wheel", onWheel);
  }, [goTo]);

  // Touch gestures
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const g = { active:false, x0:0, y0:0, x1:0, y1:0, dir:null };
    const onStart = (e) => {
      handleFirstInteraction();
      if (e.target.closest("button,a,[data-gesture-stop]")) return;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      g.active=true; g.dir=null;
      g.x0=g.x1=t.clientX; g.y0=g.y1=t.clientY;
    };
    const onMove = (e) => {
      if (!g.active) return;
      e.preventDefault();
      const t = e.touches[0];
      g.x1=t.clientX; g.y1=t.clientY;
      const dx=g.x1-g.x0, dy=g.y1-g.y0;
      if (!g.dir && (Math.abs(dx)>10||Math.abs(dy)>10)) {
        g.dir = Math.abs(dy)>=Math.abs(dx)?"v":"h";
      }
      if (g.dir==="h") {
        const norm = Math.min(Math.abs(dx)/120, 1)*0.95;
        setSwipeState({ dir:dx>0?"right":"left", opacity:norm });
      }
    };
    const onEnd = () => {
      if (!g.active) return;
      g.active=false;
      setSwipeState({ dir:null, opacity:0 });
      const dx=g.x1-g.x0, dy=g.y1-g.y0;
      if (g.dir==="v" && Math.abs(dy)>50) {
        haptic.light();
        goTo(idxRef.current+(dy<0?1:-1));
      } else if (g.dir==="h") {
        if (dx>80) {
          const reel=reelsRef.current[idxRef.current];
          if (reel&&!isSavedFn(reel)) {
            haptic.save(); handleSave(reel);
            setSaveFlash(true); setTimeout(()=>setSaveFlash(false),700);
          }
        } else if (dx<-80) {
          haptic.light(); goTo(idxRef.current-1);
        }
      }
      g.dir=null;
    };
    el.addEventListener("touchstart",  onStart, { passive:true  });
    el.addEventListener("touchmove",   onMove,  { passive:false });
    el.addEventListener("touchend",    onEnd,   { passive:true  });
    el.addEventListener("touchcancel", onEnd,   { passive:true  });
    return ()=>{
      el.removeEventListener("touchstart",  onStart);
      el.removeEventListener("touchmove",   onMove);
      el.removeEventListener("touchend",    onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [goTo, handleFirstInteraction, isSavedFn, handleSave]);

  const shouldRender = (i) => i >= idx-1 && i <= idx+2;
  const handleNav    = (id) => id==="search" ? onSearch?.() : onNavigate?.(id);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;600;700&family=DM+Mono:wght@400;500&display=swap');

        @keyframes spin          { to { transform:rotate(360deg); } }
        @keyframes slide-up      { from{transform:translateY(22px);opacity:0;} to{transform:translateY(0);opacity:1;} }
        @keyframes slide-up-full { from{transform:translateY(100%);opacity:0;} to{transform:translateY(0);opacity:1;} }
        @keyframes heart-pop     { 0%{transform:translate(-50%,-50%) scale(0);opacity:1;} 55%{transform:translate(-50%,-50%) scale(1.4);opacity:1;} 100%{transform:translate(-50%,-50%) scale(1);opacity:0;} }
        @keyframes shimmer       { 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }
        @keyframes fade-in       { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:translateY(0);} }
        @keyframes hint-fade     { 0%{opacity:0;} 15%{opacity:1;} 75%{opacity:1;} 100%{opacity:0;} }
        @keyframes flash         { 0%{opacity:0;} 15%{opacity:1;} 70%{opacity:0.6;} 100%{opacity:0;} }

        /* ── YouTube Shorts–style top bar ─────────────────────── */
        .rp-top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px 40px;
        }
        .rp-top-icon-btn {
          all: unset;
          width: 40px; height: 40px;
          border-radius: 50%;
          background: rgba(0,0,0,0.38);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border: 1px solid rgba(255,255,255,0.1);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          flex-shrink: 0;
        }
        .rp-top-icon-btn:hover  { background: rgba(255,255,255,0.18); }
        .rp-top-icon-btn:active { transform: scale(0.88); }

        .rp-top-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          pointer-events: none;
          user-select: none;
        }
        .rp-top-brand-text {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 22px;
          letter-spacing: 3px;
          color: rgba(255,255,255,0.95);
          line-height: 1;
        }
        .rp-top-brand-ns { color: #00b4a6; }
        .rp-top-badge {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1px;
          background: linear-gradient(135deg, #f5a623, #e74c3c);
          border-radius: 4px;
          padding: 2px 6px;
          font-family: 'DM Sans', sans-serif;
          color: #fff;
          line-height: 1.6;
        }

        /* ── Action rail ──────────────────────────────────────── */
        .rc-rail {
          position: absolute;
          right: 14px;
          bottom: 110px;
          z-index: 30;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 22px;
          touch-action: none;
        }

        /* ── Bottom info ──────────────────────────────────────── */
        .rc-bottom {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 80px;
          z-index: 30;
          padding: 0 14px 90px 20px;
          pointer-events: none;
          box-sizing: border-box;
        }
        .rc-meta   { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:10px; }
        .rc-tag    { background:rgba(255,255,255,0.07); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.09); border-radius:30px; padding:3px 11px; font-size:9px; font-weight:700; color:rgba(255,255,255,0.7); letter-spacing:1px; font-family:'DM Mono',monospace; text-transform:uppercase; }
        .rc-rating { background:rgba(241,196,15,0.07); border:1px solid rgba(241,196,15,0.22); border-radius:30px; padding:3px 10px; font-size:9px; font-weight:700; color:#f1c40f; font-family:'DM Mono',monospace; display:inline-flex; align-items:center; }
        .rc-title  { margin:0 0 10px; font-family:'Bebas Neue',sans-serif; font-size:clamp(28px,7vw,54px); font-weight:400; letter-spacing:1.5px; line-height:0.95; color:#fff; text-shadow:0 2px 28px rgba(0,0,0,0.95),0 0 2px rgba(0,0,0,0.9); word-break:break-word; }
        .rc-overview { margin:0 0 14px; font-family:'DM Sans',sans-serif; font-size:12px; line-height:1.65; color:rgba(255,255,255,0.48); text-shadow:0 1px 8px rgba(0,0,0,0.95); pointer-events:none; max-width:320px; }

        /* ── Responsive ───────────────────────────────────────── */
        @media (max-width:480px) {
          .rc-rail    { right:10px; bottom:130px; gap:18px; }
          .rc-bottom  { padding-bottom:96px; padding-left:14px; right:66px; }
          .rc-title   { font-size:clamp(22px,8vw,34px); }
          .rp-top-bar { padding: 12px 12px 36px; }
          .rp-top-icon-btn { width:36px; height:36px; }
          .rp-top-brand-text { font-size:18px; letter-spacing:2.5px; }
        }
        @media (min-width:768px) and (max-width:1023px) {
          .rc-rail    { right:20px; bottom:120px; gap:24px; }
          .rc-bottom  { padding-left:32px; padding-bottom:72px; right:96px; }
          .rp-top-bar { padding: 16px 20px 48px; }
        }
        @media (min-width:1024px) {
          .rc-rail    { right:28px; bottom:130px; gap:26px; }
          .rc-bottom  { padding-left:40px; padding-bottom:60px; right:110px; }
          .rp-top-brand-text { font-size:24px; }
        }
        @media (min-width:1440px) {
          .rc-rail    { right:42px; }
          .rc-bottom  { padding-left:56px; }
        }
        @media (orientation:landscape) and (max-height:500px) {
          .rc-rail    { right:10px; bottom:60px; gap:14px; }
          .rc-bottom  { padding-bottom:50px; right:68px; }
          .rc-title   { font-size:clamp(18px,5vh,28px); margin-bottom:6px; }
          .rc-overview { display:none; }
          .rp-top-bar { padding: 8px 12px 30px; }
        }
      `}</style>

      {/* ── Outer container ── */}
      <div
        ref={containerRef}
        style={{
          position:"fixed", top:0, bottom:0,
          left:"var(--sidebar,0px)", right:0,
          background:"#000", overflow:"hidden",
          touchAction:"none", overscrollBehavior:"none",
          WebkitOverflowScrolling:"none",
          userSelect:"none", WebkitUserSelect:"none",
          fontFamily:"'DM Sans','Helvetica Neue',sans-serif",
          zIndex:10,
        }}
        onClick={handleFirstInteraction}
      >
        {/* Loading shimmer */}
        {loading && (
          <div style={{ position:"absolute", inset:0, zIndex:5, background:"linear-gradient(120deg,#090909 25%,#131313 50%,#090909 75%)", backgroundSize:"400% 400%", animation:"shimmer 1.8s ease infinite", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:16 }}>
              <div style={{ position:"relative", width:46, height:46 }}>
                <div style={{ position:"absolute", inset:0, borderRadius:"50%", border:"1.5px solid rgba(255,255,255,0.04)"}}/>
                <div style={{ position:"absolute", inset:0, borderRadius:"50%", border:"1.5px solid transparent", borderTopColor:"#00e5cc", animation:"spin 0.8s linear infinite"}}/>
              </div>
              <span style={{ fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:3.5, color:"rgba(255,255,255,0.15)", textTransform:"uppercase" }}>Curating Reels</span>
            </div>
          </div>
        )}

        {/* Reel deck */}
        {!loading && reels.map((reel, i) => {
          if (!shouldRender(i)) return null;
          return (
            <div
              key={`${reel.id}-${i}`}
              style={{
                position:"absolute", inset:0,
                transform:`translateY(${(i - idx) * 100}%)`,
                transition:"transform 0.38s cubic-bezier(0.4, 0, 0.2, 1)",
                willChange:"transform",
                zIndex: i===idx ? 2 : 1,
              }}
            >
              <ReelCard
                reel={reel} active={i===idx} muted={muted} preload={i===idx+1}
                onToggleMute={()=>setMuted(m=>!m)}
                onWatch={handleWatch} onSave={handleSave}
                saved={isSavedFn(reel)}
                onBlocked={i===idx ? handleBlocked : undefined}
                swipeDir={i===idx ? swipeState.dir : null}
                swipeOpacity={i===idx ? swipeState.opacity : 0}
                saveFlash={i===idx ? saveFlash : false}
              />
            </div>
          );
        })}

        {/* Empty state */}
        {!loading && !reels.length && (
          <div style={{ position:"absolute", inset:0, background:"#06060a", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:14, animation:"fade-in 0.5s ease both" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:2.5, color:"rgba(255,255,255,0.16)" }}>No Reels Found</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.18)", textAlign:"center", maxWidth:220, lineHeight:1.75, fontFamily:"'DM Sans',sans-serif" }}>
              Check your connection and try again.
            </div>
          </div>
        )}

        {/* More loading */}
        {moreLoad && (
          <div style={{ position:"absolute", bottom:24, left:"50%", transform:"translateX(-50%)", zIndex:50, pointerEvents:"none" }}>
            <div style={{ width:20, height:20, borderRadius:"50%", border:"1.5px solid rgba(255,255,255,0.06)", borderTopColor:"#00e5cc", animation:"spin 0.8s linear infinite"}}/>
          </div>
        )}

        {/* ── YouTube Shorts–style top bar ── */}
        <div style={{
          position:"absolute", top:0, left:0, right:0, zIndex:50,
          background:"linear-gradient(to bottom, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.22) 55%, transparent 100%)",
          pointerEvents:"none",
        }}>
          <div className="rp-top-bar" style={{ pointerEvents:"auto" }}>
            {/* Back to home */}
            <button className="rp-top-icon-btn" onClick={() => handleNav("home")} aria-label="Home">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>

            {/* NS SHORTS branding */}
            <div className="rp-top-brand">
              <span className="rp-top-brand-text">
                <span className="rp-top-brand-ns">NS</span> SHORTS
              </span>
              <span className="rp-top-badge">WORLD</span>
            </div>

            {/* Search */}
            <button className="rp-top-icon-btn" onClick={() => handleNav("search")} aria-label="Search">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Reel counter */}
        {!loading && reels.length>0 && (
          <div style={{ position:"absolute", top:18, right:18, zIndex:51, fontFamily:"'DM Mono',monospace", fontSize:9, letterSpacing:1.8, color:"rgba(255,255,255,0.22)", textTransform:"uppercase", pointerEvents:"none" }}>
            {idx+1} / {reels.length}
          </div>
        )}

        {/* First-interaction hints */}
        {!hasInteracted && !loading && reels.length>0 && (
          <>
            <div style={{ position:"absolute", bottom:170, left:"50%", transform:"translateX(-50%)", zIndex:60, pointerEvents:"none", display:"flex", alignItems:"center", gap:8, background:"rgba(0,0,0,0.55)", backdropFilter:"blur(14px)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:24, padding:"8px 18px", animation:"hint-fade 3.5s ease 1s both" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
              <span style={{ fontSize:10.5, color:"rgba(255,255,255,0.5)", fontFamily:"'DM Sans',sans-serif", whiteSpace:"nowrap", letterSpacing:0.3 }}>Tap anywhere for sound</span>
            </div>
            <div style={{ position:"absolute", bottom:130, left:"50%", transform:"translateX(-50%)", zIndex:59, pointerEvents:"none", animation:"hint-fade 4s ease 2s both" }}>
              <span style={{ fontSize:10, color:"rgba(255,255,255,0.28)", fontFamily:"'DM Mono',monospace", letterSpacing:1.5, textTransform:"uppercase", whiteSpace:"nowrap" }}>
                Swipe ↑↓ to browse · → to save · Double-tap to like
              </span>
            </div>
          </>
        )}

        {/* Save / notify toast */}
        {saveToast && (
          <div style={{ position:"absolute", top:80, left:"50%", transform:"translateX(-50%)", zIndex:75, pointerEvents:"none", background:"rgba(0,0,0,0.72)", backdropFilter:"blur(16px)", border:"1px solid rgba(0,229,204,0.25)", borderRadius:12, padding:"10px 20px", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:8, animation:"fade-in 0.25s ease both" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#00e5cc"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, letterSpacing:1, color:"#00e5cc", textTransform:"uppercase" }}>
              {saveToast.startsWith("Notify:")? saveToast : "Saved to Watchlist"}
            </span>
          </div>
        )}
      </div>
    </>
  );
}