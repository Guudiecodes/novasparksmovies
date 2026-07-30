const fs = require('fs');
const path = require('path');

const MOJIBAKE_MARKERS = /Ã|â€|ðŸ/;
const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.md'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (EXTENSIONS.includes(path.extname(entry.name))) results.push(full);
  }
  return results;
}

const allFiles = walk('src');
let fixedCount = 0;

for (const file of allFiles) {
  const original = fs.readFileSync(file, 'utf8');
  if (!MOJIBAKE_MARKERS.test(original)) continue;

  const fixed = Buffer.from(original, 'latin1').toString('utf8');
  if (fixed.includes('\uFFFD')) {
    console.log(`SKIPPED (would corrupt): ${file}`);
    continue;
  }
  fs.writeFileSync(file, fixed, 'utf8');
  console.log(`Fixed: ${file}`);
  fixedCount++;
}

console.log(`\nDone. Fixed ${fixedCount} file(s).`);