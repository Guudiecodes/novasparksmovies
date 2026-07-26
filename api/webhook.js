// api/webhook.js — the one genuinely trustworthy signal in this flow.
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PS_SECRET    = process.env.PAYSTACK_SECRET_KEY;

const PLAN_PRICE_KOBO = { standard: 65000, premium: 170000 };
const PLAN_DAYS       = { standard: 30, premium: 30 };

async function supabaseUpsertByEmail(record) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?on_conflict=email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(record),
  });
  return { ok: res.ok, data: await res.json().catch(() => null) };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig  = req.headers["x-paystack-signature"];
  const hash = crypto.createHmac("sha512", PS_SECRET).update(JSON.stringify(req.body)).digest("hex");
  if (sig !== hash) return res.status(401).json({ error: "Invalid signature" });

  const { event, data } = req.body;
  if (event === "charge.success") {
    const email = data?.customer?.email?.toLowerCase();
    const txnRef = data?.reference;
    const amountPaid = data?.amount;

    // Derive plan from what was ACTUALLY charged -- metadata is editable
    // client-side before payment, the charged amount is not.
    const planId = Object.keys(PLAN_PRICE_KOBO).find(k => PLAN_PRICE_KOBO[k] === amountPaid);
    if (!planId) {
      console.error("webhook: charged amount matches no known plan", { amountPaid, txnRef });
      return res.status(200).json({ received: true, warning: "amount_matches_no_plan" });
    }
    if (email && txnRef) {
      const now = Date.now();
      await supabaseUpsertByEmail({ email, plan_id: planId, txn_ref: txnRef, expires_at: now + PLAN_DAYS[planId] * 86400000, updated_at: new Date().toISOString() });
    }
  }
  return res.status(200).json({ received: true });
}