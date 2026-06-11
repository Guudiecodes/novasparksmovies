import { useEffect, useRef, useState, useCallback } from "react";

// ── hls.js loaded from CDN at runtime — no build dep needed ──────────────────
let _hlsJs = null;
async function loadHls() {
  if (_hlsJs) return _hlsJs;
  if (window.Hls) { _hlsJs = window.Hls; return _hlsJs; }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js";
    s.onload  = () => { _hlsJs = window.Hls; resolve(_hlsJs); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function fmt(s) {
  if (!s || isNaN(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${m}:${String(sec).padStart(2,"0")}`;
}

export default function NovaSparksPlayer({
  streamUrl,         // m3u8 or mp4 URL
  subtitles = [],    // [{url, lang}]
  title = "",
  onReady,
  onError,
  onTimeUpdate,
  onPlayStateChange,
  style = {},
}) {
  const videoRef    = useRef(null);
  const hlsRef      = useRef(null);
  const containerRef= useRef(null);
  const hideTimerRef= useRef(null);
  const seekBarRef  = useRef(null);

  const [playing,      setPlaying]      = useState(false);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [duration,     setDuration]     = useState(0);
  const [volume,       setVolume]       = useState(1);
  const [muted,        setMuted]        = useState(false);
  const [buffered,     setBuffered]     = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [fullscreen,   setFullscreen]   = useState(false);
  const [levels,       setLevels]       = useState([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [showQuality,  setShowQuality]  = useState(false);
  const [showSubs,     setShowSubs]     = useState(false);
  const [activeSub,    setActiveSub]    = useState(null);
  const [error,        setError]        = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [seeking,      setSeeking]      = useState(false);
  const [showVolBar,   setShowVolBar]   = useState(false);

  // ── auto-hide controls ────────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3200);
  }, []);

  // ── HLS init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    let destroyed = false;
    setLoading(true); setError(false); setPlaying(false);
    setCurrentTime(0); setDuration(0); setLevels([]); setCurrentLevel(-1);

    const attachSubs = () => {
      // remove old tracks
      while (video.textTracks.length > 0) {
        try { video.removeChild(video.querySelector("track")); } catch { break; }
      }
      subtitles.forEach(({ url, lang }) => {
        const t = document.createElement("track");
        t.kind  = "subtitles"; t.src = url;
        t.label = lang; t.srclang = lang.slice(0,2).toLowerCase();
        video.appendChild(t);
      });
    };

    const isHls = streamUrl.includes(".m3u8") || streamUrl.includes("m3u8");

    const onCanPlay = () => { setLoading(false); onReady?.(); };
    const onErrNative = () => { setError(true); setLoading(false); onError?.(); };
    video.addEventListener("canplay",    onCanPlay);
    video.addEventListener("error",      onErrNative);

    if (isHls) {
      loadHls().then((Hls) => {
        if (destroyed) return;
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            if (destroyed) return;
            setLevels(data.levels.map((l, i) => ({ id: i, height: l.height || 0, bitrate: l.bitrate })));
            setCurrentLevel(-1); // auto
            video.play().catch(() => {});
          });
          hls.on(Hls.Events.ERROR, (_, d) => {
            if (d.fatal) { setError(true); setLoading(false); onError?.(); }
          });
          attachSubs();
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = streamUrl;
          attachSubs();
          video.play().catch(() => {});
        }
      }).catch(() => { setError(true); setLoading(false); });
    } else {
      video.src = streamUrl;
      attachSubs();
      video.play().catch(() => {});
    }

    return () => {
      destroyed = true;
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error",   onErrNative);
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
      video.pause(); video.src = "";
    };
  }, [streamUrl]); // eslint-disable-line

  // ── apply quality level ───────────────────────────────────────────────────
  useEffect(() => {
    if (hlsRef.current) hlsRef.current.currentLevel = currentLevel;
  }, [currentLevel]);

  // ── apply subtitle ─────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    Array.from(video.textTracks).forEach((t, i) => {
      t.mode = activeSub === i ? "showing" : "hidden";
    });
  }, [activeSub]);

  // ── video event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const onPlay    = () => { setPlaying(true);  onPlayStateChange?.(true);  };
    const onPause   = () => { setPlaying(false); onPlayStateChange?.(false); };
    const onTU      = () => {
      setCurrentTime(v.currentTime);
      onTimeUpdate?.(v.currentTime, v.duration);
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length-1));
    };
    const onMeta    = () => setDuration(v.duration);
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    v.addEventListener("play",       onPlay);
    v.addEventListener("pause",      onPause);
    v.addEventListener("timeupdate", onTU);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("waiting",    onWaiting);
    v.addEventListener("playing",    onPlaying);
    return () => {
      v.removeEventListener("play",       onPlay);
      v.removeEventListener("pause",      onPause);
      v.removeEventListener("timeupdate", onTU);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("waiting",    onWaiting);
      v.removeEventListener("playing",    onPlaying);
    };
  }, [onPlayStateChange, onTimeUpdate]);

  // ── fullscreen listener ───────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── touch: tap to show controls / double-tap to seek ─────────────────────
  const lastTapRef = useRef(0);
  const tapXRef    = useRef(0);
  const handleTap  = useCallback((e) => {
    const now = Date.now();
    const x   = e.touches?.[0]?.clientX ?? e.clientX;
    tapXRef.current = x;
    if (now - lastTapRef.current < 300) {
      // double tap
      const w   = containerRef.current?.offsetWidth || 300;
      const sec = x < w / 2 ? -10 : 10;
      const v   = videoRef.current; if (!v) return;
      v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + sec));
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
      resetHideTimer();
    }
  }, [resetHideTimer]);

  // ── controls actions ──────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
    resetHideTimer();
  }, [resetHideTimer]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
  }, []);

  const changeVolume = useCallback((val) => {
    const v = videoRef.current; if (!v) return;
    v.volume = val; setVolume(val);
    if (val === 0) { v.muted = true; setMuted(true); }
    else           { v.muted = false; setMuted(false); }
  }, []);

  const seek = useCallback((e) => {
    const v   = videoRef.current; if (!v || !v.duration) return;
    const bar = seekBarRef.current; if (!bar) return;
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * v.duration;
  }, []);

  const toggleFS = useCallback(() => {
    const c = containerRef.current; if (!c) return;
    if (!document.fullscreenElement) c.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }, []);

  const skip = useCallback((sec) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + sec));
    resetHideTimer();
  }, [resetHideTimer]);

  // ── progress pct ─────────────────────────────────────────────────────────
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHideTimer}
      onMouseEnter={resetHideTimer}
      onTouchStart={handleTap}
      onClick={(e) => { if (e.target === containerRef.current) togglePlay(); }}
      style={{
        position: "relative", width: "100%", height: "100%",
        background: "#000", overflow: "hidden", userSelect: "none",
        ...style,
      }}
    >
      <style>{`
        .nsp-btn { background:none; border:none; cursor:pointer; color:#fff; display:flex; align-items:center; justify-content:center; padding:0; transition:opacity .15s; }
        .nsp-btn:hover { opacity:.75; }
        .nsp-seekbar { position:relative; height:4px; border-radius:2px; background:rgba(255,255,255,.2); cursor:pointer; flex:1; }
        .nsp-seekbar:hover { height:6px; margin-top:-1px; }
        .nsp-seekbar-buf { position:absolute; top:0; left:0; height:100%; border-radius:2px; background:rgba(255,255,255,.3); pointer-events:none; }
        .nsp-seekbar-fill { position:absolute; top:0; left:0; height:100%; border-radius:2px; background:#e50914; pointer-events:none; }
        .nsp-seekbar-thumb { position:absolute; top:50%; width:13px; height:13px; border-radius:50%; background:#e50914; transform:translate(-50%,-50%) scale(0); transition:transform .1s; pointer-events:none; }
        .nsp-seekbar:hover .nsp-seekbar-thumb { transform:translate(-50%,-50%) scale(1); }
        .nsp-vol-slider { -webkit-appearance:none; appearance:none; width:70px; height:3px; border-radius:2px; background:rgba(255,255,255,.3); outline:none; cursor:pointer; }
        .nsp-vol-slider::-webkit-slider-thumb { -webkit-appearance:none; width:11px; height:11px; border-radius:50%; background:#fff; cursor:pointer; }
        .nsp-dropdown { position:absolute; bottom:56px; background:rgba(15,15,15,.97); border:1px solid rgba(255,255,255,.1); border-radius:8px; padding:4px 0; min-width:130px; box-shadow:0 8px 32px rgba(0,0,0,.8); }
        .nsp-dropdown button { display:block; width:100%; text-align:left; padding:8px 14px; background:none; border:none; color:#fff; font-size:12px; cursor:pointer; font-family:inherit; white-space:nowrap; }
        .nsp-dropdown button:hover { background:rgba(255,255,255,.08); }
        .nsp-dropdown button.active { color:#e50914; font-weight:700; }
        @keyframes nspSpin { to { transform:rotate(360deg); } }
      `}</style>

      {/* ── video element ──────────────────────────────────────────── */}
      <video
        ref={videoRef}
        style={{ width:"100%", height:"100%", display:"block", background:"#000" }}
        playsInline
        crossOrigin="anonymous"
        onClick={togglePlay}
      />

      {/* ── loading spinner ────────────────────────────────────────── */}
      {loading && !error && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none", zIndex:5 }}>
          <div style={{ width:44, height:44, borderRadius:"50%", border:"3px solid rgba(255,255,255,.12)", borderTopColor:"#e50914", animation:"nspSpin .8s linear infinite" }} />
        </div>
      )}

      {/* ── error state ────────────────────────────────────────────── */}
      {error && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, zIndex:5 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="rgba(255,255,255,.4)" stroke="none"/></svg>
          <span style={{ color:"rgba(255,255,255,.5)", fontSize:13 }}>Stream unavailable</span>
        </div>
      )}

      {/* ── double-tap seek flash ─────────────────────────────────── */}
      {/* (visual handled by parent app if desired) */}

      {/* ── gradient overlay ──────────────────────────────────────── */}
      <div style={{
        position:"absolute", inset:0, pointerEvents:"none", zIndex:2,
        background:"linear-gradient(to top, rgba(0,0,0,.75) 0%, transparent 35%, transparent 65%, rgba(0,0,0,.45) 100%)",
        opacity: showControls ? 1 : 0, transition:"opacity .3s",
      }} />

      {/* ── title bar ─────────────────────────────────────────────── */}
      <div style={{
        position:"absolute", top:0, left:0, right:0, zIndex:10,
        padding:"12px 16px 8px",
        opacity: showControls ? 1 : 0, transition:"opacity .3s",
        pointerEvents: showControls ? "auto" : "none",
      }}>
        <div style={{ fontSize:13, fontWeight:600, color:"rgba(255,255,255,.9)", textShadow:"0 1px 6px rgba(0,0,0,.8)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"70%" }}>
          {title}
        </div>
      </div>

      {/* ── centre play/pause overlay (mobile tap target) ─────────── */}
      <div style={{
        position:"absolute", inset:0, zIndex:3, display:"flex", alignItems:"center", justifyContent:"center",
        pointerEvents:"none",
        opacity: showControls ? 1 : 0, transition:"opacity .3s",
      }}>
        <button className="nsp-btn" style={{ pointerEvents:"auto", width:60, height:60, borderRadius:"50%", background:"rgba(0,0,0,.45)", backdropFilter:"blur(6px)" }} onClick={togglePlay}>
          {playing
            ? <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>}
        </button>
      </div>

      {/* ── bottom controls bar ───────────────────────────────────── */}
      <div style={{
        position:"absolute", bottom:0, left:0, right:0, zIndex:10, padding:"6px 12px 10px",
        display:"flex", flexDirection:"column", gap:6,
        opacity: showControls ? 1 : 0, transition:"opacity .3s",
        pointerEvents: showControls ? "auto" : "none",
      }}>
        {/* seek bar */}
        <div
          ref={seekBarRef}
          className="nsp-seekbar"
          style={{ transition:"height .1s, margin-top .1s" }}
          onClick={seek}
          onMouseDown={(e) => { setSeeking(true); seek(e); }}
          onMouseMove={(e) => { if (seeking) seek(e); }}
          onMouseUp={() => setSeeking(false)}
          onMouseLeave={() => setSeeking(false)}
        >
          <div className="nsp-seekbar-buf" style={{ width:`${bufPct}%` }} />
          <div className="nsp-seekbar-fill" style={{ width:`${pct}%` }} />
          <div className="nsp-seekbar-thumb" style={{ left:`${pct}%` }} />
        </div>

        {/* bottom row */}
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          {/* play/pause */}
          <button className="nsp-btn" style={{ width:32, height:32 }} onClick={togglePlay}>
            {playing
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>}
          </button>

          {/* skip back */}
          <button className="nsp-btn" style={{ width:28, height:28 }} onClick={() => skip(-10)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M12.5 8c-2.65 0-5.05 1-6.9 2.6L2 7v9h9l-3.62-3.62A7 7 0 0119 18.1l2.1-2.09C19.12 13.01 16.02 11 12.5 11c-.66 0-1.3.08-1.9.22l.3-2.72c.53-.04 1.07-.05 1.6-.01z"/></svg>
          </button>

          {/* skip fwd */}
          <button className="nsp-btn" style={{ width:28, height:28 }} onClick={() => skip(10)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M11.5 8c2.65 0 5.05 1 6.9 2.6L22 7v9h-9l3.62-3.62A7 7 0 015 18.1l-2.1-2.09C4.88 13.01 7.98 11 11.5 11c.66 0 1.3.08 1.9.22l-.3-2.72c-.53-.04-1.07-.05-1.6-.01z"/></svg>
          </button>

          {/* time */}
          <span style={{ color:"rgba(255,255,255,.8)", fontSize:11, fontVariantNumeric:"tabular-nums", minWidth:72, letterSpacing:.3 }}>
            {fmt(currentTime)} / {fmt(duration)}
          </span>

          <div style={{ flex:1 }} />

          {/* volume */}
          <div style={{ position:"relative", display:"flex", alignItems:"center", gap:5 }}
            onMouseEnter={() => setShowVolBar(true)} onMouseLeave={() => setShowVolBar(false)}>
            <button className="nsp-btn" style={{ width:28, height:28 }} onClick={toggleMute}>
              {muted || volume === 0
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                : volume < 0.5
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M7 9v6h4l5 5V4l-5 5H7zm13.5 3A7.5 7.5 0 0114 4.07v2.05A5.5 5.5 0 0118.5 12a5.5 5.5 0 01-4.5 5.88v2.06A7.5 7.5 0 0020.5 12z"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05A4.5 4.5 0 0016.5 12zM14 3.23v2.06A7 7 0 0121 12a7 7 0 01-7 6.71v2.06A9 9 0 0023 12a9 9 0 00-9-8.77z"/></svg>}
            </button>
            {showVolBar && (
              <input type="range" className="nsp-vol-slider"
                min="0" max="1" step="0.05"
                value={muted ? 0 : volume}
                onChange={(e) => changeVolume(parseFloat(e.target.value))} />
            )}
          </div>

          {/* subtitles */}
          {subtitles.length > 0 && (
            <div style={{ position:"relative" }}>
              <button className="nsp-btn" style={{ width:28, height:28, opacity: activeSub !== null ? 1 : .6 }}
                onClick={() => { setShowQuality(false); setShowSubs(v=>!v); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"/></svg>
              </button>
              {showSubs && (
                <div className="nsp-dropdown" style={{ right:0 }}>
                  <button className={activeSub===null?"active":""} onClick={()=>{setActiveSub(null);setShowSubs(false);}}>Off</button>
                  {subtitles.map((s,i)=>(
                    <button key={i} className={activeSub===i?"active":""} onClick={()=>{setActiveSub(i);setShowSubs(false);}}>{s.lang}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* quality */}
          {levels.length > 1 && (
            <div style={{ position:"relative" }}>
              <button className="nsp-btn" style={{ width:28, height:28, fontSize:10, fontWeight:700, color:"rgba(255,255,255,.85)" }}
                onClick={() => { setShowSubs(false); setShowQuality(v=>!v); }}>
                {currentLevel === -1 ? "AUTO" : `${levels[currentLevel]?.height||"?"}p`}
              </button>
              {showQuality && (
                <div className="nsp-dropdown" style={{ right:0 }}>
                  <button className={currentLevel===-1?"active":""} onClick={()=>{setCurrentLevel(-1);setShowQuality(false);}}>Auto</button>
                  {[...levels].reverse().map((l)=>(
                    <button key={l.id} className={currentLevel===l.id?"active":""} onClick={()=>{setCurrentLevel(l.id);setShowQuality(false);}}>
                      {l.height ? `${l.height}p` : `${Math.round(l.bitrate/1000)}k`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* fullscreen */}
          <button className="nsp-btn" style={{ width:28, height:28 }} onClick={toggleFS}>
            {fullscreen
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>}
          </button>
        </div>
      </div>
    </div>
  );
}