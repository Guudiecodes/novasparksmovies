import { useState, useEffect, useRef } from "react";
import { imgUrl } from "../utils/api";
import { getEffectivePlan as getCurrentPlan } from "../utils/premium";

import DonateModal from "../components/DonateModal";

import {
  HomeIcon,
  SearchIcon,
  HistoryIcon,
  FilmIcon,
  SettingsIcon,
  DownloadsQueueIcon,
  QuitIcon,
  BackIcon,
  HelpIcon,
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

// ── Download popup component ──────────────────────────────────────────────
function DownloadPopup({ onClose }) {
  const [release,      setRelease]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [downloading,  setDownloading]  = useState(false);
  const [error,        setError]        = useState(null);

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

      {/* Header */}
      <div style={{
        padding: "14px 16px 10px",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "linear-gradient(135deg, var(--red), var(--amber))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
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
        <button onClick={onClose} style={{
          background: "none", border: "none", color: "var(--text3)",
          cursor: "pointer", fontSize: 14, padding: 2,
        }}>✕</button>
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
            {error}<br />
            <span style={{ color: "var(--text2)" }}>Check back soon for the desktop release.</span>
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
                <div style={{
                  padding: "3px 10px", borderRadius: 6,
                  background: "var(--surface3)", fontSize: 11,
                  color: "var(--text3)", fontWeight: 600,
                }}>{release.size}</div>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 12, lineHeight: 1.5 }}>
              {release.name}
            </div>
            {release.url ? (
              <button onClick={download} disabled={downloading} style={{
                width: "100%", padding: "11px 0", borderRadius: 9, border: "none",
                background: downloading ? "var(--surface3)" : "var(--red)",
                color: downloading ? "var(--text3)" : "#fff",
                fontSize: 13, fontWeight: 700, cursor: downloading ? "default" : "pointer",
                transition: "all 0.2s", fontFamily: "var(--font-body)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: downloading ? "none" : "0 4px 14px rgba(0,180,166,0.35)",
              }}>
                {downloading ? (
                  <><div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.6s linear infinite" }} />Starting download...</>
                ) : (
                  <><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3v11m0 0l-4-4m4 4l4-4M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>Download Now</>
                )}
              </button>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", padding: "8px 0" }}>
                No installer found in latest release.
              </div>
            )}
            <div style={{
              marginTop: 10, fontSize: 10, color: "var(--text3)",
              textAlign: "center", lineHeight: 1.5,
            }}>
              ✓ Free download · No account required<br />
              Works on Windows 10+ · macOS 11+
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
      style={{ position: "relative", overflow: "visible" }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
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
      <span className="tooltip">NS AI · Coming Soon</span>
      <span style={{
        position: "absolute", top: 5, right: 5,
        width: 6, height: 6, borderRadius: "50%",
        background: "linear-gradient(135deg, #00d4ff, #7c3aed)",
        boxShadow: "0 0 6px rgba(0,212,255,0.8)",
        animation: "ns-ai-pulse 2s ease-in-out infinite",
      }} />
    </button>
  );
}

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

// ── Hook: detect if we're in mobile layout ────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export default function Sidebar({
  page, onNavigate, onSearch, savedList, activeDownloads,
  onReorderSaved, onRemoveSaved, canGoBack, onBack,
  onShowShortcuts, isPremium, onUpgrade,
}) {
  const [dragOver,      setDragOver]      = useState(null);
  const [tooltip,       setTooltip]       = useState(null);
  const [contextMenu,   setContextMenu]   = useState(null);
  const [showDonate,    setShowDonate]    = useState(false);
  const [showDownload,  setShowDownload]  = useState(false);

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

  // Close context menu on outside click
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click",       close);
    window.addEventListener("contextmenu", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("contextmenu", close); };
  }, []);

  // Close download popup on outside click
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

  // ── MOBILE BOTTOM NAV ─────────────────────────────────────────────────────
  // Rendered in the same component, not via CSS .mobile-nav class
  // (which relies on nothing rendering it). We detect viewport width
  // and return the mobile nav instead of the full sidebar.
  // ── Shared icon size token — every nav icon is exactly this ─────────────
  const ICO = 22; // px — enforced on every SVG in mobile nav

  // ── Nav items: search lives here too, same visual weight as everything else
  const mobileNavItems = [
    {
      id:    "search",
      label: "Search",
      onTap: onSearch,          // search opens the modal, not a page navigate
      icon: (active) => (
        <svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none"
          stroke={active ? "var(--red)" : "var(--text3)"}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7"/>
          <line x1="16.5" y1="16.5" x2="22" y2="22"/>
        </svg>
      ),
    },
    {
      id:    "home",
      label: "Home",
      icon: (active) => (
        <svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none"
          stroke={active ? "var(--red)" : "var(--text3)"}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
          <path d="M9 21V12h6v9"/>
        </svg>
      ),
    },
    {
      id:    "history",
      label: "Library",
      icon: (active) => (
        <svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none"
          stroke={active ? "var(--red)" : "var(--text3)"}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" rx="1"/>
          <rect x="14" y="3" width="7" height="5" rx="1"/>
          <rect x="14" y="12" width="7" height="9" rx="1"/>
          <rect x="3" y="16" width="7" height="5" rx="1"/>
        </svg>
      ),
    },
    {
      id:    "downloads",
      label: "Downloads",
      badge: activeDownloads > 0 ? activeDownloads : null,
      icon: (active) => (
        <svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none"
          stroke={active ? "var(--red)" : "var(--text3)"}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v11m0 0l-4-4m4 4l4-4"/>
          <path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/>
        </svg>
      ),
    },
    {
      id:    "settings",
      label: "Settings",
      icon: (active) => (
        <svg width={ICO} height={ICO} viewBox="0 0 24 24" fill="none"
          stroke={active ? "var(--red)" : "var(--text3)"}
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      ),
    },
  ];

  if (isMobile) {
    return (
      <>
        {/* ── Mobile top bar ─────────────────────────────────────────────── */}
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0,
          height: 52,
          background: "rgba(5,12,15,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          zIndex: 100,
          // GPU layer
          willChange: "transform",
          transform: "translateZ(0)",
        }}>
          {/* Logo + plan tier badge */}
          <div
            onClick={() => onNavigate("pricing")}
            title={logoLabel}
            style={{
              position: "relative",
              width: 34, height: 34,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <NovasparkLogo tier={tier} />
            <TierBadge tier={tier} />
          </div>

          {/* App wordmark — centred */}
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 19,
            letterSpacing: 3,
            color: "var(--text)",
            flex: 1,
            textAlign: "center",
            userSelect: "none",
          }}>
            NOVASPARK
          </div>

          {/* Plan label pill — right side */}
          <div
            onClick={() => onNavigate("pricing")}
            style={{
              flexShrink: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 20,
              border: `1px solid ${tier === "free" ? "var(--border)" : TIER_CFG[tier].ring}`,
              background: tier === "free"
                ? "rgba(255,255,255,0.04)"
                : `rgba(${tier === "diamond" ? "0,212,255" : tier === "gold" ? "245,166,35" : "192,200,208"},0.08)`,
            }}
          >
            {/* Tier dot */}
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: tier === "free"    ? "var(--red)"
                        : tier === "silver"  ? "#c0c8d0"
                        : tier === "gold"    ? "#f5a623"
                        : "linear-gradient(135deg,#00d4ff,#7c3aed)",
              boxShadow: tier !== "free" ? `0 0 5px ${TIER_CFG[tier].glow}` : "none",
            }} />
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
              color: tier === "free" ? "var(--text3)" : TIER_CFG[tier].grad0,
              textTransform: "uppercase",
            }}>
              {TIER_CFG[tier].label}
            </span>
          </div>
        </div>

        {/* ── Mobile bottom navigation ────────────────────────────────────── */}
        {/* Search is item #1 here — same visual treatment as all other items  */}
        <nav style={{
          position: "fixed",
          bottom: 0, left: 0, right: 0,
          background: "rgba(5,12,15,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-around",
          // Height: 58px content + safe-area-inset-bottom
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          zIndex: 100,
          willChange: "transform",
          transform: "translateZ(0)",
        }}>
          {mobileNavItems.map(({ id, icon, label, badge, onTap }) => {
            const isActive = id !== "search" && page === id;
            const handleClick = onTap
              ? onTap                        // search opens modal directly
              : () => onNavigate(id);        // everything else navigates

            return (
              <button
                key={id}
                onClick={handleClick}
                style={{
                  // Equal flex share — every item identical width
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  height: 58,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  position: "relative",
                  fontFamily: "var(--font-body)",
                  // Active indicator: subtle teal underline at top of bar
                  borderTop: isActive
                    ? "2px solid var(--red)"
                    : "2px solid transparent",
                  transition: "border-color 0.2s, color 0.2s",
                }}
              >
                {/* Icon — always 22×22, colour handled inside each icon fn */}
                <span style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: ICO, height: ICO,
                  transition: "transform 0.15s",
                  // Subtle scale-up on active
                  transform: isActive ? "scale(1.12)" : "scale(1)",
                }}>
                  {icon(isActive)}
                </span>

                {/* Label — same font size, same weight, same casing everywhere */}
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.3,
                  color: isActive ? "var(--red)" : "var(--text3)",
                  textTransform: "capitalize",
                  lineHeight: 1,
                  transition: "color 0.2s",
                }}>
                  {label}
                </span>

                {/* Badge (downloads count) */}
                {badge && (
                  <span style={{
                    position: "absolute",
                    top: 8, right: "calc(50% - 18px)",
                    minWidth: 16, height: 16,
                    borderRadius: 8,
                    background: "var(--red)",
                    color: "#050c0f",
                    fontSize: 9, fontWeight: 800,
                    lineHeight: "16px",
                    textAlign: "center",
                    padding: "0 4px",
                  }}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Modals */}
        {showDonate && <DonateModal onClose={() => setShowDonate(false)} />}
      </>
    );
  }

  // ── DESKTOP SIDEBAR ───────────────────────────────────────────────────────
  return (
    <div className="sidebar">
      <style>{`
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
      `}</style>

      {/* ── NS Logo ── */}
      <div
        onClick={() => onNavigate("pricing")}
        title={logoLabel}
        style={{
          position: "relative", width: 40, height: 40,
          margin: "10px auto 4px", cursor: "pointer", flexShrink: 0,
          filter:    tier === "silver" ? `drop-shadow(0 0 6px ${tierCfg.glow})`  :
                     tier === "gold"   ? `drop-shadow(0 0 8px ${tierCfg.glow})`  : undefined,
          animation: tier === "diamond" ? "ns-diamond-pulse 2.5s ease-in-out infinite" : "none",
        }}
      >
        <NovasparkLogo tier={tier} />
        <TierBadge tier={tier} />
      </div>

      {canGoBack && <SideBtn onClick={onBack}                          icon={<BackIcon />}           label="Back (Ctrl+Z)" />}
      <SideBtn onClick={onSearch}                                      icon={<SearchIcon />}          label="Search (⌘F)" />
      <SideBtn active={page === "home"}      onClick={() => onNavigate("home")}      icon={<HomeIcon />}           label="Home" />
      <SideBtn active={page === "history"}   onClick={() => onNavigate("history")}   icon={<HistoryIcon />}        label="Library & History" />
      <SideBtn active={page === "downloads"} onClick={() => onNavigate("downloads")} icon={<DownloadsQueueIcon />} label="Downloads"
        badge={activeDownloads > 0 ? activeDownloads : null} />

      {/* ── NS AI ── */}
      <NSAIButton onNavigate={onNavigate} />

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
              onDragStart={(e)  => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragEnter={(e)  => handleDragEnter(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e)       => handleDrop(e, index)}
              onClick={()       => onNavigate(item.media_type === "tv" ? "tv" : "movie", item)}
              onContextMenu={(e)=> handleContextMenu(e, item)}
              onMouseEnter={(e) => handleMouseEnter(e, title)}
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
        <div className="sidebar-context-menu"
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}
          onClick={(e) => e.stopPropagation()}>
          <div className="sidebar-context-menu-item"
            onClick={() => { onRemoveSaved?.(contextMenu.item); setContextMenu(null); }}>
            Remove
          </div>
        </div>
      )}

      {/* ── Bottom buttons ── */}
      <div className="sidebar-bottom">
        {/* Download desktop app — web only */}
        {isWeb && (
          <div style={{ position: "relative" }}>
            <button
              data-download-btn
              className="sidebar-btn"
              onClick={(e) => { e.stopPropagation(); setShowDownload((v) => !v); }}
              title="Download Desktop App"
              style={{ color: showDownload ? "var(--amber)" : undefined }}
            >
              <svg width="20" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 3v11m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span className="tooltip">Download Desktop App</span>
            </button>
            {showDownload && (
              <div data-download-popup>
                <DownloadPopup onClose={() => setShowDownload(false)} />
              </div>
            )}
          </div>
        )}

        {/* Donate button */}
        <button
          className="sidebar-btn"
          onClick={() => setShowDonate(true)}
          title="Support NovaSpark"
          style={{ color: "var(--text3)" }}
        >
          <svg width="20" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 21C12 21 3 14.5 3 8.5C3 5.46 5.46 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.54 3 23 5.46 23 8.5C23 14.5 12 21 12 21Z"
              stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinejoin="round"/>
          </svg>
          <span className="tooltip">Support NovaSpark ❤️</span>
        </button>

        <SideBtn onClick={onShowShortcuts}                              icon={<HelpIcon />}     label="Help & Shortcuts (?)" />
        <SideBtn active={page === "settings"} onClick={() => onNavigate("settings")} icon={<SettingsIcon />} label="Settings" />

        {window.electron?.quitApp && (
          <button className="sidebar-btn"
            onClick={() => window.electron.quitApp()}
            title="Quit App"
            style={{ color: "#e53e3e", marginTop: 4 }}>
            <QuitIcon />
            <span className="tooltip">Quit App</span>
          </button>
        )}
      </div>

      {/* ── Donate Modal ── */}
      {showDonate && <DonateModal onClose={() => setShowDonate(false)} />}
    </div>
  );
}

function SideBtn({ active, onClick, icon, label, badge }) {
  return (
    <button className={`sidebar-btn ${active ? "active" : ""}`} onClick={onClick} style={{ position: "relative" }}>
      {icon}
      <span className="tooltip">{label}</span>
      {badge && (
        <span style={{
          position: "absolute", top: 4, right: 4,
          minWidth: 16, height: 16, borderRadius: 8,
          background: "var(--red)", color: "white",
          fontSize: 10, fontWeight: 700,
          lineHeight: "16px", textAlign: "center", padding: "0 4px",
        }}>{badge}</span>
      )}
    </button>
  );
}