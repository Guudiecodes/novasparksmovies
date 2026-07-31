const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.md'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

const MOJIBAKE_CHARS =
  '\u0080-\u00FF' +
  '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D' +
  '\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178';

const RUN_REGEX = new RegExp(`[${MOJIBAKE_CHARS}]+`, 'g');
const MARKER_CHECK = /\u00C3|\u00E2\u20AC|\u00F0\u0178/;

function walk(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, results);
    else if (EXTENSIONS.includes(path.extname(entry.name))) results.push(full);
  }
  return results;
}

function fixMojibake(text) {
  let changed = false;
  const fixed = text.replace(RUN_REGEX, (run) => {
    try {
      const bytes = iconv.encode(run, 'win1252');
      const decoded = bytes.toString('utf8');
      if (decoded.includes('\uFFFD')) return run;
      if (decoded === run) return run;
      changed = true;
      return decoded;
    } catch {
      return run;
    }
  });
  return { fixed, changed };
}

const allFiles = walk('src');
let fixedCount = 0;
let stillFlaggedCount = 0;

for (const file of allFiles) {
  const original = fs.readFileSync(file, 'utf8');
  if (!MARKER_CHECK.test(original)) continue;

  const { fixed, changed } = fixMojibake(original);

  if (changed) {
    fs.writeFileSync(file, fixed, 'utf8');
    fixedCount++;
    if (MARKER_CHECK.test(fixed)) {
      console.log(`Fixed (partially, markers remain): ${file}`);
      stillFlaggedCount++;
    } else {
      console.log(`Fixed: ${file}`);
    }
  } else {
    console.log(`NO CHANGE (markers present but nothing safely fixable): ${file}`);
    stillFlaggedCount++;
  }
}

console.log(`Done. Fixed ${fixedCount} file(s). ${stillFlaggedCount} still need a look.`);
