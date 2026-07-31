const fs = require('fs');
const path = require('path');

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
let strippedCount = 0;
let checkedCount = 0;

for (const file of allFiles) {
  checkedCount++;
  const original = fs.readFileSync(file, 'utf8');
  if (original.charCodeAt(0) === 0xFEFF) {
    const stripped = original.slice(1);
    fs.writeFileSync(file, stripped, 'utf8');
    console.log('Stripped BOM: ' + file);
    strippedCount++;
  }
}

console.log('Checked ' + checkedCount + ' file(s). Stripped BOM from ' + strippedCount + ' file(s).');
