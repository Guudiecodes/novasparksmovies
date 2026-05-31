import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";   // ← add this line back
import { initBrowserEnv } from "./utils/api";
import { activateShield, installPostMessageFilter } from "./utils/Shield";


if (!window?.electron) {
  installPostMessageFilter();
  activateShield(window.location.origin);
}

// app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

initBrowserEnv().catch(() => {}).finally(() => {
  
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
    
  );
});