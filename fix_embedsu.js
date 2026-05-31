const fs = require('fs');
const p = 'C:\\Users\\HP\\Downloads\\novasparks\\src\\utils\\api.js';
let c = fs.readFileSync(p, 'utf8');
c = c.replace(
  `export const BROWSER_RESTRICTED_DEFAULT = "embedsu";`,
  `export const BROWSER_RESTRICTED_DEFAULT = "moviesapi";`
);
// Also drop embedsu browserPriority so it's not first in Chrome queue
c = c.replace(
  `browserPriority: 1,    // #1 Chrome: most stable, no sub-frame redirects`,
  `browserPriority: 99,   // embed.su DNS unreliable — removed from Chrome priority`
);
fs.writeFileSync(p, c, 'utf8');
console.log('DONE');
