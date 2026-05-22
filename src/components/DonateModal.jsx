import { useState, useEffect } from "react";

// ── YOUR PAYSTACK PUBLIC KEY ── replace with your real key ────────────────
const PAYSTACK_KEY = "sk_live_7a41cee8223af8ebae60c24c63fc8be8cdbb9886";

// ── Your wallet addresses ─────────────────────────────────────────────────
const WALLETS = {
  usdt: { address: "0xc216ee7748a18c1a451b223cd0e344553ecf86ce", network: "BSC (BEP20) · ERC20", color: "#26a17b", symbol: "₮" },
  eth:  { address: "0xc216ee7748a18c1a451b223cd0e344553ecf86ce", network: "Ethereum (ERC20)",    color: "#627eea", symbol: "Ξ" },
  btc:  { address: "12SDDVhtgYaKkmYg5tNxCygo43EqxndDXm",        network: "Bitcoin (BTC)",        color: "#f7931a", symbol: "₿" },
};

const AMOUNTS = [10, 25, 50, 100];

export default function DonateModal({ onClose }) {
  const [tab,          setTab]          = useState("card");
  const [amount,       setAmount]       = useState(25);
  const [custom,       setCustom]       = useState("");
  const [useCustom,    setUseCustom]    = useState(false);
  const [email,        setEmail]        = useState("");
  const [coin,         setCoin]         = useState("usdt");
  const [copied,       setCopied]       = useState(false);
  const [psReady,      setPsReady]      = useState(false);
  const [paying,       setPaying]       = useState(false);
  const [emailError,   setEmailError]   = useState("");

  // Load Paystack inline script once
  useEffect(() => {
    if (window.PaystackPop) { setPsReady(true); return; }
    if (document.getElementById("ps-script")) return;
    const s = document.createElement("script");
    s.id  = "ps-script";
    s.src = "https://js.paystack.co/v1/inline.js";
    s.onload = () => setPsReady(true);
    document.head.appendChild(s);
  }, []);

  const finalAmount = useCustom ? Math.max(0, parseFloat(custom) || 0) : amount;
  const wallet = WALLETS[coin];

  const pay = () => {
    if (!email || !/\S+@\S+\.\S+/.test(email)) { setEmailError("Enter a valid email"); return; }
    setEmailError("");
    if (finalAmount < 10) return;
    if (!psReady || !window.PaystackPop) { alert("Payment gateway loading, try again in a moment."); return; }
    setPaying(true);
    const handler = window.PaystackPop.setup({
      key:      PAYSTACK_KEY,
      email,
      amount:   Math.round(finalAmount * 100),
      currency: "USD",
      ref:      `ns_donate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      metadata: {
        custom_fields: [{ display_name: "Type", variable_name: "type", value: "NovaSpark Donation" }],
      },
      onClose:  () => setPaying(false),
      callback: () => { setPaying(false); onClose(); },
    });
    handler.openIframe();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = wallet.address;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      background: "rgba(5,12,15,0.88)", backdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        width: 460, maxWidth: "100%",
        boxShadow: "0 32px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(0,180,166,0.08)",
        overflow: "hidden",
        animation: "donateSlideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        <style>{`
          @keyframes donateSlideUp {
            from { opacity:0; transform: translateY(24px) scale(0.97); }
            to   { opacity:1; transform: translateY(0)   scale(1);     }
          }
        `}</style>

        {/* ── Header ── */}
        <div style={{
          padding: "24px 24px 0",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", gap: 10 }}>
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
          <button onClick={onClose} style={{
            background: "var(--surface3)", border: "none", borderRadius: 8,
            color: "var(--text3)", cursor: "pointer", width: 30, height: 30,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
            transition: "color 0.15s",
          }}>✕</button>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", margin: "20px 24px 0", gap: 8 }}>
          {[["card", "💳 Card / Bank"], ["crypto", "₿ Crypto"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid",
              borderColor: tab === id ? "var(--red)" : "var(--border)",
              background: tab === id ? "var(--red-dim)" : "transparent",
              color: tab === id ? "var(--red)" : "var(--text3)",
              fontWeight: 700, fontSize: 13, cursor: "pointer",
              transition: "all 0.2s", fontFamily: "var(--font-body)",
            }}>{label}</button>
          ))}
        </div>

        <div style={{ padding: "20px 24px 24px" }}>

          {/* ── Amount ── */}
          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
              textTransform: "uppercase", color: "var(--text3)", marginBottom: 10,
            }}>Amount (USD)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {AMOUNTS.map((a) => {
                const active = !useCustom && amount === a;
                return (
                  <button key={a} onClick={() => { setAmount(a); setUseCustom(false); }} style={{
                    padding: "9px 18px", borderRadius: 9, border: "1.5px solid",
                    borderColor: active ? "var(--amber)" : "var(--border)",
                    background: active ? "rgba(245,166,35,0.12)" : "var(--surface2)",
                    color: active ? "var(--amber)" : "var(--text2)",
                    fontWeight: 700, fontSize: 14, cursor: "pointer",
                    transition: "all 0.18s", fontFamily: "var(--font-body)",
                  }}>${a}</button>
                );
              })}
              <input
                type="number"
                placeholder="Custom"
                value={custom}
                min={10}
                onChange={(e) => { setCustom(e.target.value); setUseCustom(true); }}
                onFocus={() => setUseCustom(true)}
                style={{
                  padding: "9px 12px", borderRadius: 9, border: "1.5px solid",
                  borderColor: useCustom ? "var(--amber)" : "var(--border)",
                  background: useCustom ? "rgba(245,166,35,0.08)" : "var(--surface2)",
                  color: "var(--text)", fontSize: 14, outline: "none",
                  width: 88, fontFamily: "var(--font-body)",
                  transition: "all 0.18s",
                }}
              />
            </div>
            {finalAmount > 0 && finalAmount < 10 && (
              <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 6 }}>Minimum donation is $10</div>
            )}
          </div>

          {/* ── Card Tab ── */}
          {tab === "card" && (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                  textTransform: "uppercase", color: "var(--text3)", marginBottom: 8,
                }}>Your Email</div>
                <input
                  type="email"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 9,
                    border: `1.5px solid ${emailError ? "#f44336" : "var(--border)"}`,
                    background: "var(--surface2)", color: "var(--text)",
                    fontSize: 14, outline: "none", fontFamily: "var(--font-body)",
                    transition: "border-color 0.2s", boxSizing: "border-box",
                  }}
                  onFocus={(e) => e.target.style.borderColor = "var(--red)"}
                  onBlur={(e) => e.target.style.borderColor = emailError ? "#f44336" : "var(--border)"}
                />
                {emailError && <div style={{ fontSize: 11, color: "#f44336", marginTop: 5 }}>{emailError}</div>}
              </div>

              <button
                onClick={pay}
                disabled={paying || finalAmount < 10}
                style={{
                  width: "100%", padding: "14px 0", borderRadius: 11, border: "none",
                  background: finalAmount >= 10 ? "var(--red)" : "var(--surface3)",
                  color: finalAmount >= 10 ? "#fff" : "var(--text3)",
                  fontSize: 15, fontWeight: 700,
                  cursor: finalAmount >= 10 ? "pointer" : "not-allowed",
                  transition: "all 0.2s", fontFamily: "var(--font-body)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  boxShadow: finalAmount >= 10 ? "0 4px 20px rgba(0,180,166,0.3)" : "none",
                }}
              >
                {paying
                  ? <><span style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.6s linear infinite", display: "inline-block" }} />Opening...</>
                  : `Donate $${finalAmount || "—"} via Card / Bank`
                }
              </button>

              <div style={{
                fontSize: 11, color: "var(--text3)", textAlign: "center",
                marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2"/></svg>
                Secured by Paystack · 256-bit SSL
              </div>
            </>
          )}

          {/* ── Crypto Tab ── */}
          {tab === "crypto" && (
            <>
              {/* Coin selector */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {Object.entries(WALLETS).map(([id, w]) => (
                  <button key={id} onClick={() => setCoin(id)} style={{
                    flex: 1, padding: "9px 0", borderRadius: 8, border: "1.5px solid",
                    borderColor: coin === id ? w.color : "var(--border)",
                    background: coin === id ? `${w.color}18` : "var(--surface2)",
                    color: coin === id ? w.color : "var(--text3)",
                    fontWeight: 800, fontSize: 13, cursor: "pointer",
                    transition: "all 0.18s", fontFamily: "var(--font-body)",
                  }}>
                    {w.symbol} {id.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Network */}
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
                <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: "auto" }}>Only send {coin.toUpperCase()} on this network</span>
              </div>

              {/* Address box */}
              <div style={{
                background: "var(--surface2)", border: `1.5px solid ${wallet.color}30`,
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

              <button onClick={copy} style={{
                width: "100%", padding: "13px 0", borderRadius: 11, border: "1.5px solid",
                borderColor: copied ? "#4caf50" : "var(--border)",
                background: copied ? "rgba(76,175,80,0.1)" : "var(--surface2)",
                color: copied ? "#4caf50" : "var(--text)",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                transition: "all 0.25s", fontFamily: "var(--font-body)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                {copied
                  ? <><span style={{ fontSize: 16 }}>✓</span> Address Copied!</>
                  : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="2"/></svg> Copy Address</>
                }
              </button>

              <div style={{
                marginTop: 12, padding: "10px 14px", borderRadius: 8,
                background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)",
              }}>
                <div style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600, marginBottom: 3 }}>⚠ Important</div>
                <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.6 }}>
                  Only send {coin.toUpperCase()} to this address. Sending other coins may result in permanent loss.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}