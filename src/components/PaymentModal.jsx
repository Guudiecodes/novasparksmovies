import { useState } from "react";
import { savePremiumRecord, simpleHash, API_BASE } from "../utils/premium";
import { CloseIcon } from "./Icons";

const PAYSTACK_PUBLIC_KEY = "pk_live_7a41cee8223af8ebae60c24c63fc8be8cdbb9886";

const CRYPTO_WALLETS = {
  "USDT (BEP-20)": "0xc216ee7748a18c1a451b223cd0e344553ecf86ce",
  "Bitcoin (BTC)": "12SDDVhtgYaKkmYg5tNxCygo43EqxndDXm",
};

// Dynamically load Paystack inline script — safe to call multiple times
function loadPaystackScript() {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) { resolve(); return; }
    const existing = document.getElementById("paystack-inline-js");
    if (existing) { existing.onload = resolve; return; }
    const s = document.createElement("script");
    s.id  = "paystack-inline-js";
    s.src = "https://js.paystack.co/v1/inline.js";
    s.onload  = resolve;
    s.onerror = () => reject(new Error("Could not load payment script. Check your connection."));
    document.head.appendChild(s);
  });
}

// Steps: 1=choose method  2=account details  3=paying (Paystack open)  4=success
export default function PaymentModal({ plan, onClose, onSuccess }) {
  const [step,     setStep]     = useState(1);
  const [method,   setMethod]   = useState(null);   // "paystack" | "crypto"
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [txnRef,   setTxnRef]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [copied,   setCopied]   = useState("");

  // plan.price / plan.priceKobo are Naira now (premium.js v3.0), not USD.
  // Never hardcode this — it must always come from the plan actually
  // being purchased, or Standard/Premium buyers get charged the wrong amount.
  const price      = `₦${Number(plan.price || 0).toLocaleString()}`;
  const planColor  = plan.color || "#00b4a6";
  const amountKobo = plan.priceKobo ?? Math.round((plan.price || 0) * 100);

  function validate() {
    if (!email.trim())            { setError("Email is required.");                  return false; }
    if (password.length < 6)      { setError("Password must be at least 6 characters."); return false; }
    if (password !== confirm)     { setError("Passwords do not match.");             return false; }
    return true;
  }

  // ── Paystack inline popup ─────────────────────────────────────────────────
  async function handlePaystack() {
    setError("");
    if (!validate()) return;

    // Hard guard — never open a checkout for an amount we can't verify.
    // This is what protects against ever silently charging ₦0 or a stale
    // hardcoded figure regardless of which plan was actually selected.
    if (!amountKobo || !Number.isFinite(amountKobo) || amountKobo <= 0) {
      console.error("PaymentModal: refusing to charge — invalid amountKobo for plan", plan);
      setError("Pricing error for this plan — please refresh and try again.");
      return;
    }

    setLoading(true);

    try {
      await loadPaystackScript();

      const ref = `NS-${plan.id.toUpperCase()}-${Date.now()}`;

      const handler = window.PaystackPop.setup({
        key:      PAYSTACK_PUBLIC_KEY,
        email:    email.trim().toLowerCase(),
        amount:   amountKobo,   // ← real per-plan amount, not a hardcoded one
        currency: "NGN",
        ref,
        metadata: {
          plan_id:       plan.id,
          plan_name:     plan.name,
          amount_ngn:    plan.price,
          password_hash: simpleHash(password),
        },
        callback(response) {
          // Payment confirmed by Paystack
          const txnRef = response.reference || ref;
          savePremiumRecord(plan.id, email, password, txnRef);
          fetch(`${API_BASE}/api/subscribe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, planId: plan.id, txnRef, durationDays: plan.durationDays || 30 }),
          }).catch((err) => console.error("subscribe sync failed:", err));
          setStep(4);
          onSuccess?.();
        },
        onClose() {
          // User closed popup without paying — stay on step 2
          setLoading(false);
          setStep(2);
        },
      });

      setStep(3);
      handler.openIframe();
    } catch (err) {
      setError(err.message || "Failed to open payment. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Crypto manual confirm ─────────────────────────────────────────────────
  async function handleCryptoConfirm() {
    setError("");
    if (!validate()) return;
    if (!txnRef.trim()) { setError("Please enter your transaction hash."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/crypto-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, planId: plan.id, txnRef: txnRef.trim(), durationDays: plan.durationDays || 30 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setError(data.error || "Could not submit for review. Try again."); setLoading(false); return; }
      setStep(5);
      onSuccess?.();
    } catch {
      setError("Could not connect. Check your internet.");
    } finally {
      setLoading(false);
    }
    return;
    setStep(4);
    onSuccess?.();
  }

  function copyWallet(key, addr) {
    navigator.clipboard.writeText(addr).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  }

  // ── Shared input style ────────────────────────────────────────────────────
  const inputStyle = {
    width: "100%", boxSizing: "border-box",
    background: "var(--surface2)", border: "1px solid var(--border)",
    borderRadius: 8, padding: "10px 14px",
    fontSize: 14, color: "var(--text)", outline: "none",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "36px 40px", maxWidth: 480, width: "100%", boxShadow: "0 32px 80px rgba(0,0,0,0.8)", position: "relative" }}>

        {/* Close */}
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", color: "var(--text3)", padding: 4 }}>
          <CloseIcon size={20} />
        </button>

        {/* Plan badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: `${planColor}22`, border: `1px solid ${planColor}55`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 18 }}>⚡</span>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{plan.name} Plan</div>
            <div style={{ fontSize: 13, color: planColor, fontWeight: 700 }}>{price} / month</div>
          </div>
        </div>

        {/* ── Step 1: Choose method ─────────────────────────────────────────── */}
        {step === 1 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Choose payment method</div>

            {/* Currency info */}
            <div style={{ background: "rgba(0,180,166,0.07)", border: "1px solid rgba(0,180,166,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "var(--text3)", lineHeight: 1.6 }}>
              💡 Prices are in <strong style={{ color: "var(--text)" }}>Naira (₦)</strong>. Pay by card, bank transfer, USSD, or mobile money via Paystack — or send crypto below.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => { setMethod("paystack"); setStep(2); setError(""); }}
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", cursor: "pointer", textAlign: "left", color: "var(--text)" }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Pay with Paystack</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>Card · Bank Transfer · USSD · Mobile Money</div>
              </button>
              <button
                onClick={() => { setMethod("crypto"); setStep(2); setError(""); }}
                style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", cursor: "pointer", textAlign: "left", color: "var(--text)" }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Pay with Crypto</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>Send the {price} equivalent · USDT (BEP-20) · Bitcoin</div>
              </button>
            </div>
          </>
        )}

        {/* ── Step 2: Account details ───────────────────────────────────────── */}
        {step === 2 && (
          <>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
              {method === "paystack" ? "Account details" : "Crypto payment"}
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 20, lineHeight: 1.6 }}>
              {method === "paystack"
                ? "We'll store these so you can restore your plan on any device."
                : "Send the equivalent of your plan price to a wallet below, then confirm with your transaction hash."}
            </div>

            {/* Crypto wallets — compact */}
            {method === "crypto" && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8, lineHeight: 1.5 }}>
                  Send the equivalent of <strong style={{ color: "#f5a623" }}>{price}</strong> (at today's exchange rate) to one wallet, then paste your transaction hash below.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {Object.entries(CRYPTO_WALLETS).map(([key, addr]) => (
                    <div key={key} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 700, letterSpacing: 0.8 }}>{key} </span>
                        <code style={{ fontSize: 10, color: "var(--text2)", wordBreak: "break-all" }}>{addr}</code>
                      </div>
                      <button
                        onClick={() => copyWallet(key, addr)}
                        style={{ background: copied === key ? `${planColor}22` : "var(--surface)", border: `1px solid ${planColor}55`, color: planColor, borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", flexShrink: 0, fontWeight: 600 }}
                      >
                        {copied === key ? "✓" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Form */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600, display: "block", marginBottom: 6 }}>Email address</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Password <span style={{ fontWeight: 400 }}>(to restore on other devices)</span>
                </label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600, display: "block", marginBottom: 6 }}>Confirm password</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat password" style={inputStyle} />
              </div>
              {method === "crypto" && (
                <div>
                  <label style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600, display: "block", marginBottom: 6 }}>Transaction hash</label>
                  <input type="text" value={txnRef} onChange={(e) => setTxnRef(e.target.value)} placeholder="0x..." style={{ ...inputStyle, fontSize: 13 }} />
                </div>
              )}
            </div>

            {error && (
              <div style={{ marginTop: 14, fontSize: 13, color: "var(--red)", background: "rgba(220,50,50,0.08)", border: "1px solid rgba(220,50,50,0.25)", borderRadius: 8, padding: "10px 14px" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setStep(1); setError(""); }}>Back</button>
              <button
                className="btn btn-primary"
                style={{ flex: 2, background: planColor, border: "none", fontWeight: 700, justifyContent: "center" }}
                onClick={method === "paystack" ? handlePaystack : handleCryptoConfirm}
                disabled={loading}
              >
                {loading ? "Opening payment…" : method === "paystack" ? `Pay ${price}` : "Confirm payment"}
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Paystack popup is open — message while it's in front ─── */}
        {step === 3 && (
          <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>ðŸ”</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>Complete your payment</div>
            <div style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.7 }}>
              The Paystack checkout is open. Complete your payment there — your plan activates the moment it's confirmed.
            </div>
          </div>
        )}

        {/* ── Step 4: Success ───────────────────────────────────────────────── */}
        {step === 5 && (
          <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#f5a623", letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Submitted for review</div>
            <div style={{ fontSize: 14, color: "var(--text3)", lineHeight: 1.7, marginBottom: 28 }}>
              We received your transaction hash. Crypto payments are checked manually against the wallet before your plan activates -- usually within a few hours.
            </div>
            <button
              className="btn btn-primary"
              style={{ background: planColor, border: "none", fontWeight: 700, justifyContent: "center", width: "100%" }}
              onClick={onClose}
            >
              Got it
            </button>
          </div>
        )}

        {step === 4 && (
          <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>Welcome to {plan.name}!</div>
            <div style={{ fontSize: 14, color: "var(--text3)", lineHeight: 1.7, marginBottom: 28 }}>
              Your subscription is active. Enjoy the full NovaSpark experience.
            </div>
            <button
              className="btn btn-primary"
              style={{ background: planColor, border: "none", fontWeight: 700, justifyContent: "center", width: "100%" }}
              onClick={onClose}
            >
              Start watching
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
