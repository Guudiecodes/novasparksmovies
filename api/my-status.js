// api/my-status.js — live account status check for logged-in users
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const USER_SESSION_SECRET = process.env.USER_SESSION_SECRET;

import crypto from "crypto";

function verifyUserToken(token) {
  if (!token || !USER_SESSION_SECRET) return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", USER_SESSION_SECRET).update(payloadB64).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp <= Date.now()) return null;
    return payload;
  } catch { return null; }
}

async function sb(path, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token } = req.body || {};
  const payload = verifyUserToken(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired session" });

  try {
    const [userRows, subRows] = await Promise.all([
      sb("/users", { select: "access_status,suspended_until,suspended_reason,flagged,flag_reason", id: `eq.${payload.uid}`, limit: 1 }),
      sb("/subscriptions", { select: "plan_id,expires_at", email: `eq.${payload.email}`, limit: 1 }),
    ]);

    const u = userRows?.[0] || { access_status: "active" };
    const sub = subRows?.[0] || null;

    const now = Date.now();
    const suspendedActive = u.access_status === "suspended" && u.suspended_until && new Date(u.suspended_until).getTime() > now;
    const blocked = u.access_status === "banned" || u.access_status === "deleted" || suspendedActive;

    return res.json({
      ok: true,
      blocked,
      accessStatus: u.access_status,
      suspendedUntil: u.suspended_until ? new Date(u.suspended_until).getTime() : null,
      reason: u.suspended_reason || null,
      flagged: !!u.flagged,
      planId: sub?.plan_id || "free",
      expiresAt: sub?.expires_at ? new Date(sub.expires_at).getTime() : null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}