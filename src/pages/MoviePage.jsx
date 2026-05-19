import {
  useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, memo,
} from "react";
import {
  tmdbFetch, imgUrl, PLAYER_SOURCES, getSourceUrl,
  sourceSupportsProgress, sourceProgressViaFrames, sourceIsAsync,
  fetchAnilistData, cleanAnilistDescription, isAnimeContent,
  ANIME_DEFAULT_SOURCE, NON_ANIME_DEFAULT_SOURCE, NEEDS_INTERCEPT, findWorkingSource,
} from "../utils/api";
import {
  PlayIcon, BookmarkIcon, BookmarkFillIcon, BackIcon, StarIcon, FilmIcon,
  DownloadIcon, WatchedIcon, TrailerIcon, RatingShieldIcon, RatingLockIcon,
  SourceIcon, ShieldBlockIcon, PopOutIcon,
} from "../components/Icons";
import DownloadModal from "../components/DownloadModal";
import TrailerModal from "../components/TrailerModal";
import BlockedStatsModal from "../components/BlockedStatsModal";
import { useBlockedStats } from "../utils/useBlockedStats";
import MediaCard from "../components/MediaCard";
import { storage } from "../utils/storage";
import { fetchMovieRating, isRestricted, getAgeLimitSetting, getRatingCountry } from "../utils/ageRating";
import { canSwitchSource, canDownload, canPopOut } from "../utils/gate";
import PremiumGate from "../components/PremiumGate";

// ─── Embed injection ──────────────────────────────────────────────────────────
const _EMBED_CSS = `
[class*="loading"i],[class*="loader"i],[class*="fetching"i],[class*="preload"i],
[id*="loading"i],[id*="loader"i],[id*="fetching"i],
.spinner,.preloader,.lds-ring,.lds-spinner,.vjs-loading-spinner,
.jw-icon-loading,.plyr__loading {
  display:none!important;opacity:0!important;visibility:hidden!important;
}
video{opacity:1!important;visibility:visible!important;display:block!important;}
`;
const _EMBED_JS = `(function(){
  if(window.__ns)return;window.__ns=true;
  var BAD=['FETCHING, ONE MOMENT...','FETCHING','ONE MOMENT...','PLEASE WAIT','LOADING...','LOADING'];
  function run(){try{document.querySelectorAll('body *').forEach(function(el){
    if(!el.childElementCount){
      var t=(el.textContent||'').trim().toUpperCase();
      if(BAD.some(function(k){return t===k||t.startsWith(k);})){
        var p=el;for(var i=0;i<4;i++){var par=p.parentElement;if(par&&par!==document.body)p=par;else break;}
        p.style.cssText='display:none!important;opacity:0!important;pointer-events:none!important;';
      }
    }
  });}catch(e){}}
  run();
  var obs=new MutationObserver(run);
  obs.observe(document.body,{childList:true,subtree:true});
  setTimeout(function(){obs.disconnect();},12000);
})()`;

// ─── Server toast ─────────────────────────────────────────────────────────────
function ServerToast({ status, sourceLabel }) {
  const [show, setShow] = useState(false);
  const [fade, setFade] = useState(false);
  const timerRef        = useRef(null);
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (status === "testing" || status === "retrying") { setShow(true); setFade(false); }
    else if (status === "found") {
      setFade(false);
      timerRef.current = setTimeout(() => { setFade(true); timerRef.current = setTimeout(() => setShow(false), 500); }, 2500);
    } else if (status === "failed") {
      setFade(false);
      timerRef.current = setTimeout(() => { setFade(true); timerRef.current = setTimeout(() => setShow(false), 500); }, 4000);
    }
    return () => clearTimeout(timerRef.current);
  }, [status, sourceLabel]);
  if (!show) return null;
  return (
    <div style={{
      position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",zIndex:9999,
      background:"rgba(8,8,8,0.97)",border:"1px solid rgba(255,255,255,0.08)",
      borderRadius:12,padding:"11px 22px",display:"flex",alignItems:"center",gap:10,
      color:"#fff",fontSize:13,fontWeight:500,backdropFilter:"blur(12px)",
      WebkitBackdropFilter:"blur(12px)",boxShadow:"0 6px 32px rgba(0,0,0,0.7)",
      opacity:fade?0:1,transition:"opacity 0.45s ease",pointerEvents:"none",
    }}>
      {(status==="testing"||status==="retrying") ? (<>
        <div style={{width:14,height:14,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.15)",
          borderTopColor:"#fff",animation:"spin 0.7s linear infinite",flexShrink:0}}/>
        <span>{status==="retrying"?"Trying another server…":"Please wait, finding best server…"}</span>
      </>) : status==="found" ? (<>
        <span style={{color:"#4caf50",fontSize:17,lineHeight:1}}>✓</span>
        <span>Playing on <strong>{sourceLabel}</strong></span>
      </>) : (<>
        <span style={{color:"#ff5252",fontSize:17,lineHeight:1}}>⚠</span>
        <span>Could not load — check your connection</span>
      </>)}
    </div>
  );
}

export default function MoviePage({
  item, apiKey, onSave, isSaved, onHistory, progress, saveProgress,
  onBack, onSettings, onDownloadStarted, watched, onMarkWatched, onMarkUnwatched,
  downloads, onGoToDownloads, onSelect, onWatch, isPremium, onUpgrade,
}) {
  const [details,          setDetails]          = useState(null);
  const [playing,          setPlaying]          = useState(false);
  const [showDownload,     setShowDownload]     = useState(false);
  const [trailerKey,       setTrailerKey]       = useState(null);
  const [showTrailer,      setShowTrailer]      = useState(false);
  const [m3u8Url,          setM3u8Url]          = useState(null);
  const [interceptedSubs,  setInterceptedSubs]  = useState([]);
  const [playerSource,     setPlayerSource]     = useState(() => storage.get("playerSource") || NON_ANIME_DEFAULT_SOURCE);
  const [autoSourceStatus, setAutoSourceStatus] = useState("testing");
  const [foundSource,      setFoundSource]      = useState(null);
  const progressViaFrames = useMemo(() => sourceProgressViaFrames(playerSource), [playerSource]);
  const [showSourceMenu,   setShowSourceMenu]   = useState(false);
  const [dubMode,          setDubMode]          = useState(() => storage.get("allmangaDubMode") || "sub");
  const [anilistData,      setAnilistData]      = useState(null);
  const [menuPos,          setMenuPos]          = useState(null);
  const [gateModal,        setGateModal]        = useState(null);
  const [resolvedPlayerUrl,setResolvedPlayerUrl]= useState(null);
  const [resolvingUrl,     setResolvingUrl]     = useState(false);
  const [resolveError,     setResolveError]     = useState(null);
  const [collection,       setCollection]       = useState(null);
  const [webviewLoading,   setWebviewLoading]   = useState(false);
  const [playerFullscreen, setPlayerFullscreen] = useState(false);
  const [pipOpen,          setPipOpen]          = useState(false);
  const [downloaderFolder, setDownloaderFolder] = useState(() => storage.get("downloaderFolder") || "");

  // Beast engine refs
  const sourceRef          = useRef(null);
  const playerWrapRef      = useRef(null);
  const webviewRef         = useRef(null);
  const preWarmRef         = useRef(null);   // hidden pre-warm webview
  const pollRef            = useRef(null);
  const retryQueueRef      = useRef([]);
  const retryIdxRef        = useRef(0);
  const saveProgressRef    = useRef(saveProgress);
  saveProgressRef.current  = saveProgress;
  const onMarkWatchedRef   = useRef(onMarkWatched);
  onMarkWatchedRef.current = onMarkWatched;
  const pipUrlRef          = useRef(null);
  const pipWebContentsIdRef= useRef(null);

  const isAnime = useMemo(() => isAnimeContent(item, details), [item.id, details]);

  const { sessionTotal: blockedSession, alltimeTotal: blockedAlltime,
    showModal: showBlockedModal, setShowModal: setShowBlockedModal,
    getSessionDomains: getBlockedDomains } = useBlockedStats(item.id);

  const [rating, setRating] = useState({ cert: null, minAge: null });
  const ageLimitSetting = useMemo(() => getAgeLimitSetting(storage), []);
  const ratingCountry   = useMemo(() => getRatingCountry(storage), []);
  const restricted      = isRestricted(rating.minAge, ageLimitSetting);

  const progressKey = `movie_${item.id}`;
  const pct         = progress[progressKey] || 0;
  const isWatched   = !!watched?.[progressKey];
  const hasProgress = pct > 0;

  const d        = details || item;
  const title    = d.title || d.name;
  const year     = (d.release_date || "").slice(0, 4);
  const mediaName = `${title}${year ? " (" + year + ")" : ""}`;
  const planId    = isPremium?.planId || (isPremium ? "premium" : "free");

  const { watchedSecs, totalSecs, displayPct, progressLabel } = useMemo(() => {
    const watchedSecs = storage.get("dlTime_" + progressKey) || 0;
    const totalSecs   = d?.runtime ? d.runtime * 60 : 0;
    const derivedPct  = watchedSecs > 0 && totalSecs > 0 ? Math.floor((watchedSecs / totalSecs) * 100) : 0;
    const displayPct  = pct > 0 ? pct : derivedPct;
    const fmt = (s) => {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
      return h > 0
        ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
        : `${m}:${String(sec).padStart(2,"0")}`;
    };
    const progressLabel = watchedSecs > 0 && totalSecs > 0
      ? `${fmt(watchedSecs)} / ${fmt(totalSecs)}`
      : watchedSecs > 0 ? fmt(watchedSecs)
      : displayPct > 0  ? `${displayPct}%` : null;
    return { watchedSecs, totalSecs, displayPct, progressLabel };
  }, [progressKey, pct, d?.runtime]);

  const [watchedThreshold] = useState(() => storage.get("watchedThreshold") ?? 20);
  const autoMarkedRef      = useRef(false);
  const lastKnownTimeRef   = useRef(0);
  const seekBackCooldownRef= useRef(0);

  // ── Build retry queue on item change ────────────────────────────────────
  useEffect(() => {
    const all   = PLAYER_SOURCES.filter((s) => !s.async && !s.tag).map((s) => s.id);
    const start = all.indexOf(playerSource);
    retryQueueRef.current = start >= 0
      ? [...all.slice(start), ...all.slice(0, start)]
      : [playerSource, ...all.filter((id) => id !== playerSource)];
    retryIdxRef.current = 1;
  }, [item.id]);

  // ── Silent auto-retry ───────────────────────────────────────────────────
  const tryNextSource = useCallback(() => {
    const idx = retryIdxRef.current;
    if (idx >= retryQueueRef.current.length) {
      setAutoSourceStatus("failed"); setWebviewLoading(false); return;
    }
    const nextId = retryQueueRef.current[idx];
    retryIdxRef.current += 1;
    setAutoSourceStatus("retrying");
    setPlayerSource(nextId); storage.set("playerSource", nextId);
  }, []);

  // ── Movie details ────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    tmdbFetch(`/movie/${item.id}`, apiKey)
      .then((d) => { if (mounted) setDetails(d); })
      .catch(() => { if (mounted) setDetails(item); });
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  // ── Initial source check (respects stored pref, only switches if dead) ──
  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;
    setAutoSourceStatus("testing");
    findWorkingSource("movie", item.id, null, null, playerSource).then((id) => {
      if (cancelled) return;
      setFoundSource(id);
      setAutoSourceStatus(id ? "found" : "failed");
    });
    return () => { cancelled = true; };
  }, [item.id, playerSource]);

  // ── Age rating ───────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    fetchMovieRating(item.id, apiKey, ratingCountry).then((r) => { if (mounted) setRating(r); });
    return () => { mounted = false; };
  }, [item.id, apiKey, ratingCountry]);

  // ── Trailer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    tmdbFetch(`/movie/${item.id}/videos`, apiKey)
      .then((data) => {
        if (!mounted) return;
        const videos  = data.results || [];
        const trailer = videos.find((v) => v.type === "Trailer" && v.site === "YouTube") || videos.find((v) => v.site === "YouTube");
        if (trailer) setTrailerKey(trailer.key);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  // ── Collection ───────────────────────────────────────────────────────────
  useEffect(() => {
    setCollection(null);
    if (!details?.belongs_to_collection?.id) return;
    let mounted = true;
    tmdbFetch(`/collection/${details.belongs_to_collection.id}`, apiKey)
      .then((data) => {
        if (!mounted) return;
        const parts = (data.parts || [])
          .map((p) => ({ ...p, media_type: "movie" }))
          .sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""));
        if (parts.length > 1) setCollection({ name: data.name, parts });
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [details?.belongs_to_collection?.id, apiKey]);

  // ── Reset player state on source/content change ──────────────────────────
  useEffect(() => {
    setM3u8Url(null); setInterceptedSubs([]); setShowSourceMenu(false);
    setAnilistData(null); setResolvedPlayerUrl(null); setResolvingUrl(false);
    setResolveError(null); setWebviewLoading(true);
  }, [item.id, playerSource, dubMode]);

  // ── Anime source routing ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    if (isAnime) {
      fetchAnilistData(item.title || item.name, "ANIME", item.id).then(
        (data) => { if (mounted && data) setAnilistData(data); },
      );
      const cur = PLAYER_SOURCES.find((s) => s.id === playerSource);
      if (!cur?.tag) { const sv = storage.get("playerSource"); const svs = PLAYER_SOURCES.find((s) => s.id === sv); setPlayerSource(svs?.tag ? sv : ANIME_DEFAULT_SOURCE); }
    } else {
      const cur = PLAYER_SOURCES.find((s) => s.id === playerSource);
      if (cur?.tag) { const sv = storage.get("playerSource"); const svs = PLAYER_SOURCES.find((s) => s.id === sv); setPlayerSource(!svs?.tag ? sv : NON_ANIME_DEFAULT_SOURCE); }
    }
    return () => { mounted = false; };
  }, [item.id, isAnime]);

  // ── AllManga async resolve ────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !sourceIsAsync(playerSource)) return;
    if (resolvedPlayerUrl || resolvingUrl) return;
    setResolvingUrl(true); setResolveError(null);
    const startTime = storage.get("dlTime_" + progressKey) || 0;
    let mounted = true;
    window.electron.resolveAllManga({ title, seasonNumber: 1, episodeNumber: 1, isMovie: true, translationType: dubMode })
      .then((res) => {
        if (!mounted) return;
        if (res?.ok && res.url) {
          if (res.isDirectMp4 !== undefined) {
            window.electron.setPlayerVideo({ url: res.url, referer: res.referer || "https://allmanga.to", startTime })
              .then((r) => { if (!mounted) return; setResolvedPlayerUrl(r.playerUrl); setM3u8Url(res.url); })
              .catch(() => { if (mounted) setResolveError("Failed to start local player"); });
          } else { setResolvedPlayerUrl(res.url); }
        } else { setResolveError(res?.error || "Movie not found on AllManga"); }
      })
      .catch((e) => { if (mounted) setResolveError(e.message || "Error"); })
      .finally(() => { if (mounted) setResolvingUrl(false); });
    return () => { mounted = false; };
  }, [playing, playerSource, dubMode]);

  // ── Electron listeners ───────────────────────────────────────────────────
  useEffect(() => {
    if (!window.electron) return;
    const h = window.electron.onM3u8Found((url) => setM3u8Url((p) => p !== url ? url : p));
    return () => window.electron.offM3u8Found(h);
  }, []);

  useEffect(() => {
    if (!showSourceMenu) return;
    const close = () => setShowSourceMenu(false);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    const onClick = (e) => { if (sourceRef.current?.contains(e.target) || e.target.closest(".source-dropdown")) return; close(); };
    document.addEventListener("mousedown", onClick);
    return () => { window.removeEventListener("scroll", close, { capture: true }); document.removeEventListener("mousedown", onClick); };
  }, [showSourceMenu]);

  useEffect(() => {
    if (!window.electron) return;
    const h = window.electron.onSubtitleFound(({ url, lang }) => {
      if (!url || !url.toLowerCase().includes(".vtt")) return;
      setInterceptedSubs((prev) => [...prev.filter((s) => s.lang !== lang), { url, lang: lang || "unknown" }]);
    });
    return () => window.electron.offSubtitleFound(h);
  }, []);

  useEffect(() => {
    autoMarkedRef.current = false; lastKnownTimeRef.current = 0; seekBackCooldownRef.current = 0;
  }, [item.id, isWatched]);

  useEffect(() => { if (playing) setWebviewLoading(true); }, [playing]);

  useLayoutEffect(() => {
    if (playing) return;
    const wv = webviewRef.current;
    if (wv) { try { wv.src = "about:blank"; } catch {} }
  }, [playing]);

  // ─── BEAST ENGINE ────────────────────────────────────────────────────────
  // Runs when playing=true. Injects CSS/JS on dom-ready, polls for video
  // readiness, retries next source on error or 12s timeout — all silently.
  useEffect(() => {
    if (!playing || !window.electron) return;
    const wv = webviewRef.current;
    if (!wv) return;

    let active = true;
    clearInterval(pollRef.current);

    const markReady = () => {
      if (!active) return;
      active = false;
      clearInterval(pollRef.current);
      setAutoSourceStatus((s) => (s === "retrying" || s === "testing") ? "found" : s);
      setWebviewLoading(false);
    };

    const onFail = () => {
      if (!active) return;
      active = false;
      clearInterval(pollRef.current);
      clearTimeout(hardTimeout); // eslint-disable-line no-use-before-define
      tryNextSource();
    };

    const onDomReady = async () => {
      try { await wv.insertCSS(_EMBED_CSS); } catch (_) {}
      try { await wv.executeJavaScript(_EMBED_JS); } catch (_) {}
      pollRef.current = setInterval(async () => {
        if (!active) { clearInterval(pollRef.current); return; }
        try {
          const r = await wv.executeJavaScript(
            `(()=>{const v=document.querySelector('video');if(!v)return{ready:false,err:false};` +
            `return{ready:v.readyState>=2&&v.duration>0&&!isNaN(v.duration),` +
            `err:v.networkState===3||!!(v.error&&v.error.code>0)};})()`
          );
          if (r.ready) markReady();
          else if (r.err) onFail();
        } catch { markReady(); }
      }, 300);
    };

    wv.addEventListener("dom-ready", onDomReady);
    wv.addEventListener("did-fail-load", onFail);
    const hardTimeout = setTimeout(onFail, 12000);

    return () => {
      active = false; clearInterval(pollRef.current); clearTimeout(hardTimeout);
      try { wv.removeEventListener("dom-ready", onDomReady); } catch (_) {}
      try { wv.removeEventListener("did-fail-load", onFail); } catch (_) {}
    };
  }, [playing, playerSource, item.id, tryNextSource]);

  // ── Web iframe fallback ──────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || window.electron) return;
    let active = true;
    const tid = setTimeout(() => { if (active) setWebviewLoading(false); }, 8000);
    return () => { active = false; clearTimeout(tid); };
  }, [playing, playerSource, item.id]);

  // ── Progress tracking ────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !sourceSupportsProgress(playerSource) || !window.electron) return;
    let interval = null;
    const timer = setTimeout(() => {
      interval = setInterval(async () => {
        try {
          const wv = webviewRef.current;
          if (!wv) return;
          let result;
          if (pipWebContentsIdRef.current != null && window.electron?.queryVideoProgress) {
            result = await window.electron.queryVideoProgress(pipWebContentsIdRef.current);
          } else if (progressViaFrames && window.electron?.queryVideoProgress) {
            result = await window.electron.queryVideoProgress(wv.getWebContentsId());
          } else {
            result = await wv.executeJavaScript(`
              (() => {
                const v = document.querySelector('video');
                if (!v || !v.duration || v.duration === Infinity || v.paused) return null;
                if (!v._seekTracked) {
                  v._seekTracked = true;
                  v.addEventListener('seeked', () => { v._lastUserSeek = Date.now(); v._lastUserSeekTo = v.currentTime; });
                }
                return { currentTime: v.currentTime, duration: v.duration,
                  recentUserSeek: v._lastUserSeek ? (Date.now() - v._lastUserSeek < 6000) : false,
                  lastUserSeekTo: v._lastUserSeekTo ?? null };
              })()
            `);
          }
          if (result && result.duration > 0) {
            const ct = result.currentTime, now = Date.now();
            if (lastKnownTimeRef.current > 30 && ct <= 5 && !result.recentUserSeek) {
              if (now > seekBackCooldownRef.current) {
                const seekTo = lastKnownTimeRef.current;
                seekBackCooldownRef.current = now + 8000;
                try { await wv.executeJavaScript(`(()=>{const v=document.querySelector('video');if(v)v.currentTime=${seekTo};})()`); } catch {}
              }
              return;
            }
            if (result.recentUserSeek && result.lastUserSeekTo !== null) lastKnownTimeRef.current = result.lastUserSeekTo;
            else lastKnownTimeRef.current = ct;
            const p = Math.floor((ct / result.duration) * 100);
            saveProgressRef.current(progressKey, Math.min(p, 100));
            storage.set("dlTime_" + progressKey, Math.floor(ct));
            const remaining = result.duration - ct;
            if (!autoMarkedRef.current && remaining <= watchedThreshold && remaining >= 0) {
              autoMarkedRef.current = true; onMarkWatchedRef.current?.(progressKey);
            }
          }
        } catch {}
      }, 5000);
    }, 3000);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, [playing, progressKey, watchedThreshold, playerSource, progressViaFrames]);

  const handlePlay = useCallback(() => {
    if (onWatch) { onHistory({ ...d, media_type: "movie" }); onWatch({ item: d, season: null, episode: null, sourceId: foundSource }); return; }
    setM3u8Url(null); setInterceptedSubs([]); setPlaying(true);
    onHistory({ ...d, media_type: "movie" });
    // Stop pre-warm webview so it doesn't compete for resources
    const pw = preWarmRef.current;
    if (pw) { try { pw.src = "about:blank"; } catch {} }
  }, [d, onHistory, onWatch, foundSource]);

  // ── Fullscreen / PiP listeners ────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !NEEDS_INTERCEPT.includes(playerSource)) return;
    const enterH = window.electron?.onWebviewEnterFullscreen?.(() => { setPlayerFullscreen(true); document.documentElement.setAttribute("data-player-fullscreen", "1"); });
    const leaveH = window.electron?.onWebviewLeaveFullscreen?.(() => { setPlayerFullscreen(false); document.documentElement.removeAttribute("data-player-fullscreen"); if (document.fullscreenElement) document.exitFullscreen?.(); });
    return () => {
      if (enterH) window.electron?.offWebviewEnterFullscreen?.(enterH);
      if (leaveH) window.electron?.offWebviewLeaveFullscreen?.(leaveH);
      document.documentElement.removeAttribute("data-player-fullscreen");
    };
  }, [playing, playerSource]);

  useEffect(() => {
    if (!playing) return;
    const openH = window.electron?.onPipOpened?.(async () => { setPipOpen(true); pipWebContentsIdRef.current = (await window.electron.getPipWebContentsId?.()) ?? null; });
    const closeH = window.electron?.onPipClosed?.(() => { pipUrlRef.current = null; pipWebContentsIdRef.current = null; setPipOpen(false); });
    return () => {
      if (openH) window.electron?.offPipOpened?.(openH);
      if (closeH) window.electron?.offPipClosed?.(closeH);
    };
  }, [playing]);

  const handleSetDownloaderFolder = useCallback((folder) => { setDownloaderFolder(folder); storage.set("downloaderFolder", folder); }, []);

  // ── Derived display values ────────────────────────────────────────────────
  const displayOverview = isAnime && anilistData?.description ? cleanAnilistDescription(anilistData.description) : d.overview;
  const displayScore    = isAnime && anilistData?.averageScore ? (anilistData.averageScore / 10).toFixed(1) : d.vote_average > 0 ? d.vote_average.toFixed(1) : null;
  const displayGenres   = isAnime && anilistData?.genres?.length ? anilistData.genres.map((g, i) => ({ id: i, name: g })) : d.genres || [];

  const isUnreleased = useMemo(() => {
    if (!d.release_date) return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(d.release_date) > today;
  }, [d.release_date]);

  const movieDownload = (downloads || []).find((dl) =>
    dl.mediaType === "movie" && (dl.tmdbId === item.id || dl.mediaId === item.id) &&
    (dl.status === "completed" || dl.status === "local" || dl.status === "downloading"));

  const handleUpgrade = onUpgrade ?? (() => window.dispatchEvent(new CustomEvent("novaspark:upgrade")));

  // ── Pre-warm URL: start loading embed BEFORE user clicks play ────────────
  // Uses same persist:player partition — shared HTTP cache = near-instant
  // main-player load when user actually hits Play.
  const preWarmUrl = useMemo(() => {
    if (!foundSource || !window.electron || sourceIsAsync(playerSource) || restricted || isUnreleased || playing) return null;
    return getSourceUrl(foundSource, "movie", item.id, null, null);
  }, [foundSource, playerSource, restricted, isUnreleased, playing, item.id]);

  return (
    <div className="fade-in">

      {/* ── Server toast ─────────────────────────────────────────────────── */}
      {playing && <ServerToast status={autoSourceStatus} sourceLabel={PLAYER_SOURCES.find((s) => s.id === playerSource)?.label} />}

      {/* ── PRE-WARM: invisible webview pre-loads embed into HTTP cache ───── */}
      {preWarmUrl && (
        <webview
          ref={preWarmRef}
          src={preWarmUrl}
          partition="persist:player"
          allowpopups="false"
          plugins="true"
          webpreferences="contextIsolation=yes,nodeIntegration=no,webSecurity=no,allowRunningInsecureContent=yes"
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
          style={{ position:"fixed", top:"-9999px", left:"-9999px", width:"1px", height:"1px", opacity:0, pointerEvents:"none", zIndex:-1 }}
        />
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="detail-hero">
        <div className="detail-bg" style={{ backgroundImage:`url(${imgUrl(d.backdrop_path, "w1280")})` }} />
        <div className="detail-gradient" />
        <div className="detail-content">
          <div className="detail-poster" style={{ position:"relative" }}>
            {d.poster_path
              ? <img src={imgUrl(d.poster_path)} alt={title} loading="lazy" />
              : <div style={{ width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--text3)" }}><FilmIcon /></div>}
            {isWatched && <div className="detail-watched-badge"><WatchedIcon size={36} /></div>}
          </div>
          <div className="detail-info">
            <div className="detail-type" style={{ display:"flex",alignItems:"center",gap:8 }}>
              Movie
              {isWatched && <span className="watched-label"><WatchedIcon size={14} /> Watched</span>}
            </div>
            <div className="detail-title">{title}</div>
            <div className="genres">
              {displayGenres.map((g) => <span key={g.id} className="genre-tag">{g.name}</span>)}
            </div>
            <div className="detail-meta">
              {displayScore && <span className="detail-rating"><StarIcon /> {displayScore}</span>}
              {year && <span>{year}</span>}
              {d.runtime && <span>{d.runtime} min</span>}
              {d.original_language && <span>{d.original_language?.toUpperCase()}</span>}
            </div>
            {rating.cert && (
              <div className={`age-rating-pill${restricted?" age-rating-pill--restricted":""}`}>
                {restricted ? <RatingLockIcon size={13} /> : <RatingShieldIcon size={13} />}
                <span className="age-rating-pill-cert">{rating.cert}</span>
                {restricted && <span className="age-rating-pill-label">Inappropriate for your age setting</span>}
              </div>
            )}
            <p className="detail-overview">{displayOverview}</p>
            {!isWatched && displayPct > 0 && (
              <div className="progress-bar-row" style={{ marginBottom:12 }}>
                <div className="progress-bar-outer"><div className="progress-bar-fill" style={{ width:`${Math.min(displayPct,100)}%` }} /></div>
                <span style={{ fontSize:12,color:"var(--text3)" }}>{progressLabel}</span>
              </div>
            )}
            <div className="detail-actions">
              {isUnreleased ? (
                <button className="btn btn-primary btn-restricted" disabled title="This movie has not been released yet">🔒 Unreleased</button>
              ) : restricted ? (
                <button className="btn btn-primary btn-restricted" disabled title="Inappropriate for your age rating setting">🔒 Restricted</button>
              ) : (
                <button className="btn btn-primary" onClick={handlePlay}><PlayIcon /> {playing ? "Restart" : "Play"}</button>
              )}
              {trailerKey && (restricted
                ? <button className="btn btn-secondary btn-restricted" disabled>🔒 Trailer</button>
                : <button className="btn btn-secondary" onClick={() => setShowTrailer(true)}><TrailerIcon /> Trailer</button>)}
              <button className="btn btn-secondary" onClick={onSave}>{isSaved ? <BookmarkFillIcon /> : <BookmarkIcon />}{isSaved ? "Saved" : "Save"}</button>
              {!isUnreleased && (isWatched
                ? <button className="btn btn-ghost watched-btn" onClick={() => onMarkUnwatched?.(progressKey)}><WatchedIcon size={16} /> Watched</button>
                : <>
                    <button className="btn btn-ghost" onClick={() => onMarkWatched?.(progressKey)}>✓ Mark Watched</button>
                    {hasProgress && <button className="btn btn-ghost" style={{ fontSize:13 }} onClick={() => { saveProgress(progressKey,0); storage.set("dlTime_"+progressKey,null); }}>⊘ Not Started</button>}
                  </>)}
              <button className="btn btn-ghost" onClick={onBack}><BackIcon /> Back</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Inline player (web mode — when onWatch not provided) ─────────── */}
      {playing && !restricted && !isUnreleased && !onWatch && (
        <div className="section">
          <div className={`player-wrap${playerFullscreen?" player-wrap--fullscreen":""}`} ref={playerWrapRef}>

            {/* Solid black — only lifted when video.readyState >= 2 */}
            {webviewLoading && !resolveError && (
              <div style={{ position:"absolute",inset:0,zIndex:10,display:"flex",alignItems:"center",justifyContent:"center",background:"#000",borderRadius:"inherit" }}>
                <div className="spinner" />
              </div>
            )}

            {sourceIsAsync(playerSource) && resolveError && !resolvingUrl && (
              <div style={{ position:"absolute",inset:0,zIndex:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.85)",gap:10,borderRadius:"inherit" }}>
                <span style={{ fontSize:28 }}>⚠️</span>
                <span style={{ fontSize:14,color:"var(--text2)" }}>Movie not found</span>
                <span style={{ fontSize:12,color:"var(--text3)" }}>{resolveError}</span>
                <span style={{ fontSize:12,color:"var(--text3)" }}>Try a different source.</span>
              </div>
            )}

            {pipOpen && (
              <div style={{ position:"absolute",inset:0,zIndex:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.92)",gap:16,borderRadius:"inherit" }}>
                <PopOutIcon size={36} />
                <span style={{ fontSize:15,color:"var(--text1)",fontWeight:600 }}>Playing in pop-out window</span>
                <button className="player-overlay-btn" onClick={() => window.electron?.closePipWindow?.()} style={{ marginTop:4 }}>Close pop-out &amp; return</button>
              </div>
            )}

            {window.electron ? (
              <webview
                ref={webviewRef}
                src={pipOpen ? "about:blank" : sourceIsAsync(playerSource) ? resolvedPlayerUrl || "about:blank" : getSourceUrl(playerSource, "movie", item.id, null, null)}
                partition="persist:player"
                allowpopups="true"
                plugins="true"
                webpreferences="contextIsolation=true,nodeIntegration=false,webSecurity=false,allowRunningInsecureContent=true"
                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
                style={{ position:"absolute",inset:0,width:"100%",height:"100%",border:"none",opacity:webviewLoading||(sourceIsAsync(playerSource)&&!resolvedPlayerUrl)?0:1,transition:"opacity 0.3s ease" }}
              />
            ) : (
              <iframe
                ref={webviewRef}
                src={pipOpen ? "about:blank" : sourceIsAsync(playerSource) ? resolvedPlayerUrl || "about:blank" : getSourceUrl(playerSource, "movie", item.id, null, null)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                style={{ position:"absolute",inset:0,width:"100%",height:"100%",border:"none",background:"#000",opacity:webviewLoading||(sourceIsAsync(playerSource)&&!resolvedPlayerUrl)?0:1,transition:"opacity 0.3s ease" }}
              />
            )}

            <div className="player-overlay-group">
              <button ref={sourceRef} className="player-overlay-btn"
                onClick={() => {
                  if (!canSwitchSource(planId)) { setGateModal("source"); return; }
                  const rect = sourceRef.current?.getBoundingClientRect();
                  if (rect) setMenuPos({ top: rect.bottom + 6, left: rect.left });
                  setShowSourceMenu((v) => !v);
                }} title="Change source">
                <SourceIcon />{PLAYER_SOURCES.find((s) => s.id === playerSource)?.label ?? "Source"}
              </button>
              {playerSource === "allmanga" && (
                <button className="player-overlay-btn" onClick={() => {
                  const next = dubMode === "sub" ? "dub" : "sub";
                  setDubMode(next); storage.set("allmangaDubMode", next);
                  setM3u8Url(null); setInterceptedSubs([]); setResolvedPlayerUrl(null); setResolvingUrl(false); setResolveError(null);
                }} title="Toggle Sub/Dub">{dubMode === "sub" ? "SUB" : "DUB"}</button>
              )}
              <button className="player-overlay-btn" onClick={() => { setShowSourceMenu(false); setShowBlockedModal(true); }} title="Blocked ads & trackers">
                <ShieldBlockIcon />{blockedSession > 0 && <span className="player-blocked-badge">{blockedSession}</span>}
              </button>
              <button className="player-overlay-btn"
                onClick={() => {
                  if (pipOpen) { window.electron?.closePipWindow?.(); return; }
                  if (!canPopOut(planId)) { setGateModal("pip"); return; }
                  const url = sourceIsAsync(playerSource) ? resolvedPlayerUrl : getSourceUrl(playerSource, "movie", item.id, null, null);
                  if (!url) return;
                  pipUrlRef.current = url;
                  window.electron?.openPipWindow?.(url, item.title);
                }}
                title={pipOpen ? "Close pop-out" : "Pop out player"}
                disabled={!pipOpen && (webviewLoading || !!(sourceIsAsync(playerSource) && !resolvedPlayerUrl))}
                style={pipOpen ? { color:"var(--red)" } : undefined}>
                <PopOutIcon />
              </button>
            </div>

            {showSourceMenu && menuPos && (
              <div className="source-dropdown source-dropdown--fixed" style={{ top:menuPos.top, left:menuPos.left }} onClick={(e) => e.stopPropagation()}>
                {PLAYER_SOURCES.map((src) => (
                  <button key={src.id}
                    className={"source-dropdown__item" + (playerSource === src.id ? " source-dropdown__item--active" : "")}
                    onClick={() => {
                      setShowSourceMenu(false); if (src.id === playerSource) return;
                      const all = PLAYER_SOURCES.filter((s) => !s.async && !s.tag).map((s) => s.id);
                      const start = all.indexOf(src.id);
                      retryQueueRef.current = start >= 0 ? [...all.slice(start), ...all.slice(0, start)] : [src.id, ...all.filter((id) => id !== src.id)];
                      retryIdxRef.current = 1;
                      setPlayerSource(src.id); storage.set("playerSource", src.id);
                      setM3u8Url(null); setInterceptedSubs([]); setResolvedPlayerUrl(null); setResolvingUrl(false); setResolveError(null);
                    }}>
                    <span>{src.label}</span>
                    {src.tag  && <span className="source-dropdown__tag">{src.tag}</span>}
                    {src.note && <span className="source-dropdown__note">{src.note}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Download row */}
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",background:"var(--surface)",borderRadius:12,border:"1px solid var(--border)",marginTop:16,gap:16 }}>
            <div style={{ display:"flex",alignItems:"center",gap:12,flex:1 }}>
              <div style={{ width:40,height:40,borderRadius:10,background:movieDownload?"rgba(76,175,80,0.1)":"rgba(0,168,225,0.08)",display:"flex",alignItems:"center",justifyContent:"center",color:movieDownload?"#4caf50":"#00a8e1",fontSize:20 }}>
                {movieDownload ? "✓" : "⬇️"}
              </div>
              <div>
                <div style={{ fontSize:14,fontWeight:600,color:"var(--text)" }}>
                  {movieDownload ? (movieDownload.status==="downloading"?"Downloading…":"Downloaded") : "Download this movie"}
                </div>
                <div style={{ fontSize:12,color:"var(--text3)",marginTop:2 }}>
                  {movieDownload ? (movieDownload.status==="downloading"?"In progress — click to view":"Available offline") : "Watch offline anytime"}
                </div>
              </div>
            </div>
            <button className="btn btn-primary"
              onClick={() => {
                if (movieDownload) { onGoToDownloads?.(movieDownload.id); return; }
                if (!canDownload(planId)) { setGateModal("download"); return; }
                setShowDownload(true);
              }}
              style={{ background:movieDownload?"rgba(76,175,80,0.15)":"linear-gradient(90deg,#00a8e1,#0076b0)",border:movieDownload?"1px solid rgba(76,175,80,0.3)":"none",color:movieDownload?"#4caf50":"#fff",whiteSpace:"nowrap" }}>
              {movieDownload ? <>View in Downloads</> : <><DownloadIcon size={14} /> Download</>}
            </button>
          </div>

          {displayPct > 0 && (
            <div className="progress-bar-row">
              <div className="progress-bar-outer"><div className="progress-bar-fill" style={{ width:`${Math.min(displayPct,100)}%` }} /></div>
              <span style={{ fontSize:12,color:"var(--text3)" }}>{progressLabel}</span>
            </div>
          )}
          <div className="progress-mark-row">
            <span style={{ fontSize:12,color:"var(--text3)",marginRight:4 }}>Mark progress:</span>
            {[25,50,75,100].map((p) => (
              <button key={p} className="btn btn-ghost" style={{ padding:"5px 14px",fontSize:12 }} onClick={() => saveProgress(progressKey,p)}>{p}%</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Collection ───────────────────────────────────────────────────── */}
      {collection && onSelect && (
        <div className="section">
          <div className="section-title">{collection.name}</div>
          <div className="scroll-row">
            {collection.parts.map((part) => {
              const pk = `movie_${part.id}`;
              const isCurrent = part.id === item.id;
              return (
                <CollectionCard key={part.id} part={part} isCurrent={isCurrent} onSelect={onSelect}
                  progress={progress[pk] || 0} watched={watched} onMarkWatched={onMarkWatched} onMarkUnwatched={onMarkUnwatched} />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {showTrailer && trailerKey && <TrailerModal trailerKey={trailerKey} title={title} onClose={() => setShowTrailer(false)} />}
      {showBlockedModal && <BlockedStatsModal sessionDomains={getBlockedDomains()} sessionTotal={blockedSession} alltimeTotal={blockedAlltime} onClose={() => setShowBlockedModal(false)} />}
      {showDownload && <DownloadModal onClose={() => setShowDownload(false)} m3u8Url={m3u8Url} subtitles={interceptedSubs} mediaName={mediaName} downloaderFolder={downloaderFolder} setDownloaderFolder={handleSetDownloaderFolder} onOpenSettings={onSettings} onDownloadStarted={onDownloadStarted} mediaId={item.id} mediaType="movie" posterPath={d.poster_path} tmdbId={item.id} />}
      {gateModal && <PremiumGate feature={gateModal} onUpgrade={handleUpgrade} onClose={() => setGateModal(null)} />}
    </div>
  );
}

const CollectionCard = memo(function CollectionCard({ part, isCurrent, onSelect, progress, watched, onMarkWatched, onMarkUnwatched }) {
  const handleClick = useCallback(() => onSelect(part), [onSelect, part]);
  return (
    <div style={{ opacity:isCurrent?0.5:1, pointerEvents:isCurrent?"none":"auto" }}>
      <MediaCard item={part} onClick={handleClick} progress={progress} watched={watched} onMarkWatched={onMarkWatched} onMarkUnwatched={onMarkUnwatched} />
    </div>
  );
});