/**
 * gate.js — NovaSpark feature gate · v2.1
 *
 * Single source of truth for what each plan can access.
 * Works WITH premium.js — never duplicates plan resolution.
 *
 * Plan order (matches premium.js exactly):
 *   free → standard → premium
 *
 * ── STRATEGY ──────────────────────────────────────────────────────────────────
 *  1. 14-day full-access trial  — build habits before the wall appears
 *  2. Soft limits with nudges   — warn at 80%, never surprise-block
 *  3. Loss-aversion messaging   — "you HAD this" > "upgrade to get this"
 *  4. Smart upsell timing       — evening hours + session blocks + trial end
 *  5. Strict post-trial walls   — firm but never rude
 */

import { isPremiumActive, getPremiumRecord, getEffectivePlan as premiumEffectivePlan } from "./premium";

// ── Config ────────────────────────────────────────────────────────────────────
const TRIAL_DAYS        = 14;
const TRIAL_WARNING_DAY = 11;
const PREFIX            = "streambert_";

// ── Plan rank — mirrors premium.js exactly ────────────────────────────────────
const PLAN_RANK = { free: 0, standard: 1, premium: 2 };

// ── Pricing ───────────────────────────────────────────────────────────────────
export const PLAN_PRICES = {
  standard: { usd: "$0.99",  ngn: "₦1,584",  label: "Standard" },
  premium:  { usd: "Coming soon", ngn: null,  label: "Premium"  },
};

// ── Soft usage limits (monthly unless noted as daily) ─────────────────────────
// free = post-trial locked values
const SOFT_LIMITS = {
  download: {
    free:     0,
    standard: Infinity,   // standard gets unlimited downloads
    premium:  Infinity,
  },
  source_switch: {
    free:     3,          // 3 per day — enough to taste, not enough to rely on
    standard: Infinity,
    premium:  Infinity,
  },
  subtitles: {
    free:     2,          // 2 per day
    standard: Infinity,
    premium:  Infinity,
  },
};

const NUDGE_AT = 0.8; // warn at 80% of limit

// ─────────────────────────────────────────────────────────────────────────────
// TRIAL SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call once on app boot (e.g. in App.jsx useEffect).
 * Stamps trial start date on first launch — safe to call multiple times.
 */
export function initTrial() {
  try {
    if (!localStorage.getItem(PREFIX + "trial_start")) {
      localStorage.setItem(PREFIX + "trial_start", String(Date.now()));
    }
  } catch {}
}

/**
 * Full trial status. Use this everywhere trial state is needed.
 */
export function getTrialStatus() {
  const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
  try {
    const raw = localStorage.getItem(PREFIX + "trial_start");
    if (!raw) return { started: false, active: false, expired: false, daysLeft: 0, daysUsed: 0, startedAt: null, endsAt: null, warning: false };
    const startedAt = parseInt(raw, 10);
    const endsAt    = startedAt + TRIAL_MS;
    const now       = Date.now();
    const daysUsed  = Math.floor((now - startedAt) / (24 * 60 * 60 * 1000));
    const daysLeft  = Math.max(0, TRIAL_DAYS - daysUsed);
    const active    = now < endsAt;
    return {
      started: true,
      active,
      expired: !active,
      daysLeft,
      daysUsed,
      startedAt,
      endsAt,
      warning: active && daysUsed >= TRIAL_WARNING_DAY,
    };
  } catch {
    return { started: false, active: false, expired: false, daysLeft: 0, daysUsed: 0, startedAt: null, endsAt: null, warning: false };
  }
}

/**
 * Banner text for the countdown UI. Returns null when no message needed.
 */
export function getTrialBannerMessage() {
  // Already a paying subscriber — no banner
  if (isPremiumActive()) return null;
  const t = getTrialStatus();
  if (!t.started || !t.warning) return null;
  if (t.daysLeft === 0) return "⏰ Your free trial ends today. Lock in your plan to keep everything.";
  if (t.daysLeft === 1) return "⏰ 1 day left on your trial. Don't lose access tomorrow.";
  return `⏰ ${t.daysLeft} days left on your free trial.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN RESOLUTION — thin wrapper over premium.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The plan that governs feature access RIGHT NOW.
 * During an active trial, free users are treated as standard.
 * Paying users always get their real plan from premium.js.
 */
export function getActivePlan() {
  // Paying subscriber — trust premium.js
  if (isPremiumActive()) return premiumEffectivePlan();

  // Free user — check if trial is active
  const trial = getTrialStatus();
  if (trial.active) return "standard"; // trial = full standard access

  return "free";
}

function atLeast(required) {
  return (PLAN_RANK[getActivePlan()] ?? 0) >= (PLAN_RANK[required] ?? 999);
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE GATES
// ─────────────────────────────────────────────────────────────────────────────

export function canSwitchSource()    { return atLeast("standard"); }
export function canDownload()        { return atLeast("standard"); }
export function canUseSubtitles()    { return atLeast("standard"); }
export function canContinueWatching(){ return atLeast("standard"); }
export function canPopOut()          { return atLeast("premium");  }
export function can4K()              { return atLeast("premium");  }

export function maxQualityLabel() {
  const p = getActivePlan();
  if (p === "premium")  return "4K Ultra HD";
  if (p === "standard") return "Full HD 1080p";
  return "SD 480p";
}

// ─────────────────────────────────────────────────────────────────────────────
// SOFT LIMITS
// ─────────────────────────────────────────────────────────────────────────────

const DAILY_FEATURES = ["source_switch", "subtitles"];

function usageKey(feature) {
  const now = new Date();
  const daily = DAILY_FEATURES.includes(feature);
  const bucket = daily
    ? `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
    : `${now.getFullYear()}-${now.getMonth()}`;
  return `${PREFIX}usage_${feature}_${bucket}`;
}

export function getUsageCount(feature) {
  try { return parseInt(localStorage.getItem(usageKey(feature)) || "0", 10); } catch { return 0; }
}

export function incrementUsage(feature) {
  try {
    const key = usageKey(feature);
    const cur = getUsageCount(feature);
    localStorage.setItem(key, String(cur + 1));
    trackActivity(feature, { count: cur + 1 });
    return cur + 1;
  } catch { return 0; }
}

/**
 * Full soft-limit check.
 * Call this before letting a user perform a gated action.
 */
export function checkSoftLimit(feature) {
  const plan    = getActivePlan();
  const limits  = SOFT_LIMITS[feature];
  if (!limits) return { allowed: true, hardBlock: false, nudge: false, used: 0, limit: Infinity, remaining: Infinity };

  const limit     = limits[plan] ?? 0;
  const used      = getUsageCount(feature);
  const remaining = Math.max(0, limit - used);
  const hardBlock = limit !== Infinity && used >= limit;
  const nudge     = !hardBlock && limit !== Infinity && used >= Math.floor(limit * NUDGE_AT);

  return { allowed: !hardBlock, hardBlock, nudge, used, limit, remaining };
}

export function getSoftLimitNudge(feature, remaining) {
  const m = {
    download:      `${remaining} download${remaining !== 1 ? "s" : ""} left this month.`,
    source_switch: `${remaining} source switch${remaining !== 1 ? "es" : ""} left today.`,
    subtitles:     `${remaining} subtitle download${remaining !== 1 ? "s" : ""} left today.`,
  };
  return (m[feature] || `${remaining} use${remaining !== 1 ? "s" : ""} remaining.`) + " Upgrade for unlimited.";
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART UPSELL TIMING
// ─────────────────────────────────────────────────────────────────────────────

export function shouldNudgeUpgrade() {
  if (isPremiumActive()) return false;
  const hour      = new Date().getHours();
  const isEvening = hour >= 18 && hour <= 23;
  const trial     = getTrialStatus();
  return isEvening || (trial.active && trial.daysLeft <= 3) || trial.expired || getSessionBlockCount() >= 2;
}

export function recordSessionBlock() {
  try {
    const cur = parseInt(sessionStorage.getItem("ns_session_blocks") || "0", 10);
    sessionStorage.setItem("ns_session_blocks", String(cur + 1));
  } catch {}
}

export function getSessionBlockCount() {
  try { return parseInt(sessionStorage.getItem("ns_session_blocks") || "0", 10); } catch { return 0; }
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE DESCRIPTORS
// ─────────────────────────────────────────────────────────────────────────────

export const GATES = {
  source_switch: {
    label:       "Source Switching",
    description: "Access 30+ streaming providers and auto-source detection.",
    required:    "standard",
    planLabel:   "Standard Plan",
  },
  download: {
    label:       "Downloads",
    description: "Download movies and episodes to watch offline.",
    required:    "standard",
    planLabel:   "Standard Plan",
  },
  subtitles: {
    label:       "Subtitle Downloader",
    description: "Download subtitles in any language for your local files.",
    required:    "standard",
    planLabel:   "Standard Plan",
  },
  continue_watching: {
    label:       "Continue Watching",
    description: "Pick up exactly where you left off, across sessions.",
    required:    "standard",
    planLabel:   "Standard Plan",
  },
  pip: {
    label:       "Pop-Out Player",
    description: "Watch in a floating window while you browse.",
    required:    "premium",
    planLabel:   "Premium Plan",
  },
  quality_4k: {
    label:       "4K Ultra HD",
    description: "Stream in 4K resolution when available.",
    required:    "premium",
    planLabel:   "Premium Plan",
  },
};

const GATE_ICONS = {
  source_switch:     "🌐",
  download:          "⬇️",
  pip:               "🖼️",
  subtitles:         "📝",
  quality_4k:        "🎬",
  continue_watching: "▶️",
};

// ─────────────────────────────────────────────────────────────────────────────
// PSYCHOLOGY-AWARE GATE MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a gate message object tuned to current user state.
 *
 * Shape (used by PremiumGate.jsx):
 * {
 *   icon:    string,
 *   title:   string,
 *   desc:    string,
 *   subdesc: string | null,
 *   price:   string | null,
 *   cta:     string,
 *   urgency: boolean,
 * }
 */
export function getGateMessage(feature) {
  const keyMap = {
    source:           "source_switch",
    download:         "download",
    pip:              "pip",
    subtitles:        "subtitles",
    quality_4k:       "quality_4k",
    continue_watching:"continue_watching",
  };
  const key  = keyMap[feature] || feature;
  const gate = GATES[key];

  if (!gate) {
    return {
      icon: "🔒", title: "Premium Feature",
      desc: "Upgrade your plan to unlock this.", subdesc: null,
      price: null, cta: "See Plans", urgency: false,
    };
  }

  const trial    = getTrialStatus();
  const blocks   = getSessionBlockCount();
  recordSessionBlock();

  const priceData = PLAN_PRICES[gate.required];
  const priceStr  = priceData?.ngn ? `${priceData.ngn}/month · ${priceData.usd}` : null;

  // ── Loss aversion — trial expired, they REMEMBER having this ──────────────
  if (trial.expired && !isPremiumActive()) {
    return {
      icon:    GATE_ICONS[key] || "🔒",
      title:   `You had ${gate.label} — get it back`,
      desc:    `You used this free during your 14-day trial. Upgrade to ${gate.planLabel} to keep it.`,
      subdesc: "Everything you built your habits around is still here.",
      price:   priceStr,
      cta:     "Restore Access",
      urgency: true,
    };
  }

  // ── Trial ending soon — countdown urgency ─────────────────────────────────
  if (trial.warning && blocks <= 1) {
    return {
      icon:    GATE_ICONS[key] || "🔒",
      title:   `${trial.daysLeft}d left of ${gate.label}`,
      desc:    `Your free trial ends in ${trial.daysLeft} day${trial.daysLeft !== 1 ? "s" : ""}. Upgrade to keep uninterrupted access.`,
      subdesc: priceStr ? `${gate.planLabel} — ${priceStr}` : null,
      price:   priceStr,
      cta:     "Keep Access",
      urgency: true,
    };
  }

  // ── Repeat block — they keep trying, be direct ────────────────────────────
  if (blocks >= 2) {
    return {
      icon:    GATE_ICONS[key] || "🔒",
      title:   `Unlock ${gate.label}`,
      desc:    gate.description,
      subdesc: "Thousands of NovaSpark users have this right now.",
      price:   priceStr,
      cta:     priceStr ? `Upgrade — ${priceStr}` : `Upgrade to ${gate.planLabel}`,
      urgency: true,
    };
  }

  // ── Default — first encounter ─────────────────────────────────────────────
  return {
    icon:    GATE_ICONS[key] || "🔒",
    title:   gate.label,
    desc:    gate.description,
    subdesc: null,
    price:   priceStr,
    cta:     `Upgrade to ${gate.planLabel}`,
    urgency: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY TRACKER (unchanged from v1)
// ─────────────────────────────────────────────────────────────────────────────

export function trackActivity(feature, meta = {}) {
  try {
    const userId = localStorage.getItem(PREFIX + "ns_user_id") || "guest";
    const raw    = localStorage.getItem(PREFIX + "ns_activity_log");
    const log    = raw ? JSON.parse(raw) : [];
    log.push({ feature, meta, userId, ts: Date.now() });
    if (log.length > 500) log.splice(0, log.length - 500);
    localStorage.setItem(PREFIX + "ns_activity_log", JSON.stringify(log));
  } catch {}
}

export function getActivityLog() {
  try {
    const raw = localStorage.getItem(PREFIX + "ns_activity_log");
    return (raw ? JSON.parse(raw) : []).sort((a, b) => b.ts - a.ts);
  } catch { return []; }
}

export function getFeatureUsageSummary() {
  return getActivityLog().reduce((acc, e) => {
    acc[e.feature] = (acc[e.feature] || 0) + 1;
    return acc;
  }, {});
}

export function getUserEngagementProfile() {
  const log     = getActivityLog();
  const trial   = getTrialStatus();
  const summary = getFeatureUsageSummary();
  const top     = Object.entries(summary).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const first   = log.length ? log[log.length - 1].ts : null;
  return {
    plan:           getActivePlan(),
    trial,
    topFeature:     top,
    totalEvents:    log.length,
    daysSinceFirst: first ? Math.floor((Date.now() - first) / 86400000) : 0,
    sessionBlocks:  getSessionBlockCount(),
    featureSummary: summary,
    convertRisk:    trial.expired && !isPremiumActive() ? "high" : trial.warning ? "medium" : "low",
    nudgeNow:       shouldNudgeUpgrade(),
  };
}