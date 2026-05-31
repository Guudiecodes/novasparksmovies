const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');

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

function obfuscate(input, output) {
  if (!fs.existsSync(input)) {
    console.log(`Skip: ${input} not found`);
    return;
  }
  const code = fs.readFileSync(input, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, config);
  fs.writeFileSync(output, result.getObfuscatedCode());
  console.log(`Obfuscated: ${input} -> ${output}`);
}

obfuscate('preload.js', 'dist/preload.js');
obfuscate('popout-preload.js', 'dist/popout-preload.js');