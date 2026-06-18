import { useState, useEffect } from "react";

const API_BASE =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? window.location.origin
    : "http://localhost:3000";

export default function AdminLoginPage({ onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    document.title = "NovaSpark Admin";
  }, []);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError("All fields required.");
      triggerShake();
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, action: "login" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed.");
        triggerShake();
        return;
      }

      if (!data.user?.is_admin) {
        setError("Access denied. Admins only.");
        triggerShake();
        return;
      }

      localStorage.setItem("ns_user", JSON.stringify(data.user));
      localStorage.setItem("ns_admin", "true");
      onSuccess?.(data.user);
    } catch {
      setError("Server unreachable.");
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.bg} />

      <div style={{ ...styles.panel, animation: shake ? "shake 0.4s ease" : "none" }}>
        {/* Header bar */}
        <div style={styles.topBar}>
          <span style={styles.dot} />
          <span style={styles.dot} />
          <span style={styles.dot} />
          <span style={styles.barLabel}>RESTRICTED ACCESS</span>
        </div>

        {/* Logo area */}
        <div style={styles.logoRow}>
          <div style={styles.shieldIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z"
                fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1.5" />
              <path d="M9 12l2 2 4-4" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div style={styles.brand}>NOVASPARK</div>
            <div style={styles.subtitle}>Admin Control Panel</div>
          </div>
        </div>

        <div style={styles.divider} />

        {/* Form */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>ADMIN EMAIL</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="admin@novasparks.xyz"
            style={styles.input}
            autoFocus
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>PASSWORD</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="••••••••"
            style={styles.input}
          />
        </div>

        {error && (
          <div style={styles.error}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10" stroke="#f87171" strokeWidth="1.5" />
              <path d="M12 8v4M12 16h.01" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
        >
          {loading ? (
            <span style={styles.spinner} />
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Authenticate
            </>
          )}
        </button>

        <div style={styles.footer}>
          <a href="/" style={styles.backLink}>← Back to NovaSpark</a>
          <span style={styles.version}>v4.0.4</span>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 30px #0d1117 inset !important;
          -webkit-text-fill-color: #e2e8f0 !important;
        }
      `}</style>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#060a0f",
    zIndex: 9999,
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  bg: {
    position: "absolute",
    inset: 0,
    background: `
      radial-gradient(ellipse 60% 40% at 20% 20%, rgba(245,158,11,0.06) 0%, transparent 60%),
      radial-gradient(ellipse 40% 60% at 80% 80%, rgba(245,158,11,0.04) 0%, transparent 60%)
    `,
    pointerEvents: "none",
  },
  panel: {
    position: "relative",
    width: "100%",
    maxWidth: 400,
    background: "#0d1117",
    border: "1px solid rgba(245,158,11,0.15)",
    borderRadius: 12,
    overflow: "hidden",
    boxShadow: "0 0 0 1px rgba(245,158,11,0.05), 0 24px 64px rgba(0,0,0,0.6)",
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 16px",
    background: "rgba(245,158,11,0.04)",
    borderBottom: "1px solid rgba(245,158,11,0.1)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "rgba(245,158,11,0.3)",
    display: "inline-block",
  },
  barLabel: {
    marginLeft: "auto",
    fontSize: 9,
    letterSpacing: "0.2em",
    color: "rgba(245,158,11,0.5)",
    fontWeight: 600,
    fontFamily: "monospace",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "24px 24px 16px",
  },
  shieldIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: "rgba(245,158,11,0.08)",
    border: "1px solid rgba(245,158,11,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  brand: {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.15em",
    color: "#f59e0b",
  },
  subtitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    marginTop: 2,
    letterSpacing: "0.05em",
  },
  divider: {
    height: 1,
    background: "rgba(255,255,255,0.05)",
    margin: "0 24px 20px",
  },
  fieldGroup: {
    padding: "0 24px 14px",
  },
  label: {
    display: "block",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.15em",
    color: "rgba(245,158,11,0.6)",
    marginBottom: 6,
    fontFamily: "monospace",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 14px",
    background: "#0a0e14",
    border: "1px solid rgba(245,158,11,0.15)",
    borderRadius: 6,
    color: "#e2e8f0",
    fontSize: 13,
    outline: "none",
    transition: "border-color 0.2s",
  },
  error: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    margin: "0 24px 14px",
    padding: "10px 12px",
    background: "rgba(248,113,113,0.07)",
    border: "1px solid rgba(248,113,113,0.2)",
    borderRadius: 6,
    fontSize: 12,
    color: "#f87171",
  },
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "calc(100% - 48px)",
    margin: "4px 24px 16px",
    padding: "11px",
    background: "linear-gradient(135deg, #d97706, #f59e0b)",
    border: "none",
    borderRadius: 7,
    color: "#000",
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.05em",
    cursor: "pointer",
    transition: "opacity 0.2s, transform 0.1s",
  },
  spinner: {
    width: 14,
    height: 14,
    border: "2px solid rgba(0,0,0,0.3)",
    borderTop: "2px solid #000",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
    display: "inline-block",
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 24px",
    borderTop: "1px solid rgba(255,255,255,0.05)",
  },
  backLink: {
    fontSize: 11,
    color: "rgba(255,255,255,0.3)",
    textDecoration: "none",
  },
  version: {
    fontSize: 10,
    color: "rgba(255,255,255,0.15)",
    fontFamily: "monospace",
  },
};