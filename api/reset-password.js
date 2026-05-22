// api/reset-password.js — Vercel serverless function
// Allows user to reset password using their Paystack transaction reference

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
  });
  return { ok: res.ok, data: await res.json() };
}

async function supabasePatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method:  "PATCH",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer":        "return=representation",
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await res.json() };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { txnRef, newPassword } = req.body || {};
  if (!txnRef || !newPassword) return res.status(400).json({ error: "txnRef and newPassword required" });
  if (newPassword.length < 6)  return res.status(400).json({ error: "Password must be at least 6 characters" });

  // Verify the txnRef actually exists in our DB
  const { ok, data } = await supabaseGet(
    `/subscriptions?txn_ref=eq.${encodeURIComponent(txnRef)}&select=id,email&limit=1`
  );

  if (!ok || !Array.isArray(data) || data.length === 0) {
    return res.status(404).json({
      error:   "not_found",
      message: "No account found with this payment reference. Check your Paystack confirmation email.",
    });
  }

  const record = data[0];

  // Update password hash
  const { ok: patchOk } = await supabasePatch(
    `/subscriptions?id=eq.${record.id}`,
    { password_hash: simpleHash(newPassword), updated_at: new Date().toISOString() }
  );

  if (!patchOk) return res.status(500).json({ error: "Failed to update password" });

  return res.status(200).json({
    ok:    true,
    email: record.email,
    message: "Password updated. You can now restore your subscription.",
  });
}