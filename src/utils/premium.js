import { storage } from "./storage";

// ── Storage key ───────────────────────────────────────────────────────────────
const PREMIUM_KEY = "ns_premium";

// ── Exchange rate ─────────────────────────────────────────────────────────────
export const NGN_TO_USD = 1600;
export function ngn2usd(ngn) {
  if (!ngn) return null;
  return `~$${(ngn / NGN_TO_USD).toFixed(2)} USD`;
}

// ── Plans ─────────────────────────────────────────────────────────────────────
// Only two plans: Standard and Premium (coming soon)
export const PLANS = {
  free: {
    id:       "free",
    name:     "Free",
    price:    0,
    color:    "var(--text3)",
    features: {
      adFree:          true,
      watchlist:       true,
      history:         true,
      multipleSource:  false,
      downloads:       false,
      subtitles:       false,
      continueWatching:false,
      prioritySupport: false,
      earlyAccess:     false,
    },
  },
  standard: {
    id:       "standard",
    name:     "Standard",
    price:    800,           // ₦800/mo
    color:    "#00b4a6",
    badge:    "Most Popular",
    features: {
      adFree:          true,
      watchlist:       true,
      history:         true,
      multipleSource:  true,
      downloads:       true,
      subtitles:       true,
      continueWatching:true,
      prioritySupport: false,
      earlyAccess:     false,
    },
  },
  premium: {
    id:         "premium",
    name:       "Premium",
    price:      null,        // coming soon — no price yet
    color:      "#f5a623",
    badge:      "Coming Soon",
    comingSoon: true,
    features: {
      adFree:          true,
      watchlist:       true,
      history:         true,
      multipleSource:  true,
      downloads:       true,
      subtitles:       true,
      continueWatching:true,
      prioritySupport: true,
      earlyAccess:     true,
      NovaSparkArtificialIntelligence:     true,
    },
  },
};

export const PLAN_ORDER = ["free", "standard", "premium"];

export const PLAN_RANK = { free: 0, standard: 1, premium: 2 };

export const FEATURE_LABELS = {
  adFree:           "Ad-free experience",
  watchlist:        "Watchlist & favourites",
  history:          "Watch history",
  multipleSource:   "Multiple streaming sources",
  downloads:        "Offline downloads",
  subtitles:        "Subtitle downloader",
  continueWatching: "Continue watching",
  prioritySupport:  "Priority support",
  earlyAccess:      "Early access to new features",
};

// ── Subscription record shape ─────────────────────────────────────────────────
// {
//   planId:      "standard" | "premium"
//   email:       string
//   passwordHash:string   (simple hash, not cryptographic — for local identity only)
//   txnRef:      string
//   startedAt:   timestamp (ms)
//   expiresAt:   timestamp (ms)   ← always 30 days from startedAt
//   cancelledAt: timestamp | null ← set when user cancels, plan still runs to expiresAt
// }

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

// ── Write a new subscription ──────────────────────────────────────────────────
// durationDays defaults to 30. Called immediately on payment success.
export function setPremiumPlan(planId, email, password, txnRef, durationDays = 30) {
  const now       = Date.now();
  const expiresAt = now + durationDays * 24 * 60 * 60 * 1000;
  const record = {
    planId,
    email:        email.trim().toLowerCase(),
    passwordHash: simpleHash(password),
    txnRef,
    startedAt:    now,
    expiresAt,
    cancelledAt:  null,
  };
  storage.set(PREMIUM_KEY, record);
  // Also set the flat key App.jsx checks (ns_premium)
  storage.set("ns_premium", true);
  return record;
}

// ── Read current record ───────────────────────────────────────────────────────
export function getPremiumRecord() {
  return storage.get(PREMIUM_KEY) || null;
}

// ── Cancel: mark cancelledAt but DO NOT remove — plan runs to expiresAt ──────
export function cancelPremium() {
  const rec = getPremiumRecord();
  if (!rec) return;
  rec.cancelledAt = Date.now();
  storage.set(PREMIUM_KEY, rec);
  // Note: do NOT touch ns_premium yet — expiry check does that
}

// ── Check if plan is still active (respects expiry, survives cancellation) ───
export function isPremiumActive() {
  const rec = getPremiumRecord();
  if (!rec || rec.planId === "free") return false;
  return Date.now() < rec.expiresAt;   // still within paid window
}

// ── Sync ns_premium flat flag (call on app boot) ──────────────────────────────
export function syncPremiumFlag() {
  const active = isPremiumActive();
  if (active) {
    storage.set("ns_premium", true);
  } else {
    storage.remove("ns_premium");
    // Optionally clean up the record too
    const rec = getPremiumRecord();
    if (rec && Date.now() >= rec.expiresAt) {
      storage.set(PREMIUM_KEY, { ...rec, planId: "free" });
    }
  }
  return active;
}

// ── Get the effective plan id (checking expiry) ───────────────────────────────
export function getEffectivePlan() {
  if (!isPremiumActive()) return "free";
  return getPremiumRecord()?.planId || "free";
}

// ── Get the full plan object for current user ─────────────────────────────────
export function getPremiumPlan() {
  return PLANS[getEffectivePlan()] || PLANS.free;
}

// ── Helpers used by PricingPage ───────────────────────────────────────────────
export function canUpgradeTo(targetPlanId) {
  return (PLAN_RANK[targetPlanId] ?? 0) > (PLAN_RANK[getEffectivePlan()] ?? 0);
}

export function formatPrice(ngn) {
  if (!ngn) return "Free";
  const usd = ngn2usd(ngn);
  return `${usd} / ₦${ngn.toLocaleString()} per month`;
}

// ── Days remaining in current plan ───────────────────────────────────────────
export function daysRemaining() {
  const rec = getPremiumRecord();
  if (!rec || !rec.expiresAt) return 0;
  const ms = rec.expiresAt - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// ── Hard clear (for testing / account reset) ──────────────────────────────────
export function clearPremium() {
  storage.remove(PREMIUM_KEY);
  storage.remove("ns_premium");
}