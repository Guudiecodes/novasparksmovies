import { useState, useEffect } from "react";
import {
  PLANS,
  PLAN_ORDER,
  FEATURE_LABELS,
  getEffectivePlan,
  getPremiumRecord,
  canUpgradeTo,
  cancelPremium,
  daysRemaining,
  isPremiumActive,
  ngn2usd,
} from "../utils/premium";
import PaymentModal from "../components/PaymentModal";
import { BackIcon } from "../components/Icons";

// ── FAQ item ──────────────────────────────────────────────────────────────────
function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        background: "var(--surface2)", border: "1px solid var(--border)",
        borderRadius: 10, overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", textAlign: "left", background: "none", border: "none",
          padding: "14px 18px", fontSize: 14, fontWeight: 600, color: "var(--text)",
          cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        {q}
        <span style={{ fontSize: 18, color: "var(--text3)", flexShrink: 0, marginLeft: 12 }}>
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 18px 14px", fontSize: 13, color: "var(--text3)", lineHeight: 1.7 }}>
          {a}
        </div>
      )}
    </div>
  );
}

// ── Countdown timer ───────────────────────────────────────────────────────────
function ExpiryTimer({ expiresAt }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const ms = expiresAt - Date.now();
      if (ms <= 0) { setTimeLeft("Expired"); return; }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      if (d > 0) setTimeLeft(`${d}d ${h}h ${m}m remaining`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s remaining`);
      else setTimeLeft(`${m}m ${s}s remaining`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return (
    <span style={{ color: daysRemaining() <= 3 ? "var(--red)" : "#00b4a6", fontWeight: 700 }}>
      {timeLeft}
    </span>
  );
}

// ── Feature check row ─────────────────────────────────────────────────────────
function FeatureRow({ label, plans }) {
  return (
    <tr>
      <td style={{ padding: "11px 16px", fontSize: 13, color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>
        {label}
      </td>
      {PLAN_ORDER.filter((p) => p !== "free").map((planId) => (
        <td key={planId} style={{ textAlign: "center", padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
          {plans[planId]
            ? <span style={{ color: "#48c774", fontWeight: 700, fontSize: 15 }}>✓</span>
            : <span style={{ color: "var(--text3)", fontSize: 13 }}>—</span>
          }
        </td>
      ))}
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PricingPage({ isPremium, onPremiumUpdate, onBack }) {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showCancel,   setShowCancel]   = useState(false);
  const [, forceUpdate] = useState(0);

  const currentPlanId = getEffectivePlan();
  const record        = getPremiumRecord();
  const isActive      = isPremiumActive();

  // Re-render every minute to keep timer/expiry fresh
  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  function handlePaySuccess(plan, email, ref) {
    onPremiumUpdate?.();
    forceUpdate((n) => n + 1);
  }

  function handleCancel() {
    cancelPremium();
    setShowCancel(false);
    forceUpdate((n) => n + 1);
    onPremiumUpdate?.();
  }

  // Only Standard and Premium shown (not Free)
  const visiblePlans = ["standard", "premium"];

  return (
    <div style={{ padding: "32px 28px", maxWidth: 860, margin: "0 auto" }}>

      {/* Back */}
      {onBack && (
        <button
          className="btn btn-ghost"
          style={{ marginBottom: 28, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          onClick={onBack}
        >
          <BackIcon /> Back
        </button>
      )}

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          fontFamily: "var(--font-display)", fontSize: 36,
          letterSpacing: 2, color: "var(--text)", marginBottom: 12,
        }}>
          UPGRADE NOVASPARK
        </div>
        <p style={{ fontSize: 15, color: "var(--text3)", maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>
          Unlock the full experience. Cancel any time — your plan runs until the end of your billing period.
        </p>
      </div>

      {/* Active subscription banner */}
      {isActive && record && record.planId !== "free" && (
        <div style={{
          background: "rgba(0,180,166,0.08)", border: "1px solid rgba(0,180,166,0.3)",
          borderRadius: 12, padding: "16px 22px", marginBottom: 36,
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
              {PLANS[record.planId]?.name} — Active
              {record.cancelledAt && (
                <span style={{ marginLeft: 10, fontSize: 11, background: "rgba(255,100,50,0.15)", color: "var(--red)", borderRadius: 4, padding: "2px 8px" }}>
                  Cancelled
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)" }}>
              {record.email && <span>{record.email} · </span>}
              <ExpiryTimer expiresAt={record.expiresAt} />
              {record.cancelledAt && (
                <span style={{ marginLeft: 6, color: "var(--text3)" }}>
                  · Access until {new Date(record.expiresAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          {!record.cancelledAt && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: 12, color: "var(--red)", borderColor: "rgba(255,80,50,0.3)", padding: "6px 16px" }}
              onClick={() => setShowCancel(true)}
            >
              Cancel plan
            </button>
          )}
        </div>
      )}

      {/* Plan cards */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center", marginBottom: 56 }}>
        {visiblePlans.map((planId) => {
          const plan      = PLANS[planId];
          const isCurrent = currentPlanId === planId;
          const canBuy    = !plan.comingSoon && canUpgradeTo(planId);

          return (
            <div
              key={planId}
              style={{
                flex: "1 1 300px", maxWidth: 380,
                background: "var(--surface)",
                border: `2px solid ${isCurrent ? plan.color : "var(--border)"}`,
                borderRadius: 16, overflow: "hidden", position: "relative",
                boxShadow: isCurrent ? `0 0 0 1px ${plan.color}22` : "none",
                transition: "border-color 0.2s",
              }}
            >
              {/* Badge */}
              {plan.badge && (
                <div style={{
                  position: "absolute", top: 16, right: 16,
                  background: plan.comingSoon ? "rgba(245,166,35,0.15)" : "rgba(0,180,166,0.15)",
                  color: plan.comingSoon ? "#f5a623" : "#00b4a6",
                  border: `1px solid ${plan.comingSoon ? "rgba(245,166,35,0.4)" : "rgba(0,180,166,0.4)"}`,
                  borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700,
                }}>
                  {plan.badge}
                </div>
              )}

              <div style={{ padding: "28px 24px 24px" }}>
                {/* Plan name */}
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 2,
                  color: plan.color, textTransform: "uppercase", marginBottom: 8,
                }}>
                  {plan.name}
                </div>

                {/* Price */}
                {plan.comingSoon ? (
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text3)", marginBottom: 4 }}>
                    Coming Soon
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 2 }}>
                      {ngn2usd(plan.price)} · <span style={{ color: "var(--text)", fontWeight: 600 }}>₦{plan.price.toLocaleString()}</span> / month
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "var(--text)", lineHeight: 1.1, marginBottom: 4 }}>
                      ₦{plan.price.toLocaleString()}
                      <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text3)" }}> /mo</span>
                    </div>
                  </>
                )}

                {/* Features */}
                <ul style={{ listStyle: "none", margin: "20px 0 24px", padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                    const has = plan.features[key];
                    return (
                      <li key={key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: has ? "var(--text)" : "var(--text3)" }}>
                        <span style={{ fontSize: 15, color: has ? "#48c774" : "var(--text3)", flexShrink: 0 }}>
                          {has ? "✓" : "—"}
                        </span>
                        {label}
                      </li>
                    );
                  })}
                </ul>

                {/* CTA button */}
                {isCurrent && isActive ? (
                  <div style={{
                    textAlign: "center", fontSize: 13, fontWeight: 700,
                    color: plan.color, padding: "10px 0",
                    border: `1px solid ${plan.color}44`, borderRadius: 8,
                  }}>
                    ✓ Your current plan
                  </div>
                ) : plan.comingSoon ? (
                  <div style={{
                    textAlign: "center", fontSize: 13, color: "var(--text3)",
                    padding: "10px 0", border: "1px solid var(--border)", borderRadius: 8,
                  }}>
                    Notify me when available
                  </div>
                ) : canBuy ? (
                  <button
                    className="btn btn-primary"
                    style={{
                      width: "100%", justifyContent: "center",
                      background: plan.color, border: "none",
                      fontSize: 14, fontWeight: 700, padding: "12px 0",
                    }}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    Get {plan.name} — ₦{plan.price.toLocaleString()}/mo
                  </button>
                ) : (
                  <div style={{
                    textAlign: "center", fontSize: 13, color: "var(--text3)",
                    padding: "10px 0", border: "1px solid var(--border)", borderRadius: 8,
                  }}>
                    {currentPlanId === "free" ? "Select a plan above" : "Already subscribed"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Payment methods accepted */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
          Accepted payment methods
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {["Card", "Bank Transfer","Crypto"].map((m) => (
            <span key={m} style={{
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 6, padding: "4px 12px", fontSize: 12, color: "var(--text2)",
            }}>
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Feature comparison table */}
      <div style={{ marginBottom: 56, overflowX: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 16, textAlign: "center" }}>
          Full comparison
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>
                Feature
              </th>
              {visiblePlans.map((planId) => (
                <th key={planId} style={{
                  textAlign: "center", padding: "10px 16px",
                  fontSize: 12, color: PLANS[planId].color,
                  borderBottom: "1px solid var(--border)", fontWeight: 700,
                }}>
                  {PLANS[planId].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(FEATURE_LABELS).map(([key, label]) => (
              <FeatureRow
                key={key}
                label={label}
                plans={{
                  standard: PLANS.standard.features[key],
                  premium:  PLANS.premium.features[key],
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* FAQ */}
      <div style={{ marginBottom: 56 }}>
        <div style={{
          fontFamily: "var(--font-display)", fontSize: 26,
          letterSpacing: 1, marginBottom: 20, color: "var(--text)", textAlign: "center",
        }}>
          FREQUENTLY ASKED QUESTIONS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 680, margin: "0 auto" }}>
          <FAQItem
            q="Can I cancel my subscription?"
            a="Yes — cancel any time from this page. Your plan stays active until the end of your 30-day billing period. No charges after that."
          />
          <FAQItem
            q="What happens if I cancel mid-month?"
            a="Nothing changes immediately. Your access continues until your billing period ends, then you drop to the Free plan automatically. You always get the full 30 days you paid for."
          />
          <FAQItem
            q="Do I need an account?"
            a="Yes — when you upgrade you create an email + password account stored securely on your device to identify your subscription."
          />
          <FAQItem
            q="How does payment work?"
            a="Pay via Paystack (card, bank transfer) or crypto. Your plan activates immediately after payment is confirmed."
          />
          <FAQItem
            q="What happens when my plan expires?"
            a="You automatically drop to the Free plan. Your watchlist and history are always kept — you just lose premium features until you renew."
          />
          <FAQItem
            q="Is it really ad-free?"
            a="Yes. NovaSpark is completely ad-free across all plans. No ads, ever."
          />
          <FAQItem
            q="Can I upgrade from Standard to Premium later?"
            a="Absolutely — Premium is coming soon. When it launches, you can upgrade any time and your new plan takes effect immediately."
          />
        </div>
      </div>

      {/* Cancel confirm modal */}
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
            <div style={{ fontSize: 22, fontFamily: "var(--font-display)", letterSpacing: 1, marginBottom: 10 }}>
              CANCEL SUBSCRIPTION?
            </div>
            <p style={{ fontSize: 14, color: "var(--text3)", lineHeight: 1.7, marginBottom: 8 }}>
              Your plan will remain active until <strong style={{ color: "var(--text)" }}>
                {record?.expiresAt ? new Date(record.expiresAt).toLocaleDateString() : "your billing date"}
              </strong>.
            </p>
            <p style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.7, marginBottom: 24 }}>
              After that you'll drop to Free automatically. Your watchlist and history are always kept.
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