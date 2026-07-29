// premium.js — NovaSpark subscriptions · v4.0
// SINGLE SOURCE OF TRUTH for plan, trial, region, and feature access.
import { storage } from "./storage";

const PREMIUM_KEY        = "ns_premium_record";
const PREMIUM_FLAG_KEY   = "ns_premium";
const WARN_DISMISSED_KEY = "ns_warn_dismissed";
const TRIAL_KEY          = "ns_trial_start";
const ACTIVITY_KEY       = "ns_activity_log";
const ADMIN_FLOOR_KEY    = "ns_admin_global_plan";
const MIGRATED_KEY       = "ns_migrated_from_streambert";
const REGION_KEY         = "ns_region";

export const API_BASE = "https://novaspark.app";
export const TRIAL_DAYS = 4;
const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

export const PLANS = {
  free: {
    id: "free", name: "Free", price: 0, priceUsd: 0, priceKobo: 0, currency: "NGN",
    color: "var(--text3)",
    tagline: "Browse everything. A daily taste of Shorts and AI. Everything else needs a plan.",
    features: { adFree: true, browse: true, watch: false, watchlist: false, history: false, multipleSource: false, downloads: false, subtitles: false, continueWatching: false, ai: false, shorts: false, popOut: false, quality4k: false, prioritySupport: false, earlyAccess: false },
    downloadLimit: 0, maxQuality: "Preview only",
  },
  standard: {
    id: "standard", name: "Standard", price: 650, priceUsd: 0.49, priceKobo: 65000, currency: "NGN",
    color: "#00b4a6", badge: "Most Popular", durationDays: 30,
    tagline: "Watch, save, and use NS AI without limits. Downloads and Shorts are Premium.",
    features: { adFree: true, browse: true, watch: true, watchlist: true, history: true, multipleSource: true, downloads: false, subtitles: true, continueWatching: true, ai: true, shorts: false, popOut: false, quality4k: false, prioritySupport: false, earlyAccess: false },
    downloadLimit: 0, maxQuality: "Full HD 1080p",
  },
  premium: {
    id: "premium", name: "Premium", price: 1700, priceUsd: 1.29, priceKobo: 170000, currency: "NGN",
    color: "#f5a623", badge: "Best Value", durationDays: 30,
    tagline: "Every feature NovaSpark has — unlimited downloads, Shorts, 4K, pop-out, priority support.",
    features: { adFree: true, browse: true, watch: true, watchlist: true, history: true, multipleSource: true, downloads: true, subtitles: true, continueWatching: true, ai: true, shorts: true, popOut: true, quality4k: true, prioritySupport: true, earlyAccess: true },
    downloadLimit: Infinity, maxQuality: "4K Ultra HD",
  },
};

export const PLAN_ORDER = ["free", "standard", "premium"];
export const PLAN_RANK  = { free: 0, standard: 1, premium: 2 };

export const FEATURE_LABELS = {
  watch: "Watch movies & shows", watchlist: "Watchlist & favourites", history: "Watch history",
  multipleSource: "Multiple streaming sources", ai: "NS AI assistant", shorts: "Shorts (unlimited)",
  downloads: "Offline downloads", subtitles: "Subtitle downloader", continueWatching: "Continue watching",
  popOut: "Pop-out floating player", quality4k: "4K Ultra HD streaming",
  prioritySupport: "Priority support", earlyAccess: "Early access to new features",
};

export function getRegion() { try { return storage.get(REGION_KEY) || "NG"; } catch { return "NG"; } }
export function setRegion(region) { try { storage.set(REGION_KEY, region === "INTL" ? "INTL" : "NG"); } catch {} }

export function formatPrice(plan) {
  if (!plan) return "Free";
  if (getRegion() === "INTL") return plan.priceUsd ? `$${plan.priceUsd.toFixed(2)}/month` : "Free";
  return plan.price ? `₦${plan.price.toLocaleString()}/month` : "Free";
}
export function formatPricePerDay(plan) {
  if (!plan) return null;
  if (getRegion() === "INTL") return plan.priceUsd ? `≈ $${(plan.priceUsd / 30).toFixed(2)}/day` : null;
  return plan.price ? `≈ ₦${Math.round(plan.price / 30)}/day` : null;
}

export function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h.toString(16);
}

export function initTrial() {
  migrateLegacyStreambertData();
  try { if (storage.get(TRIAL_KEY) == null) storage.set(TRIAL_KEY, Date.now()); } catch {}
}
export function getTrialStatus() {
  try {
    const startedAt = storage.get(TRIAL_KEY);
    if (startedAt == null || !Number.isFinite(startedAt)) {
      return { started: false, active: false, expired: false, daysLeft: TRIAL_DAYS, hoursLeft: TRIAL_DAYS * 24, startedAt: null, endsAt: null };
    }
    const endsAt = startedAt + TRIAL_MS;
    const now    = Date.now();
    const msLeft = Math.max(0, endsAt - now);
    return { started: true, active: msLeft > 0, expired: msLeft <= 0, daysLeft: Math.ceil(msLeft / 86400000), hoursLeft: Math.ceil(msLeft / 3600000), startedAt, endsAt };
  } catch {
    return { started: false, active: false, expired: false, daysLeft: TRIAL_DAYS, hoursLeft: TRIAL_DAYS * 24, startedAt: null, endsAt: null };
  }
}
export function getTrialBannerMessage() {
  if (getCurrentPlan() !== "free") return null;
  const t = getTrialStatus();
  if (!t.started || t.expired) return null;
  if (t.hoursLeft <= 24) return `⏰ Your free trial ends in ${t.hoursLeft}h. Lock in your plan to keep everything.`;
  return `⏰ ${t.daysLeft} day${t.daysLeft !== 1 ? "s" : ""} left on your free trial.`;
}
function migrateLegacyStreambertData() {
  try {
    if (typeof localStorage === "undefined" || storage.get(MIGRATED_KEY)) return;
    const legacyTrial = localStorage.getItem("streambert_trial_start");
    if (legacyTrial && storage.get(TRIAL_KEY) == null) {
      const parsed = parseInt(legacyTrial, 10);
      if (Number.isFinite(parsed)) storage.set(TRIAL_KEY, parsed);
    }
    storage.set(MIGRATED_KEY, true);
  } catch {}
}

export function getPremiumRecord() { return storage.get(PREMIUM_KEY) || null; }
export function isPremiumActive() {
  const rec = getPremiumRecord();
  return !!(rec && rec.planId !== "free" && Date.now() < rec.expiresAt);
}
export function getCurrentPlan() {
  const rec = getPremiumRecord();
  if (!rec || rec.planId === "free") return "free";
  if (rec.expiresAt && Date.now() >= rec.expiresAt) return "free";
  return rec.planId;
}
export function getAdminGlobalPlan() { try { return storage.get(ADMIN_FLOOR_KEY) || "free"; } catch { return "free"; } }
export function setAdminGlobalPlan(planId) {
  try { if (!planId || planId === "free") storage.remove(ADMIN_FLOOR_KEY); else storage.set(ADMIN_FLOOR_KEY, planId); } catch {}
}
export function getEffectivePlan() {
  const purchased = getCurrentPlan();
  const floor = getAdminGlobalPlan();
  let resolved = purchased;
  if (resolved === "free" && getTrialStatus().active) resolved = "premium";
  return (PLAN_RANK[floor] ?? 0) > (PLAN_RANK[resolved] ?? 0) ? floor : resolved;
}
export function getPremiumPlan() { return PLANS[getEffectivePlan()] || PLANS.free; }
function atLeast(requiredId) { return (PLAN_RANK[getEffectivePlan()] ?? 0) >= (PLAN_RANK[requiredId] ?? 999); }
export function isOnTrial() { return getCurrentPlan() === "free" && getTrialStatus().active; }

const FREE_DAILY_LIMITS = { shorts: 15, ai: 15 };
function todayKey(feature) {
  const d = new Date();
  return `ns_free_daily_${feature}_${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
export function getFreeDailyUsage(feature) { return storage.get(todayKey(feature)) || 0; }
export function incrementFreeDailyUsage(feature) {
  const cur = getFreeDailyUsage(feature) + 1;
  storage.set(todayKey(feature), cur);
  trackActivity(feature, { count: cur, freeTaste: true });
  return cur;
}
export function checkFreeDailyLimit(feature) {
  const limit = FREE_DAILY_LIMITS[feature];
  if (!limit) return { allowed: true, used: 0, limit: Infinity, remaining: Infinity };
  const used = getFreeDailyUsage(feature);
  return { allowed: used < limit, used, limit, remaining: Math.max(0, limit - used) };
}

export function canWatch()         { return atLeast("standard"); }
export function canWatchlist()     { return atLeast("standard"); }
export function canDownload()      { return atLeast("premium"); }
export function canUseSubtitles()  { return atLeast("standard"); }
export function canSwitchSource()  { return atLeast("standard"); }
export function canContinueWatch() { return atLeast("standard"); }
export function canPopOut()        { return atLeast("premium"); }
export function can4K()            { return atLeast("premium"); }
export function hasPrioritySupport() { return atLeast("premium"); }

// Ads only show to users below the Standard tier — i.e. the Free plan.
// Any paid plan (Standard or Premium) turns ads off immediately.
export function shouldShowAds() { return !atLeast("standard"); }

// Push-notification prompt is looser than the general ad gate — it shows to
// Free AND Standard, only Premium is fully ad-free from this one.
export function shouldShowPushPrompt() { return !atLeast("premium"); }

export function canUseAI() {
  const plan = getEffectivePlan();
  if (plan === "standard" || plan === "premium") return true;
  return checkFreeDailyLimit("ai").allowed;
}
export function canUseShorts() {
  const plan = getEffectivePlan();
  if (plan === "premium") return true;
  // Standard and Free now share the same daily limit — no hard block.
  // Only Premium gets unlimited Shorts.
  return checkFreeDailyLimit("shorts").allowed;
}

export function maxQualityLabel() { return getPremiumPlan().maxQuality; }
export function getDownloadLimit() { return getPremiumPlan().downloadLimit; }
export function checkDownloadLimit() {
  const limit = getDownloadLimit();
  return { allowed: canDownload(), used: 0, limit, remaining: limit };
}

export function recordSessionBlock() {
  try { if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem("ns_session_blocks", String((parseInt(sessionStorage.getItem("ns_session_blocks") || "0", 10)) + 1));
  } catch {}
}
export function getSessionBlockCount() {
  try { return typeof sessionStorage === "undefined" ? 0 : parseInt(sessionStorage.getItem("ns_session_blocks") || "0", 10); } catch { return 0; }
}
export function shouldNudgeUpgrade() {
  if (getEffectivePlan() !== "free") return false;
  const hour = new Date().getHours();
  const trial = getTrialStatus();
  return (hour >= 18 && hour <= 23) || (trial.active && trial.hoursLeft <= 24) || trial.expired || getSessionBlockCount() >= 2;
}

export const GATES = {
  watch:         { label: "Watching",           description: "Stream movies and shows in full.",             required: "standard" },
  watchlist:     { label: "Watchlist",           description: "Save titles to watch later.",                   required: "standard" },
  source_switch: { label: "Source Switching",    description: "Access 30+ streaming providers.",               required: "standard" },
  subtitles:     { label: "Subtitle Downloader", description: "Download subtitles in any language.",           required: "standard" },
  ai:            { label: "NS AI",               description: "Your personal watch assistant, unlimited.",     required: "standard" },
  download:      { label: "Downloads",           description: "Save movies and episodes to watch offline.",    required: "premium"  },
  shorts:        { label: "Shorts",              description: "Unlimited swiping, no daily cutoff.",           required: "premium"  },
  pip:           { label: "Pop-Out Player",      description: "Watch in a floating window while you browse.",  required: "premium"  },
  quality_4k:    { label: "4K Ultra HD",         description: "Stream in 4K resolution when available.",       required: "premium"  },
};
const GATE_ICONS = { watch: "🎬", watchlist: "📌", source_switch: "🌐", subtitles: "📝", ai: "✨", download: "⬇️", shorts: "⚡", pip: "🖼️", quality_4k: "🎬" };

export function getGateMessage(feature) {
  const gate = GATES[feature];
  if (!gate) return { icon: "🔒", title: "Premium Feature", desc: "Upgrade your plan to unlock this.", subdesc: null, price: null, cta: "See Plans", urgency: false, plan: PLANS.standard };
  const plan = PLANS[gate.required];
  const priceStr = formatPrice(plan);
  const perDay = formatPricePerDay(plan);
  const trial = getTrialStatus();
  const blocks = getSessionBlockCount();
  recordSessionBlock();
  const isDailyTaste = (feature === "ai" || feature === "shorts") && getEffectivePlan() === "free" && trial.expired;
  if (isDailyTaste) {
    return { icon: GATE_ICONS[feature] || "🔒", title: `Out of free ${gate.label} for today`, desc: `Resets tomorrow — or go unlimited right now with ${plan.name}.`, subdesc: perDay ? `${priceStr} · ${perDay}` : priceStr, price: priceStr, cta: `Go Unlimited — ${priceStr}`, urgency: true, plan };
  }
  if (trial.expired && getCurrentPlan() === "free") {
    return { icon: GATE_ICONS[feature] || "🔒", title: `Your free trial ended — get ${gate.label} back`, desc: `You had full access for ${TRIAL_DAYS} days. Pick a plan to keep using NovaSpark.`, subdesc: perDay ? `${priceStr} · ${perDay}` : priceStr, price: priceStr, cta: `Unlock ${gate.label}`, urgency: true, plan };
  }
  if (trial.active && trial.hoursLeft <= 24) {
    return { icon: GATE_ICONS[feature] || "🔒", title: `${trial.hoursLeft}h left on your trial`, desc: `Lock in ${gate.label} — and everything else — before your trial ends.`, subdesc: `${plan.name} — ${priceStr}`, price: priceStr, cta: "Keep My Access", urgency: true, plan };
  }
  if (blocks >= 2) {
    return { icon: GATE_ICONS[feature] || "🔒", title: `Unlock ${gate.label}`, desc: gate.description, subdesc: `${plan.name} — ${priceStr}${perDay ? ` (${perDay})` : ""}`, price: priceStr, cta: `Upgrade — ${priceStr}`, urgency: true, plan };
  }
  return { icon: GATE_ICONS[feature] || "🔒", title: gate.label, desc: gate.description, subdesc: null, price: priceStr, cta: `Upgrade to ${plan.name}`, urgency: false, plan };
}

export function getDailyLimitMessage(feature) {
  const gate = GATES[feature];
  if (!gate) return { icon: "🔒", title: "Premium Feature", desc: "Upgrade your plan to unlock this.", subdesc: null, price: null, cta: "See Plans", urgency: false, plan: PLANS.standard };
  const plan = PLANS[gate.required];
  const priceStr = formatPrice(plan);
  const perDay = formatPricePerDay(plan);
  const trial = getTrialStatus();
  const blocks = getSessionBlockCount();
  const limitStatus = checkFreeDailyLimit(feature);
  recordSessionBlock();

  // Trial expired → loss aversion ("you HAD this")
  if (trial.expired && getCurrentPlan() === "free") {
    return { icon: GATE_ICONS[feature] || "🔒", title: `Your free trial ended — get ${gate.label} back`, desc: `You had full access for ${TRIAL_DAYS} days. Pick a plan to keep using NovaSpark.`, subdesc: perDay ? `${priceStr} · ${perDay}` : priceStr, price: priceStr, cta: `Unlock ${gate.label}`, urgency: true, plan };
  }
  // Trial final 24h → countdown urgency
  if (trial.active && trial.hoursLeft <= 24) {
    return { icon: GATE_ICONS[feature] || "🔒", title: `${trial.hoursLeft}h left on your trial`, desc: `Lock in ${gate.label} — and everything else — before your trial ends.`, subdesc: `${plan.name} — ${priceStr}`, price: priceStr, cta: "Keep My Access", urgency: true, plan };
  }
  // Repeat block in session → direct, price-forward
  if (blocks >= 2) {
    return { icon: GATE_ICONS[feature] || "🔒", title: `Out of free ${gate.label} for today`, desc: `Resets tomorrow — or go unlimited right now with ${plan.name}.`, subdesc: perDay ? `${priceStr} · ${perDay}` : priceStr, price: priceStr, cta: `Go Unlimited — ${priceStr}`, urgency: true, plan };
  }
  // Trial active / first hit → soft, benefit-forward
  return { icon: GATE_ICONS[feature] || "🔒", title: `${limitStatus.remaining} free ${gate.label} left today`, desc: gate.description, subdesc: null, price: priceStr, cta: `Upgrade to ${plan.name}`, urgency: false, plan };
}

export function getSoftLimitNudge(remaining) { return `${remaining} left today. Upgrade for unlimited.`; }

export function setPremiumPlan(planId, email, password, txnRef, durationDaysOverride) {
  const plan = PLANS[planId];
  const days = durationDaysOverride ?? plan?.durationDays ?? 30;
  const now = Date.now();
  const record = { planId, email: email.trim().toLowerCase(), passwordHash: simpleHash(password), txnRef, startedAt: now, expiresAt: now + days * 86400000, cancelledAt: null, warningSent: { "7d": false, "3d": false, "1d": false }, lastSyncedAt: now };
  storage.set(PREMIUM_KEY, record);
  storage.set(PREMIUM_FLAG_KEY, { planId });
  return record;
}
export const savePremiumRecord = setPremiumPlan;

export function syncPremiumFlag() {
  const active = isPremiumActive();
  const rec = getPremiumRecord();
  if (active && rec) storage.set(PREMIUM_FLAG_KEY, { planId: rec.planId });
  else {
    storage.remove(PREMIUM_FLAG_KEY);
    if (rec && rec.expiresAt && Date.now() >= rec.expiresAt && rec.planId !== "free") storage.set(PREMIUM_KEY, { ...rec, planId: "free", expiredAt: rec.expiresAt });
  }
  return active;
}
export function cancelPremium() {
  const rec = getPremiumRecord();
  if (rec && rec.planId !== "free") storage.set(PREMIUM_KEY, { ...rec, cancelledAt: Date.now() });
}
export function daysRemaining() {
  const rec = getPremiumRecord();
  if (!rec || !rec.expiresAt) return 0;
  return Math.max(0, Math.ceil((rec.expiresAt - Date.now()) / 86400000));
}
export function getExpiryWarning() {
  const rec = getPremiumRecord();
  if (!rec || !isPremiumActive()) return null;
  const days = daysRemaining(); const warn = rec.warningSent || {};
  if (days <= 1 && !warn["1d"]) return "1d"; if (days <= 3 && !warn["3d"]) return "3d"; if (days <= 7 && !warn["7d"]) return "7d";
  return null;
}
export function dismissExpiryWarning(level) {
  const rec = getPremiumRecord();
  if (rec) storage.set(PREMIUM_KEY, { ...rec, warningSent: { ...(rec.warningSent || {}), [level]: true } });
}
export function verifyPassword(password) {
  const rec = getPremiumRecord();
  return !!rec && rec.passwordHash === simpleHash(password);
}
export function canUpgradeTo(targetPlanId) { return (PLAN_RANK[targetPlanId] ?? 0) > (PLAN_RANK[getEffectivePlan()] ?? 0); }
export function clearPremium() { storage.remove(PREMIUM_KEY); storage.remove(PREMIUM_FLAG_KEY); storage.remove(WARN_DISMISSED_KEY); }

export async function syncPremiumFromServer(email, password) {
  try {
    const res = await fetch(`${API_BASE}/api/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase(), passwordHash: simpleHash(password) }) });
    if (!res.ok) { const err = await res.json().catch(() => ({})); return { ok: false, error: err.error || `Server error (${res.status})` }; }
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || "Not found" };
    const rec = { planId: data.planId, email: data.email, passwordHash: simpleHash(password), txnRef: data.txnRef, startedAt: data.startedAt, expiresAt: data.expiresAt, cancelledAt: null, warningSent: { "7d": false, "3d": false, "1d": false }, lastSyncedAt: Date.now() };
    storage.set(PREMIUM_KEY, rec); storage.set(PREMIUM_FLAG_KEY, { planId: data.planId });
    return { ok: true, planId: data.planId, expiresAt: data.expiresAt };
  } catch { return { ok: false, error: "offline" }; }
}
export async function autoSyncPremium() {
  try {
    const rec = getPremiumRecord();
    if (!rec || rec.planId === "free" || !rec.email || !rec.passwordHash) return;
    if (rec.lastSyncedAt && Date.now() - rec.lastSyncedAt < 2 * 60 * 60 * 1000) return;
    const res = await fetch(`${API_BASE}/api/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: rec.email, passwordHash: rec.passwordHash }) });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.ok) return;
    storage.set(PREMIUM_KEY, { ...rec, planId: data.planId, expiresAt: data.expiresAt, lastSyncedAt: Date.now() });
    storage.set(PREMIUM_FLAG_KEY, { planId: data.planId });
  } catch {}
}

export function trackActivity(feature, meta = {}) {
  try { const log = storage.get(ACTIVITY_KEY) || []; log.push({ feature, meta, ts: Date.now() }); if (log.length > 500) log.splice(0, log.length - 500); storage.set(ACTIVITY_KEY, log); } catch {}
}
export const recordFeatureUse = trackActivity;
export function getActivityLog() { const log = storage.get(ACTIVITY_KEY) || []; return log.sort((a, b) => b.ts - a.ts); }
export function getFeatureUsageSummary() { return getActivityLog().reduce((acc, e) => { acc[e.feature] = (acc[e.feature] || 0) + 1; return acc; }, {}); }
export function getUserEngagementProfile() {
  const log = getActivityLog(); const trial = getTrialStatus(); const plan = getCurrentPlan(); const summary = getFeatureUsageSummary();
  const topFeature = Object.entries(summary).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const first = log.length ? log[log.length - 1].ts : null;
  return { plan, trial, topFeature, totalEvents: log.length, daysSinceFirst: first ? Math.floor((Date.now() - first) / 86400000) : 0, sessionBlocks: getSessionBlockCount(), featureSummary: summary, convertRisk: trial.expired && plan === "free" ? "high" : (trial.active && trial.hoursLeft <= 24) ? "medium" : "low", nudgeNow: shouldNudgeUpgrade() };
}