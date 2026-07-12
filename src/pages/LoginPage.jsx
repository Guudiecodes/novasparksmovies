import { useState } from "react";

const PREFIX = "streambert_";

const IS_ELECTRON = typeof window !== "undefined" && !!window.electronAPI;
const API_BASE = (() => {
  if (IS_ELECTRON) return "https://novasparks.xyz";
  if (typeof window === "undefined") return "https://novasparks.xyz";
  const { hostname, protocol } = window.location;
  if (protocol === "file:" || hostname === "" || hostname === "null") return "https://novasparks.xyz";
  if (hostname === "localhost" || hostname === "127.0.0.1") return "https://novasparks.xyz";
  return window.location.origin;
})();

export default function LoginPage({ onSuccess, onClose, onSkip }) {
  const [mode,     setMode]    = useState("login");
  const [email,    setEmail]   = useState("");
  const [password, setPassword]= useState("");
  const [name,     setName]    = useState("");
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState("");
  const [success,  setSuccess] = useState("");

  const reset = () => { setError(""); setSuccess(""); };
  const switchMode = (m) => { setMode(m); reset(); setEmail(""); setPassword(""); setName(""); };

  const validate = () => {
    if (!email.trim())    { setError("Email is required."); return false; }
    if (!password.trim()) { setError("Password is required."); return false; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError("Enter a valid email."); return false; }
    if (mode === "signup" && password.length < 6) { setError("Password must be at least 6 characters."); return false; }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode === "signup" ? "register" : "login",
          email: email.trim().toLowerCase(),
          password,
          displayName: name.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      localStorage.setItem(PREFIX + "ns_user_id",    data.user.id);
      localStorage.setItem(PREFIX + "ns_user_email", data.user.email);
      localStorage.setItem(PREFIX + "ns_user_name",  data.user.displayName || "");
      if (mode === "signup") { setSuccess("Account created! Welcome to NovaSpark 🎬"); setTimeout(() => onSuccess(data.user), 1400); }
      else { onSuccess(data.user); }
    } catch { setError("Could not connect. Check your internet."); setLoading(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", backdropFilter: "blur(14px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "48px 52px", width: 420, maxWidth: "90%", boxShadow: "0 48px 120px rgba(0,0,0,0.85)", position: "relative" }}>
        {onClose && (
          <button onClick={onClose} style={{ position: "absolute", top: 16, right: 18, background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: "2px 6px" }}>×</button>
        )}
        <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: 6, color: "var(--red)", marginBottom: 6, textTransform: "uppercase" }}>NovaSpark</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 34, letterSpacing: 1, marginBottom: 6, lineHeight: 1 }}>
          {mode === "login" ? "WELCOME BACK" : "CREATE ACCOUNT"}
        </div>
        <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 32, lineHeight: 1.6 }}>
          {mode === "login" ? "Sign in to your NovaSpark account." : "Register and join NovaSpark for free."}
        </div>
        {mode === "signup" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text3)", marginBottom: 7 }}>Display Name</div>
            <input className="apikey-input" type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} style={{ width: "100%", marginBottom: 0 }} autoFocus />
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text3)", marginBottom: 7 }}>Email</div>
          <input className="apikey-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} style={{ width: "100%", marginBottom: 0 }} autoFocus={mode === "login"} />
        </div>
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--text3)", marginBottom: 7 }}>Password</div>
          <input className="apikey-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSubmit()} style={{ width: "100%", marginBottom: 0 }} />
        </div>
        {error && <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "rgba(229,9,20,0.08)", border: "1px solid rgba(229,9,20,0.2)", color: "var(--red)" }}>{error}</div>}
        {success && <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "rgba(72,199,116,0.08)", border: "1px solid rgba(72,199,116,0.2)", color: "#48c774" }}>{success}</div>}
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "13px", fontSize: 15, fontWeight: 700, opacity: loading ? 0.65 : 1 }}>
          {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Free Account"}
        </button>
        <div style={{ marginTop: 18, textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
          {mode === "login" ? "Don't have an account? " : "Already registered? "}
          <button onClick={() => switchMode(mode === "login" ? "signup" : "login")} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontWeight: 700, fontSize: 13, padding: 0 }}>
            {mode === "login" ? "Sign up free" : "Sign in"}
          </button>
        </div>
        {onSkip && (
          <div style={{ marginTop: 10, textAlign: "center" }}>
            <button onClick={onSkip} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 12, padding: 0 }}>
              Continue without account
            </button>
          </div>
        )}
      </div>
    </div>
  );
}