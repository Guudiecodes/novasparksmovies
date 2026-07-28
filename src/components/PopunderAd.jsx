import { useEffect } from "react";
import { shouldShowAds } from "../utils/gate";

const POPUNDER_SRC =
  "https://pl29741665.effectivecpmnetwork.com/bd/b6/3a/bdb63a60b2b5c511d2c5c18794a57013.js";

// Injects the Adsterra popunder script once, only for users below the
// paid tier. Adsterra's own script handles its own frequency capping
// (roughly once per session), so we don't need to manage that ourselves.
export default function PopunderAd() {
  useEffect(() => {
    if (!shouldShowAds()) return;
    if (document.getElementById("ns-popunder-script")) return;
    const script = document.createElement("script");
    script.id = "ns-popunder-script";
    script.src = POPUNDER_SRC;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return null;
}