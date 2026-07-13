import { useState, useEffect, useCallback, useRef } from "react";
import {
  setAdminGlobalPlan,
  getAdminGlobalPlan,
  GATES,
  getActivityLog,
  getFeatureUsageSummary,
} from "../utils/gate";
import { secureStorage } from "../utils/storage";

// ── Config ─────────────────────────────────────────────────────────────────────
const NS_ADMIN_EMAIL    = "jokesonyou146@gmail.com";
const NS_ADMIN_PASS     = import.meta.env.VITE_ADMIN_PASSWORD || "";
const ADMIN_SESSION_KEY = "ns_admin_panel_v1";
const PLAN_RANK = { free: 0, mobile: 1, basic: 2, standard: 3, premium: 4 };

const API_BASE =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? window.location.origin
    : "https://novaspark.vercel.app";

const ADMIN_TOKEN = typeof btoa !== "undefined"
  ? btoa(`${NS_ADMIN_EMAIL}:${NS_ADMIN_PASS}`)
  : "";

async function adminFetch(action, params = {}) {
  const url = new URL(`${API_BASE}/api/admin`);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: { "x-admin-token": ADMIN_TOKEN },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function timeSince(ts) {
  if (!ts) return "Never";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${d}d ago`;
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function PlanBadge({ plan }) {
  const C = {
    free:     ["rgba(255,255,255,0.06)", "var(--text3)",  "var(--border)"],
    mobile:   ["rgba(99,149,255,0.1)",   "#6395ff",       "rgba(99,149,255,0.3)"],
    basic:    ["rgba(255,180,80,0.1)",   "#ffb450",       "rgba(255,180,80,0.3)"],
    standard: ["rgba(0,168,225,0.1)",    "#00a8e1",       "rgba(0,168,225,0.3)"],
    premium:  ["rgba(72,199,116,0.1)",   "#48c774",       "rgba(72,199,116,0.3)"],
  }[plan || "free"] || ["rgba(255,255,255,0.06)", "var(--text3)", "var(--border)"];
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8,
      padding: "2px 8px", borderRadius: 4,
      background: C[0], color: C[1], border: `1px solid ${C[2]}`,
    }}>
      {plan || "free"}
    </span>
  );
}

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, padding: "22px 26px", flex: 1, minWidth: 160,
    }}>
      <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
      <div style={{
        fontSize: 38, fontWeight: 900, lineHeight: 1, marginBottom: 5,
        fontVariantNumeric: "tabular-nums",
        color: accent || "var(--text)",
      }}>
        {value ?? <span style={{ opacity: 0.25 }}>—</span>}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--text3)" }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function UsageBar({ label, count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 13 }}>
        <span style={{ color: "var(--text2)" }}>{label}</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>{count}</span>
      </div>
      <div style={{ height: 5, background: "var(--surface2)", borderRadius: 3 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "var(--red)", borderRadius: 3, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

function LiveDot() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: "#48c774", fontWeight: 800, letterSpacing: 1 }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%", background: "#48c774",
        boxShadow: "0 0 0 3px rgba(72,199,116,0.2)",
        animation: "ns-pulse 2s ease-in-out infinite",
        display: "inline-block",
      }} />
      LIVE
    </span>
  );
}

// ── Login Screen ───────────────────────────────────────────────────────────────
function AdminLogin({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [pass,  setPass]  = useState("");
  const [error, setError] = useState("");

  const attempt = () => {
    if (
      email.trim().toLowerCase() === NS_ADMIN_EMAIL.toLowerCase() &&
      pass === NS_ADMIN_PASS
    ) {
      try { sessionStorage.setItem(ADMIN_SESSION_KEY, "1"); } catch {}
      onSuccess();
    } else {
      setError("Invalid credentials");
      setTimeout(() => setError(""), 3000);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "var(--bg)", padding: 24,
    }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 20, padding: "52px 56px", width: 420, maxWidth: "90%",
        boxShadow: "0 40px 100px rgba(0,0,0,0.85)",
      }}>
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 6, color: "var(--red)", marginBottom: 8, textTransform: "uppercase" }}>
          NovaSpark
        </div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 44, letterSpacing: 2, lineHeight: 1, marginBottom: 8 }}>ADMIN</div>
        <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 36, lineHeight: 1.6 }}>
          Restricted access. Authorised personnel only.
        </div>

        {[
          { label: "Email",    type: "email",    ph: "admin@novaspark.app", val: email, set: setEmail },
          { label: "Password", type: "password", ph: "••••••••",           val: pass,  set: setPass  },
        ].map(({ label, type, ph, val, set }, i) => (
          <div key={label} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text3)", marginBottom: 7 }}>
              {label}
            </div>
            <input className="apikey-input" type={type} placeholder={ph}
              value={val} onChange={e => set(e.target.value)}
              onKeyDown={e => e.key === "Enter" && attempt()}
              style={{ width: "100%", marginBottom: 0 }}
              autoFocus={i === 0}
            />
          </div>
        ))}

        {error && (
          <div style={{ fontSize: 13, color: "var(--red)", fontWeight: 600, textAlign: "center", marginBottom: 16, padding: "10px", background: "rgba(229,9,20,0.08)", borderRadius: 8, border: "1px solid rgba(229,9,20,0.2)" }}>
            {error}
          </div>
        )}

        <button className="btn btn-primary" onClick={attempt}
          style={{ width: "100%", padding: "13px", fontSize: 15, fontWeight: 700, marginTop: 8, letterSpacing: 0.5 }}>
          Enter Admin Panel
        </button>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
function AdminDashboard({ onBack }) {
  const [tab,             setTab]           = useState("overview");
  const [stats,           setStats]         = useState(null);
  const [users,           setUsers]         = useState([]);
  const [remoteActivity,  setRemoteActivity]= useState([]);
  const [loading,         setLoading]       = useState(true);
  const [apiError,        setApiError]      = useState(null);
  const [lastRefreshed,   setLastRefreshed] = useState(null);
  const [searchQuery,     setSearchQuery]   = useState("");

  // Settings tab state
  const [globalPlan,    setGlobalPlanState] = useState(() => getAdminGlobalPlan() || "free");
  const [planSaved,     setPlanSaved]       = useState(false);
  const [wyzieKey,      setWyzieKey]        = useState("");
  const [showWyzieKey,  setShowWyzieKey]    = useState(false);
  const [wyzieSaved,    setWyzieSaved]      = useState(false);
  const [wyzieChecking, setWyzieChecking]   = useState(false);
  const [wyzieStatus,   setWyzieStatus]     = useState(null);

  const pollerRef = useRef(null);

  // Local activity (current device)
  const localActivity = getActivityLog();
  const localSummary  = getFeatureUsageSummary();

  const FEATURE_LABELS = {
    watch: "🎬 Watch", download: "⬇️ Download", source_switch: "🔄 Source Switch",
    subtitles: "📝 Subtitles", login: "🔐 Login", search: "🔍 Search",
    pip: "🖼️ Pop-Out", signup: "👤 Sign Up", share: "📤 Share",
  };

  useEffect(() => {
    secureStorage.get("ns_wyzie_global_key").then(val => { if (val) setWyzieKey(val); });
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    const [statsRes, usersRes, actRes] = await Promise.allSettled([
      adminFetch("stats"),
      adminFetch("users"),
      adminFetch("activity"),
    ]);
    if (statsRes.status === "fulfilled") setStats(statsRes.value);
    if (usersRes.status === "fulfilled") setUsers(usersRes.value.users || []);
    if (actRes.status === "fulfilled")   setRemoteActivity(actRes.value.activity || []);
    if (
      statsRes.status === "rejected" &&
      usersRes.status === "rejected" &&
      actRes.status  === "rejected"
    ) {
      setApiError("Cannot reach API — showing local device data only.");
    }
    setLastRefreshed(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    pollerRef.current = setInterval(fetchAll, 30000);
    return () => clearInterval(pollerRef.current);
  }, [fetchAll]);

  const handleSavePlan = () => {
    setAdminGlobalPlan(globalPlan === "free" ? null : globalPlan);
    setPlanSaved(true);
    setTimeout(() => setPlanSaved(false), 2500);
  };

  const handleSaveWyzie = async () => {
    await secureStorage.set("ns_wyzie_global_key", wyzieKey.trim());
    setWyzieSaved(true);
    setTimeout(() => setWyzieSaved(false), 2500);
  };

  const handleTestWyzie = async () => {
    const key = wyzieKey.trim();
    if (!key) { setWyzieStatus({ ok: false, msg: "Enter a key first." }); return; }
    setWyzieChecking(true); setWyzieStatus(null);
    try {
      const res = await fetch(
        `https://sub.wyzie.io/search?id=550&format=srt&key=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      setWyzieStatus(res.ok
        ? { ok: true,  msg: "✓ Key is valid and working." }
        : { ok: false, msg: `✕ Rejected (${res.status}).` }
      );
    } catch {
      setWyzieStatus({ ok: false, msg: "✕ Could not reach Wyzie." });
    }
    setWyzieChecking(false);
  };

  const handleLogout = () => {
    try { sessionStorage.removeItem(ADMIN_SESSION_KEY); } catch {}
    window.location.reload();
  };

  // Merge local + remote activity
  const mergedSummary = { ...localSummary };
  remoteActivity.forEach(a => {
    mergedSummary[a.feature] = (mergedSummary[a.feature] || 0) + 1;
  });
  const summaryEntries = Object.entries(mergedSummary).sort((a, b) => b[1] - a[1]);
  const maxCount = summaryEntries[0]?.[1] || 1;

  const mergedFeed = [
    ...localActivity.map(e => ({ ...e, source: "local" })),
    ...remoteActivity.map(e => ({ ...e, ts: e.ts || new Date(e.created_at).getTime(), source: "remote" })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 60);

  const filteredUsers = searchQuery.trim()
    ? users.filter(u =>
        u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : users;

  const TABS = [
    { id: "overview",  label: "Overview" },
    { id: "users",     label: `Users${users.length ? ` (${users.length})` : ""}` },
    { id: "activity",  label: "Activity" },
    { id: "settings",  label: "Settings" },
  ];

  const PLAN_OPTIONS = [
    { value: "free",     label: "No override"               },
    { value: "mobile",   label: "Mobile"                    },
    { value: "basic",    label: "Basic"                     },
    { value: "standard", label: "Standard"                  },
    { value: "premium",  label: "Premium — unlock everything"},
  ];

  const sRow = {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
    padding: "0 20px",
    alignItems: "center",
    gap: 12,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body)" }}>

      {/* ── Header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 200,
        background: "rgba(16,16,16,0.96)", backdropFilter: "blur(14px)",
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px", height: 56,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", display: "flex", alignItems: "center", gap: 5, fontSize: 13, padding: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back to App
          </button>
          <div style={{ width: 1, height: 18, background: "var(--border)" }} />
          <div style={{ fontFamily: "var(--font-display)", fontSize: 17, letterSpacing: 3 }}>ADMIN PANEL</div>
          <LiveDot />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastRefreshed && (
            <span style={{ fontSize: 11, color: "var(--text3)", fontVariantNumeric: "tabular-nums" }}>
              Updated {timeSince(lastRefreshed)}
            </span>
          )}
          <button className="btn btn-ghost" onClick={fetchAll} disabled={loading}
            style={{ padding: "5px 14px", fontSize: 12, opacity: loading ? 0.5 : 1 }}>
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
          <button className="btn btn-ghost" onClick={handleLogout}
            style={{ padding: "5px 14px", fontSize: 12, color: "var(--text3)" }}>
            Logout
          </button>
        </div>
      </div>

      <div style={{ padding: "40px 40px 80px" }}>

        {/* ── Title ── */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 52, letterSpacing: 1, lineHeight: 1, marginBottom: 6 }}>
            DASHBOARD
          </div>
          <div style={{ fontSize: 13, color: "var(--text3)" }}>
            NovaSpark · Real-time user management &amp; analytics
          </div>
        </div>

        {/* ── API error banner ── */}
        {apiError && (
          <div style={{
            marginBottom: 28, padding: "12px 18px",
            background: "rgba(255,180,80,0.07)", border: "1px solid rgba(255,180,80,0.25)",
            borderRadius: 10, fontSize: 13, color: "#ffb450",
          }}>
            ⚠ {apiError}
          </div>
        )}

        {/* ── Stats Row ── */}
        <div style={{ display: "flex", gap: 16, marginBottom: 40, flexWrap: "wrap" }}>
          <StatCard icon="👥" label="Registered Users" value={stats?.total          ?? "—"} />
          <StatCard icon="⚡" label="Active Today"      value={stats?.activeToday   ?? "—"} accent="var(--red)" />
          <StatCard icon="🆕" label="New This Week"     value={stats?.newThisWeek   ?? "—"} accent="#48c774"
            sub={stats?.newThisWeek ? `+${stats.newThisWeek} signups` : null} />
          <StatCard icon="💎" label="Premium Users"     value={stats?.premium       ?? "—"} accent="#ffb450" />
        </div>

        {/* ── Tab Bar ── */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: 32 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 20px", fontSize: 14,
              fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? "var(--text)" : "var(--text3)",
              borderBottom: `2px solid ${tab === t.id ? "var(--red)" : "transparent"}`,
              marginBottom: -1, transition: "color 0.15s, border-color 0.15s",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 1100 }}>

            {/* Feature Usage */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "26px 30px" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Feature Usage</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 22 }}>Most-used features this session</div>
              {summaryEntries.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text3)", padding: "16px 0", lineHeight: 1.7 }}>
                  No activity recorded yet. Usage appears here as users interact with the app.
                </div>
              ) : summaryEntries.slice(0, 8).map(([f, count]) => (
                <UsageBar key={f} label={FEATURE_LABELS[f] || f} count={count} max={maxCount} />
              ))}
            </div>

            {/* Recent Signups */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "26px 30px" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Recent Signups</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 22 }}>Latest registered users</div>
              {users.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text3)", padding: "16px 0", lineHeight: 1.7 }}>
                  {apiError ? "Connect to API to see users." : "No registered users yet."}
                </div>
              ) : users.slice(0, 8).map(u => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                    background: "var(--surface2)", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, color: "var(--red)",
                  }}>
                    {(u.display_name || u.email || "?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {u.display_name || u.email}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>Joined {timeSince(u.created_at)}</div>
                  </div>
                  <PlanBadge plan={u.plan} />
                </div>
              ))}
            </div>

            {/* Live Activity Feed — full width */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "26px 30px", gridColumn: "1 / -1" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Live Activity Feed</div>
                <LiveDot />
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 22 }}>
                Auto-refreshes every 30 seconds · Showing {Math.min(mergedFeed.length, 12)} most recent events
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                {mergedFeed.slice(0, 12).map((e, i) => (
                  <div key={i} style={{
                    background: "var(--surface2)", border: "1px solid var(--border)",
                    borderRadius: 10, padding: "12px 14px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "var(--red)", textTransform: "uppercase", letterSpacing: 0.8 }}>
                        {FEATURE_LABELS[e.feature] || e.feature}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text3)" }}>{timeSince(new Date(e.ts))}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.meta?.title || e.meta?.query || (e.meta ? JSON.stringify(e.meta).slice(0, 50) : "—")}
                    </div>
                  </div>
                ))}
                {mergedFeed.length === 0 && (
                  <div style={{ fontSize: 13, color: "var(--text3)", padding: "8px 0", gridColumn: "1/-1" }}>
                    No activity yet. Data appears here automatically as users interact.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ USERS TAB ═══════════════ */}
        {tab === "users" && (
          <div style={{ maxWidth: 1100 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
              <input className="apikey-input"
                placeholder="Search email or name…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ maxWidth: 320, marginBottom: 0 }}
              />
              <span style={{ fontSize: 13, color: "var(--text3)" }}>
                {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
              </span>
            </div>

            {filteredUsers.length === 0 ? (
              <div style={{ padding: "80px 0", textAlign: "center", color: "var(--text3)", fontSize: 14 }}>
                {apiError ? "⚠ API unreachable — deploy api/admin.js to Vercel" : "No users yet"}
              </div>
            ) : (
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
                {/* Header */}
                <div style={{
                  ...sRow,
                  height: 42, background: "var(--surface2)",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--text3)",
                }}>
                  <span>User</span><span>Plan</span><span>Joined</span><span>Last Active</span><span>Status</span>
                </div>
                {/* Rows */}
                {filteredUsers.map(u => {
                  const isActive  = u.last_active && (Date.now() - new Date(u.last_active).getTime()) < 86400000;
                  const isExpired = u.subExpires && u.subExpires < Date.now();
                  return (
                    <div key={u.id} style={{
                      ...sRow, minHeight: 56,
                      borderBottom: "1px solid var(--border)",
                      transition: "background 0.1s",
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                          background: "var(--surface2)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 13, fontWeight: 700, color: "var(--red)",
                        }}>
                          {(u.display_name || u.email || "?")[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {u.display_name || "—"}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {u.email}
                          </div>
                        </div>
                      </div>
                      <PlanBadge plan={u.plan} />
                      <span style={{ fontSize: 12, color: "var(--text3)" }}>{fmtDate(u.created_at)}</span>
                      <span style={{ fontSize: 12, color: isActive ? "#48c774" : "var(--text3)" }}>
                        {timeSince(u.last_active)}
                      </span>
                      <span style={{
                        display: "inline-block",
                        fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 4,
                        textTransform: "uppercase", letterSpacing: 0.5,
                        background: isExpired ? "rgba(229,9,20,0.1)" : isActive ? "rgba(72,199,116,0.1)" : "rgba(255,255,255,0.05)",
                        color: isExpired ? "var(--red)" : isActive ? "#48c774" : "var(--text3)",
                        border: `1px solid ${isExpired ? "rgba(229,9,20,0.25)" : isActive ? "rgba(72,199,116,0.25)" : "var(--border)"}`,
                      }}>
                        {isExpired ? "Expired" : isActive ? "Online" : "Offline"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ ACTIVITY TAB ═══════════════ */}
        {tab === "activity" && (
          <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 24, maxWidth: 1100 }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "26px 30px" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Feature Breakdown</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 22 }}>Sorted by usage</div>
              {summaryEntries.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.7 }}>No activity yet.</div>
              ) : summaryEntries.map(([f, count]) => (
                <UsageBar key={f} label={FEATURE_LABELS[f] || f} count={count} max={maxCount} />
              ))}
            </div>

            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "26px 30px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>Full Activity Log</div>
                <LiveDot />
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 22 }}>
                Auto-refreshes every 30s · {mergedFeed.length} events
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 520, overflowY: "auto" }}>
                {mergedFeed.map((e, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "9px 14px", background: "var(--surface2)",
                    border: "1px solid var(--border)", borderRadius: 8,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "var(--red)", textTransform: "uppercase", minWidth: 90, letterSpacing: 0.5 }}>
                      {e.feature}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, color: "var(--text2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.meta?.title || e.meta?.query || (e.meta ? JSON.stringify(e.meta).slice(0, 60) : "—")}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text3)", flexShrink: 0 }}>{timeSince(new Date(e.ts))}</span>
                  </div>
                ))}
                {mergedFeed.length === 0 && (
                  <div style={{ fontSize: 13, color: "var(--text3)", padding: "24px 0" }}>No activity recorded yet.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ SETTINGS TAB ═══════════════ */}
        {tab === "settings" && (
          <div style={{ maxWidth: 720 }}>
            {/* Global Plan Floor */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "28px 32px", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Global Feature Access</div>
              <div style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.7, marginBottom: 22 }}>
                Set a minimum plan for all users. When active, every user gets at least this level of access regardless of their subscription.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {PLAN_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setGlobalPlanState(opt.value)}
                    className={globalPlan === opt.value ? "btn btn-primary" : "btn btn-ghost"}
                    style={{ padding: "7px 16px", fontSize: 13 }}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {globalPlan !== "free" && (
                <div style={{ marginBottom: 18, padding: "12px 16px", background: "rgba(72,199,116,0.06)", border: "1px solid rgba(72,199,116,0.2)", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#48c774", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>
                    Unlocked for all users:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Object.entries(GATES)
                      .filter(([, g]) => (PLAN_RANK[g.required] ?? 999) <= (PLAN_RANK[globalPlan] ?? 0))
                      .map(([key, g]) => (
                        <span key={key} style={{
                          fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 700,
                          background: "rgba(72,199,116,0.1)", color: "#48c774", border: "1px solid rgba(72,199,116,0.2)",
                        }}>
                          ✓ {g.label}
                        </span>
                      ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button className="btn btn-primary" onClick={handleSavePlan}>Save Plan Floor</button>
                {planSaved && <span style={{ fontSize: 13, color: "#48c774", fontWeight: 600 }}>✓ Active for all users</span>}
              </div>
            </div>

            {/* Wyzie Key */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "28px 32px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
                Wyzie Subtitle API Key
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 4,
                  background: wyzieKey.trim() ? "rgba(72,199,116,0.12)" : "rgba(255,180,80,0.12)",
                  color: wyzieKey.trim() ? "#48c774" : "#ffb450",
                  border: `1px solid ${wyzieKey.trim() ? "rgba(72,199,116,0.3)" : "rgba(255,180,80,0.3)"}`,
                }}>
                  {wyzieKey.trim() ? "ACTIVE" : "NOT SET"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.7, marginBottom: 22 }}>
                Applied globally for all subtitle downloads across every user session.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: wyzieStatus ? 12 : 0 }}>
                <input className="apikey-input"
                  type={showWyzieKey ? "text" : "password"}
                  placeholder="wyzie-..."
                  value={wyzieKey}
                  onChange={e => { setWyzieKey(e.target.value); setWyzieStatus(null); }}
                  style={{ flex: 1, minWidth: 220, marginBottom: 0 }}
                />
                <button className="btn btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }} onClick={() => setShowWyzieKey(v => !v)}>
                  {showWyzieKey ? "Hide" : "Show"}
                </button>
                <button className="btn btn-ghost" style={{ padding: "7px 12px", fontSize: 12 }} disabled={wyzieChecking} onClick={handleTestWyzie}>
                  {wyzieChecking ? "Testing…" : "Test Key"}
                </button>
                <button className="btn btn-primary" onClick={handleSaveWyzie}>Save Key</button>
                {wyzieSaved && <span style={{ fontSize: 13, color: "#48c774", fontWeight: 600 }}>✓ Saved</span>}
              </div>
              {wyzieStatus && (
                <div style={{
                  marginTop: 10, fontSize: 13, fontWeight: 500,
                  color: wyzieStatus.ok ? "#48c774" : "var(--red)",
                  padding: "9px 14px", borderRadius: 8,
                  background: wyzieStatus.ok ? "rgba(72,199,116,0.08)" : "rgba(229,9,20,0.08)",
                  border: `1px solid ${wyzieStatus.ok ? "rgba(72,199,116,0.25)" : "rgba(229,9,20,0.2)"}`,
                }}>
                  {wyzieStatus.msg}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes ns-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}

// ── Entry Point ────────────────────────────────────────────────────────────────
export default function AdminPage({ onBack }) {
  const [authed, setAuthed] = useState(() => {
    try { return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1"; } catch { return false; }
  });

  if (!authed) return <AdminLogin onSuccess={() => setAuthed(true)} />;
  return <AdminDashboard onBack={onBack} />;
}