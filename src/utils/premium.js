/**
 * premium.js — NovaSpark subscription management
 *
 * Stores plan data in localStorage under "ns_premium".
 * Shape: { planId, email, password (hashed), ref, activatedAt, expiresAt }
 *
 * Plans (ascending):
 *   free → mobile → basic → standard → premium
 */

// ── Your Paystack public key ──────────────────────────────────────────────────
// Replace with your live key (pk_live_...) before going live
export const PAYSTACK_PUBLIC_KEY = "pk_test_5ff5879e892b24e0a2d0e1b3c4f5a6b7c8d9e0f"; // ← replace with real key

// ── Crypto wallet addresses ───────────────────────────────────────────────────
// Replace placeholders with your real wallet addresses
export const CRYPTO_WALLETS = {
  USDT_TRC: "YOUR_USDT_TRC20_WALLET_ADDRESS",
  USDT_ERC: "YOUR_USDT_ERC20_WALLET_ADDRESS",
  BTC:      "YOUR_BITCOIN_WALLET_ADDRESS",
  ETH:      "YOUR_ETHEREUM_WALLET_ADDRESS",
};

// ── Plan definitions ──────────────────────────────────────────────────────────
export const PLANS = {
  free: {
    id:       "free",
    name:     "Free",
    price:    0,
    color:    "#6b7280",
    devices:  1,
    quality:  "SD 480p",
    features: {
      hd:               false,
      fullHd:           false,
      uhd4k:            false,
      multiDevice:      false,
      downloads:        false,
      unlimitedDl:      false,
      adFree:           true,   // always — no ads ever
      prioritySources:  false,
      earlyAccess:      false,
      vipSupport:       false,
    },
  },
  mobile: {
    id:       "mobile",
    name:     "Mobile",
    price:    1000,
    color:    "#10b981",
    devices:  1,
    quality:  "SD 480p",
    features: {
      hd:               false,
      fullHd:           false,
      uhd4k:            false,
      multiDevice:      false,
      downloads:        false,
      unlimitedDl:      false,
      adFree:           true,
      prioritySources:  false,
      earlyAccess:      false,
      vipSupport:       false,
    },
    // What mobile UNLOCKS vs free:
    // → source switching (30+ providers)
  },
  basic: {
    id:       "basic",
    name:     "Basic",
    price:    1500,
    color:    "#3b82f6",
    devices:  1,
    quality:  "HD 720p",
    features: {
      hd:               true,
      fullHd:           false,
      uhd4k:            false,
      multiDevice:      false,
      downloads:        true,
      unlimitedDl:      false,
      adFree:           true,
      prioritySources:  false,
      earlyAccess:      false,
      vipSupport:       false,
    },
  },
  standard: {
    id:       "standard",
    name:     "Standard",
    price:    3500,
    color:    "#8b5cf6",
    devices:  2,
    quality:  "Full HD 1080p",
    features: {
      hd:               true,
      fullHd:           true,
      uhd4k:            false,
      multiDevice:      true,
      downloads:        true,
      unlimitedDl:      false,
      adFree:           true,
      prioritySources:  true,
      earlyAccess:      false,
      vipSupport:       false,
    },
  },
  premium: {
    id:       "premium",
    name:     "Premium",
    price:    6500,
    color:    "#f5c518",
    devices:  4,
    quality:  "4K Ultra HD",
    features: {
      hd:               true,
      fullHd:           true,
      uhd4k:            true,
      multiDevice:      true,
      downloads:        true,
      unlimitedDl:      true,
      adFree:           true,
      prioritySources:  true,
      earlyAccess:      true,
      vipSupport:       true,
    },
  },
};

export const PLAN_ORDER = ["free", "mobile", "basic", "standard", "premium"];

export const FEATURE_LABELS = {
  hd:              "HD Streaming",
  fullHd:          "Full HD Streaming",
  uhd4k:           "4K Ultra HD Streaming",
  multiDevice:     "Multiple Devices",
  downloads:       "Downloads",
  unlimitedDl:     "Unlimited Downloads",
  adFree:          "Ad-Free Experience",
  prioritySources: "Priority Sources",
  earlyAccess:     "Early Access",
  vipSupport:      "VIP Support",
};

const NS_PREMIUM_KEY = "ns_premium";

// ── Simple hash (not crypto — just obfuscation for localStorage) ──────────────
// We don't store the real password, only a derived token
function simpleHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function hashPassword(email, password) {
  // Combine email + password so the hash is unique per account
  return simpleHash(`ns::${email.toLowerCase()}::${password}`);
}

// ── Storage helpers ───────────────────────────────────────────────────────────

/**
 * Returns the stored premium record or null.
 * Shape: { planId, email, pwHash, ref, activatedAt, expiresAt }
 */
export function getPremiumPlan() {
  try {
    const raw = localStorage.getItem(NS_PREMIUM_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Backward compat — old records had planId at root
    return data?.planId ? data : null;
  } catch {
    return null;
  }
}

/** Returns just the planId string ("free" when nothing stored). */
export function getCurrentPlan() {
  return getPremiumPlan()?.planId || "free";
}

/**
 * Activate / upgrade a plan.
 * Called after successful Paystack payment or crypto confirmation.
 *
 * @param {string} planId      — plan key ("mobile","basic","standard","premium")
 * @param {string} email       — user email
 * @param {string} password    — user's chosen password (stored as hash)
 * @param {string} ref         — payment reference
 * @param {number} [days=31]   — subscription length in days
 */
export function setPremiumPlan(planId, email, password, ref, days = 31) {
  const now        = Date.now();
  const expiresAt  = now + days * 24 * 60 * 60 * 1000;
  const record = {
    planId,
    email:       email.trim().toLowerCase(),
    pwHash:      hashPassword(email.trim().toLowerCase(), password),
    ref,
    activatedAt: now,
    expiresAt,
  };
  localStorage.setItem(NS_PREMIUM_KEY, JSON.stringify(record));
  // Dispatch so App.jsx and Sidebar react immediately
  window.dispatchEvent(new CustomEvent("ns:plan-changed", { detail: record }));
}

/**
 * Verify credentials — used to show account info or manage subscription.
 * Returns true if email + password match the stored record.
 */
export function verifyCredentials(email, password) {
  const record = getPremiumPlan();
  if (!record) return false;
  const inputEmail = email.trim().toLowerCase();
  const inputHash  = hashPassword(inputEmail, password);
  return record.email === inputEmail && record.pwHash === inputHash;
}

/**
 * Check if the current plan is still active (not expired).
 */
export function isPlanActive() {
  const record = getPremiumPlan();
  if (!record || record.planId === "free") return false;
  return Date.now() < record.expiresAt;
}

/**
 * Get the effective plan — returns "free" if expired.
 */
export function getEffectivePlan() {
  const record = getPremiumPlan();
  if (!record) return "free";
  if (record.planId === "free") return "free";
  if (Date.now() > record.expiresAt) return "free"; // expired
  return record.planId;
}

/** Cancel subscription — downgrades to free. */
export function clearPremium() {
  localStorage.removeItem(NS_PREMIUM_KEY);
  window.dispatchEvent(new CustomEvent("ns:plan-changed", { detail: { planId: "free" } }));
}

// ── Plan logic helpers ────────────────────────────────────────────────────────

const PLAN_RANK = { free: 0, mobile: 1, basic: 2, standard: 3, premium: 4 };

export function canUpgradeTo(targetPlanId) {
  const current = getEffectivePlan();
  return (PLAN_RANK[targetPlanId] ?? 0) > (PLAN_RANK[current] ?? 0);
}

export function formatPrice(ngn) {
  if (!ngn) return "Free";
  const usd = (ngn / 1600).toFixed(2);
  return `₦${ngn.toLocaleString()} / mo  (~$${usd} USD)`;
}

export function getPlanFeatures(planId) {
  return PLANS[planId]?.features || PLANS.free.features;
}