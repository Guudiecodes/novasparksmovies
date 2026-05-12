// ── NovaSpark Premium — plans, state, feature gates ─────────────────────────

export const NS_PLANS = [
  {
    id:       "free",
    name:     "Free",
    badge:    null,
    price:    0,
    currency: "NGN",
    devices:  1,
    quality:  "SD",
    qualityLabel: "Standard Definition",
    color:    "#7a9ab0",
    features: [
      "Stream movies & TV shows",
      "Standard Definition (SD)",
      "1 device at a time",
      "Watch history & watchlist",
      "Basic search",
    ],
    locked: [
      "HD / Full HD / 4K streaming",
      "Multiple devices",
      "Offline downloads",
      "Early access to new titles",
      "Priority stream sources",
    ],
  },
  {
    id:       "mobile",
    name:     "Mobile",
    badge:    "STARTER",
    price:    1000,
    currency: "NGN",
    devices:  1,
    quality:  "SD",
    qualityLabel: "Standard Definition",
    color:    "#48c774",
    popular:  false,
    features: [
      "Everything in Free",
      "Ad-free experience",
      "Standard Definition (SD)",
      "1 device at a time",
      "Email support",
    ],
    locked: [
      "HD / Full HD / 4K streaming",
      "Multiple devices",
      "Offline downloads",
    ],
  },
  {
    id:       "basic",
    name:     "Basic",
    badge:    "VALUE",
    price:    1500,
    currency: "NGN",
    devices:  1,
    quality:  "HD",
    qualityLabel: "High Definition",
    color:    "#3273dc",
    popular:  false,
    features: [
      "Everything in Mobile",
      "High Definition (HD)",
      "1 device at a time",
      "Download 10 titles/month",
      "Priority customer support",
    ],
    locked: [
      "Multiple devices",
      "Full HD / 4K streaming",
      "Unlimited downloads",
    ],
  },
  {
    id:       "standard",
    name:     "Standard",
    badge:    "POPULAR",
    price:    3500,
    currency: "NGN",
    devices:  2,
    quality:  "FHD",
    qualityLabel: "Full HD 1080p",
    color:    "#00a8e1",
    popular:  true,
    features: [
      "Everything in Basic",
      "Full HD 1080p streaming",
      "2 devices simultaneously",
      "Download 30 titles/month",
      "Exclusive Standard content",
      "Early access to new releases",
    ],
    locked: [
      "4K Ultra HD streaming",
      "4 simultaneous devices",
    ],
  },
  {
    id:       "premium",
    name:     "Premium",
    badge:    "BEST",
    price:    6500,
    currency: "NGN",
    devices:  4,
    quality:  "4K",
    qualityLabel: "4K Ultra HD",
    color:    "#f5c518",
    popular:  false,
    features: [
      "Everything in Standard",
      "4K Ultra HD streaming",
      "4 devices simultaneously",
      "Unlimited downloads",
      "Dolby Audio support",
      "Exclusive Premium content",
      "Priority stream sources",
      "Dedicated VIP support",
    ],
    locked: [],
  },
];

// ── Storage key ──────────────────────────────────────────────────────────────
const PREMIUM_KEY = "ns_premium";

// ── Read / Write ─────────────────────────────────────────────────────────────
export function getPremiumStatus() {
  try {
    const raw = localStorage.getItem(PREMIUM_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Check expiry
    if (data.expiresAt && Date.now() > data.expiresAt) {
      localStorage.removeItem(PREMIUM_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function setPremiumStatus({ planId, email, reference, method, expiresAt }) {
  const plan = NS_PLANS.find((p) => p.id === planId);
  if (!plan) return;
  const data = {
    planId,
    planName:  plan.name,
    email,
    reference,
    method,
    activatedAt: Date.now(),
    expiresAt:   expiresAt || Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  localStorage.setItem(PREMIUM_KEY, JSON.stringify(data));
}

export function clearPremiumStatus() {
  localStorage.removeItem(PREMIUM_KEY);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function isPremiumActive() {
  return !!getPremiumStatus();
}

export function getCurrentPlan() {
  const status = getPremiumStatus();
  if (!status) return NS_PLANS[0]; // free
  return NS_PLANS.find((p) => p.id === status.planId) ?? NS_PLANS[0];
}

export function getPlanById(id) {
  return NS_PLANS.find((p) => p.id === id) ?? NS_PLANS[0];
}

export function formatPrice(price) {
  if (price === 0) return "Free";
  return `₦${price.toLocaleString()}`;
}

export function getDaysRemaining() {
  const status = getPremiumStatus();
  if (!status || !status.expiresAt) return 0;
  const ms = status.expiresAt - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

// ── Feature gates ─────────────────────────────────────────────────────────────
// planRank: free=0, mobile=1, basic=2, standard=3, premium=4
function planRank(planId) {
  const order = ["free", "mobile", "basic", "standard", "premium"];
  return order.indexOf(planId ?? "free");
}

export function canAccess(feature) {
  const current = getCurrentPlan();
  const rank    = planRank(current.id);
  const gates   = {
    hd_streaming:        rank >= 2, // basic+
    fhd_streaming:       rank >= 3, // standard+
    uhd_streaming:       rank >= 4, // premium only
    multi_device:        rank >= 3, // standard+
    downloads:           rank >= 2, // basic+
    unlimited_downloads: rank >= 4, // premium only
    ad_free:             rank >= 1, // mobile+
    priority_sources:    rank >= 4, // premium only
    early_access:        rank >= 3, // standard+
    vip_support:         rank >= 4, // premium only
  };
  return gates[feature] ?? false;
}