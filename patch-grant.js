const fs = require('fs');
const f = 'api/admin.js';
let c = fs.readFileSync(f, 'utf8');
const re = /await sbWrite\("POST", "\/subscriptions\?on_conflict=email", \{[\s\S]*?\}\);/;
if (!re.test(c)) {
  console.log('NO MATCH - block not found, paste current content around grant_plan');
} else {
  const nb = 'await sbWrite("POST", "/subscriptions?on_conflict=email", {\n        email,\n        plan_id,\n        expires_at: expiresAt,\n      });';
  c = c.replace(re, nb);
  fs.writeFileSync(f, c, 'utf8');
  console.log('Replaced grant_plan insert block');
}
