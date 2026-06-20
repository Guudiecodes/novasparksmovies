import { useState, useEffect, useRef } from "react";
import { imgUrl } from "../utils/api";
import { getEffectivePlan as getCurrentPlan } from "../utils/premium";
import DonateModal from "../components/DonateModal";
import {
  HomeIcon, SearchIcon, HistoryIcon, FilmIcon,
  SettingsIcon, DownloadsQueueIcon, QuitIcon,
  BackIcon, HelpIcon, SparkleIcon,
} from "./Icons";

// ── GitHub repo for auto-fetching latest release ──────────────────────────
const GITHUB_REPO = "Guudiecodes/novasparks-gen";
const DIRECT_DOWNLOAD = {
  url:     "https://github.com/Guudiecodes/novasparks-gen/releases/download/v2.4.0/NovaSpark.Setup.2.4.0.exe",
  version: "v2.4.0",
  name:    "NovaSpark Setup 2.4.0.exe",
  size:    "84.5 MB",
};

function getPlanTier(planId) {
  if (planId === "premium")                      return "diamond";
  if (planId === "standard")                     return "gold";
  if (planId === "basic" || planId === "mobile") return "silver";
  return "free";
}

const TIER_CFG = {
  free:    { label: "Free",    grad0: "#00b4a6", grad1: "#007a72", ring: "#00b4a6", glow: "transparent",              badge: null,                          pulse: false },
  silver:  { label: "Silver",  grad0: "#d0d8e0", grad1: "#8a9aaa", ring: "#c0c8d0", glow: "rgba(192,200,208,0.55)",   badge: { symbol: "✦", color: "#c8d0d8" }, pulse: false },
  gold:    { label: "Gold",    grad0: "#f5a623", grad1: "#c87800", ring: "#f5a623", glow: "rgba(245,166,35,0.65)",    badge: { symbol: "★", color: "#f5a623" }, pulse: false },
  diamond: { label: "Diamond", grad0: "#00d4ff", grad1: "#7c3aed", ring: "#00d4ff", glow: "rgba(0,212,255,0.75)",    badge: { symbol: "◆", color: "#00d4ff" }, pulse: true  },
};

// ── Download popup ────────────────────────────────────────────────────────
function DownloadPopup({ onClose }) {
  const [release,     setRelease]     = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    setRelease(DIRECT_DOWNLOAD);
    setLoading(false);
  }, []);

  const download = () => {
    if (!release?.url) return;
    setDownloading(true);
    const a   = document.createElement("a");
    a.href    = release.url;
    a.download = release.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloading(false), 3000);
  };

  return (
    <div style={{
      position: "fixed",
      left: "calc(var(--sidebar, 54px) + 12px)",
      bottom: 100,
      zIndex: 99998,
      width: 280,
      background: "var(--surface2)",
      border: "1px solid var(--border)",
      borderRadius: 14,
      boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,180,166,0.1)",
      overflow: "hidden",
      animation: "dlPopIn 0.22s cubic-bezier(0.34,1.56,0.64,1)",
    }}>
      <style>{`
        @keyframes dlPopIn {
          from { opacity:0; transform: translateX(-12px) scale(0.95); }
          to   { opacity:1; transform: translateX(0)      scale(1); }
        }
      `}</style>
      <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "linear-gradient(135deg, var(--red), var(--amber))", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="18" rx="3" fill="white" opacity="0.9"/>
              <path d="M12 7v7m0 0l-3-3m3 3l3-3" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="7" y1="17" x2="17" y2="17" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Download Desktop</div>
            <div style={{ fontSize: 10, color: "var(--text3)" }}>NovaSpark for Windows / Mac</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 14, padding: 2 }}>✕</button>
      </div>
      <div style={{ padding: "14px 16px 16px" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text3)", fontSize: 13 }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--red)", animation: "spin 0.6s linear infinite" }} />
            Fetching latest version...
          </div>
        )}
        {error && (
          <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.5 }}>
            {error}<br /><span style={{ color: "var(--text2)" }}>Check back soon for the desktop release.</span>
          </div>
        )}
        {release && !loading && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>Latest Version</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--amber)" }}>{release.version}</div>
              </div>
              {release.size && (
                <div style={{ padding: "3px 10px", borderRadius: 6, background: "var(--surface3)", fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>{release.size}</div>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 12, lineHeight: 1.5 }}>{release.name}</div>
            {release.url ? (
              <button onClick={download} disabled={downloading} style={{ width: "100%", padding: "11px 0", borderRadius: 9, border: "none", background: downloading ? "var(--surface3)" : "var(--red)", color: downloading ? "var(--text3)" : "#fff", fontSize: 13, fontWeight: 700, cursor: downloading ? "default" : "pointer", transition: "all 0.2s", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {downloading
                  ? <><div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.6s linear infinite" }} />Starting…</>
                  : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3v11m0 0l-4-4m4 4l4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>Download Now</>
                }
              </button>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", padding: "8px 0" }}>No installer found in latest release.</div>
            )}
            <div style={{ marginTop: 10, fontSize: 10, color: "var(--text3)", textAlign: "center", lineHeight: 1.5 }}>
              ✓ Free download · No account required<br />Works on Windows 10+ · macOS 11+
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── NS AI Button ──────────────────────────────────────────────────────────
function NSAIButton({ onNavigate }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      className="sidebar-btn"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onNavigate("nsai")}
      title="NS AI"
      style={{ position: "relative", overflow: "visible" }}
    >
      <span className="ns-sb-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          style={{ filter: hovered ? "drop-shadow(0 0 6px rgba(0,212,255,0.8))" : "none", transition: "filter 0.3s" }}>
          <defs>
            <linearGradient id="ai-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stopColor="#00d4ff" />
              <stop offset="50%"  stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#00d4ff" />
            </linearGradient>
          </defs>
          <circle cx="12" cy="12" r="10" stroke="url(#ai-grad)" strokeWidth="1.5" fill="none" opacity="0.5" />
          <circle cx="12" cy="12" r="3"  fill="url(#ai-grad)" opacity="0.9" />
          <line x1="12" y1="2"   x2="12" y2="6"   stroke="url(#ai-grad)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="12" y1="18"  x2="12" y2="22"  stroke="url(#ai-grad)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="2"  y1="12"  x2="6"  y2="12"  stroke="url(#ai-grad)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="18" y1="12"  x2="22" y2="12"  stroke="url(#ai-grad)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="4.9" y1="4.9"   x2="7.8"  y2="7.8"   stroke="url(#ai-grad)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="16.2" y1="16.2" x2="19.1" y2="19.1"  stroke="url(#ai-grad)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="19.1" y1="4.9"  x2="16.2" y2="7.8"   stroke="url(#ai-grad)" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="7.8"  y1="16.2" x2="4.9"  y2="19.1"  stroke="url(#ai-grad)" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="ns-sb-label" style={{ color: hovered ? "#00d4ff" : undefined }}>NS AI</span>
      {/* Pulse dot */}
      <span style={{
        position: "absolute", top: 6, right: 6,
        width: 6, height: 6, borderRadius: "50%",
        background: "linear-gradient(135deg, #00d4ff, #7c3aed)",
        boxShadow: "0 0 6px rgba(0,212,255,0.8)",
        animation: "ns-ai-pulse 2s ease-in-out infinite",
        pointerEvents: "none",
      }} />
    </button>
  );
}

// ── World Reel Button ─────────────────────────────────────────────────────
function ReelButton({ active, onNavigate }) {
  const [hovered, setHovered] = useState(false);
  const isOn = active || hovered;
  return (
    <button
      className={`sidebar-btn ${active ? "active" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onNavigate("reel")}
      title="NS Shorts"
      style={{ position: "relative", overflow: "visible" }}
    >
      <span className="ns-sb-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          style={{ filter: isOn ? "drop-shadow(0 0 5px rgba(255,180,0,0.7))" : "none", transition: "filter 0.3s" }}>
          <circle cx="12" cy="12" r="9" stroke={isOn ? "#f5a623" : "currentColor"} strokeWidth="1.6" fill="none" />
          <circle cx="12" cy="12" r="3" stroke={isOn ? "#f5a623" : "currentColor"} strokeWidth="1.6" fill="none" />
          <circle cx="12" cy="4"  r="1.2" fill={isOn ? "#f5a623" : "currentColor"} opacity="0.8" />
          <circle cx="12" cy="20" r="1.2" fill={isOn ? "#f5a623" : "currentColor"} opacity="0.8" />
          <circle cx="4"  cy="12" r="1.2" fill={isOn ? "#f5a623" : "currentColor"} opacity="0.8" />
          <circle cx="20" cy="12" r="1.2" fill={isOn ? "#f5a623" : "currentColor"} opacity="0.8" />
          <circle cx="6.3"  cy="6.3"  r="1" fill={isOn ? "#f5a623" : "currentColor"} opacity="0.6" />
          <circle cx="17.7" cy="17.7" r="1" fill={isOn ? "#f5a623" : "currentColor"} opacity="0.6" />
          <circle cx="17.7" cy="6.3"  r="1" fill={isOn ? "#f5a623" : "currentColor"} opacity="0.6" />
          <circle cx="6.3"  cy="17.7" r="1" fill={isOn ? "#f5a623" : "currentColor"} opacity="0.6" />
        </svg>
      </span>
      <span className="ns-sb-label" style={{ color: isOn ? "#f5a623" : undefined }}>NS Shorts</span>
      {/* NEW badge */}
      <span style={{
        background: "linear-gradient(135deg, #f5a623, #e74c3c)",
        borderRadius: 3, padding: "1px 5px",
        fontSize: 7, fontWeight: 900, color: "#fff",
        letterSpacing: 0.3, lineHeight: 1.5,
        pointerEvents: "none", flexShrink: 0,
      }}>NEW</span>
    </button>
  );
}

// ── NovaSpark Logo SVG ────────────────────────────────────────────────────
function NovasparkLogo({ tier }) {
  const t   = TIER_CFG[tier] || TIER_CFG.free;
  const gid = `nsg-${tier}`;
  const rid = `nsr-${tier}`;
  const fid = `nsf-${tier}`;
  return (
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={t.grad0} />
          <stop offset="100%" stopColor={t.grad1} />
        </linearGradient>
        {tier === "diamond" && (
          <linearGradient id={rid} x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#00d4ff" />
            <stop offset="35%"  stopColor="#7c3aed" />
            <stop offset="70%"  stopColor="#f5a623" />
            <stop offset="100%" stopColor="#00d4ff" />
          </linearGradient>
        )}
        <filter id={fid}>
          <feGaussianBlur stdDeviation={tier === "diamond" ? "2.5" : tier === "free" ? "1.2" : "1.8"} result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="22" cy="22" r="20" fill={`url(#${gid})`}
        opacity={tier === "free" ? 0.1 : tier === "diamond" ? 0.22 : 0.16} />
      {(tier === "gold" || tier === "diamond") && (
        <circle cx="22" cy="22" r="21.5" stroke={t.ring} strokeWidth="0.8" fill="none" opacity="0.3" />
      )}
      <circle cx="22" cy="22" r="20"
        stroke={tier === "diamond" ? `url(#${rid})` : `url(#${gid})`}
        strokeWidth={tier === "free" ? "1.5" : "2.2"} fill="none" />
      <text x="22" y="28" textAnchor="middle"
        fontFamily="'Bebas Neue','Outfit',sans-serif"
        fontSize="18" fontWeight="700"
        fill={`url(#${gid})`} filter={`url(#${fid})`} letterSpacing="1">NS</text>
    </svg>
  );
}

function TierBadge({ tier }) {
  if (tier === "free") return null;
  const t = TIER_CFG[tier];
  return (
    <div style={{
      position: "absolute", bottom: 0, right: 0,
      width: 14, height: 14, borderRadius: "50%",
      background: "var(--bg, #050c0f)",
      border: `1.5px solid ${t.badge.color}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 7, lineHeight: 1, color: t.badge.color,
      fontWeight: 900, pointerEvents: "none",
      boxShadow: `0 0 5px ${t.glow}`,
    }}>
      {t.badge.symbol}
    </div>
  );
}

// ── Hook: detect mobile ───────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const mq      = window.matchMedia("(max-width: 768px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

// ── NS AI icon SVG (mobile) ───────────────────────────────────────────────
function NSAIIcon({ active, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ filter: active ? "drop-shadow(0 0 6px rgba(0,212,255,0.9))" : "none", transition: "filter 0.3s" }}>
      <defs>
        <linearGradient id="mob-ai-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#00d4ff" />
          <stop offset="50%"  stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#00d4ff" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" stroke={active ? "url(#mob-ai-grad)" : "var(--text3)"} strokeWidth="1.5" fill="none" opacity={active ? 0.8 : 0.5} />
      <circle cx="12" cy="12" r="3"  fill={active ? "url(#mob-ai-grad)" : "var(--text3)"} opacity={active ? 1 : 0.6} />
      <line x1="12" y1="2"  x2="12" y2="6"  stroke={active ? "url(#mob-ai-grad)" : "var(--text3)"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="22" stroke={active ? "url(#mob-ai-grad)" : "var(--text3)"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2"  y1="12" x2="6"  y2="12" stroke={active ? "url(#mob-ai-grad)" : "var(--text3)"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="18" y1="12" x2="22" y2="12" stroke={active ? "url(#mob-ai-grad)" : "var(--text3)"} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4.9"  y1="4.9"  x2="7.8"  y2="7.8"  stroke={active ? "url(#mob-ai-grad)" : "var(--text3)"} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="16.2" y1="16.2" x2="19.1" y2="19.1" stroke={active ? "url(#mob-ai-grad)" : "var(--text3)"} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="19.1" y1="4.9"  x2="16.2" y2="7.8"  stroke={active ? "url(#mob-ai-grad)" : "var(--text3)"} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="7.8"  y1="16.2" x2="4.9"  y2="19.1" stroke={active ? "url(#mob-ai-grad)" : "var(--text3)"} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SIDEBAR COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function Sidebar({
  page, onNavigate, onSearch, savedList, activeDownloads,
  onReorderSaved, onRemoveSaved, canGoBack, onBack,
  onShowShortcuts, isPremium, onUpgrade,
}) {
  const [dragOver,     setDragOver]     = useState(null);
  const [tooltip,      setTooltip]      = useState(null);
  const [contextMenu,  setContextMenu]  = useState(null);
  const [showDonate,   setShowDonate]   = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  const [planId, setPlanId] = useState(() => getCurrentPlan());
  useEffect(() => {
    const h = () => setPlanId(getCurrentPlan());
    window.addEventListener("ns:plan-changed", h);
    return () => window.removeEventListener("ns:plan-changed", h);
  }, []);
  useEffect(() => { setPlanId(getCurrentPlan()); }, [isPremium]);

  const tier    = getPlanTier(planId);
  const tierCfg = TIER_CFG[tier];
  const isMobile = useIsMobile();

  const dragItem = useRef(null);
  const dragNode = useRef(null);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("contextmenu", close); };
  }, []);

  useEffect(() => {
    if (!showDownload) return;
    const h = (e) => {
      if (!e.target.closest("[data-download-popup]") && !e.target.closest("[data-download-btn]")) {
        setShowDownload(false);
      }
    };
    setTimeout(() => window.addEventListener("click", h), 0);
    return () => window.removeEventListener("click", h);
  }, [showDownload]);

  const handleContextMenu = (e, item)  => { e.preventDefault(); e.stopPropagation(); setTooltip(null); setContextMenu({ item, x: e.clientX, y: e.clientY }); };
  const handleDragStart   = (e, index) => { dragItem.current = index; dragNode.current = e.currentTarget; setTimeout(() => { if (dragNode.current) dragNode.current.style.opacity = "0.4"; }, 0); e.dataTransfer.effectAllowed = "move"; };
  const handleDragEnd     = ()         => { if (dragNode.current) dragNode.current.style.opacity = "1"; dragItem.current = null; dragNode.current = null; setDragOver(null); };
  const handleDragEnter   = (e, index) => { if (dragItem.current === index) return; setDragOver(index); };
  const handleDrop        = (e, di)    => { e.preventDefault(); const from = dragItem.current; if (from === null || from === di) return; const next = [...savedList]; const [mv] = next.splice(from, 1); next.splice(di, 0, mv); onReorderSaved(next.map((i) => `${i.media_type}_${i.id}`)); setDragOver(null); };
  const handleDragOver    = (e)        => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleMouseEnter  = (e, title) => { const r = e.currentTarget.getBoundingClientRect(); setTooltip({ title, y: r.top + r.height / 2 }); };
  const handleMouseLeave  = ()         => setTooltip(null);

  const logoLabel = tier === "free"
    ? "Free Plan · Click to upgrade"
    : `${tierCfg.label} Plan · Click to manage`;

  const isWeb = !window.electron;
  const ICO   = 22;

  // ── Mobile nav items ─────────────────────────────────────────────────────
  const mobileNavItems = [
    { id: "search",    label: "Search",    onTap: onSearch,
      icon: (active) => (<svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={active ? "var(--red)" : "var(--text3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg>) },
    { id: "home",      label: "Home",
      icon: (active) => (<svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={active ? "var(--red)" : "var(--text3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>) },
    { id: "reel",      label: "Shorts",
      icon: (active) => (<svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={active ? "#f5a623" : "var(--text3)"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="4"  r="1.2" fill={active ? "#f5a623" : "var(--text3)"} stroke="none"/><circle cx="12" cy="20" r="1.2" fill={active ? "#f5a623" : "var(--text3)"} stroke="none"/><circle cx="4"  cy="12" r="1.2" fill={active ? "#f5a623" : "var(--text3)"} stroke="none"/><circle cx="20" cy="12" r="1.2" fill={active ? "#f5a623" : "var(--text3)"} stroke="none"/></svg>),
      extra: (active) => !active && (<span style={{ position:"absolute", top:5, right:2, background:"linear-gradient(135deg,#f5a623,#e74c3c)", borderRadius:3, padding:"1px 3px", fontSize:6, fontWeight:900, color:"#fff", lineHeight:1.4 }}>NEW</span>) },
    { id: "nsai",      label: "NS AI",   onTap: () => onNavigate("nsai"),
      icon: (active) => <NSAIIcon active={active} size={ICO} />,
      extra: () => (<span style={{ position:"absolute", top:5, right:2, width:5, height:5, borderRadius:"50%", background:"linear-gradient(135deg,#00d4ff,#7c3aed)", boxShadow:"0 0 5px rgba(0,212,255,0.7)", animation:"ns-ai-pulse 2s ease-in-out infinite", pointerEvents:"none" }}/>) },
    { id: "history",   label: "Library",
      icon: (active) => (<svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={active ? "var(--red)" : "var(--text3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>) },
    { id: "downloads", label: "Downloads", badge: activeDownloads > 0 ? activeDownloads : null,
      icon: (active) => (<svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={active ? "var(--red)" : "var(--text3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v11m0 0l-4-4m4 4l4-4"/><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/></svg>) },
    { id: "settings",  label: "Settings",
      icon: (active) => (<svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={active ? "var(--red)" : "var(--text3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>) },
    { id: "help",      label: "Help",    onTap: onShowShortcuts,
      icon: (active) => (<svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={active ? "var(--red)" : "var(--text3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>) },
    { id: "donate",    label: "Support", onTap: () => setShowDonate(true),
      icon: (active) => (<svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={active ? "var(--red)" : "var(--text3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21C12 21 3 14.5 3 8.5C3 5.46 5.46 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.54 3 23 5.46 23 8.5C23 14.5 12 21 12 21Z"/></svg>) },
    ...(isWeb ? [{
      id: "get-app", label: "Get App", onTap: () => setShowDownload((v) => !v),
      icon: (_a) => (<svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke={showDownload ? "var(--amber)" : "var(--text3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v11m0 0l-4-4m4 4l4-4"/><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/></svg>),
    }] : []),
    ...(window.electron?.quitApp ? [{
      id: "quit", label: "Quit", onTap: () => window.electron.quitApp(),
      icon: (_a) => (<svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none" stroke="#e53e3e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>),
    }] : []),
  ];

  // ── MOBILE ────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        {/* Mobile top bar */}
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 52,
          background: "rgba(4,8,13,0.97)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", zIndex: 100,
          willChange: "transform", transform: "translateZ(0)",
          boxShadow: "0 1px 0 rgba(0,180,166,0.08)",
        }}>
          <div onClick={() => onNavigate("pricing")} title={logoLabel}
            style={{ position: "relative", width: 34, height: 34, cursor: "pointer", flexShrink: 0 }}>
            <NovasparkLogo tier={tier} />
            <TierBadge tier={tier} />
          </div>

          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 19, letterSpacing: 3,
            color: "var(--text)", flex: 1,
            textAlign: "center", userSelect: "none",
          }}>
            NOVASPARK
          </div>

          <div onClick={() => onNavigate("pricing")} style={{
            flexShrink: 0, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 20,
            border: `1px solid ${tier === "free" ? "var(--border)" : TIER_CFG[tier].ring}`,
            background: tier === "free"
              ? "rgba(255,255,255,0.04)"
              : `rgba(${tier === "diamond" ? "0,212,255" : tier === "gold" ? "245,166,35" : "192,200,208"},0.08)`,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: tier === "free"   ? "var(--red)"
                : tier === "silver" ? "#c0c8d0"
                : tier === "gold"   ? "#f5a623"
                : "linear-gradient(135deg,#00d4ff,#7c3aed)",
              boxShadow: tier !== "free" ? `0 0 5px ${TIER_CFG[tier].glow}` : "none",
            }} />
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              color: tier === "free" ? "var(--text3)" : TIER_CFG[tier].grad0,
              textTransform: "uppercase",
            }}>{TIER_CFG[tier].label}</span>
          </div>
        </div>

        {/* Mobile bottom nav */}
        <nav style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: "rgba(4,8,13,0.97)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          borderTop: "1px solid var(--border)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          zIndex: 100, willChange: "transform", transform: "translateZ(0)",
        }}>
          <style>{`
            @keyframes ns-ai-pulse {
              0%,100% { opacity:1; transform:scale(1); }
              50%      { opacity:0.5; transform:scale(0.7); }
            }
          `}</style>
          <div style={{
            display: "flex", alignItems: "stretch",
            overflowX: "auto", overflowY: "visible",
            scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
            maskImage: "linear-gradient(to right, transparent 0%, black 12px, black calc(100% - 12px), transparent 100%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 12px, black calc(100% - 12px), transparent 100%)",
          }}>
            <div style={{ width: 8, flexShrink: 0 }} />
            {mobileNavItems.map(({ id, icon, label, badge, onTap, extra }) => {
              const isActionOnly = ["search", "help", "donate", "get-app", "quit"].includes(id);
              const isActive     = !isActionOnly && page === id;
              const isReel       = id === "reel";
              const isAI         = id === "nsai";
              const handleClick  = onTap ?? (() => onNavigate(id));
              const activeColor  = isReel ? "#f5a623" : isAI ? "#00d4ff" : "var(--red)";
              return (
                <button key={id} onClick={handleClick} style={{
                  flexShrink: 0, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: 4, height: 58, minWidth: 60,
                  background: "none", border: "none",
                  cursor: "pointer", padding: "0 8px",
                  position: "relative", fontFamily: "var(--font-body)",
                  borderTop: isActive ? `2px solid ${activeColor}` : "2px solid transparent",
                  transition: "border-color 0.2s",
                }}>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: ICO, height: ICO, transition: "transform 0.15s", transform: isActive ? "scale(1.12)" : "scale(1)" }}>
                    {icon(isActive)}
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.3, color: isActive ? activeColor : "var(--text3)", textTransform: "capitalize", lineHeight: 1, transition: "color 0.2s", whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                  {badge && (
                    <span style={{ position: "absolute", top: 8, right: 4, minWidth: 16, height: 16, borderRadius: 8, background: "var(--red)", color: "#050c0f", fontSize: 9, fontWeight: 800, lineHeight: "16px", textAlign: "center", padding: "0 4px" }}>{badge}</span>
                  )}
                  {extra?.(isActive)}
                </button>
              );
            })}
            <div style={{ width: 8, flexShrink: 0 }} />
          </div>
        </nav>

        {showDownload && isWeb && (
          <div data-download-popup style={{ position: "fixed", bottom: 68, left: 12, zIndex: 99999 }}>
            <DownloadPopup onClose={() => setShowDownload(false)} />
          </div>
        )}
        {showDonate && <DonateModal onClose={() => setShowDonate(false)} />}
      </>
    );
  }

  // ── DESKTOP SIDEBAR ───────────────────────────────────────────────────────
  return (
    <>
      <div className="sidebar">
        <style>{`
          /* ══ EXPANDABLE SIDEBAR ════════════════════════════════════════ */
          @keyframes ns-ai-pulse {
            0%,100% { opacity:1; transform:scale(1); }
            50%      { opacity:0.5; transform:scale(0.7); }
          }
          @keyframes spin { to { transform:rotate(360deg); } }
          ${tier === "diamond" ? `
          @keyframes ns-diamond-pulse {
            0%,100% { filter: drop-shadow(0 0 4px rgba(0,212,255,0.55)); }
            50%      { filter: drop-shadow(0 0 14px rgba(0,212,255,0.95)) drop-shadow(0 0 28px rgba(124,58,237,0.55)); }
          }` : ""}

          /* Expand sidebar on hover */
          .sidebar {
            width: 54px;
            transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
          }
          .sidebar:hover {
            width: 230px;
            z-index: 101;
            box-shadow:
              0 0 0 1px rgba(0,180,166,0.09),
              6px 0 48px rgba(0,0,0,0.75),
              inset -1px 0 0 rgba(0,180,166,0.12);
          }

          /* Header: logo + brand name */
          .ns-sb-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 4px 7px;
            margin: 4px 6px 4px;
            cursor: pointer;
            border-radius: 10px;
            transition: background 0.2s;
            overflow: hidden;
            flex-shrink: 0;
          }
          .ns-sb-header:hover { background: rgba(0,180,166,0.07); }

          /* Brand name — hidden until hover */
          .ns-sb-brand {
            font-family: var(--font-display);
            font-size: 17px;
            letter-spacing: 2.5px;
            color: var(--red);
            white-space: nowrap;
            overflow: hidden;
            max-width: 0;
            opacity: 0;
            transition: max-width 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s 0.06s;
            text-shadow: 0 0 20px rgba(0,180,166,0.3);
          }
          .sidebar:hover .ns-sb-brand { max-width: 160px; opacity: 1; }

          /* Section divider labels */
          .ns-sb-section {
            display: block;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 2.2px;
            text-transform: uppercase;
            color: var(--text3);
            padding: 10px 0 2px;
            margin: 0 16px;
            white-space: nowrap;
            overflow: hidden;
            max-width: 0;
            opacity: 0;
            transition: max-width 0.28s, opacity 0.2s;
            border-top: 1px solid transparent;
          }
          .sidebar:hover .ns-sb-section {
            max-width: 200px;
            opacity: 0.6;
          }
          .ns-sb-section:first-of-type { border-top: none; }

          /* Sidebar buttons — full width */
          .sidebar-btn {
            width: calc(100% - 12px) !important;
            margin: 1px 6px !important;
            padding: 0 11px !important;
            justify-content: flex-start !important;
            gap: 11px !important;
            height: 40px !important;
            border-radius: 9px !important;
            flex-shrink: 0;
          }

          /* Icon wrapper */
          .ns-sb-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            width: 20px;
            height: 20px;
          }
          .ns-sb-icon svg { width: 20px; height: 20px; }

          /* Label — hidden until hover */
          .ns-sb-label {
            font-size: 13px;
            font-weight: 500;
            letter-spacing: 0.15px;
            color: inherit;
            white-space: nowrap;
            overflow: hidden;
            max-width: 0;
            opacity: 0;
            flex: 1;
            min-width: 0;
            transition: max-width 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.18s 0.07s;
          }
          .sidebar:hover .ns-sb-label { max-width: 160px; opacity: 1; }

          /* Badge — stay right-aligned */
          .ns-sb-badge {
            flex-shrink: 0;
            margin-left: auto;
            min-width: 18px;
            height: 18px;
            border-radius: 9px;
            background: var(--red);
            color: #050c0f;
            font-size: 10px;
            font-weight: 800;
            line-height: 18px;
            text-align: center;
            padding: 0 5px;
          }

          /* Separator line — expand width */
          .sidebar-sep {
            transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .sidebar:hover .sidebar-sep { width: calc(100% - 24px); }

          /* Hide tooltip text when sidebar is expanded (labels visible) */
          .sidebar:hover .tooltip { display: none !important; }

          /* Saved thumbnails area */
          .sidebar-saved { padding: 4px 6px; }
          .sidebar:hover .saved-thumb { width: 40px; }
        `}</style>

        {/* ── Brand Header ── */}
        <div className="ns-sb-header" onClick={() => onNavigate("pricing")} title={logoLabel}>
          <div style={{
            position: "relative", width: 36, height: 36, flexShrink: 0,
            filter:    tier === "silver" ? `drop-shadow(0 0 6px ${tierCfg.glow})`  :
                       tier === "gold"   ? `drop-shadow(0 0 8px ${tierCfg.glow})`  : undefined,
            animation: tier === "diamond" ? "ns-diamond-pulse 2.5s ease-in-out infinite" : "none",
          }}>
            <NovasparkLogo tier={tier} />
            <TierBadge tier={tier} />
          </div>
          <span className="ns-sb-brand">NOVASPARK</span>
        </div>

        {/* ── Navigate ── */}
        <span className="ns-sb-section">Navigate</span>
        <SideBtn onClick={onSearch}                                        icon={<SearchIcon />}          label="Search  ⌘F" />
        <SideBtn active={page === "home"}      onClick={() => onNavigate("home")}      icon={<HomeIcon />}           label="Home" />
        <ReelButton active={page === "reel"}   onNavigate={onNavigate} />
        <NSAIButton onNavigate={onNavigate} />

        {/* ── Library ── */}
        <span className="ns-sb-section">Library</span>
        <SideBtn active={page === "history"}   onClick={() => onNavigate("history")}   icon={<HistoryIcon />}        label="Library & History" />
        <SideBtn
          active={page === "downloads"}
          onClick={() => onNavigate("downloads")}
          icon={<DownloadsQueueIcon />}
          label="Downloads"
          badge={activeDownloads > 0 ? activeDownloads : undefined}
        />

        {/* ── Back / Menu ── */}
        {canGoBack && <SideBtn onClick={onBack} icon={<BackIcon />} label="Back  Ctrl+Z" />}

        <SideMenuBtn
          page={page}
          onNavigate={onNavigate}
          onShowShortcuts={onShowShortcuts}
          setShowDonate={setShowDonate}
          showDownload={showDownload}
          setShowDownload={setShowDownload}
          isWeb={isWeb}
        />

        <div className="sidebar-sep" />

        {/* ── Saved thumbnails ── */}
        <div className="sidebar-saved">
          {savedList.map((item, index) => {
            const key   = `${item.media_type}_${item.id}`;
            const title = item.title || item.name;
            return (
              <div
                key={key}
                className={`saved-thumb${dragOver === index ? " drag-over" : ""}`}
                draggable
                onDragStart={(e)   => handleDragStart(e, index)}
                onDragEnd={handleDragEnd}
                onDragEnter={(e)   => handleDragEnter(e, index)}
                onDragOver={handleDragOver}
                onDrop={(e)        => handleDrop(e, index)}
                onClick={()        => onNavigate(item.media_type === "tv" ? "tv" : "movie", item)}
                onContextMenu={(e) => handleContextMenu(e, item)}
                onMouseEnter={(e)  => handleMouseEnter(e, title)}
                onMouseLeave={handleMouseLeave}
                style={{ cursor: "grab", position: "relative" }}
              >
                {item.poster_path
                  ? <img src={imgUrl(item.poster_path, "w200")} alt={title} />
                  : <div className="no-img"><FilmIcon /></div>
                }
                {dragOver === index && (
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--red)", borderRadius: 2, pointerEvents: "none" }} />
                )}
              </div>
            );
          })}
        </div>

        {tooltip && (
          <div className="saved-thumb-tooltip" style={{ top: tooltip.y }}>{tooltip.title}</div>
        )}

        {contextMenu && (
          <div
            className="sidebar-context-menu"
            style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sidebar-context-menu-item"
              onClick={() => { onRemoveSaved?.(contextMenu.item); setContextMenu(null); }}>
              Remove
            </div>
          </div>
        )}
      </div>

      {showDonate && <DonateModal onClose={() => setShowDonate(false)} />}
      {showDownload && isWeb && (
        <div data-download-popup>
          <DownloadPopup onClose={() => setShowDownload(false)} />
        </div>
      )}
    </>
  );
}

// ── Desktop Sidebar Menu Flyout ───────────────────────────────────────────
function SideMenuBtn({ page, onNavigate, onShowShortcuts, setShowDonate, showDownload, setShowDownload, isWeb }) {
  const [open, setOpen]           = useState(false);
  const containerRef              = useRef(null);
  const [flyoutTop, setFlyoutTop] = useState(200);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setFlyoutTop(Math.min(rect.top, window.innerHeight - 320));
    }
    setOpen((v) => !v);
  };

  const menuItems = [
    {
      label: "Settings", active: page === "settings",
      icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>),
      action: () => { onNavigate("settings"); setOpen(false); },
    },
    {
      label: "Help & Shortcuts",
      icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>),
      action: () => { onShowShortcuts(); setOpen(false); },
    },
    {
      label: "Support NovaSpark", accent: "#e8547a",
      icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21C12 21 3 14.5 3 8.5C3 5.46 5.46 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.54 3 23 5.46 23 8.5C23 14.5 12 21 12 21Z"/></svg>),
      action: () => { setShowDonate(true); setOpen(false); },
    },
    ...(isWeb ? [{
      label: "Download Desktop App", accent: "var(--amber, #f5a623)",
      icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v11m0 0l-4-4m4 4l4-4"/><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/></svg>),
      action: () => { setShowDownload((v) => !v); setOpen(false); },
    }] : []),
    ...(window.electron?.quitApp ? [{
      label: "Quit NovaSpark", accent: "#e53e3e",
      icon: (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>),
      action: () => window.electron.quitApp(),
    }] : []),
  ];

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button className={`sidebar-btn${open ? " active" : ""}`} onClick={handleToggle} title="More" style={{ position: "relative" }}>
        <span className="ns-sb-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5"  cy="12" r="2.2"/>
            <circle cx="12" cy="12" r="2.2"/>
            <circle cx="19" cy="12" r="2.2"/>
          </svg>
        </span>
        <span className="ns-sb-label">More</span>
      </button>

      {open && (
        <div style={{
          position: "fixed",
          left: "calc(var(--sidebar, 54px) + 12px)",
          top: flyoutTop,
          zIndex: 9999,
          background: "rgba(5,11,19,0.98)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 14,
          padding: "6px",
          minWidth: 224,
          boxShadow: "0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,180,166,0.06)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          animation: "sideMenuIn 0.16s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          <style>{`
            @keyframes sideMenuIn {
              from { opacity: 0; transform: translateX(-10px) scale(0.96); }
              to   { opacity: 1; transform: translateX(0)     scale(1);    }
            }
          `}</style>
          {/* Divider label */}
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "var(--text3)", padding: "4px 14px 8px", opacity: 0.6 }}>Options</div>
          {menuItems.map(({ label, icon, accent, active, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                display: "flex", alignItems: "center", gap: 11,
                width: "100%",
                background: active ? "var(--red-dim)" : "none",
                border: "none", borderRadius: 9,
                padding: "10px 13px",
                color: accent ?? (active ? "var(--red)" : "var(--text2)"),
                cursor: "pointer", fontSize: 13,
                fontWeight: active ? 600 : 500,
                fontFamily: "var(--font-body)", textAlign: "left",
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = accent ?? "var(--text)"; }
              }}
              onMouseLeave={(e) => {
                if (!active) { e.currentTarget.style.background = "none"; e.currentTarget.style.color = accent ?? "var(--text2)"; }
              }}
            >
              <span style={{ flexShrink: 0, display: "flex", alignItems: "center", opacity: 0.75 }}>{icon}</span>
              {label}
              {active && <span style={{ marginLeft: "auto", color: "var(--red)", fontSize: 11 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sidebar Button ────────────────────────────────────────────────────────
function SideBtn({ active, onClick, icon, label, badge }) {
  return (
    <button className={`sidebar-btn ${active ? "active" : ""}`} onClick={onClick} title={label} style={{ position: "relative" }}>
      <span className="ns-sb-icon">{icon}</span>
      <span className="ns-sb-label">{label}</span>
      {badge != null && (
        <span className="ns-sb-badge">{badge}</span>
      )}
    </button>
  );
}