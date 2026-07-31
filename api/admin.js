import crypto from "crypto";
// api/admin.js -- NovaSpark admin data API
// Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY in Vercel env vars

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_EMAIL  = "jokesonyou146@gmail.com";
const ADMIN_PASS   = process.env.ADMIN_PASSWORD;

const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;

function verifySessionToken(token) {
  if (!token || !SESSION_SECRET) return false;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return payload.exp > Date.now() && payload.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  } catch { return false; }
}

function checkAuth(req) {
  return verifySessionToken(req.headers["x-admin-token"]);
}

async function sb(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: {
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Supabase ${res.status}: ${t}`); }
  return res.json();
}

async function sbWrite(method, path, body) {
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
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });

  const { action } = req.query;
  const now  = Date.now();
  const DAY  = 86400000;
  const WEEK = 7 * DAY;

  try {
    // -- Stats --------------------------------------------------------------
    if (action === "stats") {
      const [users, subs] = await Promise.all([
        sb("/users", { select: "id,created_at,last_active" }),
        sb("/subscriptions", { select: "email,plan_id,expires_at" }),
      ]);

      const activeToday = users.filter(u =>
        u.last_active && (now - new Date(u.last_active).getTime()) < DAY
      ).length;

      const newThisWeek = users.filter(u =>
        u.created_at && (now - new Date(u.created_at).getTime()) < WEEK
      ).length;

      const premium = subs.filter(s =>
        s.plan_id && s.plan_id !== "free" && new Date(s.expires_at).getTime() > now
      ).length;

      return res.json({ total: users.length, activeToday, newThisWeek, premium });
    }

    // -- Users ----------------------------------------------------------------
    if (action === "users") {
      const page   = parseInt(req.query.page || "0");
      const limit  = 50;
      const offset = page * limit;

      const [users, subs] = await Promise.all([
        sb("/users", {
          select: "id,email,display_name,created_at,last_active",
          order:  "created_at.desc",
          limit,
          offset,
        }),
        sb("/subscriptions", { select: "email,plan_id,expires_at" }),
      ]);

      const subMap = {};
      subs.forEach(s => { subMap[s.email] = s; });

      const result = users.map(u => ({
        id:          u.id,
        email:       u.email,
        display_name:u.display_name,
        created_at:  u.created_at,
        last_active: u.last_active,
        plan:        subMap[u.email]?.plan_id || "free",
        subExpires:  subMap[u.email]?.expires_at
          ? new Date(subMap[u.email].expires_at).getTime()
          : null,
      }));

      return res.json({ users: result, page, limit, total: result.length });
    }

    // -- Activity ---------------------------------------------------------------
    if (action === "activity") {
      const activity = await sb("/activity", {
        select: "id,user_id,feature,meta,created_at",
        order:  "created_at.desc",
        limit:  200,
      });
      return res.json({ activity });
    }

    // -- Crypto: list pending --------------------------------------------------
    if (action === "crypto_pending") {
      const pending = await sb("/crypto_pending", {
        select: "id,email,plan_id,txn_ref,duration_days,status,submitted_at",
        status: "eq.pending",
        order:  "submitted_at.desc",
      });
      return res.json({ pending });
    }

    // -- Crypto: approve (writes the real subscription row) ---------------------
    if (action === "crypto_approve" && req.method === "POST") {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: "Missing id" });

      const rows = await sb("/crypto_pending", { id: `eq.${id}`, select: "*", limit: 1 });
      const claim = rows?.[0];
      if (!claim) return res.status(404).json({ error: "Submission not found" });
      if (claim.status !== "pending") return res.status(409).json({ error: `Already ${claim.status}` });

      const expiresAt = now + (claim.duration_days || 30) * DAY;

      await sbWrite("POST", "/subscriptions?on_conflict=email", {
        email:         claim.email,
        password_hash: claim.password_hash,
        plan_id:       claim.plan_id,
        txn_ref:       claim.txn_ref,
        started_at:    now,
        expires_at:    expiresAt,
        cancelled_at:  null,
        warning_sent:  { "7d": false, "3d": false, "1d": false },
        updated_at:    new Date().toISOString(),
      });

      await sbWrite("PATCH", `/crypto_pending?id=eq.${id}`, {
        status:      "approved",
        reviewed_at: new Date().toISOString(),
      });

      return res.json({ ok: true, expiresAt });
    }

    // -- Crypto: reject -----------------------------------------------------------
    if (action === "crypto_reject" && req.method === "POST") {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: "Missing id" });

      await sbWrite("PATCH", `/crypto_pending?id=eq.${id}`, {
        status:      "rejected",
        reviewed_at: new Date().toISOString(),
      });

      return res.json({ ok: true });
    }

    // -- Grant plan: manual admin grant, bypasses payment -------------------------
    if (action === "grant_plan" && req.method === "POST") {
      const { email, plan_id, duration_days } = req.body || {};
      if (!email || !plan_id) return res.status(400).json({ error: "Missing email or plan_id" });

      const days = Number(duration_days) > 0 ? Number(duration_days) : 30;
      const expiresAt = now + days * DAY;

      await sbWrite("POST", "/subscriptions?on_conflict=email", {
        email,
        plan_id,
        started_at:   now,
        expires_at:   expiresAt,
        cancelled_at: null,
        warning_sent: { "7d": false, "3d": false, "1d": false },
        updated_at:   new Date().toISOString(),
      });

      return res.json({ ok: true, expiresAt });
    }

    return res.status(400).json({ error: "Unknown action. Use: stats | users | activity | crypto_pending | crypto_approve | crypto_reject | grant_plan" });

  } catch (e) {
    console.error("admin API error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}