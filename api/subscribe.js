// api/subscribe.js — Vercel serverless function
// Called after Paystack payment succeeds — saves subscription to Supabase

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
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
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, password, planId, txnRef, durationDays = 30 } = req.body || {};

  if (!email || !password || !planId || !txnRef) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Verify with Paystack that the transaction actually succeeded
  const psRes = await fetch(`https://api.paystack.co/transaction/verify/${txnRef}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  const psData = await psRes.json();

  if (!psData.status || psData.data?.status !== "success") {
    return res.status(402).json({ error: "Payment not verified", detail: psData.message });
  }

  const now       = Date.now();
  const expiresAt = now + durationDays * 24 * 60 * 60 * 1000;
  const record    = {
    email:         email.trim().toLowerCase(),
    password_hash: simpleHash(password),
    plan_id:       planId,
    txn_ref:       txnRef,
    started_at:    now,
    expires_at:    expiresAt,
    cancelled_at:  null,
    warning_sent:  { "7d": false, "3d": false, "1d": false },
    updated_at:    new Date().toISOString(),
  };

  // Upsert — if email exists update it, otherwise insert
  const { ok, data, status } = await supabase(
    "POST",
    "/subscriptions?on_conflict=email",
    record
  );

  if (!ok) {
    console.error("Supabase error:", data);
    return res.status(500).json({ error: "Database error", detail: data });
  }

  return res.status(200).json({
    ok:       true,
    planId,
    expiresAt,
    email:    record.email,
    txnRef,
  });
}