const fs = require('fs');

const files = [
  'src/pages/LoginPage.jsx',
  'src/pages/WatchPage.jsx'
];

let fixedCount = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  if (original.charCodeAt(0) === 63) {
    const stripped = original.slice(1);
    fs.writeFileSync(file, stripped, 'utf8');
    console.log('Stripped leading ? from: ' + file);
    fixedCount++;
  } else {
    console.log('No leading ? found (already clean?): ' + file);
  }
}

console.log('Done. Fixed ' + fixedCount + ' file(s).');
