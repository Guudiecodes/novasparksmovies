import { useState, useEffect, useCallback } from "react";
import {
  PAYSTACK_PUBLIC_KEY,
  CRYPTO_WALLETS,
  setPremiumPlan,
} from "../utils/premium";
import { CloseIcon } from "./Icons";

// ── USD conversion (₦1,600 = $1) ─────────────────────────────────────────────
const NGN_TO_USD = 1600;
function toUSD(ngn) {
  if (!ngn) return null;
  return `~$${(ngn / NGN_TO_USD).toFixed(2)} USD`;
}

// ── Load Paystack once ────────────────────────────────────────────────────────
function loadPaystack() {
  return new Promise((resolve) => {
    if (window.PaystackPop) { resolve(); return; }
    const s    = document.createElement("script");
    s.src      = "https://js.paystack.co/v1/inline.js";
    s.onload   = resolve;
    document.head.appendChild(s);
  });
}

function genRef() {
  return `NS_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      style={{
        background:   copied ? "rgba(72,199,116,0.15)" : "var(--surface3)",
        border:       `1px solid ${copied ? "rgba(72,199,116,0.4)" : "var(--border)"}`,
        color:        copied ? "#48c774" : "var(--text2)",
        borderRadius: 6, padding: "4px 10px", fontSize: 11,
        fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
        fontFamily: "var(--font-body)", whiteSpace: "nowrap", flexShrink: 0,
      }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

// ── Input field helper ────────────────────────────────────────────────────────
function Field({ label, children, error }) {
  return (
    <div style={{ marginBottom: error ? 6 : 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {error && (
        <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PaymentModal({ plan, onClose, onSuccess }) {
  const [step,          setStep]          = useState("account"); // account → method → crypto → success → error
  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [confirmPass,   setConfirmPass]   = useState("");
  const [showPass,      setShowPass]      = useState(false);
  const [emailErr,      setEmailErr]      = useState("");
  const [passErr,       setPassErr]       = useState("");
  const [method,        setMethod]        = useState(null);
  const [cryptoCoin,    setCryptoCoin]    = useState("USDT_TRC");
  const [paystackBusy,  setPaystackBusy]  = useState(false);
  const [errorMsg,      setErrorMsg]      = useState("");
  const [txnRef,        setTxnRef]        = useState("");

  const usdLabel = toUSD(plan.price);

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

  // ── Step 1: Account details (email + password) ────────────────────────────
  const handleAccountNext = () => {
    let ok = true;
    if (!validateEmail(email)) { setEmailErr("Enter a valid email address."); ok = false; }
    else setEmailErr("");

    if (password.length < 6) { setPassErr("Password must be at least 6 characters."); ok = false; }
    else if (password !== confirmPass) { setPassErr("Passwords do not match."); ok = false; }
    else setPassErr("");

    if (ok) setStep("method");
  };

  // ── Step 2: Paystack ──────────────────────────────────────────────────────
  const handlePaystack = useCallback(async () => {
    setPaystackBusy(true);
    setErrorMsg("");
    try {
      await loadPaystack();
      const ref = genRef();
      setTxnRef(ref);
      const handler = window.PaystackPop.setup({
        key:      PAYSTACK_PUBLIC_KEY,
        email:    email.trim(),
        amount:   plan.price * 100, // kobo
        currency: "NGN",
        ref,
        label:    `NovaSpark ${plan.name}`,
        channels: ["card", "bank", "ussd", "qr", "mobile_money", "bank_transfer"],
        metadata: { plan_id: plan.id, plan_name: plan.name, email: email.trim() },
        callback: (response) => {
          // Activate plan immediately on successful payment
          setPremiumPlan(plan.id, email.trim(), password, response.reference, 31);
          setTxnRef(response.reference);
          setStep("success");
          onSuccess?.(plan, email.trim(), response.reference);
        },
        onClose: () => { setPaystackBusy(false); },
      });
      handler.openIframe();
    } catch {
      setErrorMsg("Could not load Paystack. Check your internet connection.");
      setStep("error");
      setPaystackBusy(false);
    }
  }, [email, password, plan, onSuccess]);

  // ── Step 3: Crypto confirm ────────────────────────────────────────────────
  const handleCryptoConfirm = () => {
    const ref = genRef();
    setPremiumPlan(plan.id, email.trim(), password, ref, 31);
    setTxnRef(ref);
    setStep("success");
    onSuccess?.(plan, email.trim(), ref);
  };

  // ── Plan summary ──────────────────────────────────────────────────────────
  const PlanSummary = () => (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 20px",
      background: "var(--surface2)",
      borderBottom: "1px solid var(--border)",
      borderRadius: "14px 14px 0 0",
    }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 2 }}>Subscribing to</div>
        <div style={{
          fontSize: 17, fontWeight: 700, color: plan.color,
          fontFamily: "var(--font-display)", letterSpacing: 0.5,
        }}>
          NovaSpark {plan.name}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)" }}>
          ₦{plan.price.toLocaleString()}
        </div>
        {usdLabel && <div style={{ fontSize: 12, color: "var(--text3)" }}>{usdLabel} / mo</div>}
        {!usdLabel && <div style={{ fontSize: 12, color: "var(--text3)" }}>per month</div>}
      </div>
    </div>
  );

  // ── Modal wrapper ─────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.82)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 480,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14, overflow: "hidden",
        boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
        animation: "slideUp 0.22s ease",
      }}>
        <PlanSummary />

        {/* Step header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px 0" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
            {step === "account" && "Create your account"}
            {step === "method"  && "Choose payment method"}
            {step === "crypto"  && "Pay with Crypto"}
            {step === "success" && "🎉 You're Premium!"}
            {step === "error"   && "Payment issue"}
          </div>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", display: "flex", padding: 4, borderRadius: 6, transition: "color 0.15s" }}
            onClick={onClose}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text3)")}
          >
            <CloseIcon />
          </button>
        </div>

        {/* ── Step: Account (email + password) ── */}
        {step === "account" && (
          <div style={{ padding: "16px 20px 24px" }}>
            <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 18, lineHeight: 1.6 }}>
              Your account is used to access your subscription on this device.
              Keep your password safe — you'll need it to manage your plan.
            </p>

            <Field label="Email address" error={emailErr}>
              <input
                className="apikey-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleAccountNext()}
                style={{ width: "100%", marginBottom: 0 }}
                autoFocus
              />
            </Field>

            <Field label="Password (min 6 characters)" error={passErr}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="apikey-input"
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setPassErr(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAccountNext()}
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button
                  className="btn btn-ghost"
                  style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }}
                  onClick={() => setShowPass((v) => !v)}
                  type="button"
                >
                  {showPass ? "Hide" : "Show"}
                </button>
              </div>
            </Field>

            <Field label="Confirm password">
              <input
                className="apikey-input"
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPass}
                onChange={(e) => { setConfirmPass(e.target.value); setPassErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && handleAccountNext()}
                style={{ width: "100%", marginBottom: 0 }}
              />
            </Field>

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: 12, marginTop: 4 }}
              onClick={handleAccountNext}
            >
              Continue to Payment →
            </button>
          </div>
        )}

        {/* ── Step: Method ── */}
        {step === "method" && (
          <div style={{ padding: "16px 20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 4 }}>
              Paying as <strong style={{ color: "var(--text)" }}>{email}</strong>
            </p>

            {/* Paystack */}
            <button
              onClick={handlePaystack}
              disabled={paystackBusy}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                background: paystackBusy ? "var(--surface2)" : "rgba(0,168,225,0.08)",
                border: "2px solid rgba(0,168,225,0.4)",
                borderRadius: 12, padding: "16px 20px", cursor: "pointer",
                transition: "all 0.2s", textAlign: "left", width: "100%",
                opacity: paystackBusy ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!paystackBusy) e.currentTarget.style.background = "rgba(0,168,225,0.14)"; }}
              onMouseLeave={(e) => { if (!paystackBusy) e.currentTarget.style.background = "rgba(0,168,225,0.08)"; }}
            >
              <div style={{ fontSize: 28, lineHeight: 1 }}>🇳🇬</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>
                  {paystackBusy ? "Opening Paystack…" : "Pay with Paystack"}
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>
                  Card · OPay · PalmPay · Kuda · Bank Transfer · USSD
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#00a8e1" }}>
                  ₦{plan.price.toLocaleString()}
                </div>
                {usdLabel && <div style={{ fontSize: 11, color: "var(--text3)" }}>{usdLabel}</div>}
              </div>
            </button>

            {/* Crypto */}
            <button
              onClick={() => setStep("crypto")}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                background: "rgba(245,197,24,0.06)",
                border: "2px solid rgba(245,197,24,0.3)",
                borderRadius: 12, padding: "16px 20px", cursor: "pointer",
                transition: "all 0.2s", textAlign: "left", width: "100%",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(245,197,24,0.12)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(245,197,24,0.06)")}
            >
              <div style={{ fontSize: 28, lineHeight: 1 }}>🌍</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>
                  Pay with Crypto
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>
                  Bitcoin · USDT (TRC20/ERC20) · Ethereum · International
                </div>
              </div>
              <span style={{ fontSize: 18, color: "var(--text3)" }}>→</span>
            </button>

            <button className="btn btn-ghost" style={{ marginTop: 4 }} onClick={() => setStep("account")}>
              ← Back
            </button>
          </div>
        )}

        {/* ── Step: Crypto ── */}
        {step === "crypto" && (
          <div style={{ padding: "16px 20px 24px" }}>
            <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14, lineHeight: 1.6 }}>
              Send the equivalent of{" "}
              <strong style={{ color: "var(--text)" }}>
                ₦{plan.price.toLocaleString()}{usdLabel ? ` (${usdLabel})` : ""}
              </strong>{" "}
              in your chosen crypto to the address below. After sending, click{" "}
              <strong style={{ color: "var(--text)" }}>I've Sent Payment</strong> — your plan
              activates instantly and admin verifies within 24h.
            </p>

            {/* Coin selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { id: "USDT_TRC", label: "USDT TRC20", icon: "💚" },
                { id: "USDT_ERC", label: "USDT ERC20", icon: "🔷" },
                { id: "BTC",      label: "Bitcoin",    icon: "₿" },
                { id: "ETH",      label: "Ethereum",   icon: "Ξ" },
              ].map(({ id, label, icon }) => (
                <button
                  key={id}
                  onClick={() => setCryptoCoin(id)}
                  style={{
                    padding: "7px 14px", borderRadius: 8, border: "1px solid",
                    borderColor: cryptoCoin === id ? "var(--red)" : "var(--border)",
                    background:  cryptoCoin === id ? "rgba(0,168,225,0.12)" : "var(--surface2)",
                    color:       cryptoCoin === id ? "var(--text)" : "var(--text2)",
                    fontSize: 13, fontWeight: cryptoCoin === id ? 700 : 400,
                    cursor: "pointer", fontFamily: "var(--font-body)", transition: "all 0.15s",
                  }}
                >
                  {icon} {label}
                </button>
              ))}
            </div>

            {/* Wallet address */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", marginBottom: 8 }}>
                Send to this address:
              </div>
              <div style={{
                display: "flex", gap: 8, alignItems: "center",
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "10px 14px",
              }}>
                <code style={{ flex: 1, fontSize: 12, color: "var(--text)", wordBreak: "break-all", lineHeight: 1.5 }}>
                  {CRYPTO_WALLETS[cryptoCoin] || "Wallet not configured yet"}
                </code>
                <CopyBtn text={CRYPTO_WALLETS[cryptoCoin] || ""} />
              </div>
            </div>

            <div style={{
              background: "rgba(245,197,24,0.07)", border: "1px solid rgba(245,197,24,0.25)",
              borderRadius: 8, padding: "10px 14px", fontSize: 12,
              color: "var(--text2)", marginBottom: 16, lineHeight: 1.6,
            }}>
              ⚡ After sending, click the button below. Your plan activates immediately.
              Admin verifies your transaction within 24 hours. Any issues will be sent to{" "}
              <strong>{email}</strong>.
            </div>

            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: 12, marginBottom: 10 }}
              onClick={handleCryptoConfirm}
            >
              ✓ I've Sent Payment — Activate My Plan
            </button>
            <button
              className="btn btn-ghost"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => setStep("method")}
            >
              ← Back
            </button>
          </div>
        )}

        {/* ── Step: Success ── */}
        {step === "success" && (
          <div style={{ padding: "32px 24px 28px", textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 32,
              letterSpacing: 1, marginBottom: 8, color: plan.color,
            }}>
              WELCOME TO {plan.name.toUpperCase()}!
            </div>
            <p style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.7, marginBottom: 20 }}>
              Your <strong style={{ color: "var(--text)" }}>NovaSpark {plan.name}</strong> plan is
              now active. Enjoy {plan.quality}, {plan.devices} device{plan.devices > 1 ? "s" : ""},
              and all premium features unlocked immediately.
            </p>
            {txnRef && (
              <div style={{
                fontSize: 11, color: "var(--text3)", background: "var(--surface2)",
                border: "1px solid var(--border)", borderRadius: 6,
                padding: "6px 12px", marginBottom: 20, fontFamily: "monospace",
              }}>
                Ref: {txnRef}
              </div>
            )}
            <div style={{
              fontSize: 12, color: "var(--text3)", marginBottom: 20,
              background: "rgba(72,199,116,0.06)", border: "1px solid rgba(72,199,116,0.2)",
              borderRadius: 8, padding: "10px 14px",
            }}>
              📧 Account registered: <strong style={{ color: "var(--text)" }}>{email}</strong><br />
              Your credentials are saved on this device.
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: 12 }}
              onClick={onClose}
            >
              Start Streaming ▶
            </button>
          </div>
        )}

        {/* ── Step: Error ── */}
        {step === "error" && (
          <div style={{ padding: "24px 20px 24px" }}>
            <div style={{ fontSize: 14, color: "var(--red)", marginBottom: 16 }}>
              ⚠ {errorMsg || "Something went wrong. Please try again."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }}
                onClick={() => { setStep("method"); setErrorMsg(""); }}>
                Try Again
              </button>
              <button className="btn btn-ghost" style={{ flex: 1, justifyContent: "center" }}
                onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}