import { useState } from "react";
import { CloseIcon } from "./Icons";
import { setPremiumPlan, API_BASE } from "../utils/premium";

export default function RestoreModal({ onClose, onSuccess }) {
  const [step,        setStep]        = useState("restore"); // restore | forgot | success | error
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [txnRef,      setTxnRef]      = useState("");
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [result,      setResult]      = useState(null);

  async function handleRestore() {
    if (!email || !password) { setError("Enter your email and password."); return; }
    setLoading(true); setError("");
    try {
      const res  = await fetch(`${API_BASE}/api/restore`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();

      if (data.ok) {
        // Restore locally
        setPremiumPlan(data.planId, data.email, password, data.txnRef,
          Math.ceil((data.expiresAt - Date.now()) / 86400000));
        setResult(data);
        setStep("success");
        onSuccess?.();
      } else if (data.error === "expired") {
        setError(data.message);
      } else if (data.error === "no_account") {
        setError("No subscription found for this email. Check your email or subscribe below.");
      } else if (data.error === "wrong_password") {
        setError("Wrong password. Use 'Forgot password' below to reset with your payment reference.");
      } else {
        setError(data.message || "Something went wrong. Try again.");
      }
    } catch {
      setError("Could not connect. Check your internet and try again.");
    }
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!txnRef || !newPassword) { setError("Enter your payment reference and new password."); return; }
    if (newPassword !== confirmPass) { setError("Passwords do not match."); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true); setError("");
    try {
      const res  = await fetch(`${API_BASE}/api/reset-password`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ txnRef: txnRef.trim(), newPassword }),
      });
      const data = await res.json();
      if (data.ok) {
        setEmail(data.email || "");
        setPassword(newPassword);
        setStep("restore");
        setError("Password reset! Now enter your email and new password to restore.");
      } else {
        setError(data.message || "Could not find account. Check your payment reference.");
      }
    } catch {
      setError("Could not connect. Try again.");
    }
    setLoading(false);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(5,12,15,0.9)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: "100%", maxWidth: 440, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.85)", animation: "slideUp 0.22s ease" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
            {step === "restore" && "Restore Subscription"}
            {step === "forgot"  && "Reset Password"}
            {step === "success" && "🎉 Subscription Restored!"}
          </div>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", display: "flex", padding: 4, borderRadius: 6 }} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* ── Restore step ── */}
        {step === "restore" && (
          <div style={{ padding: "20px 20px 24px" }}>
            <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 18, lineHeight: 1.6 }}>
              Enter the email and password you used when you subscribed. Your plan will be restored instantly.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>Email address</label>
              <input
                className="apikey-input" type="email" placeholder="you@example.com"
                value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleRestore()}
                style={{ width: "100%", marginBottom: 0 }} autoFocus
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>Password</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="apikey-input" type={showPass ? "text" : "password"} placeholder="••••••••"
                  value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleRestore()}
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}
                  onClick={() => setShowPass((v) => !v)} type="button">
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 14, padding: "10px 14px", background: "rgba(255,80,50,0.08)", borderRadius: 8, border: "1px solid rgba(255,80,50,0.2)" }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", fontSize: 14, padding: 12, marginBottom: 12 }}
              onClick={handleRestore} disabled={loading}
            >
              {loading ? "Checking…" : "Restore My Subscription →"}
            </button>

            <button
              className="btn btn-ghost"
              style={{ width: "100%", justifyContent: "center", fontSize: 13 }}
              onClick={() => { setStep("forgot"); setError(""); }}
            >
              Forgot password? Reset with payment reference
            </button>
          </div>
        )}

        {/* ── Forgot password step ── */}
        {step === "forgot" && (
          <div style={{ padding: "20px 20px 24px" }}>
            <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 6, lineHeight: 1.6 }}>
              Enter your Paystack payment reference to verify your identity.
            </p>
            <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 18, lineHeight: 1.5 }}>
              Find it in your Paystack confirmation email — it looks like <code style={{ color: "var(--text2)" }}>NS_1234567890_ABCDEF</code>
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>Payment reference</label>
              <input
                className="apikey-input" type="text" placeholder="NS_1234567890_ABCDEF"
                value={txnRef} onChange={(e) => { setTxnRef(e.target.value); setError(""); }}
                style={{ width: "100%", marginBottom: 0 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>New password</label>
              <input
                className="apikey-input" type={showPass ? "text" : "password"} placeholder="••••••••"
                value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                style={{ width: "100%", marginBottom: 0 }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>Confirm new password</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="apikey-input" type={showPass ? "text" : "password"} placeholder="••••••••"
                  value={confirmPass} onChange={(e) => { setConfirmPass(e.target.value); setError(""); }}
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}
                  onClick={() => setShowPass((v) => !v)} type="button">
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 14, padding: "10px 14px", background: "rgba(255,80,50,0.08)", borderRadius: 8, border: "1px solid rgba(255,80,50,0.2)" }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", fontSize: 14, padding: 12, marginBottom: 12 }}
              onClick={handleForgotPassword} disabled={loading}
            >
              {loading ? "Resetting…" : "Reset Password →"}
            </button>

            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", fontSize: 13 }}
              onClick={() => { setStep("restore"); setError(""); }}>
              â† Back
            </button>
          </div>
        )}

        {/* ── Success step ── */}
        {step === "success" && result && (
          <div style={{ padding: "28px 20px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>
              Welcome back!
            </div>
            <p style={{ fontSize: 14, color: "var(--text3)", lineHeight: 1.7, marginBottom: 8 }}>
              Your <strong style={{ color: "#00b4a6" }}>{result.planId}</strong> plan has been restored.
            </p>
            <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 24 }}>
              Active until <strong style={{ color: "var(--text)" }}>{new Date(result.expiresAt).toLocaleDateString()}</strong>
            </p>
            <button className="btn btn-primary" style={{ justifyContent: "center", fontSize: 14, padding: "10px 32px" }} onClick={onClose}>
              Continue watching →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}