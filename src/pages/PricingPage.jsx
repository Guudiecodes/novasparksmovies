import { useState, useCallback } from "react";
import {
  PLANS,
  PLAN_ORDER,
  FEATURE_LABELS,
  getEffectivePlan,
  formatPrice,
  canUpgradeTo,
  clearPremium,
  getPremiumPlan,
} from "../utils/premium";
import PaymentModal from "../components/PaymentModal";
import { BackIcon } from "../components/Icons";

// ── Inline plan psychology notes ──────────────────────────────────────────────
// 1. "Most Popular" on Standard — anchors users toward the middle-premium tier
// 2. "Best Value" on Premium — loss aversion: they feel they'd miss out skipping it
// 3. Free plan shown first but visually de-emphasised — highlights what's missing
// 4. Prices shown in NGN first, USD second — local currency feels more familiar
// 5. Feature list uses ✓ for available, — for unavailable — unavailable items
//    stay visible (not hidden) so users feel what they're missing

const USD_RATE = 1600;
function ngn2usd(ngn) {
  return `~$${(ngn / USD_RATE).toFixed(2)} USD`;
}

// Which plans get marketing labels
const PLAN_LABELS = {
  standard: { text: "⭐ MOST POPULAR", color: "#8b5cf6", bg: "rgba(139,92,246,0.15)" },
  premium:  { text: "💎 BEST VALUE",   color: "#f5c518", bg: "rgba(245,197,24,0.12)"  },
};

// Border colors per plan
const PLAN_BORDERS = {
  free:     "#374151",
  mobile:   "#10b981",
  basic:    "#3b82f6",
  standard: "#8b5cf6",
  premium:  "#f5c518",
};

// ── Plan card ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, isCurrent, canUpgrade, onUpgrade }) {
  const label  = PLAN_LABELS[plan.id];
  const border = PLAN_BORDERS[plan.id] || "#374151";
  const isHighlighted = plan.id === "standard" || plan.id === "premium";

  return (
    <div style={{
      position: "relative",
      background: isHighlighted
        ? `linear-gradient(180deg, rgba(${plan.id === "standard" ? "139,92,246" : "245,197,24"},0.08) 0%, var(--surface) 60%)`
        : "var(--surface)",
      border: `2px solid ${isCurrent ? border : isHighlighted ? border : "var(--border)"}`,
      borderRadius: 16,
      padding: "28px 24px 24px",
      display: "flex",
      flexDirection: "column",
      minWidth: 200,
      flex: 1,
      transition: "transform 0.2s, box-shadow 0.2s",
      boxShadow: isCurrent
        ? `0 0 0 3px ${border}33, 0 8px 32px rgba(0,0,0,0.4)`
        : isHighlighted
        ? `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${border}44`
        : "0 4px 16px rgba(0,0,0,0.25)",
    }}
      onMouseEnter={(e) => {
        if (!isCurrent) {
          e.currentTarget.style.transform = "translateY(-4px)";
          e.currentTarget.style.boxShadow = `0 16px 48px rgba(0,0,0,0.55), 0 0 0 2px ${border}55`;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = isCurrent
          ? `0 0 0 3px ${border}33, 0 8px 32px rgba(0,0,0,0.4)`
          : isHighlighted
          ? `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${border}44`
          : "0 4px 16px rgba(0,0,0,0.25)";
      }}
    >
      {/* Marketing label */}
      {label && (
        <div style={{
          position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
          background: label.bg, border: `1px solid ${label.color}`,
          borderRadius: 100, padding: "4px 16px",
          fontSize: 11, fontWeight: 800, color: label.color,
          whiteSpace: "nowrap", letterSpacing: "0.06em",
        }}>
          {label.text}
        </div>
      )}

      {/* Current plan badge */}
      {isCurrent && (
        <div style={{
          position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)",
          background: `${border}22`, border: `1px solid ${border}`,
          borderRadius: 100, padding: "4px 16px",
          fontSize: 11, fontWeight: 800, color: border,
          whiteSpace: "nowrap",
        }}>
          ✓ CURRENT PLAN
        </div>
      )}

      {/* Plan name */}
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 22,
        letterSpacing: 2, color: plan.color, marginBottom: 12,
        textTransform: "uppercase", fontWeight: 700,
      }}>
        {plan.name}
      </div>

      {/* Price */}
      <div style={{ marginBottom: 6 }}>
        {plan.price === 0 ? (
          <span style={{ fontSize: 36, fontWeight: 800, color: "var(--text)" }}>Free</span>
        ) : (
          <>
            <span style={{ fontSize: 36, fontWeight: 800, color: "var(--text)" }}>
              ₦{plan.price.toLocaleString()}
            </span>
            <span style={{ fontSize: 14, color: "var(--text3)", marginLeft: 4 }}>/mo</span>
          </>
        )}
      </div>
      {plan.price > 0 && (
        <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 10 }}>
          {ngn2usd(plan.price)} / month
        </div>
      )}

      {/* Devices + quality */}
      <div style={{
        fontSize: 13, color: "var(--text3)", marginBottom: 20,
        paddingBottom: 16, borderBottom: "1px solid var(--border)",
      }}>
        {plan.devices} device{plan.devices > 1 ? "s" : ""} · {plan.quality}
      </div>

      {/* Feature list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, marginBottom: 24 }}>
        {Object.entries(FEATURE_LABELS).map(([key, label]) => {
          const has = plan.features[key];
          return (
            <div key={key} style={{
              display: "flex", alignItems: "center", gap: 10,
              opacity: has ? 1 : 0.4,
            }}>
              <span style={{
                fontSize: 13, fontWeight: 700, flexShrink: 0,
                color: has ? "#48c774" : "var(--text3)",
                width: 16, textAlign: "center",
              }}>
                {has ? "✓" : "—"}
              </span>
              <span style={{ fontSize: 13, color: has ? "var(--text2)" : "var(--text3)" }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* CTA button */}
      {isCurrent ? (
        <button
          disabled
          style={{
            width: "100%", padding: "13px 0",
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 10, fontSize: 14, fontWeight: 600,
            color: "var(--text3)", cursor: "default",
          }}
        >
          Current Plan
        </button>
      ) : canUpgrade ? (
        <button
          onClick={() => onUpgrade(plan)}
          style={{
            width: "100%", padding: "13px 0",
            background: plan.id === "premium"
              ? "linear-gradient(90deg, #f5c518, #ff9500)"
              : plan.id === "standard"
              ? "linear-gradient(90deg, #8b5cf6, #6d28d9)"
              : plan.id === "basic"
              ? "linear-gradient(90deg, #3b82f6, #1d4ed8)"
              : "linear-gradient(90deg, #10b981, #059669)",
            border: "none",
            borderRadius: 10, fontSize: 15, fontWeight: 700,
            color: plan.id === "premium" ? "#1a1a2e" : "#fff",
            cursor: "pointer",
            transition: "opacity 0.2s, transform 0.15s",
            boxShadow: `0 4px 20px ${plan.color}44`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "0.9";
            e.currentTarget.style.transform = "scale(1.02)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          Upgrade to {plan.name}
        </button>
      ) : (
        <button
          disabled
          style={{
            width: "100%", padding: "13px 0",
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 10, fontSize: 14, fontWeight: 600,
            color: "var(--text3)", cursor: "default",
          }}
        >
          Included in your plan
        </button>
      )}
    </div>
  );
}

// ── Comparison table ──────────────────────────────────────────────────────────
function CompareTable({ currentPlanId }) {
  const plans = PLAN_ORDER.map((id) => PLANS[id]);
  return (
    <div style={{ overflowX: "auto", marginTop: 48 }}>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: 28,
        letterSpacing: 1, marginBottom: 24, color: "var(--text)",
        textAlign: "center",
      }}>
        COMPARE PLANS
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 12, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border)" }}>
              Feature
            </th>
            {plans.map((p) => (
              <th key={p.id} style={{
                textAlign: "center", padding: "12px 16px",
                fontSize: 13, fontWeight: 700,
                color: p.id === currentPlanId ? p.color : "var(--text2)",
                borderBottom: "1px solid var(--border)",
                background: p.id === currentPlanId ? `${PLAN_BORDERS[p.id]}11` : "transparent",
              }}>
                {p.name}
                {p.id === currentPlanId && (
                  <div style={{ fontSize: 10, color: p.color, fontWeight: 600, marginTop: 2 }}>
                    ← yours
                  </div>
                )}
              </th>
            ))}
          </tr>
          <tr>
            <td style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)" }} />
            {plans.map((p) => (
              <td key={p.id} style={{
                textAlign: "center", padding: "8px 16px",
                fontSize: 12, color: "var(--text3)",
                borderBottom: "1px solid var(--border)",
              }}>
                {p.price === 0 ? "Free" : `₦${p.price.toLocaleString()}/mo`}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(FEATURE_LABELS).map(([key, label], i) => (
            <tr key={key} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
              <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>
                {label}
              </td>
              {plans.map((p) => (
                <td key={p.id} style={{
                  textAlign: "center", padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                  background: p.id === currentPlanId ? `${PLAN_BORDERS[p.id]}08` : "transparent",
                }}>
                  {p.features[key] ? (
                    <span style={{ color: "#48c774", fontSize: 16, fontWeight: 700 }}>✓</span>
                  ) : (
                    <span style={{ color: "var(--border)", fontSize: 14 }}>—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>
              Devices
            </td>
            {plans.map((p) => (
              <td key={p.id} style={{
                textAlign: "center", padding: "12px 16px", fontSize: 13, color: "var(--text2)",
                borderBottom: "1px solid var(--border)",
                background: p.id === currentPlanId ? `${PLAN_BORDERS[p.id]}08` : "transparent",
              }}>
                {p.devices}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text2)" }}>
              Quality
            </td>
            {plans.map((p) => (
              <td key={p.id} style={{
                textAlign: "center", padding: "12px 16px", fontSize: 12, color: "var(--text2)",
                background: p.id === currentPlanId ? `${PLAN_BORDERS[p.id]}08` : "transparent",
              }}>
                {p.quality}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 10,
      overflow: "hidden", background: "var(--surface)",
    }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", textAlign: "left", padding: "16px 20px",
          background: "transparent", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{q}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: "0 20px 16px", fontSize: 13, color: "var(--text3)", lineHeight: 1.7 }}>
          {a}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PricingPage({ isPremium, onPremiumUpdate, onBack }) {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showCancel,   setShowCancel]   = useState(false);

  // Read effective plan on every render + after payment
  const currentPlanId = getEffectivePlan();
  const record        = getPremiumPlan();

  const handleUpgrade = useCallback((plan) => {
    setSelectedPlan(plan);
  }, []);

  const handlePaySuccess = useCallback((plan, email, ref) => {
    setSelectedPlan(null);
    onPremiumUpdate?.(); // tells App.jsx to re-read premium state immediately
  }, [onPremiumUpdate]);

  const handleCancel = () => {
    clearPremium();
    setShowCancel(false);
    onPremiumUpdate?.();
  };

  const plans = PLAN_ORDER.map((id) => PLANS[id]);

  return (
    <div className="fade-in" style={{ padding: "40px 32px 80px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ flexShrink: 0 }}>
          <BackIcon /> Back
        </button>
      </div>

      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "var(--font-display)", fontSize: 48, letterSpacing: 1,
          marginBottom: 12, lineHeight: 1.1,
        }}>
          CHOOSE YOUR PLAN
        </div>
        <p style={{ fontSize: 16, color: "var(--text3)", maxWidth: 520, margin: "0 auto", lineHeight: 1.7 }}>
          Start free. Upgrade any time. No hidden fees — cancel whenever you want.
          All plans include our full ad-free content library.
        </p>

        {/* Trust signals */}
        <div style={{ display: "flex", gap: 24, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
          {["🔒 Secure payment", "⚡ Instant activation", "🔄 Cancel anytime", "📱 All devices"].map((t) => (
            <span key={t} style={{ fontSize: 13, color: "var(--text3)", fontWeight: 500 }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div style={{
        display: "flex", gap: 16, flexWrap: "wrap",
        alignItems: "stretch", justifyContent: "center",
      }}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isCurrent={plan.id === currentPlanId}
            canUpgrade={canUpgradeTo(plan.id)}
            onUpgrade={handleUpgrade}
          />
        ))}
      </div>

      {/* Payment methods strip */}
      <div style={{
        marginTop: 32, textAlign: "center",
        fontSize: 13, color: "var(--text3)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap",
      }}>
        <span>Pay with:</span>
        {["💳 Card", "🏦 Bank Transfer"].map((m) => (
          <span key={m} style={{
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 6, padding: "4px 10px", fontSize: 12,
          }}>
            {m}
          </span>
        ))}
      </div>

      {/* Account info if subscribed */}
      {record && record.planId !== "free" && (
        <div style={{
          marginTop: 40, padding: "20px 24px",
          background: "var(--surface2)", border: "1px solid var(--border)",
          borderRadius: 12,
        }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 8 }}>
            Your subscription
          </div>
          <div style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.8 }}>
            Plan: <strong style={{ color: PLANS[record.planId]?.color }}>{PLANS[record.planId]?.name || record.planId}</strong>
            {record.email && <> · Account: <strong style={{ color: "var(--text)" }}>{record.email}</strong></>}
            {record.expiresAt && (
              <> · Renews: <strong style={{ color: "var(--text)" }}>
                {new Date(record.expiresAt).toLocaleDateString()}
              </strong></>
            )}
          </div>
          <button
            className="btn btn-ghost"
            style={{ marginTop: 14, fontSize: 12, color: "var(--text3)", padding: "6px 14px" }}
            onClick={() => setShowCancel(true)}
          >
            Cancel subscription
          </button>
        </div>
      )}

      {/* Comparison table */}
      <CompareTable currentPlanId={currentPlanId} />

      {/* FAQ */}
      <div style={{ marginTop: 56 }}>
        <div style={{
          fontFamily: "var(--font-display)", fontSize: 28,
          letterSpacing: 1, marginBottom: 24, color: "var(--text)",
          textAlign: "center",
        }}>
          FREQUENTLY ASKED QUESTIONS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 680, margin: "0 auto" }}>
          <FAQItem
            q="Can I cancel my subscription?"
            a="Yes — cancel any time from this page. Your plan stays active until the end of the billing period, then you drop back to Free automatically. No charges after that."
          />
          <FAQItem
            q="Do I need an account?"
            a="Yes — when you upgrade you create an email + password account. This is stored securely on your device and used to identify your subscription."
          />
          <FAQItem
            q="How does payment work?"
            a="Pay via Paystack (card, OPay, PalmPay, Kuda, bank transfer, USSD) or crypto. Your plan activates immediately after payment is confirmed."
          />
          <FAQItem
            q="What happens when my plan expires?"
            a="You'll automatically drop to the Free plan. All your watchlist and history stays intact — you just lose premium features until you renew."
          />
          <FAQItem
            q="Can I upgrade later?"
            a="Absolutely — upgrade any time from this page. Your new plan takes effect immediately."
          />
          <FAQItem
            q="Is it really ad-free?"
            a="Yes. NovaSpark is completely ad-free across all plans. No ads ever — that's a promise."
          />
        </div>
      </div>

      {/* Cancel confirm */}
      {showCancel && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 14, padding: "36px 40px", maxWidth: 440, width: "100%",
            boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
          }}>
            <div style={{ fontSize: 24, fontFamily: "var(--font-display)", letterSpacing: 1, marginBottom: 10 }}>
              CANCEL SUBSCRIPTION?
            </div>
            <p style={{ fontSize: 14, color: "var(--text3)", lineHeight: 1.7, marginBottom: 24 }}>
              You'll lose access to all premium features immediately.
              Your watchlist and history will be kept.
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowCancel(false)}>
                Keep my plan
              </button>
              <button
                className="btn"
                style={{ flex: 1, background: "var(--red)", color: "#fff", border: "none", fontWeight: 600 }}
                onClick={handleCancel}
              >
                Yes, cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {selectedPlan && (
        <PaymentModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onSuccess={handlePaySuccess}
        />
      )}
    </div>
  );
}