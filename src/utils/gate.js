/**
 * gate.js — NovaSpark feature gate
 *
 * Single source of truth for what each plan can access.
 * Import this everywhere; never scatter plan-level logic in pages.
 *
 * Plan order (ascending):
 *   free → mobile → basic → standard → premium
 *
 * ── OPEN ACCESS MODE ─────────────────────────────────────────────────────────
 * All features are currently FREE for all users.
 * Set OPEN_ACCESS = false to re-enable plan-based gating.
 */

export const OPEN_ACCESS = true; // ← flip to false to re-enable gating

// ── Storage prefix (must match storage.js) ────────────────────────────────────
const PREFIX = "streambert_";

// ── Plan rank map ─────────────────────────────────────────────────────────────
const PLAN_RANK = {
  free:     0,
  mobile:   1,
  basic:    2,
  standard: 3,
  premium:  4,
};

/**
 * Returns the active plan id for the current user.
 * In OPEN_ACCESS mode always returns "premium" so UI labels reflect full access.
 */
export function getCurrentPlan() {
  if (OPEN_ACCESS) return "premium";
  try {
    const raw = localStorage.getItem(PREFIX + "ns_premium_record");
    if (!raw) return "free";
    const rec = JSON.parse(raw);
    if (!rec || !rec.planId || rec.planId === "free") return "free";
    if (rec.expiresAt && Date.now() >= rec.expiresAt) return "free";
    return rec.planId;
  } catch {
    return "free";
  }
}

export function getAdminGlobalPlan() {
  try {
    return localStorage.getItem("ns_admin_global_plan") || "free";
  } catch {
    return "free";
  }
}

export function setAdminGlobalPlan(planId) {
  try {
    if (!planId || planId === "free") {
      localStorage.removeItem("ns_admin_global_plan");
    } else {
      localStorage.setItem("ns_admin_global_plan", planId);
    }
  } catch {}
}

export function getEffectivePlan(planId) {
  if (OPEN_ACCESS) return "premium";
  const user  = planId || getCurrentPlan();
  const floor = getAdminGlobalPlan();
  const userRank  = PLAN_RANK[user]  ?? 0;
  const floorRank = PLAN_RANK[floor] ?? 0;
  return floorRank > userRank ? floor : user;
}

/** In OPEN_ACCESS mode always returns true. */
function atLeast(planId, requiredId) {
  if (OPEN_ACCESS) return true;
  const effective = getEffectivePlan(planId);
  return (PLAN_RANK[effective] ?? 0) >= (PLAN_RANK[requiredId] ?? 999);
}

// ── Feature gates (all return true in OPEN_ACCESS mode) ─────────────────────

export function canSwitchSource(planId)  { return atLeast(planId, "mobile");   }
export function canDownload(planId)      { return atLeast(planId, "basic");    }
export function canUseSubtitles(planId)  { return atLeast(planId, "basic");    }
export function canPopOut(planId)        { return atLeast(planId, "standard"); }
export function canMultiDevice(planId)   { return atLeast(planId, "standard"); }
export function can4K(planId)           { return atLeast(planId, "premium");  }

export function maxQualityLabel(planId) {
  if (OPEN_ACCESS) return "4K Ultra HD";
  const p = getEffectivePlan(planId);
  if (atLeast(p, "premium"))  return "4K Ultra HD";
  if (atLeast(p, "standard")) return "Full HD 1080p";
  if (atLeast(p, "basic"))    return "HD 720p";
  if (atLeast(p, "mobile"))   return "HD 720p";
  return "SD 480p";
}

// ── Gate descriptors (used by PremiumGate.jsx) ───────────────────────────────

export const GATES = {
  source_switch: {
    label:       "Source Switching",
    description: "Access 30+ streaming providers and auto-source detection.",
    required:    "mobile",
    planLabel:   "Mobile Plan",
  },
  download: {
    label:       "Downloads",
    description: "Download movies and episodes to watch offline.",
    required:    "basic",
    planLabel:   "Basic Plan",
  },
  subtitles: {
    label:       "Subtitle Downloader",
    description: "Download subtitles in any language for your local files.",
    required:    "basic",
    planLabel:   "Basic Plan",
  },
  pip: {
    label:       "Pop-Out Player",
    description: "Watch in a floating window while you browse.",
    required:    "standard",
    planLabel:   "Standard Plan",
  },
  quality_4k: {
    label:       "4K Ultra HD",
    description: "Stream in 4K resolution when available.",
    required:    "premium",
    planLabel:   "Premium Plan",
  },
};

// ── PremiumGate message resolver ─────────────────────────────────────────────

const GATE_ICONS = {
  source_switch: "🌐",
  download:      "⬇️",
  pip:           "🖼️",
  subtitles:     "📝",
  quality_4k:    "🎬",
};

const GATE_PRICES = {
  mobile:   "$0.65 · ₦1,000",
  basic:    "$0.95 · ₦1,500",
  standard: "$2.20 · ₦3,500",
  premium:  "$4.10 · ₦6,500",
};

export function getGateMessage(feature) {
  const keyMap = {
    source:     "source_switch",
    download:   "download",
    pip:        "pip",
    subtitles:  "subtitles",
    quality_4k: "quality_4k",
  };
  const key  = keyMap[feature] || feature;
  const gate = GATES[key];

  if (!gate) {
    return {
      icon:  "🔒",
      title: "Premium Feature",
      desc:  "Upgrade to unlock this feature.",
      price: null,
    };
  }

  return {
    icon:  GATE_ICONS[key] || "🔒",
    title: gate.label,
    desc:  gate.description,
    price: GATE_PRICES[gate.required] || null,
  };
}

// ── User Activity Tracker ─────────────────────────────────────────────────────
/**
 * Track feature usage per user session.
 * Writes to localStorage under "ns_activity_log".
 * Admin dashboard reads this to show real-time usage stats.
 *
 * Usage: trackActivity("watch", { title: "Inception", type: "movie" })
 *        trackActivity("download", { title: "Breaking Bad S01E01" })
 *        trackActivity("source_switch", { from: "embed1", to: "embed2" })
 */
export function trackActivity(feature, meta = {}) {
  try {
    const userId = localStorage.getItem(PREFIX + "ns_user_id") || "guest";
    const raw    = localStorage.getItem(PREFIX + "ns_activity_log");
    const log    = raw ? JSON.parse(raw) : [];

    log.push({
      feature,
      meta,
      userId,
      ts: Date.now(),
    });

    // Keep last 500 events to avoid bloat
    if (log.length > 500) log.splice(0, log.length - 500);
    localStorage.setItem(PREFIX + "ns_activity_log", JSON.stringify(log));
  } catch {}
}

/**
 * Read activity log — used by admin dashboard.
 * Returns array sorted newest-first.
 */
export function getActivityLog() {
  try {
    const raw = localStorage.getItem(PREFIX + "ns_activity_log");
    const log = raw ? JSON.parse(raw) : [];
    return log.sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

/**
 * Summarise feature usage counts — used by admin charts.
 * Returns: { watch: 42, download: 18, source_switch: 7, ... }
 */
export function getFeatureUsageSummary() {
  const log = getActivityLog();
  return log.reduce((acc, e) => {
    acc[e.feature] = (acc[e.feature] || 0) + 1;
    return acc;
  }, {});
}