import { getCurrentPlan, getTrialStatus, checkFreeDailyLimit, formatPrice, PLANS } from "../utils/premium";

/**
 * UsageStatus — compact, professional plan/limit indicator.
 * Silent for paying plans. Shows trial countdown or daily allowance
 * remaining for free users, with a cheap-upgrade nudge built in.
 */
export default function UsageStatus({ feature, onUpgrade }) {
  const purchased = getCurrentPlan();
  if (purchased !== "free") return null;

  const trial = getTrialStatus();
  if (trial.active) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.42)", padding: "4px 11px", borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", whiteSpace: "nowrap" }}>
        Trial · {trial.daysLeft}d left
      </div>
    );
  }

  const { remaining, limit } = checkFreeDailyLimit(feature);
  const low = remaining <= 3;
  return (
    <button
      onClick={onUpgrade}
      style={{
        display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 600, fontFamily: "inherit",
        color: low ? "#f5a623" : "rgba(255,255,255,0.5)",
        padding: "4px 12px", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap",
        background: low ? "rgba(245,166,35,0.1)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${low ? "rgba(245,166,35,0.28)" : "rgba(255,255,255,0.08)"}`,
      }}
    >
      {Math.max(0, remaining)}/{limit} left today · {formatPrice(PLANS.standard)}
    </button>
  );
}