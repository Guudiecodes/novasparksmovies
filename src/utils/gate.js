/**
 * gate.js — NovaSpark feature gate · v4.0
 * Thin pass-through over premium.js (the single source of truth).
 * Keeps old function names/call shapes so existing pages don't break.
 */
import * as Premium from "./premium";

export const OPEN_ACCESS = false;

export const PLAN_RANK = Premium.PLAN_RANK;
export const GATES = Premium.GATES;
export const FEATURE_LABELS = Premium.FEATURE_LABELS;

export const initTrial             = Premium.initTrial;
export const getTrialStatus        = Premium.getTrialStatus;
export const getTrialBannerMessage = Premium.getTrialBannerMessage;
export const getCurrentPlan        = Premium.getCurrentPlan;
export const getAdminGlobalPlan    = Premium.getAdminGlobalPlan;
export const setAdminGlobalPlan    = Premium.setAdminGlobalPlan;
export const getRegion             = Premium.getRegion;
export const setRegion             = Premium.setRegion;
export const formatPrice           = Premium.formatPrice;
export const formatPricePerDay     = Premium.formatPricePerDay;

export function getEffectivePlan(_planId) { return Premium.getEffectivePlan(); }

export function canWatch(_p)         { return OPEN_ACCESS || Premium.canWatch(); }
export function canWatchlist(_p)     { return OPEN_ACCESS || Premium.canWatchlist(); }
export function canSwitchSource(_p)  { return OPEN_ACCESS || Premium.canSwitchSource(); }
export function canDownload(_p)      { return OPEN_ACCESS || Premium.canDownload(); }
export function canUseSubtitles(_p)  { return OPEN_ACCESS || Premium.canUseSubtitles(); }
export function canContinueWatch(_p) { return OPEN_ACCESS || Premium.canContinueWatch(); }
export function canPopOut(_p)        { return OPEN_ACCESS || Premium.canPopOut(); }
export function can4K(_p)            { return OPEN_ACCESS || Premium.can4K(); }

// OPEN_ACCESS forces ads off too, same as every other gate here — dev/test
// builds shouldn't serve ads.
export function shouldShowAds(_p) { return !OPEN_ACCESS && Premium.shouldShowAds(); }
export function shouldShowPushPrompt(_p) { return !OPEN_ACCESS && Premium.shouldShowPushPrompt(); }
export function canUseAI(_p)         { return OPEN_ACCESS || Premium.canUseAI(); }
export function canUseShorts(_p)     { return OPEN_ACCESS || Premium.canUseShorts(); }

export function maxQualityLabel(_p) { return OPEN_ACCESS ? "4K Ultra HD" : Premium.maxQualityLabel(); }

export const checkFreeDailyLimit    = Premium.checkFreeDailyLimit;
export const incrementFreeDailyUsage= Premium.incrementFreeDailyUsage;
export const getFreeDailyUsage      = Premium.getFreeDailyUsage;

export function checkSoftLimit(feature, _p) {
  if (OPEN_ACCESS) return { allowed: true, hardBlock: false, nudge: false, used: 0, limit: Infinity, remaining: Infinity, period: "daily" };
  if (feature === "ai" || feature === "shorts") {
    const plan = Premium.getEffectivePlan();
    if (plan === "standard" && feature === "ai") return { allowed: true, hardBlock: false, nudge: false, used: 0, limit: Infinity, remaining: Infinity, period: "daily" };
    if (plan === "premium") return { allowed: true, hardBlock: false, nudge: false, used: 0, limit: Infinity, remaining: Infinity, period: "daily" };
    const r = Premium.checkFreeDailyLimit(feature);
    return { allowed: r.allowed, hardBlock: !r.allowed, nudge: r.remaining > 0 && r.remaining <= 3, used: r.used, limit: r.limit, remaining: r.remaining, period: "daily" };
  }
  const allowed = feature === "download" ? Premium.canDownload() : Premium.getEffectivePlan() !== "free";
  return { allowed, hardBlock: !allowed, nudge: false, used: 0, limit: allowed ? Infinity : 0, remaining: allowed ? Infinity : 0, period: "monthly" };
}
export const getSoftLimitNudge = Premium.getSoftLimitNudge;

export const getGateMessage       = Premium.getGateMessage;
export const shouldNudgeUpgrade   = Premium.shouldNudgeUpgrade;
export const recordSessionBlock   = Premium.recordSessionBlock;
export const getSessionBlockCount = Premium.getSessionBlockCount;

export const trackActivity            = Premium.trackActivity;
export const getActivityLog           = Premium.getActivityLog;
export const getFeatureUsageSummary   = Premium.getFeatureUsageSummary;
export const getUserEngagementProfile = Premium.getUserEngagementProfile;