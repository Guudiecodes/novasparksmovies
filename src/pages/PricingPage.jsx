import { useState, useEffect } from "react";
import {
  PLANS,
  FEATURE_LABELS,
  TRIAL_DAYS,
  getEffectivePlan,
  getCurrentPlan,
  getPremiumRecord,
  canUpgradeTo,
  cancelPremium,
  daysRemaining,
  isPremiumActive,
  getExpiryWarning,
  dismissExpiryWarning,
  getTrialStatus,
  getTrialBannerMessage,
  formatPricePerDay,
} from "../utils/premium";
import PaymentModal from "../components/PaymentModal";
import RestoreModal from "../components/RestoreModal";
import { BackIcon } from "../components/Icons";

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "14px 18px", fontSize: 14, fontWeight: 600, color: "var(--text)", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        {q}
        <span style={{ fontSize: 18, color: "var(--text3)", flexShrink: 0, marginLeft: 12 }}>{open ? "âˆ’" : "+"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 18px 14px", fontSize: 13, color: "var(--text3)", lineHeight: 1.7 }}>{a}</div>
      )}
    </div>
  );
}

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
  const days = daysRemaining();
  return <span style={{ color: days <= 3 ? "var(--red)" : "#00b4a6", fontWeight: 700 }}>{timeLeft}</span>;
}

function ExpiryWarningBanner({ onRenew }) {
  const [warning, setWarning] = useState(() => getExpiryWarning());
  if (!warning) return null;
  const msgs = {
    "7d": { text: "Your plan expires in 7 days.",                             color: "#f5a623" },
    "3d": { text: "Your plan expires in 3 days — renew now to stay premium.", color: "#f97316" },
    "1d": { text: "⚠ Your plan expires tomorrow! Renew now or lose access.",   color: "var(--red)" },
  };
  const { text, color } = msgs[warning] || {};
  return (
    <div style={{ background: `${color}18`, border: `1px solid ${color}55`, borderRadius: 10, padding: "12px 18px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color, fontWeight: 600 }}>{text}</span>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 12px" }}
          onClick={() => { dismissExpiryWarning(warning); setWarning(null); }}>Dismiss</button>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 14px", background: color, border: "none" }}
          onClick={onRenew}>Renew now</button>
      </div>
    </div>
  );
}

/** Trial-status banner — only shown to a free user still inside the window. */
function TrialBanner() {
  const [msg] = useState(() => getTrialBannerMessage());
  if (!msg) return null;
  return (
    <div style={{ background: "rgba(245,166,35,0.1)", border: "1px solid rgba(245,166,35,0.3)", borderRadius: 10, padding: "12px 18px", marginBottom: 24, textAlign: "center", fontSize: 13, fontWeight: 600, color: "#f5a623" }}>
      {msg}
    </div>
  );
}

/** Short, honest explainer of how the trial → plan flow actually works. */
function HowItWorksStrip() {
  const steps = [
    { n: "1", title: `${TRIAL_DAYS}-day free trial`, desc: "Full access to everything, no card required to start." },
    { n: "2", title: "Pick a plan", desc: "Standard or Premium — pay with card, bank transfer, USSD, or crypto." },
    { n: "3", title: "Keep watching", desc: "Streaming, downloads, and your watchlist stay unlocked all month." },
  ];
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginBottom: 48 }}>
      {steps.map((s) => (
        <div key={s.n} style={{ flex: "1 1 220px", maxWidth: 260, textAlign: "center", padding: "18px 16px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(0,180,166,0.15)", color: "#00b4a6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, margin: "0 auto 10px" }}>
            {s.n}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{s.title}</div>
          <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.6 }}>{s.desc}</div>
        </div>
      ))}
    </div>
  );
}

export default function PricingPage({ isPremium, onPremiumUpdate, onBack }) {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showCancel,   setShowCancel]   = useState(false);
  const [showRestore,  setShowRestore]  = useState(false);
  const [, forceUpdate] = useState(0);

  const currentPlanId = getCurrentPlan();
  const record        = getPremiumRecord();
  const isActive       = isPremiumActive();
  const trial          = getTrialStatus();

  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  function handlePaySuccess() {
    onPremiumUpdate?.();
    forceUpdate((n) => n + 1);
  }

  function handleCancel() {
    cancelPremium();
    setShowCancel(false);
    forceUpdate((n) => n + 1);
    onPremiumUpdate?.();
  }

  const visiblePlans = ["standard", "premium"];

  return (
    <div style={{ padding: "32px 28px", maxWidth: 900, margin: "0 auto" }}>

      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        {onBack && (
          <button className="btn btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }} onClick={onBack}>
            <BackIcon /> Back
          </button>
        )}
        <button
          className="btn btn-ghost"
          style={{ fontSize: 13, color: "#00b4a6", borderColor: "rgba(0,180,166,0.3)" }}
          onClick={() => setShowRestore(true)}
        >
          Already subscribed? ðŸ”„ Restore access
        </button>
      </div>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 36, letterSpacing: 2, color: "var(--text)", marginBottom: 12 }}>
          UPGRADE NOVASPARK
        </div>
        <p style={{ fontSize: 15, color: "var(--text3)", maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>
          {trial.started && !trial.expired && currentPlanId === "free"
            ? `You're on your ${TRIAL_DAYS}-day free trial. Pick a plan before it ends to keep everything.`
            : "Unlock the full experience. Cancel any time — your plan runs until the end of your billing period."}
        </p>
      </div>

      <TrialBanner />
      <ExpiryWarningBanner onRenew={() => setSelectedPlan(PLANS.standard)} />

      {/* How it works */}
      <HowItWorksStrip />

      {/* Active subscription banner */}
      {isActive && record && record.planId !== "free" && (
        <div style={{ background: "rgba(0,180,166,0.08)", border: "1px solid rgba(0,180,166,0.3)", borderRadius: 12, padding: "16px 22px", marginBottom: 36, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
              {PLANS[record.planId]?.name} â€” Active
              {record.cancelledAt && (
                <span style={{ marginLeft: 10, fontSize: 11, background: "rgba(255,100,50,0.15)", color: "var(--red)", borderRadius: 4, padding: "2px 8px" }}>Cancelled</span>
              )}
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)" }}>
              {record.email && <span>{record.email} Â· </span>}
              <ExpiryTimer expiresAt={record.expiresAt} />
              {record.cancelledAt && <span style={{ marginLeft: 6 }}>Â· Access until {new Date(record.expiresAt).toLocaleDateString()}</span>}
            </div>
            {record.txnRef && (
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
                Ref: <code style={{ color: "var(--text2)" }}>{record.txnRef}</code>
              </div>
            )}
          </div>
          {!record.cancelledAt && (
            <button className="btn btn-ghost"
              style={{ fontSize: 12, color: "var(--red)", borderColor: "rgba(255,80,50,0.3)", padding: "6px 16px" }}
              onClick={() => setShowCancel(true)}>
              Cancel plan
            </button>
          )}
        </div>
      )}

      {/* Plan cards */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center", marginBottom: 56 }}>
        {visiblePlans.map((planId) => {
          const plan      = PLANS[planId];
          const isCurrent = currentPlanId === planId && isActive;
          const canBuy    = canUpgradeTo(planId);
          const perDay    = formatPricePerDay(plan);

          return (
            <div key={planId} style={{
              flex: "1 1 280px", maxWidth: 360,
              background: "var(--surface)",
              border: `2px solid ${isCurrent ? plan.color : "var(--border)"}`,
              borderRadius: 16, overflow: "hidden", position: "relative",
              boxShadow: isCurrent ? `0 0 0 1px ${plan.color}22` : "none",
            }}>
              {plan.badge && (
                <div style={{
                  position: "absolute", top: 16, right: 16,
                  background: `${plan.color}22`,
                  color: plan.color, border: `1px solid ${plan.color}66`,
                  borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700,
                }}>
                  {plan.badge}
                </div>
              )}

              <div style={{ padding: "28px 24px 24px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: plan.color, textTransform: "uppercase", marginBottom: 8 }}>
                  {plan.name}
                </div>

                <div style={{ fontSize: 36, fontWeight: 800, color: "var(--text)", lineHeight: 1.1, marginBottom: 2 }}>
                  ₦{plan.price.toLocaleString()}
                  <span style={{ fontSize: 14, fontWeight: 400, color: "var(--text3)" }}> /mo</span>
                </div>
                {perDay && (
                  <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 14 }}>{perDay}</div>
                )}

                <p style={{ fontSize: 12.5, color: "var(--text3)", lineHeight: 1.6, margin: "0 0 18px" }}>
                  {plan.tagline}
                </p>

                <ul style={{ listStyle: "none", margin: "0 0 24px", padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                  {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                    const has = plan.features[key];
                    return (
                      <li key={key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: has ? "var(--text)" : "var(--text3)" }}>
                        <span style={{ fontSize: 14, color: has ? "#48c774" : "var(--text3)", flexShrink: 0 }}>{has ? "âœ“" : "â€”"}</span>
                        {label}
                      </li>
                    );
                  })}
                </ul>

                {isCurrent ? (
                  <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: plan.color, padding: "10px 0", border: `1px solid ${plan.color}44`, borderRadius: 8 }}>
                    âœ“ Your current plan
                  </div>
                ) : canBuy ? (
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%", justifyContent: "center", background: plan.color, border: "none", fontSize: 14, fontWeight: 700, padding: "12px 0" }}
                    onClick={() => setSelectedPlan(plan)}
                  >
                    Get {plan.name} — ₦{plan.price.toLocaleString()}/mo
                  </button>
                ) : (
                  <div style={{ textAlign: "center", fontSize: 13, color: "var(--text3)", padding: "10px 0", border: "1px solid var(--border)", borderRadius: 8 }}>
                    Already subscribed
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Payment methods â€” Paystack channels only, no bank names */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
          Accepted payment methods
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {["Card", "Bank Transfer", "USSD", "Mobile Money", "Crypto"].map((m) => (
            <span key={m} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 12px", fontSize: 12, color: "var(--text2)" }}>
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Feature comparison */}
      <div style={{ marginBottom: 56, overflowX: "auto" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 16, textAlign: "center" }}>Full comparison</div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, color: "var(--text3)", borderBottom: "1px solid var(--border)" }}>Feature</th>
              {["standard", "premium"].map((planId) => (
                <th key={planId} style={{ textAlign: "center", padding: "10px 16px", fontSize: 12, color: PLANS[planId].color, borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
                  {PLANS[planId].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(FEATURE_LABELS).map(([key, label]) => (
              <tr key={key}>
                <td style={{ padding: "11px 16px", fontSize: 13, color: "var(--text2)", borderBottom: "1px solid var(--border)" }}>{label}</td>
                {["standard", "premium"].map((planId) => (
                  <td key={planId} style={{ textAlign: "center", padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
                    {PLANS[planId].features[key]
                      ? <span style={{ color: "#48c774", fontWeight: 700, fontSize: 15 }}>âœ“</span>
                      : <span style={{ color: "var(--text3)", fontSize: 13 }}>â€”</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FAQ */}
      <div style={{ marginBottom: 56 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 26, letterSpacing: 1, marginBottom: 20, color: "var(--text)", textAlign: "center" }}>
          FREQUENTLY ASKED QUESTIONS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 680, margin: "0 auto" }}>
          <FAQItem q="What do I get during the free trial?" a={`Everything — every plan's features, unlocked, for ${TRIAL_DAYS} days. No card required to start. When it ends, you'll need Standard or Premium to keep watching.`} />
          <FAQItem q="Can I cancel my subscription?" a="Yes — cancel any time from this page. Your plan stays active until the end of your 30-day billing period. No charges after that." />
          <FAQItem q="What if I clear my browser history?" a="No problem — click 'Already subscribed? Restore access' and enter your email and password. Your plan is stored on our server and restored instantly." />
          <FAQItem q="What if I forget my password?" a="Use the 'Forgot password' option in the restore screen. Enter your Paystack payment reference to verify your identity and set a new password." />
          <FAQItem q="How does payment work?" a="Pay securely via Paystack — card, bank transfer, USSD, mobile money, or crypto. Your plan activates immediately after payment is confirmed." />
          <FAQItem q="What happens when my trial or plan ends?" a="You drop to Free — browsing stays open, but watching, your watchlist, downloads, and subtitles lock. Nothing is deleted: your watchlist and history are kept safely and come right back the moment you subscribe." />
          <FAQItem q="Is it really ad-free?" a="Yes, on every plan including Free. No ads, ever." />
        </div>
      </div>

      {/* Cancel modal */}
      {showCancel && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "36px 40px", maxWidth: 440, width: "100%", boxShadow: "0 24px 64px rgba(0,0,0,0.7)" }}>
            <div style={{ fontSize: 22, fontFamily: "var(--font-display)", letterSpacing: 1, marginBottom: 10 }}>CANCEL SUBSCRIPTION?</div>
            <p style={{ fontSize: 14, color: "var(--text3)", lineHeight: 1.7, marginBottom: 8 }}>
              Your plan stays active until <strong style={{ color: "var(--text)" }}>
                {record?.expiresAt ? new Date(record.expiresAt).toLocaleDateString() : "your billing date"}
              </strong>.
            </p>
            <p style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.7, marginBottom: 24 }}>
              After that you drop to Free automatically. Watchlist and history are always kept — resubscribe anytime to pick up right where you left off.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowCancel(false)}>Keep my plan</button>
              <button className="btn" style={{ flex: 1, background: "var(--red)", color: "#fff", border: "none", fontWeight: 600 }} onClick={handleCancel}>Yes, cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {selectedPlan && (
        <PaymentModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} onSuccess={handlePaySuccess} />
      )}

      {/* Restore modal */}
      {showRestore && (
        <RestoreModal
          onClose={() => setShowRestore(false)}
          onSuccess={() => { setShowRestore(false); onPremiumUpdate?.(); forceUpdate((n) => n + 1); }}
        />
      )}
    </div>
  );
}
