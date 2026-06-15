/**
 * DownloadModal.jsx — NovaSparks (Torrent Engine v5 · CDN Fix)
 *
 * Web:      WebTorrent loads from CDN at runtime (no Vite bundling = no crash).
 *           Progress shows live. File saves straight to system Downloads.
 *           No external torrent client. No redirect. No page leave.
 *
 * Electron: window.electron.startTorrent → WebTorrent in main process → filesystem.
 *
 * IMDB ID resolution (4-stage waterfall):
 *   1. imdbId prop (instant)
 *   2. tmdbFetch prop → /external_ids (your existing API key)
 *   3. IMDB CDN suggestion API via corsproxy.io (free, no key)
 *   4. TMDB title search (if tmdbFetch prop set)
 *
 * Torrent sources (parallel, no backend):
 *   YTS (movies) · EZTV (TV) · Torrentio (new releases, CAM, WEB-DL)
 *
 * Wire from WatchPage: <DownloadModal tmdbFetch={tmdbFetch} imdbId={imdbId} ... />
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { storage, isElectron } from "../utils/storage";

// ─── Trackers ─────────────────────────────────────────────────────────────────
const TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.tracker.cl:1337/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://open.stealth.si:80/announce",
  "udp://tracker.leechers-paradise.org:6969/announce",
  "udp://exodus.desync.com:6969/announce",
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
];
const buildMagnet = (hash, name) =>
  `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}` +
  TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join("");

const fmtBytes = (b) => { const n=Number(b); if(!n)return null; if(n>=1e9)return`${(n/1e9).toFixed(1)} GB`; if(n>=1e6)return`${(n/1e6).toFixed(0)} MB`; return`${n} B`; };
const fmtSeeds = (n) => (!n?null:n>=1000?`${(n/1000).toFixed(1)}k`:`${n}`);
const fmtSpeed = (bps) => bps>=1e6?`${(bps/1e6).toFixed(1)} MB/s`:`${(bps/1e3).toFixed(0)} KB/s`;
const fmtEta   = (ms) => {
  if(!ms||!isFinite(ms)||ms<=0)return"";
  if(ms>3600000)return`${Math.round(ms/3600000)}h left`;
  if(ms>60000)  return`${Math.round(ms/60000)}m left`;
  return`${Math.round(ms/1000)}s left`;
};

function parseTitle(raw=""){
  const m=raw.match(/^(.*?)\s*\((\d{4})\)\s*$/);
  return m?{title:m[1].trim(),year:Number(m[2])}:{title:raw.trim(),year:null};
}

// ─── IMDB ID resolution (4-stage waterfall) ────────────────────────────────
async function resolveImdbId(tmdbId, mediaType, tmdbFetchProp, mediaName) {
  const type = mediaType==="tv"?"tv":"movie";

  // Stage 2 — TMDB external_ids via prop
  if(tmdbId&&tmdbFetchProp){
    try{ const d=await tmdbFetchProp(`/${type}/${tmdbId}/external_ids`); if(d?.imdb_id)return d.imdb_id; }catch{}
  }

  // Stage 3 — IMDB CDN suggestion API (free, via corsproxy.io for CORS)
  if(mediaName){
    const {title,year}=parseTitle(mediaName);
    const slug=title.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
    const fc=slug.charAt(0)||"a";
    const cdnUrl=`https://v3.sg.media-imdb.com/suggestion/${fc}/${slug}.json`;
    const parse=(json)=>{
      const raw=json?.contents?JSON.parse(json.contents):json;
      const hits=(raw?.d||[]).filter(i=>i.id?.startsWith("tt"));
      if(!hits.length)return null;
      if(year){const ex=hits.find(h=>h.y===year||h.yr?.startsWith(String(year)));if(ex)return ex.id;}
      return hits[0]?.id||null;
    };
    for(const url of[
      `https://corsproxy.io/?${encodeURIComponent(cdnUrl)}`,
      cdnUrl,
      `https://api.allorigins.win/get?url=${encodeURIComponent(cdnUrl)}`,
    ]){
      try{
        const r=await fetch(url,{signal:AbortSignal.timeout(7000)});
        if(!r.ok)continue;
        const id=parse(await r.json());
        if(id)return id;
      }catch{}
    }
  }

  // Stage 4 — TMDB title search → external_ids
  if(mediaName&&tmdbFetchProp){
    try{
      const {title,year}=parseTitle(mediaName);
      const ep=type==="tv"?"/search/tv":"/search/movie";
      const res=await tmdbFetchProp(`${ep}?query=${encodeURIComponent(title)}${year?`&year=${year}`:""}`);
      const first=res?.results?.[0];
      if(first?.id){const ext=await tmdbFetchProp(`/${type}/${first.id}/external_ids`);if(ext?.imdb_id)return ext.imdb_id;}
    }catch{}
  }
  return null;
}

// ─── Sources ──────────────────────────────────────────────────────────────────
async function fetchYTS(imdbId,titleFallback){
  const toOpts=(json)=>{
    const movie=json?.data?.movie||json?.data?.movies?.[0];
    if(!movie?.torrents?.length)return[];
    return movie.torrents.map(t=>({
      source:"YTS",quality:t.quality,
      label:`${t.quality}${t.type&&t.type!=="web"?` ${t.type}`:""}`,
      hash:t.hash.toLowerCase(),size:t.size,sizeBytes:Number(t.size_bytes)||null,
      name:movie.title_long||movie.title,
      magnet:buildMagnet(t.hash,movie.title_long||movie.title),
      torrentUrl:`https://yts.mx/torrent/download/${t.hash}`,
      seeders:t.seeds,leechers:t.peers,
    }));
  };
  try{
    if(imdbId){const r=await fetch(`https://yts.mx/api/v2/movie_details.json?imdb_id=${imdbId}`,{signal:AbortSignal.timeout(9000)});const res=toOpts(await r.json());if(res.length)return res;}
    if(titleFallback){const{title}=parseTitle(titleFallback);const r=await fetch(`https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(title)}&limit=3&sort_by=seeds`,{signal:AbortSignal.timeout(9000)});return toOpts(await r.json());}
  }catch{}
  return[];
}

async function fetchEZTV(imdbId,season,episode){
  if(!imdbId)return[];
  try{
    const numId=String(imdbId).replace(/^tt0*/u,"");
    const r=await fetch(`https://eztv.re/api/get-torrents?imdb_id=${numId}&limit=30`,{signal:AbortSignal.timeout(9000)});
    const json=await r.json();if(!json?.torrents?.length)return[];
    return json.torrents
      .filter(t=>season==null||episode==null||(Number(t.season)===Number(season)&&Number(t.episode)===Number(episode)))
      .map(t=>{
        const q=(t.title||"").match(/\b(2160p|1080p|720p|480p|4K)\b/i)?.[1]||"Unknown";
        return{source:"EZTV",quality:q,label:q,hash:t.hash?.toLowerCase(),size:fmtBytes(t.size_bytes),sizeBytes:Number(t.size_bytes)||null,name:t.filename||t.title,magnet:t.magnet_url||(t.hash?buildMagnet(t.hash,t.title):null),torrentUrl:null,seeders:Number(t.seeds)||null,leechers:Number(t.peers)||null};
      })
      .filter(t=>t.hash&&t.magnet);
  }catch{return[];}
}

async function fetchTorrentio(mediaType,imdbId,season,episode){
  if(!imdbId)return[];
  try{
    const seg=mediaType==="tv"?`series/${imdbId}:${season??1}:${episode??1}`:`movie/${imdbId}`;
    const r=await fetch(`https://torrentio.strem.fun/stream/${seg}.json`,{signal:AbortSignal.timeout(12000)});
    const json=await r.json();if(!json?.streams?.length)return[];
    return json.streams.filter(s=>s.infoHash).slice(0,15).map(s=>{
      const q=(s.title||s.name||"").match(/\b(2160p|1080p|720p|480p|4K)\b/i)?.[1]||"Unknown";
      const sz=(s.title||"").match(/💾\s*([\d.]+\s*(?:GB|MB))/iu)||(s.title||"").match(/\[([\d.]+\s*(?:GB|MB))\]/iu);
      return{source:(s.name||"").split("\n")[0]||"Torrentio",quality:q,label:q,hash:s.infoHash.toLowerCase(),size:sz?.[1]||null,sizeBytes:null,name:s.behaviorHints?.filename||(s.title||"").split("\n")[0]||"Video",magnet:buildMagnet(s.infoHash,s.name||"Video"),torrentUrl:null,seeders:null,leechers:null};
    });
  }catch{return[];}
}

const Q_RANK={["2160p"]:6,["4K"]:6,["1080p"]:5,["720p"]:4,["480p"]:3};
const S_RANK={YTS:10,EZTV:9};
async function resolveOptions({mediaType,imdbId,season,episode,mediaName}){
  const isMovie=mediaType!=="tv";
  const[yts,eztv,torr]=await Promise.allSettled([
    isMovie?fetchYTS(imdbId,mediaName):Promise.resolve([]),
    !isMovie?fetchEZTV(imdbId,season,episode):Promise.resolve([]),
    fetchTorrentio(mediaType,imdbId,season,episode),
  ]);
  const all=[
    ...(yts.status==="fulfilled"?yts.value:[]),
    ...(eztv.status==="fulfilled"?eztv.value:[]),
    ...(torr.status==="fulfilled"?torr.value:[]),
  ];
  const seen=new Set();
  return all.filter(x=>{if(!x.hash||seen.has(x.hash))return false;seen.add(x.hash);return true;})
    .sort((a,b)=>{const dq=(Q_RANK[b.quality]||1)-(Q_RANK[a.quality]||1);if(dq)return dq;const ds=(S_RANK[b.source]||0)-(S_RANK[a.source]||0);if(ds)return ds;return(b.seeders||0)-(a.seeders||0);});
}

// ─── CDN WebTorrent loader ────────────────────────────────────────────────────
// Loads WebTorrent from CDN at runtime — Vite never sees an import(),
// so the "Failed to resolve import webtorrent" error is permanently gone.
function loadWebTorrentCDN() {
  // Already loaded (cached from a previous call this session)
  if (typeof window !== "undefined" && window.WebTorrent) {
    return Promise.resolve(window.WebTorrent);
  }
  return new Promise((resolve, reject) => {
    // Script already injected but still loading — just poll
    if (document.querySelector("script[data-wt-cdn]")) {
      const poll = setInterval(() => {
        if (window.WebTorrent) { clearInterval(poll); resolve(window.WebTorrent); }
      }, 150);
      // Give it 25 s max
      setTimeout(() => { clearInterval(poll); reject(new Error("WebTorrent CDN timeout")); }, 25_000);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
    s.setAttribute("data-wt-cdn", "1");
    s.onload  = () => resolve(window.WebTorrent);
    s.onerror = () => reject(new Error("Failed to load WebTorrent from CDN"));
    document.head.appendChild(s);
  });
}

// ─── Web WebTorrent downloader — runs fully in browser ────────────────────────
// WebTorrent streams via WebRTC peers — shows live progress — saves to Downloads.
// No external client needed. No redirects. No page navigation.
async function runBrowserDownload({ torrentUrl, magnet, name, onPct, onStatus, onDone, onError, cancelRef }) {
  // ── Load engine from CDN (no import(), no Vite errors) ─────────────────────
  let WebTorrent;
  try {
    onStatus("Loading download engine…");
    WebTorrent = await loadWebTorrentCDN();
  } catch {
    // CDN unavailable — offer .torrent file as fallback
    if (torrentUrl) {
      onStatus("Downloading .torrent file…");
      const a = document.createElement("a");
      a.href = torrentUrl;
      a.download = `${(name || "Video").replace(/[<>:"/\\|?*]/g, "")}.torrent`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      onPct(100);
      onDone("torrent_file");
    } else {
      onError("Download engine unavailable. Install qBittorrent and use the magnet link.");
    }
    return;
  }

  // ── Start WebTorrent client ─────────────────────────────────────────────────
  const client = new WebTorrent();
  if (cancelRef) cancelRef.current = () => { try { client.destroy(); } catch {} };

  onStatus("Joining torrent swarm…");
  onPct(2);

  // Prefer .torrent URL (faster metadata) over magnet link
  client.add(torrentUrl || magnet, (torrent) => {
    // Largest file in the torrent = the video
    const mainFile = torrent.files.reduce((a, b) => (a.length > b.length ? a : b));
    onStatus(`Connected · ${torrent.numPeers} peer(s) · starting…`);

    let lastSend = 0;
    torrent.on("download", () => {
      const now = Date.now();
      if (now - lastSend < 700) return;
      lastSend = now;
      const pct   = Math.min(99, Math.round(torrent.progress * 100));
      const speed = fmtSpeed(torrent.downloadSpeed || 0);
      const eta   = fmtEta(torrent.timeRemaining);
      onPct(pct);
      onStatus(`${pct}% · ${speed}${eta ? ` · ${eta}` : ""}`);
    });

    torrent.on("done", () => {
      onPct(99);
      onStatus("Saving to Downloads folder…");
      mainFile.getBlobURL((err, url) => {
        if (err) {
          onError("Save failed: " + (err.message || err));
          try { client.destroy(); } catch {}
          return;
        }
        const safe = (mainFile.name || `${name || "Video"}.mp4`).replace(/[<>:"/\\|?*]/g, "");
        const a    = document.createElement("a");
        a.href = url;
        a.download = safe;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 120_000);
        onPct(100);
        onDone("complete");
        try { client.destroy(); } catch {}
      });
    });

    torrent.on("error", (err) => {
      onError(err.message || "Torrent error");
      try { client.destroy(); } catch {}
    });
  });
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const IcoClose  = ()=><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcoDl     = ()=><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IcoFolder = ()=><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
const IcoSpin   = ({sz=14})=><span style={{display:"inline-block",width:sz,height:sz,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.1)",borderTopColor:"rgba(255,255,255,0.75)",animation:"_dm_spin 0.7s linear infinite",flexShrink:0}}/>;
const IcoCheck  = ()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoSeed   = ()=><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>;

function Ring({pct}){
  const R=28,c=2*Math.PI*R;
  return(
    <svg width="76" height="76" viewBox="0 0 76 76" style={{transform:"rotate(-90deg)"}}>
      <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4.5"/>
      <circle cx="38" cy="38" r={R} fill="none" stroke="var(--red,#e50914)" strokeWidth="4.5"
        strokeDasharray={c} strokeDashoffset={c*(1-pct/100)} strokeLinecap="round"
        style={{transition:"stroke-dashoffset 0.35s ease"}}/>
    </svg>
  );
}

function Badge({label,color}){return<span style={{fontSize:9,fontWeight:700,letterSpacing:"0.04em",color,background:`${color}18`,border:`1px solid ${color}30`,borderRadius:3,padding:"1px 5px"}}>{label}</span>;}
const SRC_COLOR={YTS:"#4caf50",EZTV:"#2196f3"};

// ═══════════════════════════════════════════════════════════════════════════════
export default function DownloadModal({
  onClose,
  mediaName,
  imdbId:    imdbIdProp    = null,
  tmdbFetch: tmdbFetchProp = null,
  mediaId,
  mediaType,
  season,
  episode,
  posterPath,
  tmdbId,
  onDownloadStarted,
  // Legacy props (unused)
  m3u8Url, subtitles, downloaderFolder, setDownloaderFolder, onOpenSettings,
}){
  const [phase,   setPhase]   = useState("loading");
  const [options, setOptions] = useState([]);
  const [sel,     setSel]     = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [dlErr,   setDlErr]   = useState("");
  const [pct,     setPct]     = useState(0);
  const [status,  setStatus]  = useState("");
  const [dlId,    setDlId]    = useState(null);
  const [doneMsg, setDoneMsg] = useState("");
  const [dlPath,  setDlPath]  = useState(()=>storage.get("downloadPath")||"");
  const cancelRef = useRef(null);

  // ── Load sources ───────────────────────────────────────────────────────────
  useEffect(()=>{
    let dead=false;
    (async()=>{
      try{
        const imdbId = imdbIdProp ||
          await resolveImdbId(tmdbId||mediaId, mediaType, tmdbFetchProp, mediaName);
        console.info("[NS-DL] imdbId:", imdbId, "for:", mediaName);
        const opts = await resolveOptions({mediaType,imdbId,season,episode,mediaName});
        if(dead)return;
        if(!opts.length){
          setLoadErr(imdbId
            ? `No torrents found yet for "${mediaName||"this title"}". May still be in cinemas — try again in a few days.`
            : `Could not identify this title. Pass tmdbFetch or imdbId prop from WatchPage for best results.`
          );
          setPhase("error"); return;
        }
        setOptions(opts);
        setSel(opts.find(o=>o.quality==="1080p"&&o.source==="YTS")||opts[0]);
        setPhase("pick");
      }catch(e){if(!dead){setLoadErr(e.message||"Failed to load sources.");setPhase("error");}}
    })();
    return ()=>{dead=true;};
  },[]); // eslint-disable-line

  // ── Electron progress listener ─────────────────────────────────────────────
  useEffect(()=>{
    if(!isElectron||!dlId)return;
    const h=(u)=>{
      if(u.id!==dlId)return;
      if(u.progress!=null)setPct(u.progress);
      if(u.lastMessage) setStatus(u.lastMessage);
      if(u.status==="completed"){setPct(100);setPhase("done");setDoneMsg("File saved to your selected folder.");}
      if(u.status==="error")   {setDlErr(u.lastMessage||"Download failed");setPhase("error");}
    };
    window.electron?.onDownloadProgress?.(h);
    return()=>window.electron?.offDownloadProgress?.(h);
  },[dlId]);

  // ── Start download ─────────────────────────────────────────────────────────
  const handleDownload = useCallback(async()=>{
    if(!sel)return;
    setPhase("starting");

    // ── Electron path ───────────────────────────────────────────────────────
    if(isElectron){
      if(!dlPath){setPhase("pick");return;}
      try{
        const res=await window.electron.startTorrent({
          magnet:sel.magnet, torrentUrl:sel.torrentUrl||null,
          name:mediaName||sel.name||"Video", downloadPath:dlPath,
          mediaId, mediaType, season, episode, posterPath,
          tmdbId:tmdbId||mediaId||null,
        });
        if(res?.ok){
          setDlId(res.id); setPct(0); setStatus("Connecting to peers…"); setPhase("downloading");
          onDownloadStarted?.({id:res.id,name:mediaName||"Video",status:"downloading",progress:0});
        }else{setDlErr(res?.error||"Could not start");setPhase("error");}
      }catch(e){setDlErr(e.message||"Could not start");setPhase("error");}
      return;
    }

    // ── Web path — WebTorrent loads from CDN and runs IN the browser ─────────
    setPhase("downloading"); setPct(0); setStatus("Loading download engine…");

    await runBrowserDownload({
      torrentUrl: sel.torrentUrl || null,
      magnet:     sel.magnet,
      name:       mediaName || sel.name || "Video",
      cancelRef,
      onPct:    (p)=>setPct(p),
      onStatus: (s)=>setStatus(s),
      onDone:   (how)=>{
        setPhase("done");
        setDoneMsg(
          how==="torrent_file"
            ? ".torrent file saved to Downloads — open with qBittorrent or uTorrent."
            : "File downloaded to your system Downloads folder ✓"
        );
      },
      onError: (msg)=>{ setDlErr(msg); setPhase("error"); },
    });
  },[sel,dlPath,mediaName,mediaId,mediaType,season,episode,posterPath,tmdbId,onDownloadStarted]);

  const handleCancel=useCallback(()=>{
    if(isElectron&&dlId){window.electron?.cancelTorrent?.(dlId).catch(()=>{});}
    else{try{cancelRef.current?.();}catch{}}
    setPhase("pick"); setPct(0); setStatus(""); setDlId(null);
  },[dlId]);

  const shortName=mediaName?(mediaName.length>34?`${mediaName.slice(0,34)}…`:mediaName):"";

  return(
    <div style={{position:"fixed",inset:0,zIndex:9900,background:"rgba(0,0,0,0.78)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <style>{`@keyframes _dm_spin{to{transform:rotate(360deg)}}._dm_opt{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:9px;cursor:pointer;border:1.5px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);transition:all 0.13s;margin-bottom:5px}._dm_opt.on{border-color:var(--red,#e50914);background:rgba(229,9,20,0.06)}._dm_opt:not(.on):hover{border-color:rgba(255,255,255,0.16);background:rgba(255,255,255,0.04)}._dm_btn:hover:not(:disabled){opacity:0.87!important}._dm_s::-webkit-scrollbar{width:4px}._dm_s::-webkit-scrollbar-track{background:transparent}._dm_s::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}`}</style>

      <div style={{width:"100%",maxWidth:440,background:"var(--surface,#0f1318)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:14,boxShadow:"0 28px 72px rgba(0,0,0,0.88)",overflow:"hidden",maxHeight:"92vh",display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 15px 10px",borderBottom:"1px solid rgba(255,255,255,0.07)",flexShrink:0}}>
          <span style={{fontSize:13,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",gap:7}}>
            <IcoDl/> Download{shortName?` · ${shortName}`:""}
          </span>
          <button style={{background:"none",border:"none",color:"rgba(255,255,255,0.38)",cursor:"pointer",display:"flex",padding:3,borderRadius:5}} onClick={onClose}
            onMouseEnter={e=>e.currentTarget.style.color="#fff"} onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.38)"}><IcoClose/></button>
        </div>

        {/* Loading */}
        {phase==="loading"&&<div style={{padding:"44px 20px",textAlign:"center"}}><IcoSpin sz={30}/><div style={{marginTop:16,fontSize:12,color:"rgba(255,255,255,0.38)",lineHeight:1.7}}>Searching YTS · EZTV · Torrentio…</div></div>}

        {/* Starting */}
        {phase==="starting"&&<div style={{padding:"44px 20px",textAlign:"center"}}><IcoSpin sz={26}/><div style={{marginTop:16,fontSize:12,color:"rgba(255,255,255,0.38)"}}>Starting…</div></div>}

        {/* Downloading — web AND Electron share same progress UI */}
        {phase==="downloading"&&(
          <div style={{padding:"34px 20px",textAlign:"center"}}>
            <div style={{position:"relative",width:76,height:76,margin:"0 auto 14px"}}>
              <Ring pct={pct}/>
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff"}}>{pct}%</div>
            </div>
            <div style={{fontSize:13,fontWeight:600,color:"#fff",marginBottom:4}}>{status||"Downloading…"}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.3)",marginBottom:18}}>
              {isElectron?"Saving to your folder — track in Downloads tab":"Downloading in browser — file saves to system Downloads when done"}
            </div>
            <div style={{height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden",marginBottom:18}}>
              <div style={{height:"100%",background:"var(--red,#e50914)",width:`${pct}%`,borderRadius:2,transition:"width 0.4s"}}/>
            </div>
            <button onClick={handleCancel} style={{background:"none",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"rgba(255,255,255,0.4)",fontSize:12,padding:"6px 18px",cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
          </div>
        )}

        {/* Done */}
        {phase==="done"&&(
          <div style={{padding:"34px 20px",textAlign:"center"}}>
            <div style={{width:54,height:54,borderRadius:"50%",background:"rgba(76,175,80,0.1)",border:"1.5px solid rgba(76,175,80,0.28)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}><IcoCheck/></div>
            <div style={{fontSize:14,fontWeight:700,color:"#4caf50",marginBottom:6}}>{isElectron?"Download started":"Download complete"}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.38)",lineHeight:1.7,marginBottom:22}}>{doneMsg||"Done."}</div>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,color:"rgba(255,255,255,0.6)",fontSize:13,padding:"8px 26px",cursor:"pointer",fontFamily:"inherit"}}>Close</button>
          </div>
        )}

        {/* Load error */}
        {phase==="error"&&!dlErr&&(
          <div style={{padding:"32px 20px",textAlign:"center"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--red,#e50914)",marginBottom:8}}>No sources found</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.42)",lineHeight:1.7,marginBottom:22}}>{loadErr}</div>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,color:"rgba(255,255,255,0.55)",fontSize:12,padding:"8px 22px",cursor:"pointer",fontFamily:"inherit"}}>Close</button>
          </div>
        )}

        {/* Download error */}
        {phase==="error"&&dlErr&&(
          <div style={{padding:"30px 20px",textAlign:"center"}}>
            <div style={{fontSize:13,fontWeight:600,color:"var(--red,#e50914)",marginBottom:7}}>Download failed</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.42)",lineHeight:1.7,marginBottom:20}}>{dlErr}</div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <button onClick={()=>{setPhase("pick");setDlErr("");}} style={{background:"var(--red,#e50914)",border:"none",borderRadius:8,color:"#fff",fontSize:12,fontWeight:700,padding:"8px 20px",cursor:"pointer",fontFamily:"inherit"}}>Retry</button>
              <button onClick={onClose} style={{background:"none",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"rgba(255,255,255,0.4)",fontSize:12,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit"}}>Close</button>
            </div>
          </div>
        )}

        {/* Pick quality */}
        {phase==="pick"&&(
          <div style={{padding:"14px 15px 18px",overflowY:"auto",flex:1}} className="_dm_s">
            <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.28)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:10}}>
              {options.length} source{options.length!==1?"s":""} found — pick quality
            </div>

            <div className="_dm_s" style={{maxHeight:255,overflowY:"auto",marginRight:-4,paddingRight:4}}>
              {options.map((opt,i)=>(
                <div key={opt.hash||i} className={`_dm_opt${sel===opt?" on":""}`} onClick={()=>setSel(opt)}>
                  <div style={{width:14,height:14,borderRadius:"50%",flexShrink:0,transition:"all 0.12s",border:`2px solid ${sel===opt?"var(--red,#e50914)":"rgba(255,255,255,0.2)"}`,background:sel===opt?"var(--red,#e50914)":"transparent",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {sel===opt&&<div style={{width:4,height:4,borderRadius:"50%",background:"#fff"}}/>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span style={{fontSize:13,fontWeight:700,color:sel===opt?"#fff":"rgba(255,255,255,0.75)"}}>{opt.label||opt.quality}</span>
                      <Badge label={opt.source} color={SRC_COLOR[opt.source]||"rgba(255,255,255,0.35)"}/>
                      {opt.quality==="1080p"&&opt.source==="YTS"&&<Badge label="BEST" color="#63cab7"/>}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginTop:3}}>
                      {opt.size&&<span style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{opt.size}</span>}
                      {opt.seeders!=null&&<span style={{fontSize:10,color:"rgba(76,175,80,0.65)",display:"flex",alignItems:"center",gap:2}}><IcoSeed/>{fmtSeeds(opt.seeders)} seeds</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Electron folder */}
            {isElectron&&(
              <div style={{marginTop:14}}>
                <div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.28)",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7}}>Save to</div>
                <div style={{display:"flex",gap:7}}>
                  <div style={{flex:1,display:"flex",alignItems:"center",gap:7,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8,padding:"7px 10px",fontSize:12,color:"rgba(255,255,255,0.38)",overflow:"hidden"}}>
                    <IcoFolder/><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dlPath||"No folder selected"}</span>
                  </div>
                  <button onClick={async()=>{const f=await window.electron?.pickFolder?.();if(f){setDlPath(f);storage.set("downloadPath",f);}}}
                    style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,color:"rgba(255,255,255,0.65)",fontSize:11,fontWeight:600,padding:"7px 13px",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}
                    onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"}>Browse</button>
                </div>
                {!dlPath&&<div style={{fontSize:10,color:"var(--red,#e50914)",marginTop:5}}>Select a folder to begin</div>}
              </div>
            )}

            {/* Web: what happens */}
            {!isElectron&&(
              <div style={{marginTop:12,padding:"9px 11px",borderRadius:8,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",fontSize:11,color:"rgba(255,255,255,0.4)",lineHeight:1.65}}>
                Download runs inside the browser via WebTorrent · no client needed · file saves straight to your system Downloads folder
              </div>
            )}

            {/* Download button */}
            {(()=>{
              const disabled=!sel||(isElectron&&!dlPath);
              const label=!sel?"Select quality"
                :isElectron&&!dlPath?"Select folder first"
                :isElectron?`Download ${sel.label}${sel.size?` · ${sel.size}`:""}`
                :`Download ${sel.label}${sel.size?` · ${sel.size}`:""}`;
              return(
                <button className="_dm_btn" disabled={disabled} onClick={handleDownload}
                  style={{width:"100%",marginTop:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:disabled?"rgba(255,255,255,0.04)":"var(--red,#e50914)",border:"none",borderRadius:9,color:"#fff",fontSize:14,fontWeight:700,padding:"12px",fontFamily:"inherit",cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.4:1,transition:"opacity 0.15s"}}>
                  <IcoDl/>{label}
                </button>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}