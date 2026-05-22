// api/restore.js — Vercel serverless function
// Called when user wants to restore their subscription after clearing browser data

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

async function supabase(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const emailClean = email.trim().toLowerCase();
  const hash       = simpleHash(password);

  const { ok, data } = await supabase(
    `/subscriptions?email=eq.${encodeURIComponent(emailClean)}&select=*&limit=1`
  );

  if (!ok || !Array.isArray(data) || data.length === 0) {
    return res.status(404).json({
      error: "no_account",
      message: "No subscription found for this email address.",
    });
  }

  const record = data[0];

  // Wrong password
  if (record.password_hash !== hash) {
    return res.status(401).json({
      error:   "wrong_password",
      message: "Incorrect password. If you forgot it, use your Paystack reference to reset.",
    });
  }

  const now = Date.now();

  // Expired
  if (now >= record.expires_at) {
    return res.status(200).json({
      ok:        false,
      error:     "expired",
      message:   `Your ${record.plan_id} plan expired on ${new Date(record.expires_at).toLocaleDateString()}. Renew to continue.`,
      expiredAt: record.expires_at,
      planId:    record.plan_id,
      email:     record.email,
    });
  }

  // Active — return the full record so frontend can restore localStorage
  return res.status(200).json({
    ok:          true,
    planId:      record.plan_id,
    email:       record.email,
    txnRef:      record.txn_ref,
    startedAt:   record.started_at,
    expiresAt:   record.expires_at,
    cancelledAt: record.cancelled_at,
    warningSent: record.warning_sent,
  });
}