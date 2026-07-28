// Adsterra Smartlink trigger — fires once per app session for free users only.
// In-memory flag, no storage needed — resets naturally on app restart.
let adShownThisSession = false;

const SMARTLINK_URL = "https://www.effectivecpmnetwork.com/zq1jdr84u?key=6669c3fa6ab17edcafd8532703c24fcf";

export function maybeShowAd(shouldShow) {
  if (!shouldShow) return;
  if (adShownThisSession) return;
  adShownThisSession = true;

  if (window.electron?.openExternal) {
    window.electron.openExternal(SMARTLINK_URL);
  } else {
    window.open(SMARTLINK_URL, "_blank", "noopener,noreferrer");
  }
}