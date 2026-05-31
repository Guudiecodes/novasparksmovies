const fs = require('fs');
const p = 'C:\\Users\\HP\\Downloads\\novasparks\\src\\pages\\WatchPage.jsx';
let c = fs.readFileSync(p, 'utf8');

// Fix useHLSPath — Brave/restricted browsers go straight to iframe, NO extraction
const idx1 = c.indexOf('const useHLSPath =');
const end1 = c.indexOf(';', idx1) + 1;
c = c.slice(0, idx1) + 
  `const useHLSPath = !isElectron && !restricted && typeof navigator !== "undefined" && /Chrome/.test(navigator.userAgent) && !/Electron/.test(navigator.userAgent);` + 
  c.slice(end1);

// Fix iframeShieldActive — only activate AFTER playing so play button is always clickable
const idx2 = c.indexOf('const iframeShieldActive =');
const end2 = c.indexOf(';', idx2) + 1;
c = c.slice(0, idx2) +
  `const iframeShieldActive = !isElectron && !webviewLoading && isActuallyPlaying && (!useHLSPath || (hlsFailed && !hlsLoading));` +
  c.slice(end2);

fs.writeFileSync(p, c, 'utf8');
console.log('DONE');
