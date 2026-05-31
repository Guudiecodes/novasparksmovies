const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const config = {
  compact: true,
  selfDefending: true,
  debugProtection: true,
  debugProtectionInterval: 2000,
  disableConsoleOutput: true,
  stringArray: true,
  rotateStringArray: true,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
};

const distDir = 'dist/assets';

function obfuscateFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, config);
  fs.writeFileSync(filePath, result.getObfuscatedCode());
  console.log(`Obfuscated: ${path.basename(filePath)}`);
}

// Obfuscate all JS files in dist/assets except index.html and CSS
const files = fs.readdirSync(distDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  obfuscateFile(path.join(distDir, file));
}

console.log(`Done. Obfuscated ${files.length} files.`);