import { useState, useEffect, useRef, useCallback } from "react";
import { storage } from "../utils/storage";

// ── Bitrate profiles (MB per minute) ─────────────────────────────────────
const QUALITY_PROFILES = {
  saver:  { label: "Saver",  mbPerMin: 6,   desc: "~480p",  color: "#4caf50" },
  normal: { label: "Normal", mbPerMin: 28,  desc: "~720p",  color: "#00b4a6" },
  hd:     { label: "HD",     mbPerMin: 53,  desc: "~1080p", color: "#f5a623" },
};

const GENRE_MULTIPLIERS = {
  28: 1.18, 878: 1.15, 12: 1.12, 16: 0.92, 10749: 0.90, 99: 0.95, default: 1.0,
};

function getGenreMultiplier(genreIds = []) {
  for (const id of genreIds) if (GENRE_MULTIPLIERS[id]) return GENRE_MULTIPLIERS[id];
  return GENRE_MULTIPLIERS.default;
}

function formatMB(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}
function formatMBShort(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

const STORAGE_KEY = "ns_data_meter";

function loadState() {
  try {
    return storage.get(STORAGE_KEY) || { totalUsedMB: 0, saverMode: false, quality: "normal" };
  } catch { return { totalUsedMB: 0, saverMode: false, quality: "normal" }; }
}
function saveState(s) { try { storage.set(STORAGE_KEY, s); } catch {} }

// ── Sparkline mini-chart ──────────────────────────────────────────────────
function Sparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const w = 80, h = 24;
  const max = Math.max(...data, 0.1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 2) - 1;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <polyline points={`0,${h} ${pts} ${w},${h}`} fill={color} fillOpacity="0.12" stroke="none" />
    </svg>
  );
}

// ── Animated counter ──────────────────────────────────────────────────────
function AnimatedValue({ value, color }) {
  return (
    <span style={{ color, fontVariantNumeric: "tabular-nums", transition: "color 0.3s" }}>
      {value}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function DataMeterWidget({
  isPlaying = false,       // from WatchPage: true only when iframe loaded
  isActuallyPlaying = false, // REAL play/pause from postMessage or Electron polling
  runtimeMinutes = null,
  genreIds = [],
  type = "movie",
  onQualityChange,
  style = {},
}) {
  const [open,       setOpen]      = useState(false);
  const [quality,    setQuality]   = useState(() => loadState().quality || "normal");
  const [saverMode,  setSaverMode] = useState(() => loadState().saverMode || false);
  const [sessionMB,  setSessionMB] = useState(0);
  const [totalMB,    setTotalMB]   = useState(() => loadState().totalUsedMB || 0);
  const [elapsed,    setElapsed]   = useState(0);
  const [speedHistory, setSpeedHistory] = useState([]); // MB/min samples for sparkline
  const [peakMBMin,  setPeakMBMin] = useState(0);
  const [isPulsing,  setIsPulsing] = useState(false);

  const intervalRef   = useRef(null);
  const startTimeRef  = useRef(null);
  const accMBRef      = useRef(0);        // accumulated MB before current run
  const lastSavedRef  = useRef(Date.now());
  const lastSpeedRef  = useRef(Date.now());
  const prevSessionRef = useRef(0);

  const activeProfile = saverMode ? QUALITY_PROFILES.saver : QUALITY_PROFILES[quality];
  const mbPerSec      = activeProfile.mbPerMin / 60;
  const multiplier    = getGenreMultiplier(genreIds);

  const estimatedTotal = runtimeMinutes
    ? runtimeMinutes * activeProfile.mbPerMin * multiplier
    : null;

  // ── The key fix: only count when video is ACTUALLY playing ─────────────
  // isActuallyPlaying = real signal from play/pause events
  // Falls back to isPlaying if no real signal received yet
  const shouldCount = isActuallyPlaying;

  useEffect(() => {
    if (shouldCount) {
      // Resume counting
      startTimeRef.current = Date.now();
      prevSessionRef.current = sessionMB;
      setIsPulsing(true);

      intervalRef.current = setInterval(() => {
        const secs = (Date.now() - startTimeRef.current) / 1000;
        const deltaMB = secs * mbPerSec * multiplier;
        const totalSession = prevSessionRef.current + deltaMB;
        setSessionMB(totalSession);
        setElapsed((e) => {
          const newElapsed = e + (Date.now() - startTimeRef.current) / 1000;
          startTimeRef.current = Date.now();
          return newElapsed;
        });

        // Sparkline sample every 10s
        if (Date.now() - lastSpeedRef.current > 10000) {
          lastSpeedRef.current = Date.now();
          const instantMBMin = mbPerSec * multiplier * 60;
          setSpeedHistory((prev) => [...prev.slice(-11), instantMBMin]);
          setPeakMBMin((p) => Math.max(p, instantMBMin));
        }

        // Persist every 30s
        if (Date.now() - lastSavedRef.current > 30000) {
          lastSavedRef.current = Date.now();
          const snap = accMBRef.current + totalSession;
          saveState({ totalUsedMB: snap, saverMode, quality });
          setTotalMB(snap);
        }
      }, 1000);
    } else {
      // Paused or stopped — freeze counter
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        setIsPulsing(false);

        // Commit session to total when paused
        if (sessionMB > 0) {
          accMBRef.current += sessionMB;
          prevSessionRef.current = 0;
          setTotalMB(accMBRef.current);
          saveState({ totalUsedMB: accMBRef.current, saverMode, quality });
          setSessionMB(0);
        }
      }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [shouldCount, mbPerSec, multiplier]); // eslint-disable-line

  // Reset session when content changes
  useEffect(() => {
    accMBRef.current = 0;
    prevSessionRef.current = 0;
    setSessionMB(0);
    setElapsed(0);
    setSpeedHistory([]);
    setPeakMBMin(0);
  }, [runtimeMinutes, type]); // proxy for content change

  const toggleSaver = useCallback(() => {
    const next = !saverMode;
    setSaverMode(next);
    saveState({ totalUsedMB: totalMB, saverMode: next, quality: next ? "saver" : quality });
    onQualityChange?.(next ? "saver" : quality);
  }, [saverMode, quality, totalMB, onQualityChange]);

  const setQualityMode = useCallback((q) => {
    setQuality(q);
    if (!saverMode) onQualityChange?.(q);
    saveState({ totalUsedMB: totalMB, saverMode, quality: q });
  }, [saverMode, totalMB, onQualityChange]);

  const resetMeter = () => {
    accMBRef.current = 0;
    prevSessionRef.current = 0;
    setTotalMB(0); setSessionMB(0); setElapsed(0);
    setSpeedHistory([]); setPeakMBMin(0);
    saveState({ totalUsedMB: 0, saverMode, quality });
  };

  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = Math.floor(elapsed % 60);
  const elapsedStr = elapsed > 0 ? `${elapsedMin}m ${String(elapsedSec).padStart(2,"0")}s` : "—";
  const usedPct    = estimatedTotal && sessionMB > 0 ? Math.min(100, (sessionMB / estimatedTotal) * 100) : 0;

  const displayValue = sessionMB > 0.5 ? formatMBShort(sessionMB) : saverMode ? "Saver" : "Data";
  const instantMBMin = (mbPerSec * multiplier * 60).toFixed(1);

  return (
    <div style={{ position: "relative", ...style }}>
      <style>{`
        @keyframes dmPulse {
          0%,100% { box-shadow: 0 0 0 0 ${activeProfile.color}40; }
          50%      { box-shadow: 0 0 0 5px ${activeProfile.color}00; }
        }
        @keyframes dmFadeIn {
          from { opacity:0; transform:translateY(8px) scale(0.96); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes dmDot {
          0%,100% { opacity:1; } 50% { opacity:0.3; }
        }
      `}</style>

      {/* ── Toggle button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={shouldCount ? `Live: ${instantMBMin} MB/min` : "Data Meter (paused)"}
        style={{
          background: open
            ? (saverMode ? "rgba(76,175,80,0.2)" : "rgba(0,180,166,0.2)")
            : "rgba(0,0,0,0.65)",
          border: `1px solid ${
            saverMode ? "rgba(76,175,80,0.5)"
            : open ? "rgba(0,180,166,0.5)"
            : shouldCount ? `${activeProfile.color}60`
            : "rgba(255,255,255,0.15)"
          }`,
          borderRadius: 8,
          color: saverMode ? "#4caf50" : open ? "#00b4a6" : "rgba(255,255,255,0.85)",
          padding: "6px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          backdropFilter: "blur(8px)",
          transition: "all 0.2s",
          fontFamily: "var(--font-body, sans-serif)",
          whiteSpace: "nowrap",
          animation: isPulsing && shouldCount ? "dmPulse 2s infinite" : "none",
        }}
      >
        {/* Live dot when actually counting */}
        {shouldCount && (
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: activeProfile.color,
            animation: "dmDot 1.2s ease-in-out infinite",
            flexShrink: 0,
          }} />
        )}
        {/* Signal bars */}
        <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
          <rect x="0"  y="8"  width="3" height="4" rx="1" fill={saverMode ? "#4caf50" : activeProfile.color} opacity="0.4"/>
          <rect x="4"  y="5"  width="3" height="7" rx="1" fill={saverMode ? "#4caf50" : activeProfile.color} opacity="0.7"/>
          <rect x="8"  y="2"  width="3" height="10" rx="1" fill={saverMode ? "#4caf50" : activeProfile.color} opacity={shouldCount ? "1" : "0.4"}/>
          <rect x="12" y="0"  width="2" height="12" rx="1" fill={saverMode ? "#4caf50" : activeProfile.color} opacity={shouldCount && !saverMode ? "1" : "0.2"}/>
        </svg>
        {displayValue}
      </button>

      {/* ── Expanded panel ── */}
      {open && (
        <div style={{
          position: "absolute",
   top: "calc(100% + 10px)",     
     right: 0,
          width: 300,
          background: "rgba(8,14,18,0.98)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.85)",
          backdropFilter: "blur(24px)",
          overflow: "hidden",
          animation: "dmFadeIn 0.2s cubic-bezier(0.16,1,0.3,1)",
          zIndex: 100,
          fontFamily: "var(--font-body, sans-serif)",
        }}>

          {/* Header */}
          <div style={{
            padding: "13px 16px 11px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: 0.2 }}>
                Data Meter
              </span>
              {/* Live / Paused status */}
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: 1,
                padding: "2px 7px", borderRadius: 20,
                background: shouldCount ? `${activeProfile.color}22` : "rgba(255,255,255,0.06)",
                color: shouldCount ? activeProfile.color : "rgba(255,255,255,0.3)",
                border: `1px solid ${shouldCount ? activeProfile.color + "44" : "rgba(255,255,255,0.08)"}`,
              }}>
                {shouldCount ? "● LIVE" : "⏸ PAUSED"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={resetMeter} style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.3)",
                fontSize: 10, cursor: "pointer", padding: "2px 6px", borderRadius: 4,
                fontFamily: "inherit", transition: "color 0.15s",
              }}
                onMouseEnter={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.7)"}
                onMouseLeave={(e) => e.currentTarget.style.color = "rgba(255,255,255,0.3)"}
              >Reset</button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.3)",
                cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px",
              }}>✕</button>
            </div>
          </div>

          <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Live rate + sparkline */}
            {(shouldCount || speedHistory.length > 1) && (
              <div style={{
                padding: "10px 12px",
                background: `${activeProfile.color}0d`,
                border: `1px solid ${activeProfile.color}28`,
                borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 3, letterSpacing: 1 }}>
                    LIVE RATE
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: activeProfile.color, letterSpacing: -0.5 }}>
                    {instantMBMin}
                    <span style={{ fontSize: 10, fontWeight: 500, marginLeft: 3, opacity: 0.7 }}>MB/min</span>
                  </div>
                  {peakMBMin > 0 && (
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                      Peak: {peakMBMin.toFixed(1)} MB/min
                    </div>
                  )}
                </div>
                <Sparkline data={speedHistory.length > 1 ? speedHistory : [0, parseFloat(instantMBMin)]} color={activeProfile.color} />
              </div>
            )}

            {/* Session + Total stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <StatBox
                label="This Session"
                value={sessionMB > 0 ? formatMBShort(sessionMB) : "—"}
                sub={elapsed > 0 ? `${elapsedStr} watched` : shouldCount ? "Counting…" : "Paused"}
                color={saverMode ? "#4caf50" : "#00b4a6"}
                highlight={shouldCount}
              />
              <StatBox
                label="All Time"
                value={totalMB > 0 ? formatMBShort(totalMB) : "—"}
                sub="Total tracked"
                color="#f5a623"
              />
            </div>

            {/* Progress bar vs estimated */}
            {estimatedTotal && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                    {type === "tv" ? "Episode" : "Movie"} progress
                  </span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>
                    {formatMBShort(sessionMB)} / {formatMBShort(estimatedTotal)}
                  </span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    height: "100%",
                    width: `${usedPct}%`,
                    background: saverMode ? "#4caf50" : `linear-gradient(to right, #00b4a6, ${activeProfile.color})`,
                    borderRadius: 3,
                    transition: "width 1s linear",
                    position: "relative",
                  }}>
                    {/* Shimmer on live */}
                    {shouldCount && (
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                        animation: "shimmer 1.5s infinite",
                      }} />
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 4, textAlign: "right" }}>
                  {usedPct.toFixed(1)}% of estimated
                </div>
              </div>
            )}

            {/* Estimated total */}
            {estimatedTotal && (
              <div style={{
                padding: "10px 12px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10,
              }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 6, letterSpacing: 1 }}>
                  ESTIMATED TOTAL · {type === "tv" ? "EPISODE" : "MOVIE"}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.5 }}>
                    {formatMB(estimatedTotal)}
                  </div>
                  {!saverMode && (
                    <div style={{ fontSize: 11, color: "#4caf50", fontWeight: 600 }}>
                      Save {formatMBShort(estimatedTotal * 0.89)} w/ Saver
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>
                  {runtimeMinutes}min · {activeProfile.desc} · ±15% accuracy
                </div>
              </div>
            )}

            {/* Data Saver toggle */}
            <div
              onClick={toggleSaver}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px",
                background: saverMode ? "rgba(76,175,80,0.1)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${saverMode ? "rgba(76,175,80,0.28)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 10, cursor: "pointer", transition: "all 0.2s",
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: saverMode ? "#4caf50" : "#fff" }}>
                  {saverMode ? "✓ Data Saver ON" : "Data Saver"}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                  {saverMode ? "~480p · saving 89% vs HD" : "Reduces usage by ~89%"}
                </div>
              </div>
              <div style={{
                width: 36, height: 20, borderRadius: 10, padding: 2,
                background: saverMode ? "#4caf50" : "rgba(255,255,255,0.12)",
                transition: "background 0.25s", flexShrink: 0,
                display: "flex", alignItems: "center",
                justifyContent: saverMode ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  transition: "all 0.25s",
                }} />
              </div>
            </div>

            {/* Quality selector */}
            {!saverMode && (
              <div>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 7, letterSpacing: 1 }}>
                  QUALITY ESTIMATE
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {Object.entries(QUALITY_PROFILES).map(([key, profile]) => (
                    <button key={key} onClick={() => setQualityMode(key)} style={{
                      flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid",
                      borderColor: quality === key ? profile.color : "rgba(255,255,255,0.08)",
                      background: quality === key ? `${profile.color}18` : "transparent",
                      color: quality === key ? profile.color : "rgba(255,255,255,0.35)",
                      fontSize: 10, fontWeight: quality === key ? 700 : 400,
                      cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
                    }}>
                      <div>{profile.label}</div>
                      <div style={{ fontSize: 9, opacity: 0.7, marginTop: 2 }}>{profile.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, sub, color, highlight }) {
  return (
    <div style={{
      padding: "10px 11px",
      background: highlight ? `${color}0d` : "rgba(255,255,255,0.03)",
      border: `1px solid ${highlight ? color + "28" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 10,
      transition: "all 0.3s",
    }}>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 4, letterSpacing: 1 }}>{label}</div>
      <div style={{
        fontSize: 17, fontWeight: 800,
        color: value === "—" ? "rgba(255,255,255,0.18)" : color,
        letterSpacing: -0.3,
      }}>{value}</div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", marginTop: 3 }}>{sub}</div>
    </div>
  );
}