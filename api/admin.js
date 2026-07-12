// api/admin.js — NovaSpark admin data API
// Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY in Vercel env vars

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_EMAIL  = "jokesonyou146@gmail.com";
const ADMIN_PASS   = process.env.ADMIN_PASSWORD;

function checkAuth(req) {
  const token = req.headers["x-admin-token"];
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const colon   = decoded.indexOf(":");
    const email   = decoded.slice(0, colon);
    const pass    = decoded.slice(colon + 1);
    return email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && pass === ADMIN_PASS;
  } catch { return false; }
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!checkAuth(req)) return res.status(401).json({ error: "Unauthorized" });

  const { action } = req.query;
  const now  = Date.now();
  const DAY  = 86400000;
  const WEEK = 7 * DAY;

  try {
    // ── Stats ─────────────────────────────────────────────────────────────────
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

    // ── Users ─────────────────────────────────────────────────────────────────
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

    // ── Activity ──────────────────────────────────────────────────────────────
    if (action === "activity") {
      const activity = await sb("/activity", {
        select: "id,user_id,feature,meta,created_at",
        order:  "created_at.desc",
        limit:  200,
      });
      return res.json({ activity });
    }

    return res.status(400).json({ error: "Unknown action. Use: stats | users | activity" });

  } catch (e) {
    console.error("admin API error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}