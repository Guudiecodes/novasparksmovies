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
import DownloadModal     from "../components/DownloadModal";
import TrailerModal      from "../components/TrailerModal";
import BlockedStatsModal from "../components/BlockedStatsModal";
import DataMeterWidget   from "../components/DataMeterWidget";
import { useBlockedStats } from "../utils/useBlockedStats";
import MediaCard         from "../components/MediaCard";
import { storage }       from "../utils/storage";
import { fetchMovieRating, isRestricted, getAgeLimitSetting, getRatingCountry } from "../utils/ageRating";
import { canSwitchSource, canDownload, canPopOut } from "../utils/gate";
import PremiumGate       from "../components/PremiumGate";
import NativeBanner from '../components/NativeBanner';
import AdsterraAds from '../components/AdsterraAds';


// Place between movie rows:
<NativeBanner />
const _EMBED_CSS = `
[class*="loading"i],[class*="loader"i],[class*="fetching"i],[class*="preload"i],
[id*="loading"i],[id*="loader"i],[id*="fetching"i],
.spinner,.preloader,.lds-ring,.lds-spinner,.vjs-loading-spinner,
.jw-icon-loading,.plyr__loading{display:none!important;opacity:0!important;visibility:hidden!important;}
video{opacity:1!important;visibility:visible!important;display:block!important;}
`;

const _EMBED_JS = `(function(){
  if(window.__ns)return;window.__ns=true;
  var BAD=['FETCHING, ONE MOMENT...','FETCHING','ONE MOMENT...','PLEASE WAIT','LOADING...','LOADING'];
  function run(){try{document.querySelectorAll('body *').forEach(function(el){
    if(!el.childElementCount){var t=(el.textContent||'').trim().toUpperCase();
    if(BAD.some(function(k){return t===k||t.startsWith(k);})){
      var p=el;for(var i=0;i<<4;i++){var par=p.parentElement;if(par&&par!==document.body)p=par;else break;}
      p.style.cssText='display:none!important;opacity:0!important;pointer-events:none!important;';}}});}catch(e){}}
  run();var obs=new MutationObserver(run);obs.observe(document.body,{childList:true,subtree:true});
  setTimeout(function(){obs.disconnect();},12000);
})()`;

// ── Disclaimer ticker ─────────────────────────────────────────────────────────
function DisclaimerTicker() {
  const msg =
    "⚠  NovaSparks does not host or store any media content. Stream quality and availability may vary by region. You must be of legal viewing age in your jurisdiction. We are not responsible for third-party content or advertisements.  ⚠";
  return (
    <div style={{
      background: "rgba(229,9,20,0.06)",
      borderBottom: "1px solid rgba(229,9,20,0.12)",
      overflow: "hidden",
      padding: "7px 0",
      userSelect: "none",
    }}>
      <div className="ns-ticker-track">
        <AdsterraAds />
        <span className="ns-ticker-msg">{msg}</span>
        <span className="ns-ticker-msg">{msg}</span>
      </div>
    </div>
  );
}

// ── Server toast ──────────────────────────────────────────────────────────────
function ServerToast({ status, sourceLabel }) {
  const [show, setShow] = useState(false);
  const [fade, setFade] = useState(false);
  const timerRef = useRef(null);
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
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
      background: "rgba(10,14,20,0.95)", border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 12, padding: "10px 20px", display: "flex", alignItems: "center", gap: 10,
      color: "#fff", fontSize: 13, fontWeight: 500, backdropFilter: "blur(12px)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      opacity: fade ? 0 : 1, transition: "opacity 0.45s ease", pointerEvents: "none",
    }}>
      {(status === "testing" || status === "retrying") ? (<>
        <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.15)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
        <span>{status === "retrying" ? "Trying another server…" : "Finding best server…"}</span>
      </>) : status === "found" ? (<>
        <span style={{ color: "#4caf50", fontSize: 16, lineHeight: 1 }}>✓</span>
        <span>Playing on <strong>{sourceLabel}</strong></span>
      </>) : (<>
        <span style={{ color: "#ff5252", fontSize: 16, lineHeight: 1 }}>⚠</span>
        <span>Could not load — try another server</span>
      </>)}
    </div>
  );
}

// ── Cast card (grid style, matching TVPage) ───────────────────────────────────
const CastCard = memo(function CastCard({ person }) {
  return (
    <div className="ns-cast-card">
      <div className="ns-cast-img">
        {person.profile_path ? (
          <img src={imgUrl(person.profile_path, "w185")} alt={person.name} loading="lazy" />
        ) : (
          <div className="ns-cast-placeholder">
            <span>{person.name?.[0] ?? "?"}</span>
          </div>
        )}
      </div>
      <div className="ns-cast-name">{person.name}</div>
      <div className="ns-cast-role">{person.character || ""}</div>
    </div>
  );
});

// ── Review card ───────────────────────────────────────────────────────────────
const ReviewCard = memo(function ReviewCard({ review }) {
  const [expanded, setExpanded] = useState(false);
  const content = review.content || "";
  const short = content.length > 320;
  const display = expanded || !short ? content : content.slice(0, 320) + "…";
  const initials = (review.author || "?").slice(0, 2).toUpperCase();
  const rating = review.author_details?.rating;
  const date = review.created_at
    ? new Date(review.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : "";
  return (
    <div className="ns-review-card">
      <div className="ns-review-header">
        <div className="ns-review-avatar">{initials}</div>
        <div className="ns-review-meta">
          <div className="ns-review-author">{review.author}</div>
          {date && <div className="ns-review-date">{date}</div>}
        </div>
        {rating && (
          <div className="ns-review-rating">
            <StarIcon size={11} /> {rating}/10
          </div>
        )}
      </div>
      <p className="ns-review-body">{display}</p>
      {short && (
        <button className="ns-review-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </div>
  );
});

// ── Info row ──────────────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="ns-info-row">
      <span className="ns-info-label">{label}</span>
      <span className="ns-info-value">{value}</span>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────
function SectionHeading({ children }) {
  return (
    <div className="ns-section-heading">
      <span>{children}</span>
      <div className="ns-section-rule" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function MoviePage({
  item, apiKey, onSave, isSaved, onHistory, progress, saveProgress,
  onBack, onSettings, onDownloadStarted, watched, onMarkWatched, onMarkUnwatched,
  downloads, onGoToDownloads, onSelect, onWatch, isPremium, onUpgrade,
}) {
  const [details,           setDetails]           = useState(null);
  const [playing,           setPlaying]           = useState(false);
  const [showDownload,      setShowDownload]      = useState(false);
  const [trailerKey,        setTrailerKey]        = useState(null);
  const [showTrailer,       setShowTrailer]       = useState(false);
  const [m3u8Url,           setM3u8Url]           = useState(null);
  const [interceptedSubs,   setInterceptedSubs]   = useState([]);
  const [playerSource,      setPlayerSource]      = useState(() => storage.get("playerSource") || NON_ANIME_DEFAULT_SOURCE);
  const [autoSourceStatus,  setAutoSourceStatus]  = useState("testing");
  const [foundSource,       setFoundSource]       = useState(null);
  const progressViaFrames   = useMemo(() => sourceProgressViaFrames(playerSource), [playerSource]);
  const [showSourceMenu,    setShowSourceMenu]    = useState(false);
  const [dubMode,           setDubMode]           = useState(() => storage.get("allmangaDubMode") || "sub");
  const [anilistData,       setAnilistData]       = useState(null);
  const [menuPos,           setMenuPos]           = useState(null);
  const [gateModal,         setGateModal]         = useState(null);
  const [resolvedPlayerUrl, setResolvedPlayerUrl] = useState(null);
  const [resolvingUrl,      setResolvingUrl]      = useState(false);
  const [resolveError,      setResolveError]      = useState(null);
  const [collection,        setCollection]        = useState(null);
  const [webviewLoading,    setWebviewLoading]    = useState(false);
  const [playerFullscreen,  setPlayerFullscreen]  = useState(false);
  const [pipOpen,           setPipOpen]           = useState(false);
  const [downloaderFolder,  setDownloaderFolder]  = useState(() => storage.get("downloaderFolder") || "");
  const [cast,              setCast]              = useState([]);
  const [reviews,           setReviews]           = useState([]);
  const [keywords,          setKeywords]          = useState([]);
  const [showAllCast,       setShowAllCast]       = useState(false);
  const [showAllReviews,    setShowAllReviews]    = useState(false);

  const sourceRef           = useRef(null);
  const playerWrapRef       = useRef(null);
  const webviewRef          = useRef(null);
  const preWarmRef          = useRef(null);
  const pollRef             = useRef(null);
  const retryQueueRef       = useRef([]);
  const retryIdxRef         = useRef(0);
  const saveProgressRef     = useRef(saveProgress);
  saveProgressRef.current   = saveProgress;
  const onMarkWatchedRef    = useRef(onMarkWatched);
  onMarkWatchedRef.current  = onMarkWatched;
  const pipUrlRef           = useRef(null);
  const pipWebContentsIdRef = useRef(null);

  const isAnime = useMemo(() => isAnimeContent(item, details), [item.id, details]); // eslint-disable-line

  const { sessionTotal: blockedSession, alltimeTotal: blockedAlltime,
    showModal: showBlockedModal, setShowModal: setShowBlockedModal,
    getSessionDomains: getBlockedDomains } = useBlockedStats(item.id);

  const [rating,        setRating]        = useState({ cert: null, minAge: null });
  const ageLimitSetting = useMemo(() => getAgeLimitSetting(storage), []);
  const ratingCountry   = useMemo(() => getRatingCountry(storage), []);
  const restricted      = isRestricted(rating.minAge, ageLimitSetting);

  const progressKey = `movie_${item.id}`;
  const pct         = progress[progressKey] || 0;
  const isWatched   = !!watched?.[progressKey];
  const hasProgress = pct > 0;

  const d         = details || item;
  const title     = d.title || d.name;
  const year      = (d.release_date || "").slice(0, 4);
  const mediaName = `${title}${year ? " (" + year + ")" : ""}`;
  const planId    = isPremium?.planId || (isPremium ? "premium" : "free");

  const { displayPct, progressLabel } = useMemo(() => {
    const ws = storage.get("dlTime_" + progressKey) || 0;
    const ts = d?.runtime ? d.runtime * 60 : 0;
    const dp = ws > 0 && ts > 0 ? Math.floor((ws / ts) * 100) : 0;
    const display = pct > 0 ? pct : dp;
    const fmt = (s) => {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
      return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
    };
    const label = ws > 0 && ts > 0 ? `${fmt(ws)} / ${fmt(ts)}` : ws > 0 ? fmt(ws) : display > 0 ? `${display}%` : null;
    return { displayPct: display, progressLabel: label };
  }, [progressKey, pct, d?.runtime]);

  const [watchedThreshold]  = useState(() => storage.get("watchedThreshold") ?? 20);
  const autoMarkedRef        = useRef(false);
  const lastKnownTimeRef     = useRef(0);
  const seekBackCooldownRef  = useRef(0);

  useEffect(() => {
    const all   = PLAYER_SOURCES.filter((s) => !s.async && !s.tag).map((s) => s.id);
    const start = all.indexOf(playerSource);
    retryQueueRef.current = start >= 0
      ? [...all.slice(start), ...all.slice(0, start)]
      : [playerSource, ...all.filter((id) => id !== playerSource)];
    retryIdxRef.current = 1;
  }, [item.id]); // eslint-disable-line

  const tryNextSource = useCallback(() => {
    const idx = retryIdxRef.current;
    if (idx >= retryQueueRef.current.length) { setAutoSourceStatus("failed"); setWebviewLoading(false); return; }
    const nextId = retryQueueRef.current[idx];
    retryIdxRef.current += 1;
    setAutoSourceStatus("retrying");
    setPlayerSource(nextId); storage.set("playerSource", nextId);
  }, []);

  // ── Details ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    tmdbFetch(`/movie/${item.id}`, apiKey)
      .then((d) => { if (mounted) setDetails(d); })
      .catch(() => { if (mounted) setDetails(item); });
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  // ── Credits + reviews + keywords in parallel ──────────────────────────────
  useEffect(() => {
    if (!item?.id) return;
    let mounted = true;
    Promise.all([
      tmdbFetch(`/movie/${item.id}/credits`, apiKey).catch(() => ({ cast: [] })),
      tmdbFetch(`/movie/${item.id}/reviews`, apiKey).catch(() => ({ results: [] })),
      tmdbFetch(`/movie/${item.id}/keywords`, apiKey).catch(() => ({ keywords: [] })),
    ]).then(([credits, reviewsData, kwData]) => {
      if (!mounted) return;
      setCast(credits.cast || []);
      setReviews(reviewsData.results || []);
      setKeywords(kwData.keywords || []);
    });
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;
    setAutoSourceStatus("testing");
    findWorkingSource("movie", item.id, null, null, playerSource).then((id) => {
      if (cancelled) return;
      setFoundSource(id);
      setAutoSourceStatus(id ? "found" : "failed");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [item.id, playerSource]);

  useEffect(() => {
    let mounted = true;
    fetchMovieRating(item.id, apiKey, ratingCountry).then((r) => { if (mounted) setRating(r); });
    return () => { mounted = false; };
  }, [item.id, apiKey, ratingCountry]);

  useEffect(() => {
    let mounted = true;
    tmdbFetch(`/movie/${item.id}/videos`, apiKey).then((data) => {
      if (!mounted) return;
      const vids    = data.results || [];
      const trailer = vids.find((v) => v.type === "Trailer" && v.site === "YouTube") || vids.find((v) => v.site === "YouTube");
      setTrailerKey(trailer ? trailer.key : null);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  useEffect(() => {
    setCollection(null);
    if (!details?.belongs_to_collection?.id) return;
    let mounted = true;
    tmdbFetch(`/collection/${details.belongs_to_collection.id}`, apiKey).then((data) => {
      if (!mounted) return;
      const parts = (data.parts || [])
        .map((p) => ({ ...p, media_type: "movie" }))
        .sort((a, b) => (a.release_date || "").localeCompare(b.release_date || ""));
      if (parts.length > 1) setCollection({ name: data.name, parts });
    }).catch(() => {});
    return () => { mounted = false; };
  }, [details?.belongs_to_collection?.id, apiKey]);

  useEffect(() => {
    setM3u8Url(null); setInterceptedSubs([]); setShowSourceMenu(false);
    setAnilistData(null); setResolvedPlayerUrl(null); setResolvingUrl(false);
    setResolveError(null); setWebviewLoading(true);
  }, [item.id, playerSource, dubMode]);

  useEffect(() => {
    let mounted = true;
    if (isAnime) {
      fetchAnilistData(item.title || item.name, "ANIME", item.id).then(
        (data) => { if (mounted && data) setAnilistData(data); },
      ).catch(() => {});
      const cur = PLAYER_SOURCES.find((s) => s.id === playerSource);
      if (!cur?.tag) { const sv = storage.get("playerSource"); const svs = PLAYER_SOURCES.find((s) => s.id === sv); setPlayerSource(svs?.tag ? sv : ANIME_DEFAULT_SOURCE); }
    } else {
      const cur = PLAYER_SOURCES.find((s) => s.id === playerSource);
      if (cur?.tag) { const sv = storage.get("playerSource"); const svs = PLAYER_SOURCES.find((s) => s.id === sv); setPlayerSource(!svs?.tag ? sv : NON_ANIME_DEFAULT_SOURCE); }
    }
    return () => { mounted = false; };
  }, [item.id, isAnime]); // eslint-disable-line

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
  }, [playing, playerSource, dubMode]); // eslint-disable-line

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

  useEffect(() => { autoMarkedRef.current = false; lastKnownTimeRef.current = 0; seekBackCooldownRef.current = 0; }, [item.id, isWatched]);
  useEffect(() => { if (playing) setWebviewLoading(true); }, [playing]);

  useLayoutEffect(() => {
    if (playing) return;
    const wv = webviewRef.current;
    if (wv) { try { wv.src = "about:blank"; } catch {} }
  }, [playing]);

  useEffect(() => {
    if (!playing || !window.electron) return;
    const wv = webviewRef.current;
    if (!wv) return;
    let active = true;
    clearInterval(pollRef.current);
    const markReady = () => {
      if (!active) return; active = false; clearInterval(pollRef.current);
      setAutoSourceStatus((s) => (s === "retrying" || s === "testing") ? "found" : s);
      setWebviewLoading(false);
    };
    const onFail = () => {
      if (!active) return; active = false; clearInterval(pollRef.current);
      clearTimeout(hardTimeout); // eslint-disable-line
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
          if (r.ready) markReady(); else if (r.err) onFail();
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

  useEffect(() => {
    if (!playing || window.electron) return;
    let active = true;
    const tid = setTimeout(() => { if (active) setWebviewLoading(false); }, 8000);
    return () => { active = false; clearTimeout(tid); };
  }, [playing, playerSource, item.id]);

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
              })()`);
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
    if (onWatch) {
      onHistory({ ...d, media_type: "movie" });
      onWatch({ item: d, season: null, episode: null, sourceId: foundSource });
      return;
    }
    setM3u8Url(null); setInterceptedSubs([]); setPlaying(true);
    onHistory({ ...d, media_type: "movie" });
    const pw = preWarmRef.current;
    if (pw) { try { pw.src = "about:blank"; } catch {} }
  }, [d, onHistory, onWatch, foundSource]);

  useEffect(() => {
    if (!playing || !NEEDS_INTERCEPT.includes(playerSource)) return;
    const enterH = window.electron?.onWebviewEnterFullscreen?.(() => {
      setPlayerFullscreen(true); document.documentElement.setAttribute("data-player-fullscreen", "1");
    });
    const leaveH = window.electron?.onWebviewLeaveFullscreen?.(() => {
      setPlayerFullscreen(false); document.documentElement.removeAttribute("data-player-fullscreen");
      if (document.fullscreenElement) document.exitFullscreen?.();
    });
    return () => {
      if (enterH) window.electron?.offWebviewEnterFullscreen?.(enterH);
      if (leaveH) window.electron?.offWebviewLeaveFullscreen?.(leaveH);
      document.documentElement.removeAttribute("data-player-fullscreen");
    };
  }, [playing, playerSource]);

  useEffect(() => {
    if (!playing) return;
    const openH = window.electron?.onPipOpened?.(async () => {
      setPipOpen(true); pipWebContentsIdRef.current = (await window.electron.getPipWebContentsId?.()) ?? null;
    });
    const closeH = window.electron?.onPipClosed?.(() => {
      pipUrlRef.current = null; pipWebContentsIdRef.current = null; setPipOpen(false);
    });
    return () => {
      if (openH) window.electron?.offPipOpened?.(openH);
      if (closeH) window.electron?.offPipClosed?.(closeH);
    };
  }, [playing]);

  const handleSetDownloaderFolder = useCallback((folder) => {
    setDownloaderFolder(folder); storage.set("downloaderFolder", folder);
  }, []);

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

  const preWarmUrl = useMemo(() => {
    if (!foundSource || !window.electron || sourceIsAsync(playerSource) || restricted || isUnreleased || playing) return null;
    return getSourceUrl(foundSource, "movie", item.id, null, null);
  }, [foundSource, playerSource, restricted, isUnreleased, playing, item.id]);

  const visibleCast    = showAllCast    ? cast    : cast.slice(0, 12);
  const visibleReviews = showAllReviews ? reviews : reviews.slice(0, 3);

  const directors   = useMemo(() => (d.credits?.crew || []).filter((c) => c.job === "Director"), [d.credits]);
  const productionCompanies = useMemo(() => d.production_companies || [], [d.production_companies]);

  return (
    <div className="ns-movie-page fade-in" style={{ paddingBottom: "max(80px, env(safe-area-inset-bottom, 80px))" }}>
    <AdsterraAds />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        /* ── Ticker ──────────────────────────────────────────── */
        @keyframes tickerMove { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .ns-ticker-track { display: inline-flex; animation: tickerMove 42s linear infinite; white-space: nowrap; }
        .ns-ticker-track:hover { animation-play-state: paused; }
        .ns-ticker-msg { padding-right: 120px; font-size: 11.5px; color: rgba(255,255,255,0.42); letter-spacing: 0.15px; }

        /* ── Hero ────────────────────────────────────────────── */
        .ns-movie-hero { position: relative; min-height: 420px; display: flex; align-items: flex-end; overflow: hidden; }
        .ns-movie-hero-bg {
          position: absolute; inset: 0; background-size: cover; background-position: center top;
          background-repeat: no-repeat;
        }
        .ns-movie-hero-grad {
          position: absolute; inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 40%, rgba(16,16,16,0.96) 80%, var(--bg, #101010) 100%);
        }
        .ns-movie-hero-content {
          position: relative; z-index: 2;
          width: 100%; display: flex; gap: 28px; padding: 32px 28px 36px;
          align-items: flex-end;
        }
        .ns-movie-poster {
          flex-shrink: 0; width: 165px; border-radius: 10px; overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6); aspect-ratio: 2/3; background: rgba(255,255,255,0.06);
        }
        .ns-movie-poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ns-movie-info { flex: 1; min-width: 0; }
        .ns-movie-eyebrow {
          font-size: 11px; font-weight: 700; letter-spacing: 2px; color: var(--red, #e50914);
          text-transform: uppercase; margin-bottom: 8px;
        }
        .ns-movie-title {
          font-size: clamp(22px, 4vw, 40px); font-weight: 900; line-height: 1.1;
          color: #fff; margin: 0 0 10px; letter-spacing: -0.5px;
        }
        .ns-movie-genres { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .ns-movie-genre { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); border-radius: 20px; padding: 3px 11px; font-size: 11.5px; color: rgba(255,255,255,0.7); }
        .ns-movie-meta {
          display: flex; align-items: center; flex-wrap: wrap; gap: 14px;
          font-size: 13px; color: rgba(255,255,255,0.55); margin-bottom: 10px;
        }
        .ns-movie-score { display: flex; align-items: center; gap: 5px; color: #f5c518; font-weight: 700; font-size: 14px; }
        .ns-movie-overview {
          font-size: 14px; line-height: 1.65; color: rgba(255,255,255,0.72);
          margin: 12px 0 18px; max-width: 680px;
        }
        .ns-movie-actions { display: flex; flex-wrap: wrap; gap: 10px; }
        .ns-movie-body { padding: 0 28px; max-width: 1200px; margin: 0 auto; }

        /* ── Section heading ─────────────────────────────────── */
        .ns-section-heading {
          display: flex; align-items: center; gap: 14px;
          margin: 32px 0 18px; font-size: 12px; font-weight: 800;
          letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.5);
        }
        .ns-section-rule { flex: 1; height: 1px; background: rgba(255,255,255,0.07); }

        /* ── Info grid ───────────────────────────────────────── */
        .ns-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0; }
        .ns-info-row {
          display: flex; flex-direction: column; gap: 3px;
          padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.05);
          border-right: 1px solid rgba(255,255,255,0.05);
        }
        .ns-info-label { font-size: 10.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.35); }
        .ns-info-value { font-size: 13.5px; font-weight: 500; color: rgba(255,255,255,0.82); }

        /* ── Production chips ────────────────────────────────── */
        .ns-chip-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .ns-chip {
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 600;
          color: rgba(255,255,255,0.7);
        }
        .ns-chip img { height: 22px; width: auto; object-fit: contain; filter: brightness(0) invert(1); opacity: 0.7; display: block; }

        /* ── Cast grid ───────────────────────────────────────── */
        .ns-cast-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 14px; }
        .ns-cast-card { display: flex; flex-direction: column; align-items: center; gap: 7px; text-align: center; }
        .ns-cast-img {
          width: 80px; height: 80px; border-radius: 50%; overflow: hidden;
          background: rgba(255,255,255,0.07); border: 2px solid rgba(255,255,255,0.1); flex-shrink: 0;
        }
        .ns-cast-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ns-cast-placeholder {
          width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 800; color: rgba(255,255,255,0.25);
        }
        .ns-cast-name { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.85); line-height: 1.3; }
        .ns-cast-role { font-size: 11px; color: rgba(255,255,255,0.38); line-height: 1.3; }

        /* ── Show more ───────────────────────────────────────── */
        .ns-show-more-btn {
          display: block; width: 100%; margin-top: 14px; padding: 10px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.55);
          cursor: pointer; font-family: inherit; text-align: center; transition: background 0.15s, color 0.15s;
        }
        .ns-show-more-btn:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.85); }

        /* ── Reviews ─────────────────────────────────────────── */
        .ns-reviews-grid { display: flex; flex-direction: column; gap: 14px; }
        .ns-review-card {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 12px; padding: 18px 20px;
        }
        .ns-review-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .ns-review-avatar {
          width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
          background: rgba(229,9,20,0.18); border: 1px solid rgba(229,9,20,0.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 800; color: rgba(255,255,255,0.7);
        }
        .ns-review-meta { flex: 1; min-width: 0; }
        .ns-review-author { font-size: 13.5px; font-weight: 700; color: rgba(255,255,255,0.85); }
        .ns-review-date { font-size: 11.5px; color: rgba(255,255,255,0.38); margin-top: 1px; }
        .ns-review-rating { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: #f5c518; white-space: nowrap; }
        .ns-review-body { font-size: 13.5px; line-height: 1.65; color: rgba(255,255,255,0.62); margin: 0 0 6px; white-space: pre-wrap; word-break: break-word; }
        .ns-review-toggle { background: none; border: none; padding: 0; font-size: 12.5px; font-weight: 600; color: var(--red, #e50914); cursor: pointer; font-family: inherit; }

        /* ── Keywords ────────────────────────────────────────── */
        .ns-keywords { display: flex; flex-wrap: wrap; gap: 7px; }
        .ns-keyword { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 4px 10px; font-size: 11.5px; color: rgba(255,255,255,0.48); }

        /* ── Responsive ──────────────────────────────────────── */
        @media (max-width: 860px) {
          .ns-movie-hero-content { flex-direction: column; align-items: center; padding: 22px 18px 28px; gap: 20px; }
          .ns-movie-poster { width: 140px; }
          .ns-movie-info { width: 100%; text-align: center; }
          .ns-movie-genres { justify-content: center; }
          .ns-movie-meta { justify-content: center; }
          .ns-movie-overview { margin-left: auto; margin-right: auto; }
          .ns-movie-actions { justify-content: center; }
          .player-wrap { border-radius: 0 !important; }
          .ns-movie-body { padding: 0 18px; }
          .ns-info-grid { grid-template-columns: repeat(2, 1fr); }
          .ns-cast-grid { grid-template-columns: repeat(auto-fill, minmax(85px, 1fr)); gap: 10px; }
        }
        @media (max-width: 540px) {
          .ns-movie-hero { min-height: unset; }
          .ns-movie-poster { width: 115px; }
          .ns-movie-title { font-size: 20px; }
          .ns-movie-hero-content { padding: 18px 14px 24px; }
          .ns-movie-body { padding: 0 14px; }
          .ns-movie-actions .btn { flex: 1 1 auto; min-width: 88px; font-size: 13px; padding: 9px 10px; justify-content: center; }
          .ns-info-grid { grid-template-columns: 1fr 1fr; }
          .ns-cast-grid { grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; }
          .ns-cast-img { width: 64px !important; height: 64px !important; }
          .ns-cast-name { font-size: 11px; }
          .ns-cast-role { font-size: 10px; }
          .ns-review-card { padding: 14px; }
          .ns-section-heading { margin: 22px 0 14px; }
          .cards-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 380px) {
          .ns-movie-actions { gap: 7px; }
          .ns-movie-actions .btn { font-size: 12px; padding: 8px 8px; }
          .ns-cast-grid { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      {/* ── Disclaimer ticker ────────────────────────────────────────── */}
      <DisclaimerTicker />

      {playing && <ServerToast status={autoSourceStatus} sourceLabel={PLAYER_SOURCES.find((s) => s.id === playerSource)?.label} />}

      {preWarmUrl && (
        <webview ref={preWarmRef} src={preWarmUrl} partition="persist:player"
          allowpopups="false" plugins="true"
          webpreferences="contextIsolation=yes,nodeIntegration=no,webSecurity=no,allowRunningInsecureContent=yes"
          useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
          style={{ position: "fixed", top: "-9999px", left: "-9999px", width: "1px", height: "1px", opacity: 0, pointerEvents: "none", zIndex: -1 }}
        />
      )}

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="ns-movie-hero">
        {d.backdrop_path && (
          <div className="ns-movie-hero-bg" style={{
            backgroundImage: `url(${imgUrl(d.backdrop_path, "w1280")})`,
            filter: "brightness(0.45) contrast(1.05) saturate(0.9)",
          }} />
        )}
        <div className="ns-movie-hero-grad" />
        <div className="ns-movie-hero-content">
          <div className="ns-movie-poster" style={{ position: "relative" }}>
            {d.poster_path
              ? <img src={imgUrl(d.poster_path)} alt={title} loading="lazy" />
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)" }}><FilmIcon /></div>
            }
            {isWatched && <div className="detail-watched-badge"><WatchedIcon size={36} /></div>}
          </div>
          <div className="ns-movie-info">
            <div className="ns-movie-eyebrow" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              Movie
              {isWatched && <span className="watched-label"><WatchedIcon size={14} /> Watched</span>}
            </div>
            <h1 className="ns-movie-title">{title}</h1>
            <div className="ns-movie-genres">
              {displayGenres.map((g) => <span key={g.id} className="ns-movie-genre">{g.name}</span>)}
            </div>
            <div className="ns-movie-meta">
              {displayScore        && <span className="ns-movie-score"><StarIcon /> {displayScore}</span>}
              {year                && <span>{year}</span>}
              {d.runtime           && <span>{d.runtime} min</span>}
              {d.original_language && <span>{d.original_language?.toUpperCase()}</span>}
            </div>
            {rating.cert && (
              <div className={`age-rating-pill${restricted ? " age-rating-pill--restricted" : ""}`}>
                {restricted ? <RatingLockIcon size={13} /> : <RatingShieldIcon size={13} />}
                <span className="age-rating-pill-cert">{rating.cert}</span>
                {restricted && <span className="age-rating-pill-label">Inappropriate for your age setting</span>}
              </div>
            )}
            <p className="ns-movie-overview">{displayOverview}</p>
            {!isWatched && displayPct > 0 && (
              <div className="progress-bar-row" style={{ marginBottom: 12 }}>
                <div className="progress-bar-outer">
                  <div className="progress-bar-fill" style={{ width: `${Math.min(displayPct, 100)}%` }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>{progressLabel}</span>
              </div>
            )}
            <div className="ns-movie-actions">
              {isUnreleased ? (
                <button className="btn btn-primary btn-restricted" disabled>🔒 Unreleased</button>
              ) : restricted ? (
                <button className="btn btn-primary btn-restricted" disabled>🔒 Restricted</button>
              ) : (
                <button className="btn btn-primary" onClick={handlePlay}>
                  <PlayIcon /> {playing ? "Restart" : "Play"}
                </button>
              )}
              {trailerKey && (restricted
                ? <button className="btn btn-secondary btn-restricted" disabled>🔒 Trailer</button>
                : <button className="btn btn-secondary" onClick={() => setShowTrailer(true)}><TrailerIcon /> Trailer</button>
              )}
              <button className="btn btn-secondary" onClick={onSave}>
                {isSaved ? <BookmarkFillIcon /> : <BookmarkIcon />}
                {isSaved ? "Saved" : "Save"}
              </button>
              {!isUnreleased && (isWatched
                ? <button className="btn btn-ghost watched-btn" onClick={() => onMarkUnwatched?.(progressKey)}>
                    <WatchedIcon size={16} /> Watched
                  </button>
                : <>
                    <button className="btn btn-ghost" onClick={() => onMarkWatched?.(progressKey)}>✓ Mark Watched</button>
                    {hasProgress && (
                      <button className="btn btn-ghost" style={{ fontSize: 13 }}
                        onClick={() => { saveProgress(progressKey, 0); storage.set("dlTime_" + progressKey, null); }}>
                        ⊘ Not Started
                      </button>
                    )}
                  </>
              )}
              <button className="btn btn-ghost" onClick={onBack}><BackIcon /> Back</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Inline player ────────────────────────────────────────────── */}
      {playing && !restricted && !isUnreleased && !onWatch && (
        <div className="section">
          <div className={`player-wrap${playerFullscreen ? " player-wrap--fullscreen" : ""}`} ref={playerWrapRef}>
            {webviewLoading && !resolveError && (
              <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", borderRadius: "inherit" }}>
                <div className="spinner" />
              </div>
            )}
            {sourceIsAsync(playerSource) && resolveError && !resolvingUrl && (
              <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", gap: 10, borderRadius: "inherit" }}>
                <span style={{ fontSize: 28 }}>⚠️</span>
                <span style={{ fontSize: 14, color: "var(--text2)" }}>Movie not found</span>
                <span style={{ fontSize: 12, color: "var(--text3)" }}>{resolveError}</span>
              </div>
            )}
            {pipOpen && (
              <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.92)", gap: 16, borderRadius: "inherit" }}>
                <PopOutIcon size={36} />
                <span style={{ fontSize: 15, color: "var(--text)", fontWeight: 600 }}>Playing in pop-out window</span>
                <button className="player-overlay-btn" onClick={() => window.electron?.closePipWindow?.()}>Close pop-out &amp; return</button>
              </div>
            )}
            {window.electron ? (
              <webview key={`wv-movie-${playerSource}-${item.id}`} ref={webviewRef}
                src={pipOpen ? "about:blank" : sourceIsAsync(playerSource) ? resolvedPlayerUrl || "about:blank" : getSourceUrl(playerSource, "movie", item.id, null, null)}
                partition="persist:player" allowpopups="true" plugins="true"
                webpreferences="contextIsolation=true,nodeIntegration=false,webSecurity=false,allowRunningInsecureContent=true"
                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none",
                  opacity: webviewLoading || (sourceIsAsync(playerSource) && !resolvedPlayerUrl) ? 0 : 1,
                  transition: "opacity 0.3s ease" }}
              />
            ) : (
              <iframe key={`if-movie-${playerSource}-${item.id}`} ref={webviewRef}
                src={pipOpen ? "about:blank" : sourceIsAsync(playerSource) ? resolvedPlayerUrl || "about:blank" : getSourceUrl(playerSource, "movie", item.id, null, null)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", background: "#000",
                  opacity: webviewLoading || (sourceIsAsync(playerSource) && !resolvedPlayerUrl) ? 0 : 1,
                  transition: "opacity 0.3s ease" }}
              />
            )}
            <div className="player-overlay-group">
              <button ref={sourceRef} className="player-overlay-btn"
                onClick={() => {
                  if (!canSwitchSource(planId)) { setGateModal("source"); return; }
                  const rect = sourceRef.current?.getBoundingClientRect();
                  if (rect) setMenuPos({ top: rect.bottom + 6, left: rect.left });
                  setShowSourceMenu((v) => !v);
                }}>
                <SourceIcon size={14} />
                {PLAYER_SOURCES.find((s) => s.id === playerSource)?.label ?? "Source"}
              </button>
              {playerSource === "allmanga" && (
                <button className="player-overlay-btn" onClick={() => {
                  const next = dubMode === "sub" ? "dub" : "sub";
                  setDubMode(next); storage.set("allmangaDubMode", next);
                  setM3u8Url(null); setInterceptedSubs([]); setResolvedPlayerUrl(null); setResolvingUrl(false); setResolveError(null);
                }}>{dubMode === "sub" ? "SUB" : "DUB"}</button>
              )}
              <button className="player-overlay-btn" onClick={() => { setShowSourceMenu(false); setShowBlockedModal(true); }}>
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
                disabled={!pipOpen && (webviewLoading || !!(sourceIsAsync(playerSource) && !resolvedPlayerUrl))}
                style={pipOpen ? { color: "var(--red)" } : undefined}>
                <PopOutIcon />
              </button>
              <DataMeterWidget
                isPlaying={playing && !webviewLoading && !pipOpen}
                runtimeMinutes={d.runtime || null}
                genreIds={(displayGenres || []).map((g) => g.id || 0)}
                type="movie"
              />
            </div>
            {showSourceMenu && menuPos && (
              <div className="source-dropdown source-dropdown--fixed" style={{ top: menuPos.top, left: menuPos.left }} onClick={(e) => e.stopPropagation()}>
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

          {/* Download bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 18px", background: "var(--surface)",
            borderRadius: 12, border: "1px solid var(--border)", marginTop: 14, gap: 14,
            flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 180 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: movieDownload ? "rgba(76,175,80,0.1)" : "var(--red-dim)", display: "flex", alignItems: "center", justifyContent: "center", color: movieDownload ? "#4caf50" : "var(--red)", fontSize: 18 }}>
                {movieDownload ? "✓" : "⬇️"}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>
                  {movieDownload ? (movieDownload.status === "downloading" ? "Downloading…" : "Downloaded") : "Download this movie"}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 2 }}>
                  {movieDownload ? (movieDownload.status === "downloading" ? "In progress — click to view" : "Available offline") : "Watch offline anytime"}
                </div>
              </div>
            </div>
            <button className="btn btn-primary"
              onClick={() => {
                if (movieDownload) { onGoToDownloads?.(movieDownload.id); return; }
                if (!canDownload(planId)) { setGateModal("download"); return; }
                setShowDownload(true);
              }}
              style={{ whiteSpace: "nowrap" }}>
              {movieDownload ? <>View in Downloads</> : <><DownloadIcon size={14} /> Download</>}
            </button>
          </div>

          {displayPct > 0 && (
            <div className="progress-bar-row">
              <div className="progress-bar-outer">
                <div className="progress-bar-fill" style={{ width: `${Math.min(displayPct, 100)}%` }} />
              </div>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>{progressLabel}</span>
            </div>
          )}
          <div className="progress-mark-row">
            <span style={{ fontSize: 12, color: "var(--text3)", marginRight: 4 }}>Mark progress:</span>
            {[25, 50, 75, 100].map((p) => (
              <button key={p} className="btn btn-ghost" style={{ padding: "5px 14px", fontSize: 12 }}
                onClick={() => saveProgress(progressKey, p)}>{p}%</button>
            ))}
          </div>
        </div>
      )}

      {/* ── Page body ─────────────────────────────────────────────────── */}
      <div className="ns-movie-body">

        {/* ── Movie info grid ───────────────────────────────────────── */}
        <SectionHeading>Movie Info</SectionHeading>
        <div className="ns-info-grid">
          <InfoRow label="Release Date"   value={d.release_date ? new Date(d.release_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null} />
          <InfoRow label="Runtime"        value={d.runtime ? `${d.runtime} min` : null} />
          <InfoRow label="Status"         value={d.status} />
          <InfoRow label="Language"       value={d.original_language?.toUpperCase() || null} />
          <InfoRow label="Budget"         value={d.budget > 0 ? `$${(d.budget / 1e6).toFixed(1)}M` : null} />
          <InfoRow label="Revenue"        value={d.revenue > 0 ? `$${(d.revenue / 1e6).toFixed(1)}M` : null} />
          <InfoRow label="Country"        value={(d.production_countries || []).map((c) => c.name).join(", ") || null} />
          <InfoRow label="Original Title" value={d.original_title && d.original_title !== title ? d.original_title : null} />
        </div>

        {/* ── Production companies ──────────────────────────────────── */}
        {productionCompanies.length > 0 && (
          <>
            <SectionHeading>Production</SectionHeading>
            <div className="ns-chip-row">
              {productionCompanies.map((c) => (
                <div key={c.id} className="ns-chip">
                  {c.logo_path
                    ? <img src={imgUrl(c.logo_path, "w92")} alt={c.name} title={c.name} />
                    : c.name}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Cast ─────────────────────────────────────────────────── */}
        {cast.length > 0 && (
          <>
            <SectionHeading>Cast</SectionHeading>
            <div className="ns-cast-grid">
              {visibleCast.map((person) => (
                <CastCard key={person.cast_id ?? person.id} person={person} />
              ))}
            </div>
            {cast.length > 12 && (
              <button className="ns-show-more-btn" onClick={() => setShowAllCast((v) => !v)}>
                {showAllCast ? "Show less" : `Show all ${cast.length} cast members`}
              </button>
            )}
          </>
        )}

        {/* ── Keywords / Tags ───────────────────────────────────────── */}
        {keywords.length > 0 && (
          <>
            <SectionHeading>Tags</SectionHeading>
            <div className="ns-keywords">
              {keywords.slice(0, 24).map((k) => (
                <span key={k.id} className="ns-keyword">{k.name}</span>
              ))}
            </div>
          </>
        )}

        {/* ── Reviews ──────────────────────────────────────────────── */}
        {reviews.length > 0 && (
          <>
            <SectionHeading>Reviews</SectionHeading>
            <div className="ns-reviews-grid">
              {visibleReviews.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </div>
            {reviews.length > 3 && (
              <button className="ns-show-more-btn" onClick={() => setShowAllReviews((v) => !v)}>
                {showAllReviews ? "Show fewer reviews" : `Show all ${reviews.length} reviews`}
              </button>
            )}
          </>
        )}

        {/* ── Collection ───────────────────────────────────────────── */}
        {collection && onSelect && (
          <>
            <SectionHeading>{collection.name}</SectionHeading>
            <div className="scroll-row" style={{ marginBottom: 8 }}>
              {collection.parts.map((part) => {
                const pk = `movie_${part.id}`;
                return (
                  <CollectionCard key={part.id} part={part} isCurrent={part.id === item.id}
                    onSelect={onSelect} progress={progress[pk] || 0}
                    watched={watched} onMarkWatched={onMarkWatched} onMarkUnwatched={onMarkUnwatched} />
                );
              })}
            </div>
          </>
        )}

      </div>{/* end ns-movie-body */}

      {/* ── Modals ───────────────────────────────────────────────────── */}
      {showTrailer && trailerKey && (
        <TrailerModal trailerKey={trailerKey} title={title} onClose={() => setShowTrailer(false)} />
      )}
      {showBlockedModal && (
        <BlockedStatsModal sessionDomains={getBlockedDomains()} sessionTotal={blockedSession}
          alltimeTotal={blockedAlltime} onClose={() => setShowBlockedModal(false)} />
      )}
      {showDownload && (
        <DownloadModal onClose={() => setShowDownload(false)}
          m3u8Url={m3u8Url} subtitles={interceptedSubs} mediaName={mediaName}
          downloaderFolder={downloaderFolder} setDownloaderFolder={handleSetDownloaderFolder}
          onOpenSettings={onSettings} onDownloadStarted={onDownloadStarted}
          mediaId={item.id} mediaType="movie" posterPath={d.poster_path} tmdbId={item.id} />
      )}
      {gateModal && (
        <PremiumGate feature={gateModal} onUpgrade={handleUpgrade} onClose={() => setGateModal(null)} />
      )}
    </div>
  );
}

const CollectionCard = memo(function CollectionCard({ part, isCurrent, onSelect, progress, watched, onMarkWatched, onMarkUnwatched }) {
  const handleClick = useCallback(() => onSelect(part), [onSelect, part]);
  return (
    <div style={{ opacity: isCurrent ? 0.5 : 1, pointerEvents: isCurrent ? "none" : "auto" }}>
      <MediaCard item={part} onClick={handleClick} progress={progress}
        watched={watched} onMarkWatched={onMarkWatched} onMarkUnwatched={onMarkUnwatched} />
    </div>
  );
});

