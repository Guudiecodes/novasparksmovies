import { storage } from "./storage";

// ── Storage keys ──────────────────────────────────────────────────────────────
const PREMIUM_KEY        = "ns_premium_record";
const PREMIUM_FLAG_KEY   = "ns_premium";
const WARN_DISMISSED_KEY = "ns_warn_dismissed";

// ── Exchange rate ─────────────────────────────────────────────────────────────
export const NGN_TO_USD = 1600;
export function ngn2usd(ngn) {
  if (!ngn) return null;
  return `~$${(ngn / NGN_TO_USD).toFixed(2)} USD`;
}

// ── Plans ─────────────────────────────────────────────────────────────────────
export const PLANS = {
  free: {
    id:    "free",
    name:  "Free",
    price: 0,
    color: "var(--text3)",
    features: {
      adFree:           true,
      watchlist:        true,
      history:          true,
      multipleSource:   false,
      downloads:        false,
      subtitles:        false,
      continueWatching: false,
      prioritySupport:  false,
      earlyAccess:      false,
    },
  },

  standard: {
    id:           "standard",
    name:         "Standard",
    price:        800,
    color:        "#00b4a6",
    badge:        "Most Popular",
    durationDays: 30,
    features: {
      adFree:           true,
      watchlist:        true,
      history:          true,
      multipleSource:   true,
      downloads:        true,
      subtitles:        true,
      continueWatching: true,
      prioritySupport:  false,
      earlyAccess:      false,
    },
  },

  premium: {
    id:           "premium",
    name:         "Premium",
    price:        null,
    color:        "#f5a623",
    badge:        "Coming Soon",
    comingSoon:   true,
    durationDays: 30,
    features: {
      adFree:           true,
      watchlist:        true,
      history:          true,
      multipleSource:   true,
      downloads:        true,
      subtitles:        true,
      continueWatching: true,
      prioritySupport:  true,
      earlyAccess:      true,
    },
  },
};

export const PLAN_ORDER = ["free", "standard", "premium"];
export const PLAN_RANK  = { free: 0, standard: 1, premium: 2 };

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

// ── Subscription record in localStorage ──────────────────────────────────────
// streambert_ns_premium_record = {
//   planId, email, passwordHash, txnRef,
//   startedAt, expiresAt, cancelledAt, warningSent
// }

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

export function setPremiumPlan(planId, email, password, txnRef, durationDaysOverride) {
  const plan      = PLANS[planId];
  const days      = durationDaysOverride ?? plan?.durationDays ?? 30;
  const now       = Date.now();
  const expiresAt = now + days * 24 * 60 * 60 * 1000;
  const record = {
    planId,
    email:        email.trim().toLowerCase(),
    passwordHash: simpleHash(password),
    txnRef,
    startedAt:    now,
    expiresAt,
    cancelledAt:  null,
    warningSent:  { "7d": false, "3d": false, "1d": false },
  };
  storage.set(PREMIUM_KEY,      record);
  storage.set(PREMIUM_FLAG_KEY, true);
  return record;
}

export function getPremiumRecord() {
  return storage.get(PREMIUM_KEY) || null;
}

export function isPremiumActive() {
  const rec = getPremiumRecord();
  if (!rec || rec.planId === "free") return false;
  return Date.now() < rec.expiresAt;
}

export function getEffectivePlan() {
  if (!isPremiumActive()) return "free";
  return getPremiumRecord()?.planId || "free";
}

export function getPremiumPlan() {
  return PLANS[getEffectivePlan()] || PLANS.free;
}

export function syncPremiumFlag() {
  const active = isPremiumActive();
  if (active) {
    storage.set(PREMIUM_FLAG_KEY, true);
  } else {
    storage.remove(PREMIUM_FLAG_KEY);
    const rec = getPremiumRecord();
    if (rec && Date.now() >= rec.expiresAt) {
      storage.set(PREMIUM_KEY, { ...rec, planId: "free", expiredAt: rec.expiresAt });
    }
  }
  return active;
}

export function cancelPremium() {
  const rec = getPremiumRecord();
  if (!rec || rec.planId === "free") return;
  storage.set(PREMIUM_KEY, { ...rec, cancelledAt: Date.now() });
}

export function daysRemaining() {
  const rec = getPremiumRecord();
  if (!rec || !rec.expiresAt) return 0;
  const ms = rec.expiresAt - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function getExpiryWarning() {
  const rec = getPremiumRecord();
  if (!rec || !isPremiumActive()) return null;
  const days = daysRemaining();
  const warn = rec.warningSent || {};
  if (days <= 1 && !warn["1d"]) return "1d";
  if (days <= 3 && !warn["3d"]) return "3d";
  if (days <= 7 && !warn["7d"]) return "7d";
  return null;
}

export function dismissExpiryWarning(level) {
  const rec = getPremiumRecord();
  if (!rec) return;
  storage.set(PREMIUM_KEY, { ...rec, warningSent: { ...(rec.warningSent || {}), [level]: true } });
}

export function verifyPassword(password) {
  const rec = getPremiumRecord();
  if (!rec) return false;
  return rec.passwordHash === simpleHash(password);
}

export function canUpgradeTo(targetPlanId) {
  return (PLAN_RANK[targetPlanId] ?? 0) > (PLAN_RANK[getEffectivePlan()] ?? 0);
}

export function formatPrice(ngn) {
  if (!ngn) return "Free";
  return `${ngn2usd(ngn)} / ₦${ngn.toLocaleString()} per month`;
}

export function clearPremium() {
  storage.remove(PREMIUM_KEY);
  storage.remove(PREMIUM_FLAG_KEY);
  storage.remove(WARN_DISMISSED_KEY);
}