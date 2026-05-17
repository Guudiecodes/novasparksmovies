import { useState, useEffect, useRef } from "react";
import { imgUrl } from "../utils/api";
import { getCurrentPlan } from "../utils/premium";
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

function getPlanTier(planId) {
  if (planId === "premium")                      return "diamond";
  if (planId === "standard")                     return "gold";
  if (planId === "basic" || planId === "mobile") return "silver";
  return "free";
}

const TIER_CFG = {
  free:    { label: "Free",    grad0: "#00a8e1", grad1: "#0076b0", ring: "#00a8e1", glow: "transparent", badge: null, pulse: false },
  silver:  { label: "Silver",  grad0: "#d0d8e0", grad1: "#8a9aaa", ring: "#c0c8d0", glow: "rgba(192,200,208,0.55)", badge: { symbol: "✦", color: "#c8d0d8" }, pulse: false },
  gold:    { label: "Gold",    grad0: "#f5c518", grad1: "#c89000", ring: "#f5c518", glow: "rgba(245,197,24,0.65)", badge: { symbol: "★", color: "#f5c518" }, pulse: false },
  diamond: { label: "Diamond", grad0: "#00d4ff", grad1: "#7c3aed", ring: "#00d4ff", glow: "rgba(0,212,255,0.75)", badge: { symbol: "◆", color: "#00d4ff" }, pulse: true },
};

function NovasparkLogo({ tier }) {
  const t   = TIER_CFG[tier] || TIER_CFG.free;
  const gid = `nsg-${tier}`;
  const rid = `nsr-${tier}`;
  const fid = `nsf-${tier}`;
  return (
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%", display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={t.grad0} />
          <stop offset="100%" stopColor={t.grad1} />
        </linearGradient>
        {tier === "diamond" && (
          <linearGradient id={rid} x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#00d4ff" />
            <stop offset="35%"  stopColor="#7c3aed" />
            <stop offset="70%"  stopColor="#f5c518" />
            <stop offset="100%" stopColor="#00d4ff" />
          </linearGradient>
        )}
        <filter id={fid}>
          <feGaussianBlur stdDeviation={tier === "diamond" ? "2.5" : tier === "free" ? "1.2" : "1.8"} result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx="22" cy="22" r="20" fill={`url(#${gid})`} opacity={tier === "free" ? 0.1 : tier === "diamond" ? 0.22 : 0.16} />
      {(tier === "gold" || tier === "diamond") && (
        <circle cx="22" cy="22" r="21.5" stroke={t.ring} strokeWidth="0.8" fill="none" opacity="0.3" />
      )}
      <circle cx="22" cy="22" r="20" stroke={tier === "diamond" ? `url(#${rid})` : `url(#${gid})`} strokeWidth={tier === "free" ? "1.5" : "2.2"} fill="none" />
      <text x="22" y="28" textAnchor="middle" fontFamily="'Bebas Neue', 'Outfit', sans-serif" fontSize="18" fontWeight="700" fill={`url(#${gid})`} filter={`url(#${fid})`} letterSpacing="1">NS</text>
    </svg>
  );
}

function TierBadge({ tier }) {
  if (tier === "free") return null;
  const t = TIER_CFG[tier];
  return (
    <div style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: "50%", background: "var(--bg, #0a0e14)", border: `1.5px solid ${t.badge.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, lineHeight: 1, color: t.badge.color, fontWeight: 900, pointerEvents: "none", boxShadow: `0 0 5px ${t.glow}` }}>
      {t.badge.symbol}
    </div>
  );
}

// ── NS AI Button ──────────────────────────────────────────────────────────────
function NSAIButton({ onNavigate }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      className="sidebar-btn"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onNavigate("nsai")}
      style={{ position: "relative", overflow: "visible" }}
      title="NS AI — Coming Soon"
    >
      {/* Animated AI icon */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
        style={{ filter: hovered ? "drop-shadow(0 0 6px rgba(0,212,255,0.8))" : "none", transition: "filter 0.3s" }}>
        <defs>
          <linearGradient id="ai-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#00d4ff" />
            <stop offset="50%"  stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#00d4ff" />
          </linearGradient>
        </defs>
        {/* Brain/AI circuit icon */}
        <circle cx="12" cy="12" r="10" stroke="url(#ai-grad)" strokeWidth="1.5" fill="none" opacity="0.5" />
        <circle cx="12" cy="12" r="3"  fill="url(#ai-grad)" opacity="0.9" />
        <line x1="12" y1="2"  x2="12" y2="6"  stroke="url(#ai-grad)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="12" y1="18" x2="12" y2="22" stroke="url(#ai-grad)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="2"  y1="12" x2="6"  y2="12" stroke="url(#ai-grad)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="18" y1="12" x2="22" y2="12" stroke="url(#ai-grad)" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="4.9" y1="4.9" x2="7.8" y2="7.8" stroke="url(#ai-grad)" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="16.2" y1="16.2" x2="19.1" y2="19.1" stroke="url(#ai-grad)" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="19.1" y1="4.9" x2="16.2" y2="7.8" stroke="url(#ai-grad)" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="7.8"  y1="16.2" x2="4.9" y2="19.1" stroke="url(#ai-grad)" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span className="tooltip">NS AI · Coming Soon</span>
      {/* Pulsing dot */}
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

export default function Sidebar({
  page, onNavigate, onSearch, savedList, activeDownloads,
  onReorderSaved, onRemoveSaved, canGoBack, onBack,
  onShowShortcuts, isPremium, onUpgrade,
}) {
  const [dragOver,    setDragOver]    = useState(null);
  const [tooltip,     setTooltip]     = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  const [planId, setPlanId] = useState(() => getCurrentPlan());
  useEffect(() => {
    const handler = () => setPlanId(getCurrentPlan());
    window.addEventListener("ns:plan-changed", handler);
    return () => window.removeEventListener("ns:plan-changed", handler);
  }, []);
  useEffect(() => { setPlanId(getCurrentPlan()); }, [isPremium]);

  const tier    = getPlanTier(planId);
  const tierCfg = TIER_CFG[tier];

  const dragItem = useRef(null);
  const dragNode = useRef(null);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click",       close);
    window.addEventListener("contextmenu", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("contextmenu", close); };
  }, []);

  const handleContextMenu = (e, item) => { e.preventDefault(); e.stopPropagation(); setTooltip(null); setContextMenu({ item, x: e.clientX, y: e.clientY }); };
  const handleDragStart   = (e, index) => { dragItem.current = index; dragNode.current = e.currentTarget; setTimeout(() => { if (dragNode.current) dragNode.current.style.opacity = "0.4"; }, 0); e.dataTransfer.effectAllowed = "move"; };
  const handleDragEnd     = () => { if (dragNode.current) dragNode.current.style.opacity = "1"; dragItem.current = null; dragNode.current = null; setDragOver(null); };
  const handleDragEnter   = (e, index) => { if (dragItem.current === index) return; setDragOver(index); };
  const handleDrop        = (e, dropIndex) => { e.preventDefault(); const from = dragItem.current; if (from === null || from === dropIndex) return; const next = [...savedList]; const [moved] = next.splice(from, 1); next.splice(dropIndex, 0, moved); onReorderSaved(next.map((i) => `${i.media_type}_${i.id}`)); setDragOver(null); };
  const handleDragOver    = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleMouseEnter  = (e, title) => { const rect = e.currentTarget.getBoundingClientRect(); setTooltip({ title, y: rect.top + rect.height / 2 }); };
  const handleMouseLeave  = () => setTooltip(null);

  const logoLabel = tier === "free" ? "Free Plan · Click to upgrade" : `${tierCfg.label} Plan · Click to manage`;

  return (
    <div className="sidebar">
      {/* NS AI pulse animation */}
      <style>{`
        @keyframes ns-ai-pulse {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.5; transform: scale(0.7); }
        }
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
          filter: tier === "silver" ? `drop-shadow(0 0 6px ${tierCfg.glow})` : tier === "gold" ? `drop-shadow(0 0 8px ${tierCfg.glow})` : undefined,
          animation: tier === "diamond" ? "ns-diamond-pulse 2.5s ease-in-out infinite" : "none",
        }}
      >
        <NovasparkLogo tier={tier} />
        <TierBadge tier={tier} />
      </div>

      {canGoBack && <SideBtn onClick={onBack} icon={<BackIcon />} label="Back (Ctrl+Z)" />}
      <SideBtn onClick={onSearch} icon={<SearchIcon />} label="Search (⌘F)" />
      <SideBtn active={page === "home"} onClick={() => onNavigate("home")} icon={<HomeIcon />} label="Home" />
      <SideBtn active={page === "history"} onClick={() => onNavigate("history")} icon={<HistoryIcon />} label="Library & History" />
      <SideBtn active={page === "downloads"} onClick={() => onNavigate("downloads")} icon={<DownloadsQueueIcon />} label="Downloads" badge={activeDownloads > 0 ? activeDownloads : null} />

      {/* ── NS AI Button ── */}
      <NSAIButton onNavigate={onNavigate} />

      <div className="sidebar-sep" />

      {/* Saved thumbnails */}
      <div className="sidebar-saved">
        {savedList.map((item, index) => {
          const key   = `${item.media_type}_${item.id}`;
          const title = item.title || item.name;
          return (
            <div key={key} className={`saved-thumb${dragOver === index ? " drag-over" : ""}`} draggable
              onDragStart={(e) => handleDragStart(e, index)} onDragEnd={handleDragEnd}
              onDragEnter={(e) => handleDragEnter(e, index)} onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() => onNavigate(item.media_type === "tv" ? "tv" : "movie", item)}
              onContextMenu={(e) => handleContextMenu(e, item)}
              onMouseEnter={(e) => handleMouseEnter(e, title)} onMouseLeave={handleMouseLeave}
              style={{ cursor: "grab", position: "relative" }}
            >
              {item.poster_path ? (
                <img src={imgUrl(item.poster_path, "w200")} alt={title} />
              ) : (
                <div className="no-img"><FilmIcon /></div>
              )}
              {dragOver === index && (
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--red)", borderRadius: 2, pointerEvents: "none" }} />
              )}
            </div>
          );
        })}
      </div>

      {tooltip && <div className="saved-thumb-tooltip" style={{ top: tooltip.y }}>{tooltip.title}</div>}

      {contextMenu && (
        <div className="sidebar-context-menu" style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }} onClick={(e) => e.stopPropagation()}>
          <div className="sidebar-context-menu-item" onClick={() => { onRemoveSaved?.(contextMenu.item); setContextMenu(null); }}>Remove</div>
        </div>
      )}

      <div className="sidebar-bottom">
        <SideBtn onClick={onShowShortcuts} icon={<HelpIcon />} label="Help & Shortcuts (?)" />
        <SideBtn active={page === "settings"} onClick={() => onNavigate("settings")} icon={<SettingsIcon />} label="Settings" />
        {window.electron?.quitApp && (
          <button className="sidebar-btn" onClick={() => window.electron.quitApp()} title="Quit App" style={{ color: "#e53e3e", marginTop: 4 }}>
            <QuitIcon /><span className="tooltip">Quit App</span>
          </button>
        )}
      </div>
    </div>
  );
}

function SideBtn({ active, onClick, icon, label, badge }) {
  return (
    <button className={`sidebar-btn ${active ? "active" : ""}`} onClick={onClick} style={{ position: "relative" }}>
      {icon}
      <span className="tooltip">{label}</span>
      {badge && (
        <span style={{ position: "absolute", top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, background: "var(--red)", color: "white", fontSize: 10, fontWeight: 700, lineHeight: "16px", textAlign: "center", padding: "0 4px" }}>{badge}</span>
      )}
    </button>
  );
}