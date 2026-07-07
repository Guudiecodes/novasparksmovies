// MovieClipStudio.jsx — NovaSpark Movie Clip Compiler · v1.0
// Pulls REAL video clips from YouTube (via Invidious API) using TMDB video IDs.
// User trims each clip, arranges timeline, adds captions + music, exports WebM.
import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const TK = "8265bd1679663a7ea12ac168da84d2e8";
const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.privacyredirect.com",
  "https://inv.tux.pizza",
  "https://yt.cdaut.de",
  "https://invidious.lunar.icu",
];
const OUT_W = 1920; const OUT_H = 1080;
const FPS   = 24;

// ─── TMDB helpers ─────────────────────────────────────────────────────────────
async function searchMedia(q) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(q)}&api_key=${TK}`);
    const d = await r.json();
    return (d.results || []).filter(x => x.media_type !== "person").slice(0, 8);
  } catch { return []; }
}
async function getVideos(id, type) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/${type}/${id}/videos?api_key=${TK}`);
    const d = await r.json();
    return d.results || [];
  } catch { return []; }
}
async function getImages(id, type) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/${type}/${id}/images?include_image_language=en,null&api_key=${TK}`);
    const d = await r.json();
    return [...(d.backdrops||[]), ...(d.posters||[])].slice(0, 20);
  } catch { return []; }
}
const tmdbImg = (p, w="w1280") => p ? `https://image.tmdb.org/t/p/${w}${p}` : null;

// ─── Video type labels & priority ─────────────────────────────────────────────
const VIDEO_TYPE_RANK = { Clip:1, Featurette:2, "Behind the Scenes":3, Trailer:4, Teaser:5 };
const VIDEO_TYPE_ICON = { Clip:"🎬", Featurette:"🎥", "Behind the Scenes":"🎞️", Trailer:"📽️", Teaser:"✂️" };

// ─── Invidious stream resolver — tries instances until one works ──────────────
async function resolveStream(videoId) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const r = await fetch(
        `${base}/api/v1/videos/${videoId}?fields=formatStreams,adaptiveFormats,title,lengthSeconds`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (!r.ok) continue;
      const d = await r.json();
      const streams = (d.formatStreams || []).filter(f => f.url && f.quality);
      const ranked  = streams.sort((a,b)=>parseInt(b.quality||0)-parseInt(a.quality||0));
      const best    = ranked.find(f => f.quality === "720p" || f.quality === "480p") || ranked[0];
      if (best?.url) return { url: best.url, duration: d.lengthSeconds || 60, title: d.title };
    } catch { continue; }
  }
  return null;
}

// ─── Canvas image loader (CORS) ───────────────────────────────────────────────
function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = "anonymous";
    im.onload = () => res(im); im.onerror = () => rej(new Error("img_fail"));
    im.src = src;
  });
}

// ─── Ken Burns effect on canvas ───────────────────────────────────────────────
function drawKenBurns(ctx, img, W, H, progress) {
  const scale  = 1.08 + 0.07 * Math.sin(progress * Math.PI);
  const cover  = Math.max(W / img.naturalWidth, H / img.naturalHeight) * scale;
  const dw = img.naturalWidth * cover; const dh = img.naturalHeight * cover;
  const dx = (W - dw) / 2 + (progress - 0.5) * 30;
  const dy = (H - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// ─── Color grading LUT simulation ────────────────────────────────────────────
const GRADES = {
  none:       { label:"Original",  fn: null },
  cinematic:  { label:"Cinematic", fn: (r,g,b)=>([r*0.88+10, g*0.82+5,  b*0.72+15]) },
  warm:       { label:"Warm",      fn: (r,g,b)=>([Math.min(255,r*1.12), g*0.97, b*0.84]) },
  cold:       { label:"Cold",      fn: (r,g,b)=>([r*0.85, g*0.95, Math.min(255,b*1.18)]) },
  neon:       { label:"Neon",      fn: (r,g,b)=>([Math.min(255,r*0.9+20), Math.min(255,g*1.0), Math.min(255,b*1.1+10)]) },
  vintage:    { label:"Vintage",   fn: (r,g,b)=>([Math.min(255,r*1.0+15), g*0.88+10, b*0.72+20]) },
  bw:         { label:"B&W",       fn: (r,g,b)=>{ const v=r*0.299+g*0.587+b*0.114; return [v,v,v]; } },
};

function applyGrade(ctx, W, H, grade) {
  const fn = GRADES[grade]?.fn;
  if (!fn) return;
  const id = ctx.getImageData(0, 0, W, H); const d = id.data;
  for (let i=0; i<d.length; i+=4) {
    const [nr,ng,nb] = fn(d[i],d[i+1],d[i+2]);
    d[i]=Math.round(nr); d[i+1]=Math.round(ng); d[i+2]=Math.round(nb);
  }
  ctx.putImageData(id, 0, 0);
}

// ─── Draw text with background ────────────────────────────────────────────────
function drawCaption(ctx, text, W, H, position="bottom") {
  if (!text) return;
  ctx.save();
  const fontSize = Math.round(W * 0.034);
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  const metrics = ctx.measureText(text);
  const pad = fontSize * 0.5;
  const bw = metrics.width + pad * 2;
  const bh = fontSize * 1.6;
  const bx = (W - bw) / 2;
  const by = position === "bottom" ? H * 0.86 : H * 0.08;
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 6);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, by + bh / 2);
  ctx.restore();
}

// ─── Fade transition helper ───────────────────────────────────────────────────
function drawFade(ctx, W, H, alpha, color="#000") {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ─── WAV to AudioBuffer (for mixing into video) ───────────────────────────────
// (Music passed in as a URL — we decode and mix via OfflineAudioContext + canvas audio track)
// For now we handle music separately and let user use the downloaded WAV.

// ─── Clip item component ──────────────────────────────────────────────────────
function ClipCard({ clip, index, onRemove, onUpdate, onMoveUp, onMoveDown, total }) {
  const [expanded, setExpanded] = useState(false);

  const typeIcon = VIDEO_TYPE_ICON[clip.videoType] || "🎬";
  const maxDur   = clip.totalDuration || 60;

  return (
    <div style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,overflow:"hidden",marginBottom:8 }}>
      {/* Clip header */}
      <div style={{ display:"flex",alignItems:"center",gap:8,padding:"10px 12px",cursor:"pointer" }} onClick={()=>setExpanded(v=>!v)}>
        <span style={{ fontSize:18,flexShrink:0 }}>{typeIcon}</span>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontSize:12,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
            {clip.title || clip.videoType || "Clip"}
          </div>
          <div style={{ fontSize:10,color:"rgba(255,255,255,0.35)" }}>
            {clip.inPoint.toFixed(1)}s–{clip.outPoint.toFixed(1)}s
            {clip.caption && " · " + clip.caption.slice(0,20) + (clip.caption.length>20?"…":"")}
            {clip.streamUrl ? " · ✅ stream" : clip.imageSrc ? " · 🖼️ image fallback" : " · ⏳ loading"}
          </div>
        </div>
        <div style={{ display:"flex",gap:4,flexShrink:0 }}>
          {index > 0       && <button onClick={e=>{e.stopPropagation();onMoveUp(index);}}   style={{ all:"unset",cursor:"pointer",padding:"2px 6px",borderRadius:5,background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.5)",fontSize:11 }}>↑</button>}
          {index<total-1   && <button onClick={e=>{e.stopPropagation();onMoveDown(index);}} style={{ all:"unset",cursor:"pointer",padding:"2px 6px",borderRadius:5,background:"rgba(255,255,255,0.07)",color:"rgba(255,255,255,0.5)",fontSize:11 }}>↓</button>}
          <button onClick={e=>{e.stopPropagation();onRemove(index);}} style={{ all:"unset",cursor:"pointer",padding:"2px 6px",borderRadius:5,background:"rgba(255,80,50,0.15)",color:"#ff6644",fontSize:11 }}>×</button>
        </div>
      </div>

      {/* Expanded controls */}
      {expanded && (
        <div style={{ padding:"0 12px 12px",borderTop:"1px solid rgba(255,255,255,0.05)" }}>
          {/* In/Out range */}
          <div style={{ marginTop:10 }}>
            <div style={{ display:"flex",justifyContent:"space-between",fontSize:10,color:"rgba(255,255,255,0.4)",marginBottom:4 }}>
              <span>In: {clip.inPoint.toFixed(1)}s</span>
              <span>Duration: {(clip.outPoint-clip.inPoint).toFixed(1)}s</span>
              <span>Out: {clip.outPoint.toFixed(1)}s</span>
            </div>
            <div style={{ display:"flex",gap:6,marginBottom:8 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:10,color:"rgba(255,255,255,0.35)" }}>In point</label>
                <input type="range" min={0} max={Math.max(0,clip.outPoint-1)} step={0.5} value={clip.inPoint}
                  onChange={e=>onUpdate(index,{inPoint:+e.target.value})}
                  style={{ width:"100%",accentColor:"#00b4a6" }}/>
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:10,color:"rgba(255,255,255,0.35)" }}>Out point</label>
                <input type="range" min={clip.inPoint+0.5} max={maxDur} step={0.5} value={clip.outPoint}
                  onChange={e=>onUpdate(index,{outPoint:+e.target.value})}
                  style={{ width:"100%",accentColor:"#00b4a6" }}/>
              </div>
            </div>
          </div>

          {/* Caption */}
          <input value={clip.caption||""} onChange={e=>onUpdate(index,{caption:e.target.value})}
            placeholder="Caption for this clip…"
            style={{ width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"7px 10px",color:"#fff",fontSize:12,outline:"none" }}/>
        </div>
      )}
    </div>
  );
}

// ─── Main MovieClipStudio ─────────────────────────────────────────────────────
export default function MovieClipStudio({ onClose, brand="#00b4a6", externalMusicUrl=null, externalMusicLabel=null }) {
  const [searchQ,     setSearchQ]    = useState("");
  const [results,     setResults]    = useState([]);
  const [searching,   setSearching]  = useState(false);
  const [movie,       setMovie]      = useState(null);  // selected TMDB item
  const [allVideos,   setAllVideos]  = useState([]);    // TMDB videos list
  const [images,      setImages]     = useState([]);    // TMDB backdrop/poster
  const [clips,       setClips]      = useState([]);    // timeline clips
  const [loadingClip, setLoadingClip]= useState(null);  // which clip is resolving
  const [step,        setStep]       = useState("search"); // search|build|export
  const [exporting,   setExporting]  = useState(false);
  const [exportPct,   setExportPct]  = useState(0);
  const [exportUrl,   setExportUrl]  = useState(null);
  const [title,       setTitle]      = useState("");
  const [grade,       setGrade]      = useState("none");
  const [transition,  setTransition] = useState("fade"); // fade|cut|flash
  const [useMusic,    setUseMusic]   = useState(!!externalMusicUrl);
  const [errMsg,      setErrMsg]     = useState("");

  const searchTimer = useRef(null);
  const canvasRef   = useRef(null);
  const hiddenVideo = useRef(document.createElement("video"));

  useEffect(()=>{ hiddenVideo.current.muted = true; hiddenVideo.current.crossOrigin = "anonymous"; },[]);
  useEffect(()=>()=>{if(exportUrl) URL.revokeObjectURL(exportUrl);},[]);

  const doSearch = (q) => {
    setSearchQ(q);
    clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async ()=>{
      setSearching(true);
      setResults(await searchMedia(q));
      setSearching(false);
    }, 350);
  };

  const selectMovie = async (item) => {
    setMovie(item);
    setResults([]);
    setStep("build");
    setTitle(item.title || item.name || "");
    const mediaType = item.media_type || (item.first_air_date ? "tv" : "movie");

    // Fetch videos AND images in parallel
    const [vids, imgs] = await Promise.all([
      getVideos(item.id, mediaType),
      getImages(item.id, mediaType),
    ]);

    const sorted = vids.sort((a,b)=>(VIDEO_TYPE_RANK[a.type]||99)-(VIDEO_TYPE_RANK[b.type]||99));
    setAllVideos(sorted.filter(v=>v.site==="YouTube"));
    setImages(imgs);
  };

  // Add a YouTube clip to the timeline and resolve its stream URL
  const addClip = useCallback(async (ytVideo) => {
    const id = clips.length;
    const draft = {
      id: Date.now(),
      videoId:     ytVideo.key,
      videoType:   ytVideo.type,
      title:       ytVideo.name,
      inPoint:     0,
      outPoint:    Math.min(30, 30),
      totalDuration: 60,
      streamUrl:   null,
      imageSrc:    null,
      caption:     "",
    };
    setClips(p => [...p, draft]);
    setLoadingClip(id);

    // Try to resolve actual stream
    const stream = await resolveStream(ytVideo.key);
    if (stream) {
      setClips(p => p.map(c =>
        c.id === draft.id
          ? { ...c, streamUrl: stream.url, totalDuration: stream.duration, outPoint: Math.min(30, stream.duration) }
          : c
      ));
    } else {
      // Fallback: use a relevant movie image with Ken Burns
      const fallbackImg = images[Math.floor(Math.random() * Math.max(images.length,1))];
      const src = fallbackImg ? tmdbImg(fallbackImg.file_path,"w1280") : null;
      setClips(p => p.map(c =>
        c.id === draft.id ? { ...c, imageSrc: src, outPoint: 8 } : c
      ));
    }
    setLoadingClip(null);
  }, [clips.length, images]);

  // Add an image (Ken Burns) clip directly
  const addImageClip = useCallback((imgObj) => {
    setClips(p => [...p, {
      id: Date.now(), videoId: null, videoType: "Image",
      title: "Scene", inPoint: 0, outPoint: 6, totalDuration: 6,
      streamUrl: null, imageSrc: tmdbImg(imgObj.file_path,"w1280"), caption: "",
    }]);
  }, []);

  const updateClip  = (i,patch) => setClips(p=>p.map((c,idx)=>idx===i?{...c,...patch}:c));
  const removeClip  = (i) => setClips(p=>p.filter((_,idx)=>idx!==i));
  const moveUp      = (i) => { if(i<=0)return; setClips(p=>{const a=[...p];[a[i-1],a[i]]=[a[i],a[i-1]];return a;}); };
  const moveDown    = (i) => { if(i>=clips.length-1)return; setClips(p=>{const a=[...p];[a[i],a[i+1]]=[a[i+1],a[i]];return a;}); };

  const totalRuntime = clips.reduce((s,c)=>s+(c.outPoint-c.inPoint),0);

  // ── VIDEO EXPORT ─────────────────────────────────────────────────────────────
  const exportVideo = async () => {
    if (!clips.length) return;
    setExporting(true); setExportPct(0); setErrMsg(""); setExportUrl(null);

    const canvas  = canvasRef.current;
    canvas.width  = OUT_W;
    canvas.height = OUT_H;
    const ctx     = canvas.getContext("2d");

    const stream  = canvas.captureStream(FPS);
    const mime    = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus" : "video/webm";
    const rec     = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks  = [];
    rec.ondataavailable = e=>{ if(e.data.size) chunks.push(e.data); };
    const done = new Promise(r=>{ rec.onstop = r; });
    rec.start();

    let overallFrames = 0;
    const totalFrames = clips.reduce((s,c)=>s+Math.ceil((c.outPoint-c.inPoint)*FPS),0)
      + clips.length * Math.ceil(0.5 * FPS); // transition frames
    const bv = hiddenVideo.current;

    const fillBg = () => {
      ctx.fillStyle = "#000"; ctx.fillRect(0,0,OUT_W,OUT_H);
    };

    const writeTitle = (text, subtitle="") => {
      ctx.fillStyle = "#000"; ctx.fillRect(0,0,OUT_W,OUT_H);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = `bold ${OUT_W*0.042}px Arial`; ctx.fillText(text, OUT_W/2, OUT_H*0.46);
      if (subtitle) {
        ctx.font = `${OUT_W*0.022}px Arial`; ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillText(subtitle, OUT_W/2, OUT_H*0.54);
      }
    };

    const recordFrameCount = async (n) => {
      for (let f=0; f<n; f++) { await new Promise(r=>setTimeout(r,0)); }
    };

    try {
      // ── Opening title (1 second) ──────────────────────────────────────────
      if (title) {
        for (let f=0; f<FPS; f++) {
          const alpha = f < FPS*0.3 ? f/(FPS*0.3) : 1;
          fillBg();
          ctx.save(); ctx.globalAlpha = alpha;
          writeTitle(title, movie?.release_date?.slice(0,4) || "");
          ctx.restore();
          await new Promise(r=>setTimeout(r,0));
        }
      }

      // ── Clips ─────────────────────────────────────────────────────────────
      for (let ci=0; ci<clips.length; ci++) {
        const clip = clips[ci];
        const clipDur   = clip.outPoint - clip.inPoint;
        const clipFrames= Math.ceil(clipDur * FPS);
        const tranFrames= Math.ceil(0.5  * FPS);

        if (clip.streamUrl) {
          // ── Real video clip ──────────────────────────────────────────────
          bv.src = clip.streamUrl;
          await new Promise((res,rej)=>{
            bv.onloadedmetadata = res;
            setTimeout(()=>rej(new Error("video_timeout")),10000);
          }).catch(()=>{});

          for (let f=0; f<clipFrames; f++) {
            const t = clip.inPoint + (f/FPS);
            if (Math.abs(bv.currentTime - t) > 0.08) {
              bv.currentTime = t;
              await new Promise(res=>{ bv.onseeked = res; setTimeout(res,300); });
            }
            fillBg();
            try { ctx.drawImage(bv, 0, 0, OUT_W, OUT_H); } catch {}
            if (grade !== "none") applyGrade(ctx, OUT_W, OUT_H, grade);
            if (clip.caption) drawCaption(ctx, clip.caption, OUT_W, OUT_H);

            // Fade-in for first clip
            if (ci === 0 && f < FPS * 0.4) {
              drawFade(ctx, OUT_W, OUT_H, 1 - (f/(FPS*0.4)));
            }

            overallFrames++;
            if (f % 24 === 0) setExportPct(Math.round((overallFrames/totalFrames)*90));
            await new Promise(r=>setTimeout(r,0));
          }

        } else if (clip.imageSrc) {
          // ── Ken Burns on image ────────────────────────────────────────────
          let imgEl = null;
          try { imgEl = await loadImg(clip.imageSrc); } catch {}

          for (let f=0; f<clipFrames; f++) {
            fillBg();
            if (imgEl) {
              const progress = f / clipFrames;
              drawKenBurns(ctx, imgEl, OUT_W, OUT_H, progress);
            }
            if (grade !== "none") applyGrade(ctx, OUT_W, OUT_H, grade);
            if (clip.caption) drawCaption(ctx, clip.caption, OUT_W, OUT_H);
            if (ci===0 && f < FPS*0.4) drawFade(ctx, OUT_W, OUT_H, 1-(f/(FPS*0.4)));

            overallFrames++;
            if (f % 12 === 0) setExportPct(Math.round((overallFrames/totalFrames)*90));
            await new Promise(r=>setTimeout(r,0));
          }
        }

        // ── Transition to next clip ──────────────────────────────────────────
        if (ci < clips.length - 1) {
          for (let f=0; f<tranFrames; f++) {
            const a = f / tranFrames;
            if (transition === "fade")  drawFade(ctx, OUT_W, OUT_H, a);
            if (transition === "flash") { ctx.fillStyle="#fff"; ctx.globalAlpha=Math.sin(a*Math.PI)*0.9; ctx.fillRect(0,0,OUT_W,OUT_H); ctx.globalAlpha=1; }
            if (transition === "cut")   {} // no effect, hard cut
            overallFrames++;
            await new Promise(r=>setTimeout(r,0));
          }
        }
      }

      // ── Outro fade ────────────────────────────────────────────────────────
      for (let f=0; f<FPS; f++) {
        drawFade(ctx, OUT_W, OUT_H, f/FPS);
        if (title) {
          ctx.save(); ctx.globalAlpha = Math.min(1, (f-FPS*0.4)/(FPS*0.5));
          if (ctx.globalAlpha > 0) writeTitle(title, "A NovaSpark Compilation");
          ctx.restore();
        }
        await new Promise(r=>setTimeout(r,0));
      }

      rec.stop();
      await done;
      setExportPct(100);

      const blob = new Blob(chunks, { type:"video/webm" });
      setExportUrl(URL.createObjectURL(blob));

    } catch (e) {
      console.error("[MovieClipStudio]:", e.message);
      setErrMsg("Export hit an issue — try fewer/shorter clips.");
      rec.stop().catch(()=>{});
    }
    setExporting(false);
  };

  const download = () => {
    if (!exportUrl) return;
    const a = document.createElement("a");
    a.href = exportUrl;
    a.download = `novaspark_${(title||"clip").replace(/\s+/g,"_")}_${Date.now()}.webm`;
    a.click();
  };

  return (
    <div onClick={onClose} style={{ position:"fixed",inset:0,zIndex:9400,background:"rgba(0,0,0,0.93)",backdropFilter:"blur(14px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16 }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"min(680px,100%)",maxHeight:"94vh",overflowY:"auto",background:"#080808",border:"1px solid rgba(255,255,255,0.08)",borderRadius:18,padding:22 }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${brand},#001a18)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>🎬</div>
            <div>
              <div style={{ fontSize:15,fontWeight:800,color:"#fff" }}>Movie Clip Compiler</div>
              <div style={{ fontSize:11,color:"rgba(255,255,255,0.32)" }}>Real clips · Timeline editor · 1080p export</div>
            </div>
          </div>
          <div style={{ display:"flex",gap:8,alignItems:"center" }}>
            {step!=="search" && <button onClick={()=>{setStep("search");setClips([]);setMovie(null);setExportUrl(null);}} style={{ all:"unset",cursor:"pointer",fontSize:12,color:"rgba(255,255,255,0.4)",padding:"4px 8px",borderRadius:6,background:"rgba(255,255,255,0.05)" }}>New</button>}
            <button onClick={onClose} style={{ all:"unset",cursor:"pointer",color:"rgba(255,255,255,0.4)",fontSize:20,lineHeight:1 }}>×</button>
          </div>
        </div>

        {/* ── SEARCH ── */}
        {step === "search" && (
          <div>
            <div style={{ fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:14,lineHeight:1.65 }}>
              Search any movie or show. NS pulls official trailers, clips, featurettes and behind-the-scenes videos — then lets you compile them into a fully edited video.
            </div>
            <input autoFocus value={searchQ} onChange={e=>doSearch(e.target.value)}
              placeholder="Type a movie or show name…"
              style={{ width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.05)",border:`1px solid ${brand}44`,borderRadius:11,padding:"12px 14px",color:"#fff",fontSize:14,outline:"none",marginBottom:14 }}/>

            {searching && <div style={{ textAlign:"center",fontSize:12,color:"rgba(255,255,255,0.35)",padding:"10px 0" }}>Searching…</div>}
            <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
              {results.map((r,i)=>(
                <button key={i} onClick={()=>selectMovie(r)}
                  style={{ all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:12,padding:10,borderRadius:10 }}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  {(r.poster_path||r.backdrop_path) && (
                    <img src={`https://image.tmdb.org/t/p/w92${r.poster_path||r.backdrop_path}`} alt=""
                      style={{ width:40,height:58,objectFit:"cover",borderRadius:6,flexShrink:0 }}/>
                  )}
                  <div>
                    <div style={{ fontSize:14,fontWeight:700,color:"#fff" }}>{r.title||r.name}</div>
                    <div style={{ fontSize:11,color:"rgba(255,255,255,0.35)" }}>
                      {r.media_type==="tv"?"TV Series":"Movie"} · {(r.release_date||r.first_air_date||"").slice(0,4)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── BUILDER ── */}
        {step === "build" && movie && (
          <div>
            {/* Movie info */}
            <div style={{ display:"flex",gap:12,marginBottom:18,padding:12,background:"rgba(255,255,255,0.03)",borderRadius:10 }}>
              {movie.poster_path && <img src={tmdbImg(movie.poster_path,"w185")} alt="" style={{ width:52,height:78,objectFit:"cover",borderRadius:7,flexShrink:0 }}/>}
              <div style={{ flex:1 }}>
                <div style={{ fontSize:15,fontWeight:800,color:"#fff" }}>{movie.title||movie.name}</div>
                <div style={{ fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:3 }}>
                  {(movie.release_date||movie.first_air_date||"").slice(0,4)} · {allVideos.length} clips available · {images.length} images
                </div>
                {movie.overview && <div style={{ fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:5,lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden" }}>{movie.overview}</div>}
              </div>
            </div>

            {/* Project title */}
            <input value={title} onChange={e=>setTitle(e.target.value)}
              placeholder="Project title (shown in intro/outro)…"
              style={{ width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"8px 12px",color:"#fff",fontSize:13,outline:"none",marginBottom:14 }}/>

            {/* Available clips */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11,fontWeight:700,letterSpacing:1.2,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",marginBottom:8 }}>
                Available Clips — tap to add to timeline
              </div>
              {allVideos.length === 0 && (
                <div style={{ fontSize:12,color:"rgba(255,255,255,0.3)",padding:"10px 0" }}>
                  No YouTube clips found for this title — use images below to build a montage.
                </div>
              )}
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8 }}>
                {allVideos.map((v,i)=>(
                  <button key={i} onClick={()=>addClip(v)}
                    style={{ all:"unset",cursor:"pointer",padding:"9px 10px",borderRadius:9,border:`1px solid rgba(255,255,255,0.07)`,background:"rgba(255,255,255,0.02)",transition:"all .15s" }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=brand; e.currentTarget.style.background=`${brand}18`; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"; e.currentTarget.style.background="rgba(255,255,255,0.02)"; }}>
                    <div style={{ fontSize:16,marginBottom:3 }}>{VIDEO_TYPE_ICON[v.type]||"🎬"}</div>
                    <div style={{ fontSize:11,fontWeight:700,color:"#fff",lineHeight:1.3,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden" }}>{v.name}</div>
                    <div style={{ fontSize:10,color:"rgba(255,255,255,0.35)",marginTop:3 }}>{v.type}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Image clips */}
            {images.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11,fontWeight:700,letterSpacing:1.2,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",marginBottom:8 }}>
                  Scene Images — add as Ken Burns clips
                </div>
                <div style={{ display:"flex",gap:6,overflowX:"auto",paddingBottom:4 }}>
                  {images.slice(0,16).map((im,i)=>(
                    <div key={i} onClick={()=>addImageClip(im)}
                      style={{ flexShrink:0,width:120,height:68,borderRadius:7,overflow:"hidden",cursor:"pointer",border:"1px solid rgba(255,255,255,0.07)",transition:"border-color .15s" }}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=brand}
                      onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.07)"}>
                      <img src={tmdbImg(im.file_path,"w300")} alt="" style={{ width:"100%",height:"100%",objectFit:"cover",display:"block" }}/>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            {clips.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
                  <div style={{ fontSize:11,fontWeight:700,letterSpacing:1.2,color:"rgba(255,255,255,0.3)",textTransform:"uppercase" }}>
                    Timeline — {clips.length} clip{clips.length!==1?"s":""} · {totalRuntime.toFixed(1)}s total
                  </div>
                  {loadingClip !== null && <div style={{ fontSize:10,color:brand }}>Resolving stream…</div>}
                </div>
                {clips.map((c,i)=>(
                  <ClipCard key={c.id} clip={c} index={i} total={clips.length}
                    onRemove={removeClip} onUpdate={updateClip} onMoveUp={moveUp} onMoveDown={moveDown}/>
                ))}
              </div>
            )}

            {/* Settings row */}
            {clips.length > 0 && (
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16 }}>
                {/* Color grade */}
                <div>
                  <div style={{ fontSize:10,color:"rgba(255,255,255,0.35)",marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8 }}>Color Grade</div>
                  <div style={{ display:"flex",flexWrap:"wrap",gap:4 }}>
                    {Object.entries(GRADES).map(([k,v])=>(
                      <button key={k} onClick={()=>setGrade(k)}
                        style={{ all:"unset",cursor:"pointer",padding:"4px 8px",borderRadius:6,fontSize:10,fontWeight:700,
                          border:`1px solid ${grade===k?brand:"rgba(255,255,255,0.06)"}`,
                          background:grade===k?`${brand}22`:"transparent",
                          color:grade===k?brand:"rgba(255,255,255,0.4)" }}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Transitions */}
                <div>
                  <div style={{ fontSize:10,color:"rgba(255,255,255,0.35)",marginBottom:5,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8 }}>Transitions</div>
                  <div style={{ display:"flex",gap:4 }}>
                    {["fade","flash","cut"].map(t=>(
                      <button key={t} onClick={()=>setTransition(t)}
                        style={{ all:"unset",cursor:"pointer",padding:"4px 10px",borderRadius:6,fontSize:10,fontWeight:700,
                          border:`1px solid ${transition===t?brand:"rgba(255,255,255,0.06)"}`,
                          background:transition===t?`${brand}22`:"transparent",
                          color:transition===t?brand:"rgba(255,255,255,0.4)" }}>
                        {t.charAt(0).toUpperCase()+t.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Music note */}
            {externalMusicUrl && (
              <div style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"rgba(0,180,166,0.08)",border:"1px solid rgba(0,180,166,0.2)",borderRadius:8,marginBottom:14,fontSize:12,color:"rgba(255,255,255,0.7)" }}>
                <span>🎵</span>
                <span>Music: <strong style={{ color:brand }}>{externalMusicLabel||"AI Generated"}</strong> — download WAV from Music Studio and add in your video editor</span>
              </div>
            )}

            {/* Export */}
            {clips.length > 0 && (
              <>
                {!exporting && !exportUrl && (
                  <button onClick={exportVideo}
                    style={{ all:"unset",cursor:"pointer",display:"block",width:"100%",padding:"13px 0",borderRadius:11,textAlign:"center",background:`linear-gradient(90deg,${brand},${brand}bb)`,color:"#fff",fontSize:15,fontWeight:800 }}>
                    ⚡ Compile & Export — {totalRuntime.toFixed(0)}s · 1080p
                  </button>
                )}
                {exporting && (
                  <div>
                    <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,color:"rgba(255,255,255,0.5)",marginBottom:6 }}>
                      <span>Compiling {clips.length} clips…</span><span>{exportPct}%</span>
                    </div>
                    <div style={{ height:5,background:"rgba(255,255,255,0.07)",borderRadius:3,overflow:"hidden" }}>
                      <div style={{ height:"100%",background:`linear-gradient(90deg,${brand},#00d4ff)`,width:`${exportPct}%`,transition:"width 0.4s" }}/>
                    </div>
                    <div style={{ fontSize:11,color:"rgba(255,255,255,0.28)",textAlign:"center",marginTop:6 }}>
                      Processing real video frames — this takes a moment
                    </div>
                  </div>
                )}
                {exportUrl && (
                  <div>
                    <video src={exportUrl} controls style={{ width:"100%",borderRadius:11,marginBottom:12,background:"#000",maxHeight:260 }}/>
                    <button onClick={download}
                      style={{ all:"unset",cursor:"pointer",display:"block",width:"100%",padding:"12px 0",borderRadius:10,textAlign:"center",background:brand,color:"#fff",fontSize:14,fontWeight:800 }}>
                      ↓ Download Compilation WebM
                    </button>
                    <div style={{ fontSize:11,color:"rgba(255,255,255,0.25)",textAlign:"center",marginTop:8 }}>
                      NovaSpark Movie Clip Compiler · 1080p · {totalRuntime.toFixed(0)}s
                    </div>
                  </div>
                )}
              </>
            )}
            {errMsg && <div style={{ fontSize:12,color:"#ff5577",marginTop:10,textAlign:"center" }}>{errMsg}</div>}
          </div>
        )}

        {/* Hidden canvas */}
        <canvas ref={canvasRef} style={{ display:"none" }}/>
      </div>
    </div>
  );
}