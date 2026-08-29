import { useEffect } from "react";
import { shouldShowAds } from "../utils/gate";

const POPUNDER_SRC =
  "https://pl29741665.profitableratecpmnetwork.com/bd/b6/3a/bdb63a60b2b5c511d2c5c18794a57013.js";

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