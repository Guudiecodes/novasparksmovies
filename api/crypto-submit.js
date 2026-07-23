// api/crypto-submit.js -- Submit a crypto payment claim for manual review.
// Does NOT grant access by itself. An admin must verify the tx hash
// on-chain against the wallet, then approve via /api/admin.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h.toString(16);
}

async function supabase(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer":        "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password, planId, txnRef, durationDays = 30 } = req.body || {};
  if (!email || !password || !planId || !txnRef) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const record = {
    email:         email.trim().toLowerCase(),
    password_hash: simpleHash(password),
    plan_id:       planId,
    txn_ref:       txnRef.trim(),
    duration_days: durationDays,
    status:        "pending",
  };

  const { ok, data } = await supabase("POST", "/crypto_pending", record);
  if (!ok) {
    console.error("crypto-submit error:", data);
    return res.status(500).json({ error: "Database error" });
  }

  return res.status(200).json({ ok: true, message: "Submitted for review" });
}