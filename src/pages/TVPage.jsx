import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
  memo,
} from "react";
import {
  EPISODE_GROUP_IDS,
  applyEpisodeMapping,
  buildEpisodeGroupMap,
} from "../utils/episodeMappings";
import {
  tmdbFetch,
  imgUrl,
  PLAYER_SOURCES,
  getSourceUrl,
  sourceSupportsProgress,
  sourceProgressViaFrames,
  sourceIsAsync,
  fetchAnilistData,
  fetchEpisodeGroup,
  buildAnilistSeasons,
  cleanAnilistDescription,
  isAnimeContent,
  ANIME_DEFAULT_SOURCE,
  NON_ANIME_DEFAULT_SOURCE,
  NEEDS_INTERCEPT,
  findWorkingSource,
} from "../utils/api";
import {
  BookmarkIcon,
  BookmarkFillIcon,
  BackIcon,
  StarIcon,
  PlayIcon,
  TVIcon,
  DownloadIcon,
  WatchedIcon,
  TrailerIcon,
  RatingShieldIcon,
  RatingLockIcon,
  SourceIcon,
  ShieldBlockIcon,
  PopOutIcon,
} from "../components/Icons";
import DownloadModal from "../components/DownloadModal";
import TrailerModal from "../components/TrailerModal";
import BlockedStatsModal from "../components/BlockedStatsModal";
import { useBlockedStats } from "../utils/useBlockedStats";
import { storage, STORAGE_KEYS } from "../utils/storage";
import { fetchAniSkipTimings } from "../utils/aniSkip";
import {
  fetchTVRating,
  isRestricted,
  getAgeLimitSetting,
  getRatingCountry,
} from "../utils/ageRating";
import { canSwitchSource, canDownload, canPopOut } from "../utils/gate";
import PremiumGate from "../components/PremiumGate";

// ── Disclaimer ticker ─────────────────────────────────────────────────────────
function DisclaimerTicker() {
  const msg =
    "⚠  NovasparksMovies does not host or store any media content. Stream quality and availability may vary by region.  You must be of legal viewing age in your jurisdiction. We are not responsible for third-party content or advertisements.  ⚠";
  return (
    <div style={{
      background: "rgba(229,9,20,0.06)",
      borderBottom: "1px solid rgba(229,9,20,0.12)",
      overflow: "hidden",
      padding: "7px 0",
      userSelect: "none",
    }}>
      <div className="ns-ticker-track">
        <span className="ns-ticker-msg">{msg}</span>
        <span className="ns-ticker-msg">{msg}</span>
      </div>
    </div>
  );
}

// ── Cast card ─────────────────────────────────────────────────────────────────
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
      <div className="ns-cast-role">{person.character || person.roles?.[0]?.character || ""}</div>
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

// ── Info row (label + value) ──────────────────────────────────────────────────
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

const INJECT_SKIP_CONTROLS = `
(function() {
  if (window.__skipControlsInjected) return;
  var style = document.createElement('style');
  style.innerHTML = '*:focus, *:focus-visible { outline: none !important; box-shadow: none !important; } video:focus, video:focus-visible { outline: none !important; box-shadow: none !important; }';
  document.head.appendChild(style);
  window.__skipControlsInjected = true;
  var BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.53"/><text x="13.5" y="15.5" text-anchor="middle" font-size="6.5" fill="currentColor" stroke="none" font-weight="800" font-family="system-ui,sans-serif">15</text></svg>';
  var FWD_SVG  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="width:26px;height:26px"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.53"/><text x="10.5" y="15.5" text-anchor="middle" font-size="6.5" fill="currentColor" stroke="none" font-weight="800" font-family="system-ui,sans-serif">15</text></svg>';
  var wrap = document.createElement('div');
  wrap.id = '__skip-ui';
  wrap.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:2147483647;opacity:0;transition:opacity 0.25s ease;';
  function makeBtn(seconds, svg, label, side) {
    var btn = document.createElement('button');
    btn.innerHTML = svg + '<span style="font-size:11px;font-family:system-ui,sans-serif">' + label + '</span>';
    btn.setAttribute('tabindex', '-1');
    btn.title = label;
    btn.style.cssText = 'pointer-events:auto;background:rgba(0,0,0,0.72);border:1px solid rgba(255,255,255,0.18);border-radius:8px;color:white;cursor:pointer;padding:10px 18px;display:flex;align-items:center;gap:7px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:background 0.15s;font-size:12px;';
    btn.style.position = 'absolute'; btn.style.top = '50%'; btn.style.transform = 'translateY(-50%)';
    if (side === 'left') { btn.style.left = '24px'; } else { btn.style.right = '24px'; }
    btn.onmouseenter = function() { btn.style.background = 'rgba(229,9,20,0.85)'; };
    btn.onmouseleave = function() { btn.style.background = 'rgba(0,0,0,0.72)'; };
    btn.onclick = function(e) { e.stopPropagation(); var v = document.querySelector('video'); if (v) v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + seconds)); show(); };
    return btn;
  }
  wrap.appendChild(makeBtn(-15, BACK_SVG, '-15s', 'left'));
  wrap.appendChild(makeBtn(15, FWD_SVG, '+15s', 'right'));
  document.documentElement.appendChild(wrap);
  var idleTimer;
  function show() { wrap.style.opacity = '1'; clearTimeout(idleTimer); idleTimer = setTimeout(function() { wrap.style.opacity = '0'; }, 2500); }
  document.addEventListener('mousemove', show, true);
  document.addEventListener('keydown', function(e) {
    const active = document.activeElement;
    if (active && active.matches('input, textarea, [contenteditable="true"]')) return;
    if (e.repeat) return;
    const v = document.querySelector('video');
    if (!v) return;
    const now = Date.now();
    if (window.__skipKeyCooldown && now < window.__skipKeyCooldown) return;
    window.__skipKeyCooldown = now + 250;
    if (e.code === 'Space') { e.preventDefault(); if (v.paused) v.play(); else v.pause(); show(); }
    if (e.key === 'ArrowLeft') { v.currentTime = Math.max(0, v.currentTime - 10); show(); }
    if (e.key === 'ArrowRight') { v.currentTime = Math.min(v.duration || 0, v.currentTime + 10); show(); }
  }, true);
})();
`;

export default function TVPage({
  item, apiKey, onSave, isSaved, onHistory, progress, saveProgress,
  onBack, onSettings, onDownloadStarted, watched, onMarkWatched, onMarkUnwatched,
  downloads, onGoToDownloads, onWatch, isPremium, onUpgrade,
}) {
  const [details, setDetails]             = useState(null);
  const [credits, setCredits]             = useState(null);
  const [reviews, setReviews]             = useState([]);
  const [keywords, setKeywords]           = useState([]);
  const [seasonData, setSeasonData]       = useState(null);
  const [failedSeasons, setFailedSeasons] = useState(() => new Set());
  const [selectedSeason, setSelectedSeason] = useState(() => item.season != null ? Number(item.season) : 1);
  const [selectedEp, setSelectedEp]       = useState(null);
  const [playing, setPlaying]             = useState(false);
  const [loading, setLoading]             = useState(true);
  const [loadingSeason, setLoadingSeason] = useState(false);
  const [showDownload, setShowDownload]   = useState(false);
  const [trailerKey, setTrailerKey]       = useState(null);
  const [showTrailer, setShowTrailer]     = useState(false);
  const [m3u8Url, setM3u8Url]             = useState(null);
  const [interceptedSubs, setInterceptedSubs] = useState([]);
  const [playerSource, setPlayerSource]   = useState(() => storage.get("playerSource") || NON_ANIME_DEFAULT_SOURCE);
  const [autoSourceStatus, setAutoSourceStatus] = useState("idle");
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const isAsync         = useMemo(() => sourceIsAsync(playerSource), [playerSource]);
  const supportsProgress = useMemo(() => sourceSupportsProgress(playerSource), [playerSource]);
  const progressViaFrames = useMemo(() => sourceProgressViaFrames(playerSource), [playerSource]);
  const [dubMode, setDubMode]             = useState(() => storage.get("allmangaDubMode") || "sub");
  const [resolvedPlayerUrl, setResolvedPlayerUrl] = useState(null);
  const [resolvingUrl, setResolvingUrl]   = useState(false);
  const [resolveError, setResolveError]   = useState(null);
  const [anilistData, setAnilistData]     = useState(null);
  const [anilistSeasons, setAnilistSeasons] = useState(null);
  const [anilistLoading, setAnilistLoading] = useState(false);
  const [episodeGroupData, setEpisodeGroupData] = useState(null);
  const [episodeGroupMap, setEpisodeGroupMap]   = useState(null);
  const [webviewLoading, setWebviewLoading] = useState(false);
  const [playerFullscreen, setPlayerFullscreen] = useState(false);
  const [pipOpen, setPipOpen]             = useState(false);
  const pipUrlRef               = useRef(null);
  const pipWebContentsIdRef     = useRef(null);
  const [skipTimings, setSkipTimings]     = useState(null);
  const [skipPrompt, setSkipPrompt]       = useState(null);
  const [introSkipMode]                   = useState(() => storage.get(STORAGE_KEYS.INTRO_SKIP_MODE) || "off");
  const [gateModal, setGateModal]         = useState(null);
  const [contextMenu, setContextMenu]     = useState(null);
  const [menuPos, setMenuPos]             = useState(null);
  const [showAllCast, setShowAllCast]     = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);

  const sourceRef        = useRef(null);
  const playerWrapRef    = useRef(null);
  const webviewRef       = useRef(null);
  const saveProgressRef  = useRef(saveProgress);
  saveProgressRef.current = saveProgress;
  const onMarkWatchedRef = useRef(onMarkWatched);
  onMarkWatchedRef.current = onMarkWatched;

  const isAnime = useMemo(() => isAnimeContent(item, details), [item.id, details]);
  const [downloaderFolder, setDownloaderFolder] = useState(() => storage.get("downloaderFolder") || "");
  const blockedResetKey = `${item.id}_s${selectedSeason}_e${selectedEp?.episode_number ?? 0}`;
  const { sessionTotal: blockedSession, alltimeTotal: blockedAlltime, showModal: showBlockedModal, setShowModal: setShowBlockedModal, getSessionDomains: getBlockedDomains } = useBlockedStats(blockedResetKey);
  const [rating, setRating]           = useState({ cert: null, minAge: null });
  const ageLimitSetting               = useMemo(() => getAgeLimitSetting(storage), []);
  const ratingCountry                 = useMemo(() => getRatingCountry(storage), []);
  const restricted                    = isRestricted(rating.minAge, ageLimitSetting);
  const [watchedThreshold]            = useState(() => storage.get("watchedThreshold") ?? 20);
  const autoMarkedRef                 = useRef(false);
  const lastKnownTimeRef              = useRef(0);
  const durationRef                   = useRef(0);
  const seekBackCooldownRef           = useRef(0);

  const planId       = isPremium?.planId || (isPremium ? "premium" : "free");
  const handleUpgrade = onUpgrade ?? (() => window.dispatchEvent(new CustomEvent("NovasparksMovies:upgrade")));

  // ── Fetch TV details + credits + reviews + keywords ───────────────────────
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      tmdbFetch(`/tv/${item.id}`, apiKey),
      tmdbFetch(`/tv/${item.id}/credits`, apiKey).catch(() => null),
      tmdbFetch(`/tv/${item.id}/reviews`, apiKey).catch(() => null),
      tmdbFetch(`/tv/${item.id}/keywords`, apiKey).catch(() => null),
    ]).then(([d, cr, rv, kw]) => {
      if (!mounted) return;
      setDetails(d);
      if (item.season == null) {
        const first = d.seasons?.find((s) => s.season_number > 0) || d.seasons?.[0];
        if (first) setSelectedSeason(first.season_number);
      }
      if (cr) setCredits(cr);
      if (rv?.results) setReviews(rv.results);
      if (kw?.results) setKeywords(kw.results);
    }).catch(() => { if (mounted) setDetails(item); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  // ── Episode group ─────────────────────────────────────────────────────────
  useEffect(() => {
    const groupId = EPISODE_GROUP_IDS[Number(item.id)];
    if (!groupId || !apiKey) { setEpisodeGroupData(null); setEpisodeGroupMap(null); return; }
    let mounted = true;
    fetchEpisodeGroup(groupId, apiKey)
      .then((data) => { if (!mounted) return; setEpisodeGroupData(data); setEpisodeGroupMap(buildEpisodeGroupMap(data)); })
      .catch(() => { if (mounted) { setEpisodeGroupData(null); setEpisodeGroupMap(null); } });
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  // ── Trailer ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    tmdbFetch(`/tv/${item.id}/videos`, apiKey)
      .then((data) => {
        if (!mounted) return;
        const videos = data.results || [];
        const trailer = videos.find((v) => v.type === "Trailer" && v.site === "YouTube") || videos.find((v) => v.site === "YouTube");
        if (trailer) setTrailerKey(trailer.key);
      }).catch(() => {});
    return () => { mounted = false; };
  }, [item.id, apiKey]);

  // ── Age rating ────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    fetchTVRating(item.id, apiKey, ratingCountry).then((r) => { if (mounted) setRating(r); });
    return () => { mounted = false; };
  }, [item.id, apiKey, ratingCountry]);

  // ── Season episodes ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!apiKey || !item.id) return;
    if (episodeGroupData) { setSelectedEp(null); setPlaying(false); setSeasonData(null); setLoadingSeason(false); return; }
    setLoadingSeason(true); setSelectedEp(null); setPlaying(false); setSeasonData(null);
    const tmdbSeasonToFetch = isAnime && anilistSeasons?.length > 0 && tmdbSeasons.length <= 1 ? 1 : selectedSeason;
    let mounted = true;
    tmdbFetch(`/tv/${item.id}/season/${tmdbSeasonToFetch}`, apiKey)
      .then((d) => { if (mounted) setSeasonData(d); })
      .catch(() => { if (mounted) { setSeasonData(null); if (selectedSeason === 0) setFailedSeasons((prev) => new Set([...prev, selectedSeason])); } })
      .finally(() => { if (mounted) setLoadingSeason(false); });
    return () => { mounted = false; };
  }, [item.id, selectedSeason, apiKey, anilistSeasons]);

  // ── Auto source ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setAutoSourceStatus("testing");
    const epNum = selectedEp?.episode_number;
    findWorkingSource("tv", item.id, selectedSeason, epNum, playerSource).then((workingId) => {
      if (cancelled) return;
      if (workingId && workingId !== playerSource) { setPlayerSource(workingId); storage.set("playerSource", workingId); }
      setAutoSourceStatus(workingId ? "found" : "failed");
    });
    return () => { cancelled = true; };
  }, [item.id, selectedSeason, selectedEp?.episode_number]);

  // ── Reset player state ────────────────────────────────────────────────────
  useEffect(() => {
    setM3u8Url(null); setInterceptedSubs([]); setShowSourceMenu(false);
    setResolvedPlayerUrl(null); setResolvingUrl(false); setResolveError(null);
    setWebviewLoading(true);
  }, [item.id, selectedEp?.episode_number, selectedSeason, playerSource, dubMode]);

  // ── Anime detection ───────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    setAnilistData(null); setAnilistSeasons(null);
    if (isAnime) {
      setAnilistLoading(true);
      fetchAnilistData(item.name || item.title, "ANIME", item.id)
        .then((data) => {
          if (!mounted) return;
          if (data) { setAnilistData(data); const seasons = buildAnilistSeasons(data); if (seasons?.length) setAnilistSeasons(seasons); }
          if (mounted) setAnilistLoading(false);
        })
        .catch(() => { if (mounted) setAnilistLoading(false); });
      const currentSrc = PLAYER_SOURCES.find((s) => s.id === playerSource);
      if (!currentSrc?.tag) { const saved = storage.get("playerSource"); const savedSrc = PLAYER_SOURCES.find((s) => s.id === saved); setPlayerSource(savedSrc?.tag ? saved : ANIME_DEFAULT_SOURCE); }
    } else {
      setAnilistLoading(false);
      const currentSrc = PLAYER_SOURCES.find((s) => s.id === playerSource);
      if (currentSrc?.tag) { const saved = storage.get("playerSource"); const savedSrc = PLAYER_SOURCES.find((s) => s.id === saved); setPlayerSource(!savedSrc?.tag ? saved : NON_ANIME_DEFAULT_SOURCE); }
    }
    return () => { mounted = false; };
  }, [item.id, isAnime]);

  // ── AllManga async resolve ────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !selectedEp || !isAsync) return;
    if (resolvedPlayerUrl || resolvingUrl) return;
    setResolvingUrl(true); setResolveError(null);
    const epNum = selectedEp.episode_number;
    const progressKey = `tv_${item.id}_s${selectedSeason}e${epNum}`;
    const startTime = storage.get("dlTime_" + progressKey) || 0;
    let mounted = true;
    window.electron.resolveAllManga({ title, seasonNumber: selectedSeason, episodeNumber: epNum, translationType: dubMode })
      .then((res) => {
        if (!mounted) return;
        if (res?.ok && res.url) {
          if (res.isDirectMp4 !== undefined) {
            window.electron.setPlayerVideo({ url: res.url, referer: res.referer || "https://allmanga.to", startTime })
              .then((r) => { if (!mounted) return; setResolvedPlayerUrl(r.playerUrl); setM3u8Url(res.url); })
              .catch(() => { if (mounted) setResolveError("Failed to start local player"); });
          } else { setResolvedPlayerUrl(res.url); }
        } else { setResolveError(res?.error || "Episode not found on AllManga"); }
      })
      .catch((e) => { if (mounted) setResolveError(e.message || "Error"); })
      .finally(() => { if (mounted) setResolvingUrl(false); });
    return () => { mounted = false; };
  }, [playing, selectedEp, playerSource, selectedSeason, dubMode]);

  // ── M3U8 / subtitle listeners ─────────────────────────────────────────────
  useEffect(() => {
    if (!window.electron) return;
    const handler = window.electron.onM3u8Found((url) => { setM3u8Url((prev) => (prev !== url ? url : prev)); });
    return () => window.electron.offM3u8Found(handler);
  }, []);

  useEffect(() => {
    if (!showSourceMenu) return;
    const close = () => setShowSourceMenu(false);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    const handleClick = (e) => { if (sourceRef.current?.contains(e.target) || e.target.closest(".source-dropdown")) return; close(); };
    document.addEventListener("mousedown", handleClick);
    return () => { window.removeEventListener("scroll", close, { capture: true }); document.removeEventListener("mousedown", handleClick); };
  }, [showSourceMenu]);

  useEffect(() => {
    if (!window.electron) return;
    const handler = window.electron.onSubtitleFound(({ url, lang }) => {
      if (!url || !url.toLowerCase().includes(".vtt")) return;
      setInterceptedSubs((prev) => { const filtered = prev.filter((s) => s.lang !== lang); return [...filtered, { url, lang: lang || "unknown" }]; });
    });
    return () => window.electron.offSubtitleFound(handler);
  }, []);

  const d       = details || item;
  const title   = d.name || d.title;
  const year    = (d.first_air_date || "").slice(0, 4);

  const tmdbSeasons = useMemo(() => (d.seasons || []).filter((s) => s.season_number > 0), [d.seasons]);
  const tmdbSeasonsWithSpecials = useMemo(() => {
    if (isAnime) return tmdbSeasons;
    if (failedSeasons.has(0)) return tmdbSeasons;
    const specials = (d.seasons || []).filter((s) => s.season_number === 0);
    return [...tmdbSeasons, ...specials];
  }, [d.seasons, tmdbSeasons, isAnime, failedSeasons]);
  const useAnilistSeasons = useMemo(() => isAnime && anilistSeasons?.length > 0 && (tmdbSeasons.length <= 1 || anilistSeasons.length > tmdbSeasons.length), [isAnime, anilistSeasons, tmdbSeasons]);

  const episodeGroupSeasons = useMemo(() => {
    if (!episodeGroupData?.groups) return null;
    return [...episodeGroupData.groups].sort((a, b) => a.order - b.order).map((g, i) => ({ season_number: i + 1, name: g.name || `Season ${i + 1}`, episode_count: (g.episodes || []).length }));
  }, [episodeGroupData]);

  const seasons = useMemo(() => {
    if (episodeGroupSeasons) return episodeGroupSeasons;
    if (useAnilistSeasons) return anilistSeasons.map((s) => ({ season_number: s.seasonNum, name: s.title || `Season ${s.seasonNum}`, episode_count: s.episodes || 0 }));
    return tmdbSeasonsWithSpecials;
  }, [episodeGroupSeasons, useAnilistSeasons, anilistSeasons, tmdbSeasonsWithSpecials]);

  const episodeGroupCurrentEpisodes = useMemo(() => {
    if (!episodeGroupData?.groups) return null;
    const sortedGroups = [...episodeGroupData.groups].sort((a, b) => a.order - b.order);
    const group = sortedGroups[selectedSeason - 1];
    if (!group) return null;
    return [...(group.episodes || [])].sort((a, b) => a.order - b.order).map((ep, i) => ({ ...ep, episode_number: i + 1, _tmdbSeason: ep.season_number, _tmdbAbsolute: ep.episode_number }));
  }, [episodeGroupData, selectedSeason]);

  const getSeasonEpisodes = useCallback((rawEpisodes) => {
    if (!useAnilistSeasons || !rawEpisodes) return rawEpisodes;
    if (tmdbSeasons.length > 1) return rawEpisodes;
    let offset = 0;
    for (const s of anilistSeasons) { if (s.seasonNum < selectedSeason) offset += s.episodes || 0; }
    const count = anilistSeasons.find((s) => s.seasonNum === selectedSeason)?.episodes || rawEpisodes.length;
    return rawEpisodes.slice(offset, offset + count).map((ep, i) => ({ ...ep, episode_number: i + 1, _tmdbAbsolute: ep.episode_number }));
  }, [useAnilistSeasons, tmdbSeasons.length, anilistSeasons, selectedSeason]);

  const playerEp = useMemo(() => {
    if (!selectedEp) return { season: selectedSeason, episode: undefined };
    const rawSeason  = selectedEp._tmdbSeason ?? selectedSeason;
    const rawEpisode = selectedEp._tmdbAbsolute ?? selectedEp.episode_number;
    return applyEpisodeMapping(item.id, rawSeason, rawEpisode, episodeGroupMap);
  }, [selectedEp, selectedSeason, item.id, episodeGroupMap]);

  const episodeGroupPending = useMemo(() => !!EPISODE_GROUP_IDS[Number(item.id)] && !episodeGroupData, [item.id, episodeGroupData]);
  const currentSeasonEpisodes = useMemo(() => {
    if (episodeGroupPending) return [];
    if (anilistLoading) return [];
    return episodeGroupCurrentEpisodes || getSeasonEpisodes(seasonData?.episodes) || [];
  }, [episodeGroupPending, anilistLoading, episodeGroupCurrentEpisodes, getSeasonEpisodes, seasonData]);

  const downloadsByEpisodeKey = useMemo(() => {
    const map = new Map();
    for (const dl of downloads || []) {
      if (dl.mediaType === "tv" && (dl.tmdbId === item.id || dl.mediaId === item.id) && (dl.status === "completed" || dl.status === "local" || dl.status === "downloading")) {
        map.set(`s${dl.season}e${dl.episode}`, dl);
      }
    }
    return map;
  }, [downloads, item.id]);

  const displaySeasonCount   = useMemo(() => (anilistLoading ? null : seasons.length || d.number_of_seasons || 0), [anilistLoading, seasons, d.number_of_seasons]);
  const displayEpisodeCount  = useMemo(() => anilistLoading ? null : useAnilistSeasons ? anilistSeasons.reduce((sum, s) => sum + (s.episodes || 0), 0) : d.number_of_episodes || 0, [anilistLoading, useAnilistSeasons, anilistSeasons, d.number_of_episodes]);
  const displayOverview      = useMemo(() => anilistLoading ? null : isAnime && anilistData?.description ? cleanAnilistDescription(anilistData.description) : d.overview, [anilistLoading, isAnime, anilistData?.description, d.overview]);
  const displayScore         = useMemo(() => anilistLoading ? null : isAnime && anilistData?.averageScore ? (anilistData.averageScore / 10).toFixed(1) : d.vote_average > 0 ? d.vote_average.toFixed(1) : null, [anilistLoading, isAnime, anilistData?.averageScore, d.vote_average]);
  const displayGenres        = useMemo(() => anilistLoading ? [] : isAnime && anilistData?.genres?.length ? anilistData.genres.map((g, i) => ({ id: i, name: g })) : d.genres || [], [anilistLoading, isAnime, anilistData?.genres, d.genres]);

  // Cast / crew derived
  const castList   = useMemo(() => credits?.cast || [], [credits]);
  const crewList   = useMemo(() => credits?.crew || [], [credits]);
  const directors  = useMemo(() => crewList.filter((c) => c.job === "Director"), [crewList]);
  const creators   = useMemo(() => d.created_by || [], [d.created_by]);
  const networks   = useMemo(() => d.networks || [], [d.networks]);
  const productionCompanies = useMemo(() => d.production_companies || [], [d.production_companies]);

  const visibleCast    = showAllCast    ? castList    : castList.slice(0, 12);
  const visibleReviews = showAllReviews ? reviews     : reviews.slice(0, 3);

  const currentProgressKey  = selectedEp ? `tv_${item.id}_s${selectedSeason}e${selectedEp.episode_number}` : null;
  const currentEpDownload   = selectedEp ? (downloadsByEpisodeKey.get(`s${selectedSeason}e${selectedEp.episode_number}`) ?? null) : null;
  const currentEpWatched    = currentProgressKey ? !!watched?.[currentProgressKey] : false;

  useEffect(() => { autoMarkedRef.current = false; lastKnownTimeRef.current = 0; seekBackCooldownRef.current = 0; durationRef.current = 0; }, [currentProgressKey]);
  useEffect(() => { if (playing) setWebviewLoading(true); }, [playing]);

  useLayoutEffect(() => {
    if (playing) return;
    const wv = webviewRef.current;
    if (wv) { try { wv.src = "about:blank"; } catch {} }
  }, [playing]);

  // ── Webview loading ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    const wv = webviewRef.current;
    if (!wv) return;
    const done = () => setWebviewLoading(false);
    wv.addEventListener("did-stop-loading", done);
    wv.addEventListener("did-fail-load", done);
    const timeoutId = setTimeout(() => { setWebviewLoading(false); }, 1500);
    let attempts = 0;
    const pollDuration = setInterval(async () => {
      if (durationRef.current > 0 || attempts++ > 30) { clearInterval(pollDuration); clearTimeout(timeoutId); return; }
      try {
        const dur = await wv.executeJavaScript(`(() => { const v = document.querySelector('video'); return (v && v.duration > 0 && isFinite(v.duration)) ? v.duration : null; })()`);
        if (dur) { durationRef.current = dur; clearInterval(pollDuration); }
      } catch {}
    }, 1000);
    return () => {
      wv.removeEventListener("did-stop-loading", done);
      wv.removeEventListener("did-fail-load", done);
      clearInterval(pollDuration);
      clearTimeout(timeoutId);
    };
  }, [playing, playerSource, item.id, selectedEp?.episode_number]);

  // ── AniSkip ───────────────────────────────────────────────────────────────
  useEffect(() => {
    setSkipTimings(null); setSkipPrompt(null);
    if (introSkipMode === "off" || playerSource !== "allmanga" || !isAnime) return;
    const anilistId = anilistData?.idMal;
    const epNum     = selectedEp?.episode_number;
    if (!anilistId || !epNum) return;
    let cancelled = false;
    fetchAniSkipTimings(anilistId, epNum).then((timings) => { if (!cancelled) setSkipTimings(timings); });
    return () => { cancelled = true; };
  }, [anilistData?.idMal, selectedEp?.episode_number, playerSource, isAnime, introSkipMode]);

  const handleManualSkip = useCallback(async () => {
    if (!skipPrompt || !skipTimings?.[skipPrompt]) return;
    const endTime = Number(skipTimings[skipPrompt].endTime);
    if (!Number.isFinite(endTime)) return;
    const wv = webviewRef.current;
    if (!wv) return;
    try { await wv.executeJavaScript(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${endTime}; })()`); } catch {}
    setSkipPrompt(null);
  }, [skipPrompt, skipTimings]);

  useEffect(() => {
    if (!skipPrompt) return;
    const wv = webviewRef.current;
    if (!wv) return;
    const handler = (e) => { if (e.key === "Return" && e.type === "keyDown") handleManualSkip(); };
    wv.addEventListener("before-input-event", handler);
    return () => wv.removeEventListener("before-input-event", handler);
  }, [skipPrompt, handleManualSkip]);

  // ── Progress tracking ─────────────────────────────────────────────────────
  useEffect(() => {
    const aniSkipActive = introSkipMode !== "off" && playing && !!skipTimings && playerSource === "allmanga";
    if (!aniSkipActive) setSkipPrompt(null);
    if (!playing || !currentProgressKey) return;
    const TICK = aniSkipActive ? 1000 : 5000;
    let tickCount = 0;
    let interval  = null;
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
            result = await wv.executeJavaScript(`(() => { const v = document.querySelector('video'); if (!v || !v.duration || v.duration === Infinity || v.paused) return null; if (!v._seekTracked) { v._seekTracked = true; v.addEventListener('seeked', () => { v._lastUserSeek = Date.now(); v._lastUserSeekTo = v.currentTime; }); } return { currentTime: v.currentTime, duration: v.duration, recentUserSeek: v._lastUserSeek ? (Date.now() - v._lastUserSeek < 6000) : false, lastUserSeekTo: v._lastUserSeekTo ?? null }; })()`);
          }
          if (aniSkipActive && result?.currentTime != null) {
            const ct = result.currentTime;
            const { intro, outro } = skipTimings;
            const inIntro = intro && ct >= intro.startTime && ct < intro.endTime - 1;
            const inOutro = outro && ct >= outro.startTime && ct < outro.endTime - 1;
            const activeSegment = inIntro ? "intro" : inOutro ? "outro" : null;
            if (!activeSegment) { setSkipPrompt(null); }
            else if (introSkipMode === "auto") {
              setSkipPrompt(null);
              const endTime = Number(skipTimings[activeSegment].endTime);
              if (Number.isFinite(endTime)) { try { await wv.executeJavaScript(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${endTime}; })()`); } catch {} }
            } else { setSkipPrompt(activeSegment); }
          }
          tickCount++;
          if (aniSkipActive && tickCount % 5 !== 0) return;
          if (result && result.duration > 0) {
            durationRef.current = result.duration;
            const ct  = result.currentTime;
            const now = Date.now();
            if (lastKnownTimeRef.current > 30 && ct <= 5 && !result.recentUserSeek) {
              if (now > seekBackCooldownRef.current) { const seekTo = lastKnownTimeRef.current; seekBackCooldownRef.current = now + 8000; try { await wv.executeJavaScript(`(() => { const v = document.querySelector('video'); if (v) v.currentTime = ${seekTo}; })()`); } catch {} }
              return;
            }
            if (result.recentUserSeek && result.lastUserSeekTo !== null) { lastKnownTimeRef.current = result.lastUserSeekTo; } else { lastKnownTimeRef.current = ct; }
            const p = Math.floor((ct / result.duration) * 100);
            saveProgressRef.current(currentProgressKey, Math.min(p, 100));
            storage.set("dlTime_" + currentProgressKey, Math.floor(ct));
            const remaining = result.duration - ct;
            if (!autoMarkedRef.current && remaining <= watchedThreshold && remaining >= 0) { autoMarkedRef.current = true; onMarkWatchedRef.current?.(currentProgressKey); }
          }
        } catch {}
      }, TICK);
    }, 3000);
    return () => { clearTimeout(timer); clearInterval(interval); setSkipPrompt(null); };
  }, [playing, skipTimings, playerSource, introSkipMode, currentProgressKey, watchedThreshold, progressViaFrames]);

  useEffect(() => {
    if (!window.electron) return;
    const wv = webviewRef.current;
    if (!wv || !playing || playerSource !== "allmanga") return;
    const inject = () => { wv.executeJavaScript(INJECT_SKIP_CONTROLS).catch(() => {}); };
    wv.addEventListener("dom-ready", inject);
    try { inject(); } catch {}
    return () => { wv.removeEventListener("dom-ready", inject); };
  }, [playing, playerSource]);

  // ── Fullscreen / PiP ──────────────────────────────────────────────────────
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
    const openH  = window.electron?.onPipOpened?.(async () => { setPipOpen(true); pipWebContentsIdRef.current = (await window.electron.getPipWebContentsId?.()) ?? null; });
    const closeH = window.electron?.onPipClosed?.(() => { pipUrlRef.current = null; pipWebContentsIdRef.current = null; setPipOpen(false); });
    return () => { if (openH) window.electron?.offPipOpened?.(openH); if (closeH) window.electron?.offPipClosed?.(closeH); };
  }, [playing]);

  const effectiveYear = year || (isAnime && anilistData?.startDate?.year ? String(anilistData.startDate.year) : "");
  const mediaName     = selectedEp ? `${title}${effectiveYear ? ` (${effectiveYear})` : ""} S${String(selectedSeason).padStart(2, "0")} E${String(selectedEp.episode_number).padStart(2, "0")}` : title;

  const handleWatch = useCallback(() => {
    const firstEp = currentSeasonEpisodes[0];
    if (!firstEp) return;
    if (onWatch) {
      onHistory({ ...d, media_type: "tv", season: selectedSeason, episode: firstEp.episode_number, episodeName: firstEp.name });
      onWatch({ item: { ...d, media_type: "tv" }, season: selectedSeason, episode: firstEp.episode_number, episodeName: firstEp.name, sourceId: playerSource });
      return;
    }
    setM3u8Url(null); setInterceptedSubs([]); setResolvedPlayerUrl(null); setResolvingUrl(false); setResolveError(null);
    setSelectedEp(firstEp); setPlaying(true);
    onHistory({ ...d, media_type: "tv", season: selectedSeason, episode: firstEp.episode_number, episodeName: firstEp.name });
  }, [currentSeasonEpisodes, d, selectedSeason, onHistory, onWatch]);

  if (loading) return <div className="loader"><div className="spinner" /></div>;

  return (
    <div className="ns-tv-page fade-in" style={{ paddingBottom: "max(80px, env(safe-area-inset-bottom, 80px))" }}>
      <style>{`
        /* ── Ticker ──────────────────────────────────────────── */
        @keyframes tickerMove { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .ns-ticker-track { display: inline-flex; animation: tickerMove 42s linear infinite; white-space: nowrap; }
        .ns-ticker-track:hover { animation-play-state: paused; }
        .ns-ticker-msg { padding-right: 120px; font-size: 11.5px; color: rgba(255,255,255,0.42); letter-spacing: 0.15px; }

        /* ── Hero ────────────────────────────────────────────── */
        .ns-tv-hero { position: relative; min-height: 420px; display: flex; align-items: flex-end; }
        .ns-tv-hero-bg {
          position: absolute; inset: 0; background-size: cover; background-position: center top;
          background-repeat: no-repeat;
        }
        .ns-tv-hero-grad {
          position: absolute; inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 40%, rgba(16,16,16,0.96) 80%, var(--bg, #101010) 100%);
        }
        .ns-tv-hero-content {
          position: relative; z-index: 2;
          width: 100%; display: flex; gap: 28px; padding: 32px 28px 36px;
          align-items: flex-end;
        }
        .ns-tv-poster {
          flex-shrink: 0; width: 165px; border-radius: 10px; overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6); aspect-ratio: 2/3; background: rgba(255,255,255,0.06);
        }
        .ns-tv-poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ns-tv-info { flex: 1; min-width: 0; }
        .ns-tv-eyebrow {
          font-size: 11px; font-weight: 700; letter-spacing: 2px; color: var(--red, #e50914);
          text-transform: uppercase; margin-bottom: 8px;
        }
        .ns-tv-title {
          font-size: clamp(22px, 4vw, 40px); font-weight: 900; line-height: 1.1;
          color: #fff; margin: 0 0 10px; letter-spacing: -0.5px;
        }
        .ns-tv-genres { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
        .ns-tv-genre { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); border-radius: 20px; padding: 3px 11px; font-size: 11.5px; color: rgba(255,255,255,0.7); }
        .ns-tv-meta {
          display: flex; align-items: center; flex-wrap: wrap; gap: 14px;
          font-size: 13px; color: rgba(255,255,255,0.55); margin-bottom: 10px;
        }
        .ns-tv-meta-sep { width: 3px; height: 3px; border-radius: 50%; background: rgba(255,255,255,0.25); }
        .ns-tv-score { display: flex; align-items: center; gap: 5px; color: #f5c518; font-weight: 700; font-size: 14px; }
        .ns-tv-overview {
          font-size: 14px; line-height: 1.65; color: rgba(255,255,255,0.72);
          margin: 12px 0 18px; max-width: 680px;
        }
        .ns-tv-actions { display: flex; flex-wrap: wrap; gap: 10px; }

        /* ── Body ────────────────────────────────────────────── */
        .ns-tv-body { padding: 0 28px; max-width: 1200px; margin: 0 auto; }

        /* ── Section heading ─────────────────────────────────── */
        .ns-section-heading {
          display: flex; align-items: center; gap: 14px;
          margin: 32px 0 18px; font-size: 12px; font-weight: 800;
          letter-spacing: 2px; text-transform: uppercase; color: rgba(255,255,255,0.5);
        }
        .ns-section-rule { flex: 1; height: 1px; background: rgba(255,255,255,0.07); }

        /* ── Series info grid ─────────────────────────────────── */
        .ns-info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0; }
        .ns-info-row {
          display: flex; flex-direction: column; gap: 3px;
          padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.05);
          border-right: 1px solid rgba(255,255,255,0.05);
        }
        .ns-info-label { font-size: 10.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: rgba(255,255,255,0.35); }
        .ns-info-value { font-size: 13.5px; font-weight: 500; color: rgba(255,255,255,0.82); }

        /* ── Networks row ─────────────────────────────────────── */
        .ns-networks { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 4px; }
        .ns-network {
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 600;
          color: rgba(255,255,255,0.7);
        }
        .ns-network img { height: 22px; width: auto; object-fit: contain; filter: brightness(0) invert(1); opacity: 0.7; display: block; }

        /* ── Cast grid ────────────────────────────────────────── */
        .ns-cast-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 14px;
        }
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

        /* ── Inline player ───────────────────────────────────── */
        .ns-player-section { margin-bottom: 8px; }

        /* ── Responsive ──────────────────────────────────────── */
        @media (max-width: 860px) {
          .ns-tv-hero-content { flex-direction: column; align-items: center; padding: 22px 18px 28px; gap: 20px; }
          .ns-tv-poster { width: 140px; }
          .ns-tv-info { width: 100%; text-align: center; }
          .ns-tv-genres { justify-content: center; }
          .ns-tv-meta { justify-content: center; }
          .ns-tv-overview { margin-left: auto; margin-right: auto; }
          .ns-tv-actions { justify-content: center; }
          .ns-tv-body { padding: 0 18px; }
          .ns-info-grid { grid-template-columns: repeat(2, 1fr); }
          .ns-cast-grid { grid-template-columns: repeat(auto-fill, minmax(85px, 1fr)); gap: 10px; }
          .player-wrap { border-radius: 0 !important; }
        }
        @media (max-width: 540px) {
          .ns-tv-hero { min-height: unset; }
          .ns-tv-poster { width: 115px; }
          .ns-tv-title { font-size: 20px; }
          .ns-tv-hero-content { padding: 18px 14px 24px; }
          .ns-tv-body { padding: 0 14px; }
          .ns-tv-actions .btn { flex: 1 1 auto; min-width: 88px; font-size: 13px; padding: 9px 10px; justify-content: center; }
          .ns-info-grid { grid-template-columns: 1fr 1fr; }
          .ns-cast-grid { grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; }
          .ns-cast-img { width: 64px; height: 64px; }
          .ns-cast-name { font-size: 11px; }
          .ns-cast-role { font-size: 10px; }
          .ns-review-card { padding: 14px 14px; }
          .ns-section-heading { margin: 22px 0 14px; }
        }
        @media (max-width: 380px) {
          .ns-tv-actions { gap: 7px; }
          .ns-tv-actions .btn { font-size: 12px; padding: 8px 8px; }
          .ns-cast-grid { grid-template-columns: repeat(4, 1fr); }
        }
      `}</style>

      {/* ── Disclaimer ticker ────────────────────────────────────────── */}
      <DisclaimerTicker />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="ns-tv-hero">
        {d.backdrop_path && (
          <div className="ns-tv-hero-bg" style={{ backgroundImage: `url(${imgUrl(d.backdrop_path, "w1280")})` }} />
        )}
        <div className="ns-tv-hero-grad" />
        <div className="ns-tv-hero-content">
          {/* Poster */}
          <div className="ns-tv-poster">
            {d.poster_path ? (
              <img src={imgUrl(d.poster_path)} alt={title} loading="lazy" />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)" }}>
                <TVIcon size={40} />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="ns-tv-info">
            <div className="ns-tv-eyebrow">Series</div>
            <h1 className="ns-tv-title">{title}</h1>

            <div className="ns-tv-genres">
              {displayGenres.map((g) => <span key={g.id} className="ns-tv-genre">{g.name}</span>)}
            </div>

            <div className="ns-tv-meta">
              {displayScore && (
                <span className="ns-tv-score"><StarIcon size={13} /> {displayScore}</span>
              )}
              {displayScore && year && <span className="ns-tv-meta-sep" />}
              {year && <span>{year}</span>}
              {year && displaySeasonCount > 0 && <span className="ns-tv-meta-sep" />}
              {displaySeasonCount > 0 && <span>{displaySeasonCount} Season{displaySeasonCount !== 1 ? "s" : ""}</span>}
              {displaySeasonCount > 0 && displayEpisodeCount > 0 && <span className="ns-tv-meta-sep" />}
              {displayEpisodeCount > 0 && <span>{displayEpisodeCount} Episode{displayEpisodeCount !== 1 ? "s" : ""}</span>}
              {d.status && <><span className="ns-tv-meta-sep" /><span style={{ color: d.status === "Ended" ? "rgba(255,255,255,0.4)" : "rgba(76,200,100,0.9)" }}>{d.status}</span></>}
            </div>

            {rating.cert && (
              <div className={`age-rating-pill${restricted ? " age-rating-pill--restricted" : ""}`} style={{ marginBottom: 10 }}>
                {restricted ? <RatingLockIcon size={13} /> : <RatingShieldIcon size={13} />}
                <span className="age-rating-pill-cert">{rating.cert}</span>
                {restricted && <span className="age-rating-pill-label">Inappropriate for your age setting</span>}
              </div>
            )}

            {displayOverview && <p className="ns-tv-overview">{displayOverview}</p>}

            <div className="ns-tv-actions">
              {restricted ? (
                <button className="btn btn-primary btn-restricted" disabled>🔒 Restricted</button>
              ) : (
                <button className="btn btn-primary" onClick={handleWatch}
                  disabled={loadingSeason || currentSeasonEpisodes.length === 0}>
                  <PlayIcon />{loadingSeason ? "Loading…" : "Watch"}
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
              <button className="btn btn-ghost" onClick={onBack}><BackIcon /> Back</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Page body ─────────────────────────────────────────────────── */}
      <div className="ns-tv-body">

        {/* ── Inline player (when playing) ──────────────────────────── */}
        {playing && selectedEp && (
          <div className="ns-player-section">
            <SectionHeading>Now Playing</SectionHeading>

            <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="tag tag-red">S{selectedSeason} · E{selectedEp.episode_number}</span>
              <span style={{ fontSize: 13.5, fontWeight: 500, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedEp.name}
              </span>
              {currentEpWatched ? (
                <button className="btn btn-ghost watched-btn" onClick={() => onMarkUnwatched?.(currentProgressKey)}>
                  <WatchedIcon size={14} /> Watched
                </button>
              ) : (
                <button className="btn btn-ghost" onClick={() => onMarkWatched?.(currentProgressKey)}>✓ Mark Watched</button>
              )}
            </div>

            <div className={`player-wrap${playerFullscreen ? " player-wrap--fullscreen" : ""}`} ref={playerWrapRef}>
              {webviewLoading && !resolveError && (
                <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#000", borderRadius: "inherit" }}>
                  <div className="spinner" />
                </div>
              )}
              {isAsync && resolveError && !resolvingUrl && (
                <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", gap: 10, borderRadius: "inherit" }}>
                  <span style={{ fontSize: 28 }}>⚠️</span>
                  <span style={{ fontSize: 14, color: "var(--text2)" }}>Episode not found</span>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>{resolveError}</span>
                </div>
              )}
              {pipOpen && (
                <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.92)", gap: 16, borderRadius: "inherit" }}>
                  <PopOutIcon size={36} />
                  <span style={{ fontSize: 15, color: "var(--text1)", fontWeight: 600 }}>Playing in pop-out window</span>
                  <button className="player-overlay-btn" onClick={() => window.electron?.closePipWindow?.()}>Close pop-out &amp; return</button>
                </div>
              )}
              <webview
                ref={webviewRef}
                src={pipOpen ? "about:blank" : isAsync ? resolvedPlayerUrl || "about:blank" : getSourceUrl(playerSource, "tv", item.id, playerEp.season, playerEp.episode)}
                partition="persist:player" allowpopups="true" plugins="true"
                webpreferences="contextIsolation=true,nodeIntegration=false,webSecurity=false,allowRunningInsecureContent=true"
                useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
                style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  border: "none", outline: "none", background: "black",
                  opacity: webviewLoading || (isAsync && !resolvedPlayerUrl) ? 0 : 1,
                  transition: "opacity 0.25s ease",
                }}
                tabIndex={-1}
              />

              {/* Player controls overlay */}
              <div className="player-overlay-group">
                <button ref={sourceRef} className="player-overlay-btn"
                  onClick={() => {
                    if (!canSwitchSource(planId)) { setGateModal("source"); return; }
                    const rect = sourceRef.current?.getBoundingClientRect();
                    if (rect) setMenuPos({ top: rect.bottom + 6, left: rect.left });
                    setShowSourceMenu((v) => !v);
                  }} title="Change source">
                  <SourceIcon size={14} />
                  {PLAYER_SOURCES.find((s) => s.id === playerSource)?.label ?? "Source"}
                </button>
                {playerSource === "allmanga" && (
                  <button className="player-overlay-btn" onClick={() => {
                    const next = dubMode === "sub" ? "dub" : "sub";
                    setDubMode(next); storage.set("allmangaDubMode", next);
                    setM3u8Url(null); setInterceptedSubs([]);
                    setResolvedPlayerUrl(null); setResolvingUrl(false); setResolveError(null);
                  }}>{dubMode === "sub" ? "SUB" : "DUB"}</button>
                )}
                <button className="player-overlay-btn" onClick={() => { setShowSourceMenu(false); setShowBlockedModal(true); }}>
                  <ShieldBlockIcon />
                  {blockedSession > 0 && <span className="player-blocked-badge">{blockedSession}</span>}
                </button>
                <button className="player-overlay-btn"
                  onClick={() => {
                    if (pipOpen) { window.electron?.closePipWindow?.(); return; }
                    if (!canPopOut(planId)) { setGateModal("pip"); return; }
                    const url = isAsync ? resolvedPlayerUrl : getSourceUrl(playerSource, "tv", item.id, playerEp.season, playerEp.episode);
                    if (!url) return;
                    pipUrlRef.current = url;
                    window.electron?.openPipWindow?.(url, title);
                  }}
                  disabled={!pipOpen && (webviewLoading || !!(isAsync && !resolvedPlayerUrl))}
                  style={pipOpen ? { color: "var(--red)" } : undefined}>
                  <PopOutIcon />
                </button>
              </div>

              {showSourceMenu && menuPos && (
                <div className="source-dropdown source-dropdown--fixed" style={{ top: menuPos.top, left: menuPos.left }} onClick={(e) => e.stopPropagation()}>
                  {PLAYER_SOURCES.map((src) => (
                    <button key={src.id} className={"source-dropdown__item" + (playerSource === src.id ? " source-dropdown__item--active" : "")}
                      onClick={() => {
                        setShowSourceMenu(false); if (src.id === playerSource) return;
                        setPlayerSource(src.id); storage.set("playerSource", src.id);
                        setM3u8Url(null); setInterceptedSubs([]);
                        setResolvedPlayerUrl(null); setResolvingUrl(false); setResolveError(null);
                      }}>
                      <span>{src.label}</span>
                      {src.tag && <span className="source-dropdown__tag">{src.tag}</span>}
                      {src.note && <span className="source-dropdown__note">{src.note}</span>}
                    </button>
                  ))}
                </div>
              )}

              {skipPrompt && (
                <button onClick={handleManualSkip} style={{
                  position: "absolute", bottom: 24, right: 24, zIndex: 50,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
                  background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8, color: "white", cursor: "pointer", padding: "9px 18px",
                  backdropFilter: "blur(6px)", fontFamily: "var(--font-body)",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>SKIP</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", letterSpacing: 1 }}>{skipPrompt === "intro" ? "INTRO" : "OUTRO"}</span>
                </button>
              )}
            </div>

            {/* Download + progress row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button className="btn btn-secondary"
                onClick={() => {
                  if (currentEpDownload) { onGoToDownloads?.(currentEpDownload.id); return; }
                  if (!canDownload(planId)) { setGateModal("download"); return; }
                  setShowSourceMenu(false); setShowDownload(true);
                }}>
                {currentEpDownload ? (
                  <span style={{ color: currentEpDownload.status === "downloading" ? "var(--red)" : "#4caf50" }}>
                    {currentEpDownload.status === "downloading" ? "↓ Downloading…" : "✓ Downloaded"}
                  </span>
                ) : <><DownloadIcon /> Download Episode</>}
              </button>
              {m3u8Url && !currentEpDownload && (
                <span style={{ fontSize: 12, color: "var(--red)", fontWeight: 600 }}>● HD stream detected</span>
              )}
            </div>

            {currentProgressKey && (() => {
              const epPct = progress[currentProgressKey] || 0;
              const dur   = durationRef.current;
              return epPct > 0 ? (
                <div className="progress-bar-row">
                  <div className="progress-bar-outer" style={{ position: "relative" }}>
                    <div className="progress-bar-fill" style={{ width: `${Math.min(epPct, 100)}%` }} />
                    {dur > 0 && skipTimings?.intro && (
                      <div title="Intro" style={{ position: "absolute", top: 0, left: `${(skipTimings.intro.startTime / dur) * 100}%`, width: `${((skipTimings.intro.endTime - skipTimings.intro.startTime) / dur) * 100}%`, height: "100%", background: "rgba(251,191,36,0.75)", borderRadius: 2, pointerEvents: "none" }} />
                    )}
                    {dur > 0 && skipTimings?.outro && (
                      <div title="Outro" style={{ position: "absolute", top: 0, left: `${(skipTimings.outro.startTime / dur) * 100}%`, width: `${((skipTimings.outro.endTime - skipTimings.outro.startTime) / dur) * 100}%`, height: "100%", background: "rgba(251,191,36,0.75)", borderRadius: 2, pointerEvents: "none" }} />
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text3)" }}>{epPct.toFixed(0)}% watched</span>
                </div>
              ) : null;
            })()}

            {currentProgressKey && (
              <div className="progress-mark-row">
                <span style={{ fontSize: 12, color: "var(--text3)", marginRight: 4 }}>Mark progress:</span>
                {[25, 50, 75, 100].map((p) => (
                  <button key={p} className="btn btn-ghost" style={{ padding: "5px 14px", fontSize: 12 }}
                    onClick={() => saveProgress(currentProgressKey, p)}>{p}%</button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Series details grid ───────────────────────────────────── */}
        <SectionHeading>Series Info</SectionHeading>
        <div className="ns-info-grid">
          <InfoRow label="Status"          value={d.status} />
          <InfoRow label="Type"            value={d.type} />
          <InfoRow label="First Aired"     value={d.first_air_date ? new Date(d.first_air_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null} />
          <InfoRow label="Last Aired"      value={d.last_air_date ? new Date(d.last_air_date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null} />
          <InfoRow label="Seasons"         value={displaySeasonCount > 0 ? String(displaySeasonCount) : null} />
          <InfoRow label="Episodes"        value={displayEpisodeCount > 0 ? String(displayEpisodeCount) : null} />
          <InfoRow label="Created by"      value={creators.map((c) => c.name).join(", ") || null} />
          <InfoRow label="Language"        value={d.original_language?.toUpperCase() || null} />
          <InfoRow label="Country"         value={(d.origin_country || []).join(", ") || null} />
          <InfoRow label="Episode Runtime" value={d.episode_run_time?.length ? `${d.episode_run_time[0]} min` : null} />
        </div>

        {/* ── Networks ─────────────────────────────────────────────── */}
        {networks.length > 0 && (
          <>
            <SectionHeading>Networks</SectionHeading>
            <div className="ns-networks">
              {networks.map((n) => (
                <div key={n.id} className="ns-network">
                  {n.logo_path
                    ? <img src={imgUrl(n.logo_path, "w92")} alt={n.name} title={n.name} />
                    : n.name}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Cast ─────────────────────────────────────────────────── */}
        {castList.length > 0 && (
          <>
            <SectionHeading>Cast</SectionHeading>
            <div className="ns-cast-grid">
              {visibleCast.map((person) => (
                <CastCard key={person.cast_id ?? person.id} person={person} />
              ))}
            </div>
            {castList.length > 12 && (
              <button className="ns-show-more-btn" onClick={() => setShowAllCast((v) => !v)}>
                {showAllCast ? `Show less` : `Show all ${castList.length} cast members`}
              </button>
            )}
          </>
        )}

        {/* ── Production ───────────────────────────────────────────── */}
        {productionCompanies.length > 0 && (
          <>
            <SectionHeading>Production</SectionHeading>
            <div className="ns-networks">
              {productionCompanies.map((c) => (
                <div key={c.id} className="ns-network">
                  {c.logo_path
                    ? <img src={imgUrl(c.logo_path, "w92")} alt={c.name} title={c.name} />
                    : c.name}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Keywords ─────────────────────────────────────────────── */}
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

      </div>{/* end ns-tv-body */}

      {/* ── Modals ───────────────────────────────────────────────────── */}
      {showTrailer && trailerKey && <TrailerModal trailerKey={trailerKey} title={title} onClose={() => setShowTrailer(false)} />}
      {showBlockedModal && <BlockedStatsModal sessionDomains={getBlockedDomains()} sessionTotal={blockedSession} alltimeTotal={blockedAlltime} onClose={() => setShowBlockedModal(false)} />}
      {showDownload && (
        <DownloadModal onClose={() => setShowDownload(false)}
          m3u8Url={m3u8Url} subtitles={interceptedSubs} mediaName={mediaName}
          downloaderFolder={downloaderFolder} setDownloaderFolder={(f) => { setDownloaderFolder(f); storage.set("downloaderFolder", f); }}
          onOpenSettings={onSettings} onDownloadStarted={onDownloadStarted}
          mediaId={item.id} mediaType="tv" season={selectedSeason}
          episode={selectedEp?.episode_number} posterPath={d.poster_path} tmdbId={item.id} />
      )}
      {gateModal && <PremiumGate feature={gateModal} onUpgrade={handleUpgrade} onClose={() => setGateModal(null)} />}
    </div>
  );
}