const fs = require('fs');
const p = 'C:\\Users\\HP\\Downloads\\novasparks\\src\\pages\\WatchPage.jsx';
let c = fs.readFileSync(p, 'utf8');

// Fix 1: IframeShield should NOT cover center of screen where play button is.
// Only activate shield AFTER user has interacted (video is playing or loaded).
// Use pointer-events:none until iframe has loaded, then only block top strip not center.
c = c.replace(
  'const iframeShieldActive = !isElectron && !webviewLoading && (!useHLSPath || (hlsFailed && !hlsLoading));',
  'const iframeShieldActive = !isElectron && !webviewLoading && isActuallyPlaying && (!useHLSPath || (hlsFailed && !hlsLoading));'
);

// Fix 2: Brave must NEVER go through useHLSPath — it has built-in shields.
// restricted=true for Brave but that should NOT trigger HLS path.
// Only pure Chrome (not Brave, not restricted) uses HLS extraction.
c = c.replace(
  `const useHLSPath = !isElectron && (
    restricted ||
    (typeof navigator !== "undefined" &&
     /Chrome/.test(navigator.userAgent) &&
     !/Electron/.test(navigator.userAgent))
  );`,
  `const useHLSPath = !isElectron && !restricted && (
    typeof navigator !== "undefined" &&
    /Chrome/.test(navigator.userAgent) &&
    !/Electron/.test(navigator.userAgent)
  );`
);

fs.writeFileSync(p, c, 'utf8');
console.log('FIXED');
