const fs = require('fs');
const path = require('path');

const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
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
let flaggedCount = 0;

for (const file of allFiles) {
  const original = fs.readFileSync(file, 'utf8');
  const first = original.charCodeAt(0);
  // flag anything where the file doesn't start with a normal code character
  // (letter, //, /*, whitespace) - i.e. stray punctuation like a lone "?"
  if (original.length > 0 && /^[^a-zA-Z0-9_\/\s'"]/.test(original[0])) {
    console.log(file + '  ->  first char: ' + JSON.stringify(original[0]) + ' (code ' + first + ')');
    flaggedCount++;
  }
}

console.log('Checked ' + allFiles.length + ' file(s). Flagged ' + flaggedCount + ' with an unusual leading character.');
