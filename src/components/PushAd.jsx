import { useEffect } from "react";
import { shouldShowPushPrompt } from "../utils/gate";

const PUSH_SCRIPT_SRC = "https://5gvci.com/act/files/tag.min.js?z=11448594";

// Push prompt shows to Free and Standard users; Premium users never see it.
// Distinct from the popunder/smartlink gate, which excludes Standard too.
export default function PushAd({ planId }) {
  useEffect(() => {
    if (!shouldShowPushPrompt(planId)) return;
    if (document.getElementById("ns-push-script")) return;
    const script = document.createElement("script");
    script.id = "ns-push-script";
    script.src = PUSH_SCRIPT_SRC;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    document.body.appendChild(script);
  }, [planId]);

  return null;
}