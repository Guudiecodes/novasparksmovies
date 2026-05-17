/**
 * gate.js — NovaSpark feature gate
 *
 * Single source of truth for what each plan can access.
 * Import this everywhere; never scatter plan-level logic in pages.
 *
 * Plan order (ascending):
 *   free → mobile → basic → standard → premium
 *
 * Admin override:
 *   Admin can set a global plan floor in the admin panel.
 *   Storage key: "ns_admin_global_plan" (plain localStorage, admin-only)
 *   When set, ALL users are treated as at least that plan tier.
 */

// ── Plan rank map ─────────────────────────────────────────────────────────────
const PLAN_RANK = {
  free:     0,
  mobile:   1,
  basic:    2,
  standard: 3,
  premium:  4,
};

/** Returns the stored plan id ("free" when nothing is stored). */
export function getCurrentPlan() {
  try {
    const raw = localStorage.getItem("ns_premium");
    if (!raw) return "free";
    const parsed = JSON.parse(raw);
    return parsed?.planId || "free";
  } catch {
    return "free";
  }
}

/**
 * Returns the admin-set global plan floor.
 * If admin has set "ns_admin_global_plan" = "basic", every user
 * is treated as at least basic regardless of their own plan.
 */
export function getAdminGlobalPlan() {
  try {
    return localStorage.getItem("ns_admin_global_plan") || "free";
  } catch {
    return "free";
  }
}

/**
 * Save the admin global plan floor.
 * Called from the admin panel when admin clicks Save.
 */
export function setAdminGlobalPlan(planId) {
  try {
    if (!planId || planId === "free") {
      localStorage.removeItem("ns_admin_global_plan");
    } else {
      localStorage.setItem("ns_admin_global_plan", planId);
    }
  } catch {}
}

/**
 * Effective plan: whichever is higher — user's own plan or admin's global floor.
 */
export function getEffectivePlan(planId) {
  const user  = planId || getCurrentPlan();
  const floor = getAdminGlobalPlan();
  const userRank  = PLAN_RANK[user]  ?? 0;
  const floorRank = PLAN_RANK[floor] ?? 0;
  return floorRank > userRank ? floor : user;
}

/** True when planId ranks >= requiredId (respects admin floor). */
function atLeast(planId, requiredId) {
  const effective = getEffectivePlan(planId);
  return (PLAN_RANK[effective] ?? 0) >= (PLAN_RANK[requiredId] ?? 999);
}

// ── Feature gates ─────────────────────────────────────────────────────────────

/** Any paid plan can switch streaming source. */
export function canSwitchSource(planId) {
  return atLeast(planId, "mobile");
}

/** Basic+ can download content. */
export function canDownload(planId) {
  return atLeast(planId, "basic");
}

/** Basic+ can use the subtitle downloader. */
export function canUseSubtitles(planId) {
  return atLeast(planId, "basic");
}

/** Standard+ can use pop-out / PiP player. */
export function canPopOut(planId) {
  return atLeast(planId, "standard");
}

/** Standard+ can use multiple simultaneous devices (enforced client-side as info). */
export function canMultiDevice(planId) {
  return atLeast(planId, "standard");
}

/** Premium only — 4K quality badge (actual quality depends on source). */
export function can4K(planId) {
  return atLeast(planId, "premium");
}

/** Returns human-readable max quality label for UI display. */
export function maxQualityLabel(planId) {
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

// DOLLAR FIRST, then Naira — anchors higher value perception
const GATE_PRICES = {
  mobile:   "$0.65 · ₦1,000",
  basic:    "$0.95 · ₦1,500",
  standard: "$2.20 · ₦3,500",
  premium:  "$4.10 · ₦6,500",
};

/** Resolve a feature key (e.g. "download", "source", "pip") to modal content. */
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