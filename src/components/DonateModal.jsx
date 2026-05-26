import { useState, useEffect } from "react";

// ── PAYSTACK PUBLIC KEY ONLY — never use sk_live here ─────────────────────
// Get your PUBLIC key from: Paystack Dashboard → Settings → API Keys
// It starts with pk_live_... or pk_test_...
const PAYSTACK_PUBLIC_KEY = "pk_live_REPLACE_WITH_YOUR_PUBLIC_KEY";

// ── Donation amounts in USD ───────────────────────────────────────────────
const AMOUNTS = [5, 10, 25, 50];

// ── Your crypto wallet addresses ──────────────────────────────────────────
const WALLETS = {
  usdt: { address: "0xc216ee7748a18c1a451b223cd0e344553ecf86ce", network: "BSC (BEP20) · ERC20", color: "#26a17b", symbol: "₮" },
  eth:  { address: "0xc216ee7748a18c1a451b223cd0e344553ecf86ce", network: "Ethereum (ERC20)",    color: "#627eea", symbol: "Ξ" },
  btc:  { address: "12SDDVhtgYaKkmYg5tNxCygo43EqxndDXm",        network: "Bitcoin (BTC)",        color: "#f7931a", symbol: "₿" },
};

// ── USD → NGN conversion (Paystack charges in NGN for Nigerian accounts) ──
// Update this rate periodically or pull from an FX API
const USD_TO_NGN = 1600;

function usdToKobo(usd) {
  // Paystack amount is in kobo (smallest NGN unit), minimum ₦100 = 10000 kobo
  return Math.round(usd * USD_TO_NGN * 100);
}

// ── Open Paystack checkout via Initialize Transaction API ─────────────────
// This approach:
//   1. Never needs a script tag or SDK load
//   2. Works in Electron and all browsers
//   3. Returns Paystack's hosted checkout which shows ALL payment channels
//      (Card, Bank Transfer, USSD, PalmPay, Kuda, etc.) natively
//   4. Requires only the PUBLIC key on the frontend
async function initializePaystackPayment({ email, amountUSD, metadata }) {
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${PAYSTACK_PUBLIC_KEY}`,
    },
    body: JSON.stringify({
      email,
      amount:    usdToKobo(amountUSD),
      currency:  "NGN",
      reference: `ns_donate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      metadata:  {
        custom_fields: [
          { display_name: "Type",   variable_name: "type",   value: "NovaSpark Donation" },
          { display_name: "Amount", variable_name: "amount", value: `$${amountUSD} USD`  },
        ],
        ...metadata,
      },
      // Channels shown on Paystack checkout — all standard ones, no bank names
      channels: ["card", "bank", "ussd", "qr", "mobile_money", "bank_transfer"],
      callback_url: window.location.origin || "https://novaspark.app",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Paystack error ${res.status}`);
  }

  const data = await res.json();
  if (!data.status || !data.data?.authorization_url) {
    throw new Error(data.message || "Failed to initialize payment");
  }

  return data.data.authorization_url;
}

export default function DonateModal({ onClose }) {
  const [tab,        setTab]        = useState("card");
  const [amount,     setAmount]     = useState(10);
  const [custom,     setCustom]     = useState("");
  const [useCustom,  setUseCustom]  = useState(false);
  const [email,      setEmail]      = useState("");
  const [coin,       setCoin]       = useState("usdt");
  const [copied,     setCopied]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [emailError, setEmailError] = useState("");

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const finalAmount = useCustom
    ? Math.max(0, parseFloat(custom) || 0)
    : amount;

  const wallet = WALLETS[coin];

  const pay = async () => {
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setEmailError("Enter a valid email address");
      return;
    }
    if (finalAmount < 1) {
      setError("Minimum donation is $1");
      return;
    }
    setEmailError("");
    setError("");
    setLoading(true);

    try {
      const checkoutUrl = await initializePaystackPayment({
        email,
        amountUSD: finalAmount,
        metadata:  { donation: true },
      });

      // Open Paystack hosted checkout
      // In Electron: opens in the default browser (correct — keeps app clean)
      // On web: opens in a new tab
      if (window.electron?.shell?.openExternal) {
        window.electron.shell.openExternal(checkoutUrl);
      } else {
        window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      }

      onClose();
    } catch (err) {
      setError(err.message || "Payment failed — please try again");
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
    } catch {
      const el = document.createElement("textarea");
      el.value = wallet.address;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(5,12,15,0.88)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        width: 460, maxWidth: "100%",
        maxHeight: "90vh",
        overflowY: "auto",
        boxShadow: "0 32px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,180,166,0.08)",
        animation: "donateSlideUp 0.22s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <style>{`
          @keyframes donateSlideUp {
            from { opacity:0; transform: translateY(20px) scale(0.97); }
            to   { opacity:1; transform: translateY(0)    scale(1);    }
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div style={{
          padding: "24px 24px 0",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        }}>
          <div>
            <div style={{
              fontSize: 20, fontWeight: 800, color: "var(--text)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{
                width: 36, height: 36, borderRadius: 10,
                background: "linear-gradient(135deg, var(--red), var(--amber))",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, flexShrink: 0,
              }}>❤️</span>
              Support NovaSpark
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 5 }}>
              Every contribution keeps this project alive and growing
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--surface3)", border: "none", borderRadius: 8,
              color: "var(--text3)", cursor: "pointer",
              width: 30, height: 30,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, flexShrink: 0,
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--surface2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text3)"; e.currentTarget.style.background = "var(--surface3)"; }}
          >✕</button>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", margin: "20px 24px 0", gap: 8 }}>
          {[["card", "💳  Card / Bank"], ["crypto", "₿  Crypto"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); setError(""); }}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10,
                border: `1.5px solid ${tab === id ? "var(--red)" : "var(--border)"}`,
                background: tab === id ? "var(--red-dim)" : "transparent",
                color: tab === id ? "var(--red)" : "var(--text3)",
                fontWeight: 700, fontSize: 13, cursor: "pointer",
                transition: "all 0.18s", fontFamily: "var(--font-body)",
              }}
            >{label}</button>
          ))}
        </div>

        <div style={{ padding: "20px 24px 28px" }}>

          {/* ── Amount selector ──────────────────────────────────────── */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
              textTransform: "uppercase", color: "var(--text3)", marginBottom: 10,
            }}>Amount (USD)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {AMOUNTS.map((a) => {
                const active = !useCustom && amount === a;
                return (
                  <button
                    key={a}
                    onClick={() => { setAmount(a); setUseCustom(false); setError(""); }}
                    style={{
                      padding: "9px 16px", borderRadius: 9,
                      border: `1.5px solid ${active ? "var(--amber)" : "var(--border)"}`,
                      background: active ? "rgba(245,166,35,0.12)" : "var(--surface2)",
                      color: active ? "var(--amber)" : "var(--text2)",
                      fontWeight: 700, fontSize: 14, cursor: "pointer",
                      transition: "all 0.15s", fontFamily: "var(--font-body)",
                    }}
                  >${a}</button>
                );
              })}
              <input
                type="number"
                placeholder="Custom"
                value={custom}
                min={1}
                onChange={(e) => { setCustom(e.target.value); setUseCustom(true); setError(""); }}
                onFocus={() => setUseCustom(true)}
                style={{
                  padding: "9px 12px", borderRadius: 9,
                  border: `1.5px solid ${useCustom ? "var(--amber)" : "var(--border)"}`,
                  background: useCustom ? "rgba(245,166,35,0.08)" : "var(--surface2)",
                  color: "var(--text)", fontSize: 14, outline: "none",
                  width: 88, fontFamily: "var(--font-body)",
                  transition: "all 0.15s",
                }}
              />
            </div>
            {/* NGN equivalent — helpful for Nigerian users */}
            {finalAmount > 0 && (
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8 }}>
                ≈ ₦{(finalAmount * USD_TO_NGN).toLocaleString()} NGN
              </div>
            )}
          </div>

          {/* ── Error banner ─────────────────────────────────────────── */}
          {error && (
            <div style={{
              marginBottom: 14, padding: "10px 14px", borderRadius: 8,
              background: "rgba(244,67,54,0.08)", border: "1px solid rgba(244,67,54,0.3)",
              fontSize: 13, color: "#f44336",
            }}>{error}</div>
          )}

          {/* ════════════════════════════════════════════════════════════
              CARD / BANK TAB
              Uses Paystack Initialize API → opens Paystack hosted checkout
              which natively shows: Card, Bank Transfer, USSD, Mobile Money,
              PalmPay, Kuda, etc. — all Paystack standard channels.
              No bank names hardcoded. No SDK needed.
             ════════════════════════════════════════════════════════════ */}
          {tab === "card" && (
            <>
              {/* What payment methods they'll see */}
              <div style={{
                marginBottom: 16, padding: "10px 14px", borderRadius: 8,
                background: "var(--surface2)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              }}>
                <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600 }}>Pay with:</span>
                {["Card", "Bank Transfer", "USSD", "Mobile Money"].map((m) => (
                  <span key={m} style={{
                    fontSize: 11, fontWeight: 600, color: "var(--text2)",
                    background: "var(--surface3)", borderRadius: 5,
                    padding: "3px 8px", border: "1px solid var(--border)",
                  }}>{m}</span>
                ))}
              </div>

              {/* Email */}
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                  textTransform: "uppercase", color: "var(--text3)", marginBottom: 8,
                }}>Email for receipt</div>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 9,
                    border: `1.5px solid ${emailError ? "#f44336" : "var(--border)"}`,
                    background: "var(--surface2)", color: "var(--text)",
                    fontSize: 14, outline: "none",
                    fontFamily: "var(--font-body)", boxSizing: "border-box",
                    transition: "border-color 0.18s",
                  }}
                  onFocus={(e)  => e.target.style.borderColor = "var(--red)"}
                  onBlur={(e)   => e.target.style.borderColor = emailError ? "#f44336" : "var(--border)"}
                />
                {emailError && (
                  <div style={{ fontSize: 11, color: "#f44336", marginTop: 5 }}>{emailError}</div>
                )}
              </div>

              {/* Pay button */}
              <button
                onClick={pay}
                disabled={loading || finalAmount < 1}
                style={{
                  width: "100%", padding: "14px 0", borderRadius: 11,
                  border: "none",
                  background: loading || finalAmount < 1 ? "var(--surface3)" : "var(--red)",
                  color: loading || finalAmount < 1 ? "var(--text3)" : "#fff",
                  fontSize: 15, fontWeight: 700,
                  cursor: loading || finalAmount < 1 ? "not-allowed" : "pointer",
                  transition: "all 0.2s", fontFamily: "var(--font-body)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  boxShadow: finalAmount >= 1 && !loading ? "0 4px 20px rgba(0,180,166,0.3)" : "none",
                }}
              >
                {loading ? (
                  <>
                    <span style={{
                      width: 16, height: 16, borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      animation: "spin 0.6s linear infinite",
                      display: "inline-block", flexShrink: 0,
                    }} />
                    Opening checkout…
                  </>
                ) : (
                  `Donate $${finalAmount || "—"} · ₦${finalAmount ? (finalAmount * USD_TO_NGN).toLocaleString() : "—"}`
                )}
              </button>

              {/* Trust line */}
              <div style={{
                fontSize: 11, color: "var(--text3)", textAlign: "center",
                marginTop: 12,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2"/>
                </svg>
                Secured by Paystack · 256-bit SSL
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════════
              CRYPTO TAB
             ════════════════════════════════════════════════════════════ */}
          {tab === "crypto" && (
            <>
              {/* Coin selector */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {Object.entries(WALLETS).map(([id, w]) => (
                  <button
                    key={id}
                    onClick={() => setCoin(id)}
                    style={{
                      flex: 1, padding: "9px 0", borderRadius: 8,
                      border: `1.5px solid ${coin === id ? w.color : "var(--border)"}`,
                      background: coin === id ? `${w.color}18` : "var(--surface2)",
                      color: coin === id ? w.color : "var(--text3)",
                      fontWeight: 800, fontSize: 13, cursor: "pointer",
                      transition: "all 0.15s", fontFamily: "var(--font-body)",
                    }}
                  >
                    {w.symbol} {id.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Network warning */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
                padding: "8px 12px", background: "var(--surface3)", borderRadius: 8,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke={wallet.color} strokeWidth="2"/>
                  <line x1="12" y1="8" x2="12" y2="12" stroke={wallet.color} strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="12" cy="16" r="1" fill={wallet.color}/>
                </svg>
                <span style={{ fontSize: 12, color: "var(--text2)", fontWeight: 600 }}>{wallet.network}</span>
                <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: "auto" }}>
                  Only send {coin.toUpperCase()} on this network
                </span>
              </div>

              {/* Wallet address */}
              <div style={{
                background: "var(--surface2)",
                border: `1.5px solid ${wallet.color}30`,
                borderRadius: 12, padding: "14px 16px", marginBottom: 12,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
                  textTransform: "uppercase", color: wallet.color, marginBottom: 8,
                }}>Wallet Address</div>
                <div style={{
                  fontSize: 12, color: "var(--text)", wordBreak: "break-all",
                  lineHeight: 1.7, fontFamily: "monospace", letterSpacing: 0.3,
                }}>{wallet.address}</div>
              </div>

              {/* Copy button */}
              <button
                onClick={copy}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: 11,
                  border: `1.5px solid ${copied ? "#4caf50" : "var(--border)"}`,
                  background: copied ? "rgba(76,175,80,0.10)" : "var(--surface2)",
                  color: copied ? "#4caf50" : "var(--text)",
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  transition: "all 0.22s", fontFamily: "var(--font-body)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {copied ? (
                  <><span style={{ fontSize: 16 }}>✓</span> Address Copied!</>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    Copy Address
                  </>
                )}
              </button>

              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 8,
                background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.22)",
              }}>
                <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700, marginBottom: 3 }}>⚠ Important</div>
                <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.6 }}>
                  Only send {coin.toUpperCase()} to this address on the correct network.
                  Sending other assets may result in permanent loss.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}