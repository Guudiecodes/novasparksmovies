const fs = require('fs');
const p = 'C:\\Users\\HP\\Downloads\\novasparks\\src\\pages\\WatchPage.jsx';
let c = fs.readFileSync(p, 'utf8');

// Replace the saved line directly
c = c.replace(
  `    const saved = storage.get("playerSource");`,
  `    const raw = storage.get("playerSource");
    const DEAD_SOURCES = ["embedsu"];
    const saved = DEAD_SOURCES.includes(raw) ? null : raw;`
);

fs.writeFileSync(p, c, 'utf8');
console.log('DONE');
