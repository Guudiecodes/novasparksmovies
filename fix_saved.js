const fs = require('fs');
const p = 'C:\\Users\\HP\\Downloads\\novasparks\\src\\pages\\WatchPage.jsx';
let c = fs.readFileSync(p, 'utf8');

// Fix: playerSource initializer — purge dead embedsu from saved state,
// and for non-restricted browsers validate saved source actually exists in PLAYER_SOURCES
c = c.replace(
  `const [playerSource, setPlayerSource] = useState(() => {
    const saved = storage.get("playerSource");`,
  `const [playerSource, setPlayerSource] = useState(() => {
    const saved = storage.get("playerSource") === "embedsu" ? null : storage.get("playerSource");`
);

fs.writeFileSync(p, c, 'utf8');
console.log('DONE');
