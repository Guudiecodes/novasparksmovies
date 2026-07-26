import { useEffect } from "react";
import { getGateMessage } from "../utils/gate";
import { getDailyLimitMessage } from "../utils/premium";

/**
 * PremiumGate â€” psychology-enhanced upgrade modal.
 *
 * Adapts its tone automatically based on trial state:
*   • Trial active, first hit  → soft, benefit-forward
 *   • Trial final 24h          → countdown urgency
 *   • Trial expired            → loss aversion ("you HAD this")
 *   • Repeat block in session  → direct, price-forward
 *
 * Usage:
 *   {gateModal && <PremiumGate feature={gateModal} onUpgrade={fn} onClose={fn} />}
 */
export default function PremiumGate({ feature, onUpgrade, onClose }) {
  const isDailyFeature = feature === "shorts" || feature === "ai";
  const { icon, title, desc, subdesc, price, cta, urgency, plan } = isDailyFeature
    ? getDailyLimitMessage(feature)
    : getGateMessage(feature);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleUpgrade = () => {
    onClose();
    if (onUpgrade) onUpgrade();
    else window.dispatchEvent(new CustomEvent("novaspark:upgrade"));
  };

  // Urgency state uses a warm amber/gold palette (loss, scarcity).
  // Default state uses the brand teal â€” calm, inviting.
  const accentColor  = urgency ? "#f5a623" : "#00b4a6";
  const accentGlow   = urgency ? "rgba(245,166,35,0.18)" : "rgba(0,180,166,0.12)";
  const accentBorder = urgency ? "rgba(245,166,35,0.28)" : "rgba(0,180,166,0.2)";
  const ctaBg        = urgency
    ? "linear-gradient(90deg,#f5a623,#e07b00)"
    : "linear-gradient(90deg,#00b4a6,#007a72)";
  const ctaShadow    = urgency
    ? "0 4px 20px rgba(245,166,35,0.35)"
    : "0 4px 20px rgba(0,180,166,0.3)";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9500,
        background: "rgba(0,0,0,0.88)", backdropFilter: "blur(14px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        @keyframes nsGateIn {
          from { opacity:0; transform:translateY(16px) scale(0.97); }
          to   { opacity:1; transform:translateY(0)    scale(1);    }
        }
        .ns-gate-cta:hover {
          filter: brightness(1.12);
          transform: translateY(-2px);
        }
        .ns-gate-dismiss:hover {
          background: rgba(255,255,255,0.06) !important;
          color: rgba(255,255,255,0.75) !important;
        }
      `}</style>

      <div
        style={{
          width: "100%", maxWidth: 420,
          background: "linear-gradient(180deg,#141420 0%,#0e0e1a 100%)",
          border: `1px solid ${accentBorder}`,
          borderRadius: 20,
          boxShadow: `0 32px 80px rgba(0,0,0,0.9), 0 0 0 1px ${accentBorder}`,
          animation: "nsGateIn 0.22s cubic-bezier(0.34,1.05,0.64,1) both",
          padding: "36px 28px 28px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Ambient glow behind icon */}
        <div style={{
          position: "absolute", top: -50, left: "50%", transform: "translateX(-50%)",
          width: 140, height: 140, borderRadius: "50%",
          background: `radial-gradient(circle, ${accentGlow} 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />

        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 14, right: 16,
            background: "none", border: "none",
            color: "rgba(255,255,255,0.3)", fontSize: 22,
            cursor: "pointer", lineHeight: 1, padding: "4px 8px",
            borderRadius: 6, fontFamily: "inherit",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.75)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}
        >
          Ã—
        </button>

        {/* Icon */}
        <div style={{ fontSize: 44, marginBottom: 14, lineHeight: 1, position: "relative", zIndex: 1 }}>
          {icon}
        </div>

        {/* Title */}
        <div style={{
          fontSize: 20, fontWeight: 800, color: "#fff",
          marginBottom: 10, lineHeight: 1.3, position: "relative", zIndex: 1,
          letterSpacing: 0.2,
        }}>
          {title}
        </div>

        {/* Description */}
        <p style={{
          fontSize: 14, color: "rgba(255,255,255,0.6)", lineHeight: 1.75,
          margin: "0 auto 10px", maxWidth: 320, position: "relative", zIndex: 1,
        }}>
          {desc}
        </p>

        {/* Sub-description â€” loss aversion or social proof line */}
        {subdesc && (
          <p style={{
            fontSize: 12.5, color: accentColor, lineHeight: 1.6,
            margin: "0 auto 6px", maxWidth: 300,
            fontWeight: 600, position: "relative", zIndex: 1,
          }}>
            {subdesc}
          </p>
        )}

        {/* What you actually get — short, factual, answers "how does this work" */}
        {plan?.tagline && (
          <p style={{
            fontSize: 12, color: "rgba(255,255,255,0.42)", lineHeight: 1.6,
            margin: "0 auto 14px", maxWidth: 300, position: "relative", zIndex: 1,
          }}>
            {plan.tagline}
          </p>
        )}

        {/* Social proof badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 100, padding: "5px 14px", marginBottom: 16,
          fontSize: 11.5, color: "rgba(255,255,255,0.5)", fontWeight: 600,
          position: "relative", zIndex: 1,
        }}>
          â­ 50,000+ active subscribers
        </div>

        {/* Price badge */}
        {price && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: accentGlow,
            border: `1px solid ${accentBorder}`,
            borderRadius: 100, padding: "7px 18px", marginBottom: 20,
            fontSize: 13.5, fontWeight: 800, color: accentColor,
            position: "relative", zIndex: 1,
          }}>
            ðŸ’Ž {price}
          </div>
        )}

        {/* Primary CTA */}
        <button
          className="ns-gate-cta"
          onClick={handleUpgrade}
          style={{
            display: "block", width: "100%",
            background: ctaBg,
            border: "none", borderRadius: 12,
            color: urgency ? "#1a1000" : "#fff",
            padding: "13px 24px", fontSize: 15, fontWeight: 800,
            cursor: "pointer", fontFamily: "inherit",
            transition: "filter 0.15s, transform 0.15s",
            boxShadow: ctaShadow,
            marginBottom: 10, letterSpacing: 0.3,
            position: "relative", zIndex: 1,
          }}
        >
          ðŸ”“ {cta}
        </button>

        {/* Dismiss */}
        <button
          className="ns-gate-dismiss"
          onClick={onClose}
          style={{
            display: "block", width: "100%",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, color: "rgba(255,255,255,0.4)",
            padding: "11px 24px", fontSize: 13,
            cursor: "pointer", fontFamily: "inherit",
            transition: "background 0.15s, color 0.15s",
            position: "relative", zIndex: 1,
          }}
        >
          Maybe later
        </button>

        {/* Trust signal */}
        <p style={{
          fontSize: 11, color: "rgba(255,255,255,0.22)",
          marginTop: 14, letterSpacing: "0.02em",
          position: "relative", zIndex: 1,
        }}>
          ðŸ”’ Secure payment Â· Cancel anytime Â· Instant access
        </p>
      </div>
    </div>
  );
}