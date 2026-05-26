cat > /home/claude/novasparks/api/restore.js << 'EOF'
// api/restore.js — NovaSpark subscription restore / cross-device sync
// Called by desktop app and web app to retrieve an existing subscription.
// POST { email, passwordHash } → returns subscription record if valid.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  const { email, passwordHash } = req.body || {};

  if (!email || !passwordHash) {
    return res.status(400).json({ error: "email and passwordHash are required" });
  }

  // Fetch subscription from Supabase
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?email=eq.${encodeURIComponent(email.trim().toLowerCase())}&select=*&limit=1`,
    {
      headers: {
        "apikey":        SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  if (!r.ok) {
    return res.status(500).json({ error: "Database error" });
  }

  const rows = await r.json();
  if (!rows?.length) {
    return res.status(404).json({ error: "No subscription found for that email" });
  }

  const sub = rows[0];

  // Verify password hash
  if (sub.password_hash !== passwordHash) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  const now       = Date.now();
  // FIX: Supabase returns ISO string — convert to ms timestamp before comparing
  const expiresMs = new Date(sub.expires_at).getTime();

  // Expired — tell client so they can show renewal UI
  if (expiresMs < now) {
    return res.status(403).json({
      ok:        false,
      error:     "Subscription expired",
      expiresAt: expiresMs,
      planId:    sub.plan_id,
    });
  }

  const daysRemaining = Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24));

  return res.status(200).json({
    ok:           true,
    planId:       sub.plan_id,
    email:        sub.email,
    txnRef:       sub.txn_ref,
    startedAt:    new Date(sub.started_at).getTime(),
    expiresAt:    expiresMs,
    daysRemaining,
  });
}