const fs = require('fs');
const p = 'C:\\Users\\HP\\Downloads\\novasparks\\src\\pages\\WatchPage.jsx';
let c = fs.readFileSync(p, 'utf8');
const idx = c.indexOf('const iframeShieldActive =');
const end = c.indexOf(';', idx) + 1;
c = c.slice(0, idx) +
  `const iframeShieldActive = !isElectron && !webviewLoading && useHLSPath && hlsFailed && !hlsLoading;` +
  c.slice(end);
fs.writeFileSync(p, c, 'utf8');
console.log('DONE');
