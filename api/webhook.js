// api/webhook.js — Paystack webhook
// Paystack calls this automatically when payment status changes
// Set this URL in Paystack Dashboard → Settings → API Keys & Webhooks

import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PS_SECRET    = process.env.PAYSTACK_SECRET_KEY;

const PLAN_DAYS = { test: 1, standard: 30, premium: 30 };

async function supabasePatch(path, body) {
  await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method:  "PATCH",
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // Verify Paystack signature
  const sig  = req.headers["x-paystack-signature"];
  const hash = crypto.createHmac("sha512", PS_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (sig !== hash) return res.status(401).json({ error: "Invalid signature" });

  const { event, data } = req.body;

  if (event === "charge.success") {
    const email  = data?.customer?.email?.toLowerCase();
    const planId = data?.metadata?.plan_id || "standard";
    const txnRef = data?.reference;
    const days   = PLAN_DAYS[planId] ?? 30;
    const now    = Date.now();

    if (email && txnRef) {
      await supabasePatch(
        `/subscriptions?txn_ref=eq.${encodeURIComponent(txnRef)}`,
        {
          plan_id:    planId,
          expires_at: now + days * 24 * 60 * 60 * 1000,
          updated_at: new Date().toISOString(),
        }
      );
    }
  }

  return res.status(200).json({ received: true });
}