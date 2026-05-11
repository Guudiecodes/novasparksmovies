import { useState, useRef, useEffect } from "react";
import { imgUrl } from "../utils/api";
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

// ── NovaSpark inline logo — replaces StreambertLogo ─────────────────────────
function NovasparkLogo() {
  return (
    <svg
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <defs>
        <linearGradient id="ns-grad" x1="0" y1="0" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%"  stopColor="#00a8e1" />
          <stop offset="100%" stopColor="#0076b0" />
        </linearGradient>
        <filter id="ns-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Background circle */}
      <circle cx="22" cy="22" r="20" fill="url(#ns-grad)" opacity="0.15" />
      <circle cx="22" cy="22" r="20" stroke="url(#ns-grad)" strokeWidth="1.5" fill="none" />
      {/* NS text */}
      <text
        x="22"
        y="28"
        textAnchor="middle"
        fontFamily="'Bebas Neue', sans-serif"
        fontSize="18"
        fontWeight="700"
        fill="url(#ns-grad)"
        filter="url(#ns-glow)"
        letterSpacing="1"
      >
        NS
      </text>
    </svg>
  );
}

export default function Sidebar({
  page,
  onNavigate,
  onSearch,
  savedList,
  activeDownloads,
  onReorderSaved,
  onRemoveSaved,
  canGoBack,
  onBack,
  onShowShortcuts,
}) {
  const [dragOver, setDragOver] = useState(null);
  const dragItem = useRef(null);
  const dragNode = useRef(null);

  const [tooltip, setTooltip] = useState(null); // { title, y }
  const [contextMenu, setContextMenu] = useState(null); // { item, x, y }

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, []);

  const handleContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setTooltip(null);
    setContextMenu({ item, x: e.clientX, y: e.clientY });
  };

  const handleDragStart = (e, index) => {
    dragItem.current = index;
    dragNode.current = e.currentTarget;
    setTimeout(() => {
      if (dragNode.current) dragNode.current.style.opacity = "0.4";
    }, 0);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    if (dragNode.current) dragNode.current.style.opacity = "1";
    dragItem.current = null;
    dragNode.current = null;
    setDragOver(null);
  };

  const handleDragEnter = (e, index) => {
    if (dragItem.current === index) return;
    setDragOver(index);
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const fromIndex = dragItem.current;
    if (fromIndex === null || fromIndex === dropIndex) return;

    const newList = [...savedList];
    const [moved] = newList.splice(fromIndex, 1);
    newList.splice(dropIndex, 0, moved);

    const newOrder = newList.map((item) => `${item.media_type}_${item.id}`);
    onReorderSaved(newOrder);
    setDragOver(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleMouseEnter = (e, title) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ title, y: rect.top + rect.height / 2 });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div className="sidebar">
      {/* ── NovaSpark logo ── */}
      <div
        className="sidebar-logo"
        onClick={() => onNavigate("home")}
        title="NovaSpark"
      >
        <NovasparkLogo />
      </div>

      {canGoBack && (
        <SideBtn onClick={onBack} icon={<BackIcon />} label="Back (Ctrl+Z)" />
      )}

      <SideBtn onClick={onSearch} icon={<SearchIcon />} label="Search  (⌘F)" />
      <SideBtn
        active={page === "home"}
        onClick={() => onNavigate("home")}
        icon={<HomeIcon />}
        label="Home"
      />
      <SideBtn
        active={page === "history"}
        onClick={() => onNavigate("history")}
        icon={<HistoryIcon />}
        label="Library & History"
      />
      <SideBtn
        active={page === "downloads"}
        onClick={() => onNavigate("downloads")}
        icon={<DownloadsQueueIcon />}
        label="Downloads"
        badge={activeDownloads > 0 ? activeDownloads : null}
      />

      <div className="sidebar-sep" />

      <div className="sidebar-saved">
        {savedList.map((item, index) => {
          const key = `${item.media_type}_${item.id}`;
          const title = item.title || item.name;
          return (
            <div
              key={key}
              className={`saved-thumb${dragOver === index ? " drag-over" : ""}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              onDragEnter={(e) => handleDragEnter(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() =>
                onNavigate(item.media_type === "tv" ? "tv" : "movie", item)
              }
              onContextMenu={(e) => handleContextMenu(e, item)}
              onMouseEnter={(e) => handleMouseEnter(e, title)}
              onMouseLeave={handleMouseLeave}
              style={{ cursor: "grab", position: "relative" }}
            >
              {item.poster_path ? (
                <img src={imgUrl(item.poster_path, "w200")} alt={title} />
              ) : (
                <div className="no-img">
                  <FilmIcon />
                </div>
              )}
              {dragOver === index && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 3,
                    background: "var(--red)",
                    borderRadius: 2,
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {tooltip && (
        <div className="saved-thumb-tooltip" style={{ top: tooltip.y }}>
          {tooltip.title}
        </div>
      )}

      {contextMenu && (
        <div
          className="sidebar-context-menu"
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="sidebar-context-menu-item"
            onClick={() => {
              onRemoveSaved && onRemoveSaved(contextMenu.item);
              setContextMenu(null);
            }}
          >
            Remove
          </div>
        </div>
      )}

      <div className="sidebar-bottom">
        <SideBtn
          onClick={onShowShortcuts}
          icon={<HelpIcon />}
          label="Help & Shortcuts (?)"
        />
        <SideBtn
          active={page === "settings"}
          onClick={() => onNavigate("settings")}
          icon={<SettingsIcon />}
          label="Settings"
        />
        {/* Only show Quit in Electron desktop mode */}
        {window.electron?.quitApp && (
          <button
            className="sidebar-btn"
            onClick={() => window.electron.quitApp()}
            title="Quit App"
            style={{ color: "#e53e3e", marginTop: 4 }}
          >
            <QuitIcon />
            <span className="tooltip">Quit App</span>
          </button>
        )}
      </div>
    </div>
  );
}

function SideBtn({ active, onClick, icon, label, badge }) {
  return (
    <button
      className={`sidebar-btn ${active ? "active" : ""}`}
      onClick={onClick}
      style={{ position: "relative" }}
    >
      {icon}
      <span className="tooltip">{label}</span>
      {badge && (
        <span
          style={{
            position: "absolute",
            top: 4,
            right: 4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            background: "var(--red)",
            color: "white",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: "16px",
            textAlign: "center",
            padding: "0 4px",
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}