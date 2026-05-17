import { useEffect } from "react";
import { getGateMessage } from "../utils/gate";

// ── PremiumGate ───────────────────────────────────────────────────────────────
// Psychology-enhanced modal for premium feature gating.
// Uses loss aversion, social proof, and urgency color theory.
// Usage: {gateModal && <PremiumGate feature={gateModal} onUpgrade={fn} onClose={fn} />}

export default function PremiumGate({ feature, onUpgrade, onClose }) {
  const { icon, title, desc, price } = getGateMessage(feature);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const handleUpgrade = () => {
    onClose();
    if (onUpgrade) {
      onUpgrade();
    } else {
      window.dispatchEvent(new CustomEvent("novaspark:upgrade"));
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9500,
        background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%", maxWidth: 440,
          background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
          border: "1px solid rgba(255,215,0,0.2)",
          borderRadius: 20,
          boxShadow: "0 32px 80px rgba(0,0,0,0.9), 0 0 40px rgba(255,215,0,0.05)",
          animation: "slideUp 0.25s ease",
          padding: "40px 32px 32px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow effect behind icon */}
        <div style={{
          position: "absolute", top: -40, left: "50%", transform: "translateX(-50%)",
          width: 120, height: 120, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,215,0,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 16,
            background: "none", border: "none",
            color: "var(--text3)", fontSize: 22, cursor: "pointer",
            lineHeight: 1, padding: "4px 8px", borderRadius: 6,
            fontFamily: "var(--font-body)",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text3)"; }}
          aria-label="Close"
        >
          ×
        </button>

        {/* Icon */}
        <div style={{ fontSize: 48, marginBottom: 16, lineHeight: 1, position: "relative", zIndex: 1 }}>{icon}</div>

        {/* Title with loss aversion framing */}
        <div style={{
          fontFamily: "var(--font-display)", fontSize: 22,
          letterSpacing: 0.5, color: "#fff", marginBottom: 8,
          fontWeight: 700,
        }}>
          Unlock {title}
        </div>

        {/* Description */}
        <p style={{
          fontSize: 15, color: "rgba(255,255,255,0.65)", lineHeight: 1.7,
          margin: "0 auto 16px", maxWidth: 340,
        }}>
          {desc}
        </p>

        {/* Social proof badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "rgba(99,202,183,0.08)", border: "1px solid rgba(99,202,183,0.2)",
          borderRadius: 100, padding: "6px 16px", marginBottom: 20,
          fontSize: 12, color: "#63cab7", fontWeight: 600,
        }}>
          ⭐ Join 50,000+ premium users
        </div>

        {/* Price badge — DOLLAR FIRST for anchoring */}
        {price && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.25)",
            borderRadius: 100, padding: "8px 20px", marginBottom: 24,
            fontSize: 14, fontWeight: 700, color: "#FFD700",
            letterSpacing: "0.02em",
          }}>
            <span style={{ fontSize: 18 }}>💎</span>
            {price}
          </div>
        )}

        {/* Primary CTA — Gold gradient for exclusivity/urgency */}
        <button
          onClick={handleUpgrade}
          style={{
            width: "100%",
            background: "linear-gradient(90deg, #FFD700, #FFA500)",
            border: "none", borderRadius: 12, color: "#1a1a2e",
            padding: "14px 28px", fontSize: 16, fontWeight: 800,
            cursor: "pointer", fontFamily: "var(--font-body)",
            transition: "all 0.2s",
            boxShadow: "0 4px 20px rgba(255,215,0,0.3)",
            marginBottom: 12,
            letterSpacing: "0.5px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 28px rgba(255,215,0,0.4)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 20px rgba(255,215,0,0.3)";
          }}
        >
          🔓 Unlock Now
        </button>

        {/* Secondary CTA */}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, color: "rgba(255,255,255,0.5)",
            padding: "12px 24px", fontSize: 14,
            cursor: "pointer", fontFamily: "var(--font-body)",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.color = "rgba(255,255,255,0.8)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "rgba(255,255,255,0.5)";
          }}
        >
          Maybe Later
        </button>

        {/* Trust signal */}
        <p style={{
          fontSize: 11, color: "rgba(255,255,255,0.3)",
          marginTop: 16, letterSpacing: "0.03em",
        }}>
          🔒 Secure payment · Cancel anytime · Instant access
        </p>
      </div>
    </div>
  );
}