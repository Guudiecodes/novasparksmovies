import { useState, useEffect, useCallback } from "react";
import { setPremiumPlan } from "../utils/premium";
import { CloseIcon } from "./Icons";

const PAYSTACK_PUBLIC_KEY = "pk_live_7a41cee8223af8ebae60c24c63fc8be8cdbb9886";

const CRYPTO_WALLETS = {
  USDT_BSC: "0xc216ee7748a18c1a451b223cd0e344553ecf86ce",
  USDT_ETH: "0xc216ee7748a18c1a451b223cd0e344553ecf86ce",
  BTC:      "12SDDVhtgYaKkmYg5tNxCygo43EqxndDXm",
  ETH:      "0xc216ee7748a18c1a451b223cd0e344553ecf86ce",
};

const COIN_LABELS = {
  USDT_BSC: "USDT (BSC / BEP20)",
  USDT_ETH: "USDT (Ethereum / ERC20)",
  BTC:      "Bitcoin (BTC)",
  ETH:      "Ethereum (ETH)",
};

const NGN_TO_USD = 1600;
function toUSD(ngn) {
  if (!ngn) return null;
  return `~$${(ngn / NGN_TO_USD).toFixed(2)} USD`;
}

function loadPaystack() {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) { resolve(); return; }
    if (document.getElementById("ps-inline-script")) {
      const poll = setInterval(() => { if (window.PaystackPop) { clearInterval(poll); resolve(); } }, 80);
      setTimeout(() => { clearInterval(poll); reject(new Error("Paystack load timeout")); }, 10000);
      return;
    }
    const s  = document.createElement("script");
    s.id     = "ps-inline-script";
    s.src    = "https://js.paystack.co/v1/inline.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load Paystack"));
    document.head.appendChild(s);
  });
}

function genRef() {
  return `NS_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const el = document.createElement("textarea");
      el.value = text; document.body.appendChild(el); el.select();
      document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={doCopy} style={{
      background: copied ? "rgba(72,199,116,0.15)" : "var(--surface3)",
      border: `1px solid ${copied ? "rgba(72,199,116,0.4)" : "var(--border)"}`,
      color: copied ? "#48c774" : "var(--text2)",
      borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600,
      cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

function Field({ label, children, error }) {
  return (
    <div style={{ marginBottom: error ? 6 : 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>{label}</label>
      {children}
      {error && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function PaymentModal({ plan, onClose, onSuccess }) {
  const [step,         setStep]         = useState("account");
  const [email,        setEmail]        = useState("");
  const [password,     setPassword]     = useState("");
  const [confirmPass,  setConfirmPass]  = useState("");
  const [showPass,     setShowPass]     = useState(false);
  const [emailErr,     setEmailErr]     = useState("");
  const [passErr,      setPassErr]      = useState("");
  const [cryptoCoin,   setCryptoCoin]   = useState("USDT_BSC");
  const [paystackBusy, setPaystackBusy] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [errorMsg,     setErrorMsg]     = useState("");
  const [txnRef,       setTxnRef]       = useState("");

  const usdLabel = toUSD(plan?.price);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  const handleAccountNext = () => {
    let ok = true;
    if (!validateEmail(email))         { setEmailErr("Enter a valid email address."); ok = false; } else setEmailErr("");
    if (password.length < 6)           { setPassErr("Password must be at least 6 characters."); ok = false; }
    else if (password !== confirmPass) { setPassErr("Passwords do not match."); ok = false; }
    else setPassErr("");
    if (ok) setStep("method");
  };

  // Save to backend after Paystack confirms
  async function saveToBackend(planId, emailAddr, pwd, ref) {
    setSaving(true);
    try {
      const days = plan?.durationDays ?? 30;
      const res  = await fetch("/api/subscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email: emailAddr, password: pwd, planId, txnRef: ref, durationDays: days }),
      });
      const data = await res.json();
      if (!data.ok) console.warn("Backend save failed:", data);
      // Always activate locally regardless — don't block user on backend errors
    } catch (e) {
      console.warn("Backend unreachable:", e);
    }
    setSaving(false);
  }

  const handlePaystack = useCallback(async () => {
    setPaystackBusy(true); setErrorMsg("");
    try {
      await loadPaystack();
      const ref = genRef();
      window.PaystackPop.setup({
        key:      PAYSTACK_PUBLIC_KEY,
        email:    email.trim(),
        amount:   (plan?.price || 0) * 100,
        currency: "NGN",
        ref,
        label:    `NovaSpark ${plan?.name}`,
        channels: ["card", "bank", "ussd", "qr", "mobile_money", "bank_transfer"],
        metadata: { plan_id: plan?.id, plan_name: plan?.name, email: email.trim() },
        callback: async (response) => {
          const days = plan?.durationDays ?? 30;
          // 1. Activate locally immediately
          setPremiumPlan(plan.id, email.trim(), password, response.reference, days);
          setTxnRef(response.reference);
          // 2. Save to backend (async, non-blocking)
          await saveToBackend(plan.id, email.trim(), password, response.reference);
          setStep("success");
          onSuccess?.(plan, email.trim(), response.reference);
        },
        onClose: () => setPaystackBusy(false),
      }).openIframe();
    } catch (err) {
      setErrorMsg(err?.message || "Could not open payment. Check your internet and try again.");
      setStep("error");
      setPaystackBusy(false);
    }
  }, [email, password, plan, onSuccess]);

  const handleCryptoConfirm = async () => {
    const ref  = genRef();
    const days = plan?.durationDays ?? 30;
    setPremiumPlan(plan.id, email.trim(), password, ref, days);
    setTxnRef(ref);
    await saveToBackend(plan.id, email.trim(), password, ref);
    setStep("success");
    onSuccess?.(plan, email.trim(), ref);
  };

  const PlanSummary = () => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 2 }}>Subscribing to</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: plan?.color || "var(--red)", fontFamily: "var(--font-display)", letterSpacing: 0.5 }}>
          NovaSpark {plan?.name}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 2 }}>{usdLabel}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>₦{(plan?.price || 0).toLocaleString()}</div>
        <div style={{ fontSize: 11, color: "var(--text3)" }}>
          {plan?.testOnly ? "1 day test access" : "30 days access"}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(5,12,15,0.88)", backdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 480, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.85)", animation: "slideUp 0.22s ease" }}>

        <PlanSummary />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 0" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
            {step === "account" && "Create your account"}
            {step === "method"  && "Choose payment method"}
            {step === "crypto"  && "Pay with Crypto"}
            {step === "success" && "🎉 You're subscribed!"}
            {step === "error"   && "Payment issue"}
          </div>
          <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", display: "flex", padding: 4, borderRadius: 6 }} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* Account */}
        {step === "account" && (
          <div style={{ padding: "16px 20px 24px" }}>
            <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 18, lineHeight: 1.6 }}>
              Create an account so you can restore your subscription on any device, even after clearing browser data.
            </p>
            <Field label="Email address" error={emailErr}>
              <input className="apikey-input" type="email" placeholder="you@example.com" value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleAccountNext()}
                style={{ width: "100%", marginBottom: 0 }} autoFocus />
            </Field>
            <Field label="Password (min 6 characters)" error={passErr}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input className="apikey-input" type={showPass ? "text" : "password"} placeholder="••••••••" value={password}
                  onChange={(e) => { setPassword(e.target.value); setPassErr(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAccountNext()}
                  style={{ flex: 1, marginBottom: 0 }} />
                <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}
                  onClick={() => setShowPass((v) => !v)} type="button">{showPass ? "Hide" : "Show"}</button>
              </div>
            </Field>
            <Field label="Confirm password">
              <input className="apikey-input" type={showPass ? "text" : "password"} placeholder="••••••••" value={confirmPass}
                onChange={(e) => { setConfirmPass(e.target.value); setPassErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleAccountNext()}
                style={{ width: "100%", marginBottom: 0 }} />
            </Field>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: 12, marginTop: 4 }} onClick={handleAccountNext}>
              Continue to Payment →
            </button>
          </div>
        )}

        {/* Method */}
        {step === "method" && (
          <div style={{ padding: "16px 20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 4 }}>
              Paying as <strong style={{ color: "var(--text)" }}>{email}</strong>
            </p>
            <button onClick={handlePaystack} disabled={paystackBusy}
              style={{ display: "flex", alignItems: "center", gap: 16, background: paystackBusy ? "var(--surface2)" : "rgba(0,180,166,0.08)", border: "2px solid rgba(0,180,166,0.4)", borderRadius: 12, padding: "16px 20px", cursor: paystackBusy ? "default" : "pointer", transition: "all 0.2s", textAlign: "left", width: "100%", opacity: paystackBusy ? 0.6 : 1 }}
              onMouseEnter={(e) => { if (!paystackBusy) e.currentTarget.style.background = "rgba(0,180,166,0.14)"; }}
              onMouseLeave={(e) => { if (!paystackBusy) e.currentTarget.style.background = "rgba(0,180,166,0.08)"; }}
            >
              <div style={{ fontSize: 28 }}>🇳🇬</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>
                  {paystackBusy ? "Opening Paystack…" : "Pay with Paystack"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>Card · Bank Transfer · USSD · Mobile Money</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#00b4a6" }}>₦{(plan?.price || 0).toLocaleString()}</div>
                {usdLabel && <div style={{ fontSize: 11, color: "var(--text3)" }}>{usdLabel}</div>}
              </div>
            </button>

            <button onClick={() => setStep("crypto")}
              style={{ display: "flex", alignItems: "center", gap: 16, background: "rgba(245,166,35,0.06)", border: "2px solid rgba(245,166,35,0.3)", borderRadius: 12, padding: "16px 20px", cursor: "pointer", transition: "all 0.2s", textAlign: "left", width: "100%" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "rgba(245,166,35,0.12)"}
              onMouseLeave={(e) => e.currentTarget.style.background = "rgba(245,166,35,0.06)"}
            >
              <div style={{ fontSize: 28 }}>₿</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>Pay with Crypto</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>USDT · BTC · ETH</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>Manual confirm →</div>
            </button>

            <button className="btn btn-ghost" style={{ justifyContent: "center", fontSize: 13 }} onClick={() => setStep("account")}>← Back</button>
          </div>
        )}

        {/* Crypto */}
        {step === "crypto" && (
          <div style={{ padding: "16px 20px 24px" }}>
            <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 16, lineHeight: 1.6 }}>
              Send the USD equivalent to the address below then click confirm. Your plan activates immediately.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {Object.keys(CRYPTO_WALLETS).map((coin) => (
                <button key={coin} onClick={() => setCryptoCoin(coin)}
                  style={{ padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", background: cryptoCoin === coin ? "var(--red)" : "var(--surface2)", color: cryptoCoin === coin ? "#fff" : "var(--text2)" }}>
                  {coin.replace("_", " ")}
                </button>
              ))}
            </div>
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6, fontWeight: 600 }}>{COIN_LABELS[cryptoCoin]}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <code style={{ flex: 1, fontSize: 12, wordBreak: "break-all", color: "var(--text)", lineHeight: 1.5 }}>{CRYPTO_WALLETS[cryptoCoin]}</code>
                <CopyBtn text={CRYPTO_WALLETS[cryptoCoin]} />
              </div>
            </div>
            <div style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#f5a623" }}>
              ⚠ Send only {COIN_LABELS[cryptoCoin].split(" ")[0]} to this address. Wrong network = lost funds.
            </div>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", fontSize: 14, padding: 12, marginBottom: 8 }} onClick={handleCryptoConfirm}>
              I've sent the payment — Activate now
            </button>
            <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "center", fontSize: 13 }} onClick={() => setStep("method")}>← Back</button>
          </div>
        )}

        {/* Success */}
        {step === "success" && (
          <div style={{ padding: "24px 20px 32px", textAlign: "center" }}>
            {saving && <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>Saving to cloud…</div>}
            <div style={{ fontSize: 52, marginBottom: 16 }}>🎉</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>
              Welcome to NovaSpark {plan?.name}!
            </div>
            <p style={{ fontSize: 14, color: "var(--text3)", lineHeight: 1.7, marginBottom: 8 }}>
              Your plan is now active. You can restore it anytime using your email and password.
            </p>
            {txnRef && <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>Ref: <code style={{ color: "var(--text2)" }}>{txnRef}</code></p>}
            <button className="btn btn-primary" style={{ justifyContent: "center", fontSize: 14, padding: "10px 32px" }} onClick={onClose}>
              Start watching →
            </button>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div style={{ padding: "20px 20px 24px" }}>
            <p style={{ fontSize: 14, color: "var(--red)", marginBottom: 16, lineHeight: 1.6 }}>{errorMsg || "Something went wrong. Please try again."}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => { setStep("method"); setErrorMsg(""); setPaystackBusy(false); }}>Try Again</button>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={onClose}>Close</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}