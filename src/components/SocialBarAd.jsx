import { useEffect } from "react";

export default function SocialBarAd() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://pl31099281.profitableratecpmnetwork.com/91/62/a5/9162a5ae311d3cd3a7bb92dc912e0c1d.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return null;
}