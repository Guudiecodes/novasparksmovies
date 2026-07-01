/**
 * gate.js — NovaSpark feature gate · v2.0
 *
 * Single source of truth for what each plan can access.
 * Import this everywhere; never scatter plan-level logic in pages.
 *
 * Plan order (ascending):
 *   free → mobile → basic → standard → premium
 *
 * ── STRATEGY ──────────────────────────────────────────────────────────────────
 *  1. 14-day full-access trial  — build habits, create dependency
 *  2. Soft limits with nudges   — warn before blocking, never surprise
 *  3. Loss-aversion messaging   — "you HAD this" hits harder than "upgrade"
 *  4. Smart upsell timing       — nudge when engagement is highest
 *  5. Strict post-trial walls   — respectful but firm, no free rides
 *
 * ── OPEN ACCESS MODE ──────────────────────────────────────────────────────────
 * Flip OPEN_ACCESS to false to activate all gating + trial logic.
 */

export const OPEN_ACCESS = false; // ← true = everything free (dev/promo mode)

// ── Config ────────────────────────────────────────────────────────────────────
const TRIAL_DAYS        = 14;   // free full-access window
const TRIAL_WARNING_DAY = 11;   // start showing countdown from this day
const PREFIX            = "streambert_";

// ── Plan rank map ─────────────────────────────────────────────────────────────
const PLAN_RANK = {
  free:     0,
  mobile:   1,
  basic:    2,
  standard: 3,
  premium:  4,
};

// ── Pricing (shown in gate messages) ─────────────────────────────────────────
export const PLAN_PRICES = {
  mobile:   { usd: "$0.65",  ngn: "₦1,000",  label: "Mobile"   },
  basic:    { usd: "$0.95",  ngn: "₦1,500",  label: "Basic"    },
  standard: { usd: "$2.20",  ngn: "₦3,500",  label: "Standard" },
  premium:  { usd: "$4.10",  ngn: "₦6,500",  label: "Premium"  },
};

// ── Soft usage limits per billing period ──────────────────────────────────────
// free = post-trial locked, numbers are monthly allowances
const SOFT_LIMITS = {
  download: {
    free:     0,
    mobile:   0,
    basic:    10,
    standard: 40,
    premium:  Infinity,
  },
  source_switch: {
    free:     3,   // 3 per day, resets daily — enough to taste, not enough to rely on
    mobile:   Infinity,
    basic:    Infinity,
    standard: Infinity,
    premium:  Infinity,
  },
  subtitles: {
    free:     2,   // per day
    mobile:   5,
    basic:    Infinity,
    standard: Infinity,
    premium:  Infinity,
  },
};

// ── Nudge thresholds — warn at this % of limit ────────────────────────────────
const NUDGE_AT = 0.8; // 80% used → first warning

// ─────────────────────────────────────────────────────────────────────────────
// TRIAL SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called once on app boot. Sets trial start if not already set.
 * Safe to call multiple times — only writes once.
 */
export function initTrial() {
  try {
    const existing = localStorage.getItem(PREFIX + "trial_start");
    if (!existing) {
      localStorage.setItem(PREFIX + "trial_start", String(Date.now()));
    }
  } catch {}
}

/**
 * Returns full trial status object.
 * @returns {{
 *   started:    boolean,
 *   active:     boolean,   // trial is currently running
 *   expired:    boolean,   // trial has ended and user is on free
 *   daysLeft:   number,    // 0 when expired
 *   daysUsed:   number,
 *   startedAt:  number|null,
 *   endsAt:     number|null,
 *   warning:    boolean,   // true when in the final warning window
 * }}
 */
export function getTrialStatus() {
  const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;
  try {
    const raw = localStorage.getItem(PREFIX + "trial_start");
    if (!raw) {
      return { started: false, active: false, expired: false, daysLeft: 0, daysUsed: 0, startedAt: null, endsAt: null, warning: false };
    }
    const startedAt = parseInt(raw, 10);
    const endsAt    = startedAt + TRIAL_MS;
    const now       = Date.now();
    const elapsed   = now - startedAt;
    const daysUsed  = Math.floor(elapsed / (24 * 60 * 60 * 1000));
    const daysLeft  = Math.max(0, TRIAL_DAYS - daysUsed);
    const active    = now < endsAt;
    const expired   = !active;
    const warning   = active && daysUsed >= TRIAL_WARNING_DAY;
    return { started: true, active, expired, daysLeft, daysUsed, startedAt, endsAt, warning };
  } catch {
    return { started: false, active: false, expired: false, daysLeft: 0, daysUsed: 0, startedAt: null, endsAt: null, warning: false };
  }
}

/**
 * Human-readable trial status string for UI banners.
 * Returns null when no message is needed.
 */
export function getTrialBannerMessage() {
  if (OPEN_ACCESS) return null;
  const plan = getCurrentPlan();
  if (plan !== "free") return null; // paying user, no banner needed
  const t = getTrialStatus();
  if (!t.started) return null;
  if (t.expired)  return null; // wall is shown elsewhere
  if (!t.warning) return null; // too early, don't nag
  if (t.daysLeft === 0) return "⏰ Your free trial ends today. Lock in your plan to keep everything.";
  if (t.daysLeft === 1) return "⏰ 1 day left on your free trial. Don't lose access tomorrow.";
  return `⏰ ${t.daysLeft} days left on your free trial.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the stored plan id for the current user.
 * Does NOT apply trial or admin floor — use getEffectivePlan() for that.
 */
export function getCurrentPlan() {
  if (OPEN_ACCESS) return "premium";
  try {
    const raw = localStorage.getItem(PREFIX + "ns_premium_record");
    if (!raw) return "free";
    const rec = JSON.parse(raw);
    if (!rec?.planId || rec.planId === "free") return "free";
    if (rec.expiresAt && Date.now() >= rec.expiresAt) return "free";
    return rec.planId;
  } catch {
    return "free";
  }
}

export function getAdminGlobalPlan() {
  try { return localStorage.getItem("ns_admin_global_plan") || "free"; } catch { return "free"; }
}

export function setAdminGlobalPlan(planId) {
  try {
    if (!planId || planId === "free") localStorage.removeItem("ns_admin_global_plan");
    else localStorage.setItem("ns_admin_global_plan", planId);
  } catch {}
}

/**
 * The plan that actually governs feature access.
 * Applies: admin floor > stored plan > trial boost > free.
 *
 * During an active trial a "free" user is treated as "premium"
 * so they experience everything before the wall hits.
 */
export function getEffectivePlan(planId) {
  if (OPEN_ACCESS) return "premium";

  const user  = planId || getCurrentPlan();
  const floor = getAdminGlobalPlan();

  // Trial boost — free users get premium during trial
  let resolved = user;
  if (resolved === "free") {
    const trial = getTrialStatus();
    if (trial.active) resolved = "premium";
  }

  // Admin floor wins if higher
  const resolvedRank = PLAN_RANK[resolved]  ?? 0;
  const floorRank    = PLAN_RANK[floor]     ?? 0;
  return floorRank > resolvedRank ? floor : resolved;
}

function atLeast(planId, requiredId) {
  if (OPEN_ACCESS) return true;
  const effective = getEffectivePlan(planId);
  return (PLAN_RANK[effective] ?? 0) >= (PLAN_RANK[requiredId] ?? 999);
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE GATES
// ─────────────────────────────────────────────────────────────────────────────

export function canSwitchSource(planId) { return atLeast(planId, "mobile");   }
export function canDownload(planId)     { return atLeast(planId, "basic");    }
export function canUseSubtitles(planId) { return atLeast(planId, "basic");    }
export function canPopOut(planId)       { return atLeast(planId, "standard"); }
export function canMultiDevice(planId)  { return atLeast(planId, "standard"); }
export function can4K(planId)          { return atLeast(planId, "premium");  }

export function maxQualityLabel(planId) {
  if (OPEN_ACCESS) return "4K Ultra HD";
  const p = getEffectivePlan(planId);
  if (atLeast(p, "premium"))  return "4K Ultra HD";
  if (atLeast(p, "standard")) return "Full HD 1080p";
  if (atLeast(p, "basic"))    return "HD 720p";
  if (atLeast(p, "mobile"))   return "HD 720p";
  return "SD 480p";
}

// ─────────────────────────────────────────────────────────────────────────────
// SOFT LIMITS — usage counters that warn before blocking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the storage key for a given feature's usage counter.
 * Resets are period-based: "monthly" or "daily".
 */
function usageKey(feature, period = "monthly") {
  const now    = new Date();
  const bucket = period === "daily"
    ? `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
    : `${now.getFullYear()}-${now.getMonth()}`;
  return `${PREFIX}usage_${feature}_${bucket}`;
}

export function getUsageCount(feature, period = "monthly") {
  try {
    const raw = localStorage.getItem(usageKey(feature, period));
    return raw ? parseInt(raw, 10) : 0;
  } catch { return 0; }
}

export function incrementUsage(feature, period = "monthly") {
  try {
    const key = usageKey(feature, period);
    const cur = getUsageCount(feature, period);
    localStorage.setItem(key, String(cur + 1));
    trackActivity(feature, { count: cur + 1 });
    return cur + 1;
  } catch { return 0; }
}

/**
 * Full soft-limit check for a feature.
 * @returns {{
 *   allowed:   boolean,  // can they do this action right now?
 *   hardBlock: boolean,  // over limit — show upgrade wall
 *   nudge:     boolean,  // approaching limit — show soft warning
 *   used:      number,
 *   limit:     number,
 *   remaining: number,
 *   period:    string,
 * }}
 */
export function checkSoftLimit(feature, planId) {
  if (OPEN_ACCESS) return { allowed: true, hardBlock: false, nudge: false, used: 0, limit: Infinity, remaining: Infinity, period: "monthly" };

  const effective = getEffectivePlan(planId);

  // Determine period for this feature
  const dailyFeatures = ["source_switch", "subtitles"];
  const period        = dailyFeatures.includes(feature) ? "daily" : "monthly";

  const limits = SOFT_LIMITS[feature];
  if (!limits) return { allowed: true, hardBlock: false, nudge: false, used: 0, limit: Infinity, remaining: Infinity, period };

  const limit     = limits[effective] ?? 0;
  const used      = getUsageCount(feature, period);
  const remaining = Math.max(0, limit - used);
  const hardBlock = limit !== Infinity && used >= limit;
  const nudge     = !hardBlock && limit !== Infinity && used >= Math.floor(limit * NUDGE_AT);

  return { allowed: !hardBlock, hardBlock, nudge, used, limit, remaining, period };
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART UPSELL TIMING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true when the system thinks the user is most receptive to an upsell.
 * Factors: evening hours, high engagement session, trial warning window,
 * multiple hard blocks in this session.
 */
export function shouldNudgeUpgrade() {
  if (OPEN_ACCESS) return false;
  const plan = getEffectivePlan();
  if (plan !== "free") return false; // already paying

  const hour      = new Date().getHours();
  const isEvening = hour >= 18 && hour <= 23; // peak emotional engagement

  const trial    = getTrialStatus();
  const nearEnd  = trial.active && trial.daysLeft <= 3;
  const expired  = trial.expired;

  const blocks = getSessionBlockCount();
  const highBlock = blocks >= 2; // hit wall twice this session

  return isEvening || nearEnd || expired || highBlock;
}

/**
 * Track how many times user has hit a hard block this session.
 * Resets on page reload (sessionStorage).
 */
export function recordSessionBlock() {
  try {
    const cur = parseInt(sessionStorage.getItem("ns_session_blocks") || "0", 10);
    sessionStorage.setItem("ns_session_blocks", String(cur + 1));
  } catch {}
}

export function getSessionBlockCount() {
  try { return parseInt(sessionStorage.getItem("ns_session_blocks") || "0", 10); }
  catch { return 0; }
}

// ─────────────────────────────────────────────────────────────────────────────
// GATE DESCRIPTORS + PSYCHOLOGY-AWARE MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

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

const GATE_ICONS = {
  source_switch: "🌐",
  download:      "⬇️",
  pip:           "🖼️",
  subtitles:     "📝",
  quality_4k:    "🎬",
};

/**
 * Returns a psychologically-tuned gate message.
 * Adapts tone based on: trial state, session block count, time of day.
 *
 * Three states:
 *   "trial_expired" — they HAD it, now it's gone (loss aversion)
 *   "first_block"   — soft, curious
 *   "repeat_block"  — urgent, specific price
 */
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
      icon:    "🔒",
      title:   "Premium Feature",
      desc:    "Upgrade your plan to unlock this.",
      subdesc: null,
      price:   null,
      cta:     "See Plans",
      urgency: false,
    };
  }

  const trial  = getTrialStatus();
  const blocks = getSessionBlockCount();
  recordSessionBlock();

  const price   = PLAN_PRICES[gate.required];
  const priceStr = price ? `${price.ngn}/month · ${price.usd}` : null;

  // Loss aversion — most powerful message, only shown post-trial
  if (trial.expired) {
    return {
      icon:    GATE_ICONS[key] || "🔒",
      title:   `You had ${gate.label} — get it back`,
      desc:    `You used this free during your trial. Upgrade to ${gate.planLabel} to keep it.`,
      subdesc: "Everything you built your habits around is still here.",
      price:   priceStr,
      cta:     "Restore Access",
      urgency: true,
    };
  }

  // Soft nudge — first time hitting a wall, trial still active but near end
  if (trial.warning && blocks <= 1) {
    return {
      icon:    GATE_ICONS[key] || "🔒",
      title:   `${trial.daysLeft}d left of ${gate.label}`,
      desc:    `Your free trial ends in ${trial.daysLeft} day${trial.daysLeft !== 1 ? "s" : ""}. Upgrade now to keep uninterrupted access.`,
      subdesc: `${gate.planLabel} — ${priceStr}`,
      price:   priceStr,
      cta:     "Keep Access",
      urgency: true,
    };
  }

  // Repeat block in same session — they're clearly trying to use it, be direct
  if (blocks >= 2) {
    return {
      icon:    GATE_ICONS[key] || "🔒",
      title:   `Unlock ${gate.label}`,
      desc:    gate.description,
      subdesc: `Thousands of NovaSpark users are watching with this right now.`,
      price:   priceStr,
      cta:     `Upgrade — ${priceStr || "See Plans"}`,
      urgency: true,
    };
  }

  // Default — first encounter, neutral
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

/**
 * Soft-limit nudge message — shown BEFORE the hard block.
 * Called when checkSoftLimit().nudge === true.
 */
export function getSoftLimitNudge(feature, remaining) {
  const messages = {
    download:      `${remaining} download${remaining !== 1 ? "s" : ""} left this month. Upgrade for unlimited.`,
    source_switch: `${remaining} source switch${remaining !== 1 ? "es" : ""} left today.`,
    subtitles:     `${remaining} subtitle download${remaining !== 1 ? "s" : ""} left today.`,
  };
  return messages[feature] || `${remaining} use${remaining !== 1 ? "s" : ""} remaining.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY TRACKER
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
    const log = raw ? JSON.parse(raw) : [];
    return log.sort((a, b) => b.ts - a.ts);
  } catch { return []; }
}

export function getFeatureUsageSummary() {
  const log = getActivityLog();
  return log.reduce((acc, e) => {
    acc[e.feature] = (acc[e.feature] || 0) + 1;
    return acc;
  }, {});
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGAGEMENT STATS — fed back to AI and admin dashboard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a summary of this user's engagement for the admin dashboard
 * and for the NS AI personalisation engine.
 */
export function getUserEngagementProfile() {
  const log     = getActivityLog();
  const trial   = getTrialStatus();
  const plan    = getCurrentPlan();
  const summary = getFeatureUsageSummary();
  const blocks  = getSessionBlockCount();

  // Most-used feature
  const topFeature = Object.entries(summary).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Days since first activity
  const first = log.length ? log[log.length - 1].ts : null;
  const daysSinceFirst = first ? Math.floor((Date.now() - first) / (1000 * 60 * 60 * 24)) : 0;

  return {
    plan,
    trial,
    topFeature,
    totalEvents:     log.length,
    daysSinceFirst,
    sessionBlocks:   blocks,
    featureSummary:  summary,
    convertRisk:     trial.expired && plan === "free" ? "high" : trial.warning ? "medium" : "low",
    nudgeNow:        shouldNudgeUpgrade(),
  };
}