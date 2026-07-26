// api/auth.js — NovaSpark user register / login
// Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY, USER_SESSION_SECRET in Vercel env vars
//
// USER_SESSION_SECRET is separate from ADMIN_SESSION_SECRET on purpose — the
// admin panel and regular user sessions are different trust levels, and a
// bug or leak in one should never be able to forge access in the other.
//
// Token shape (must exactly match verifyUserToken() in api/source.js — if
// either side changes independently, every login silently stops working):
//   `${payloadB64}.${signature}`
//   payloadB64 = base64url(JSON.stringify({ uid, email, exp }))
//   signature  = base64url(HMAC-SHA256(payloadB64, USER_SESSION_SECRET))

import crypto from "crypto";

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_KEY         = process.env.SUPABASE_SERVICE_KEY;
const USER_SESSION_SECRET  = process.env.USER_SESSION_SECRET;
const USER_SESSION_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days

// Simple hash — not bcrypt but avoids plain-text storage
function hashPassword(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return Math.abs(h).toString(36);
}

const ADMIN_EMAIL = "jokesonyou146@gmail.com";
const ADMIN_PASS = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(payloadB64) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
}
function signUser(payloadB64) {
  return crypto.createHmac("sha256", USER_SESSION_SECRET).update(payloadB64).digest("base64url");
}
function createSessionToken(email) {
  const payload = JSON.stringify({ email, exp: Date.now() + SESSION_TTL_MS });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

function createUserSessionToken(uid, email) {
  const payload = JSON.stringify({ uid, email, exp: Date.now() + USER_SESSION_TTL_MS });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  return `${payloadB64}.${signUser(payloadB64)}`;
}

async function sb(method, path, body = null, params = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("MISSING_ENV: SUPABASE_URL or SUPABASE_SERVICE_KEY not set on this Vercel project");
  }
  const url = new URL(`${SUPABASE_URL}/rest/v1${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type":  "application/json",
      "apikey":        SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer":        "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

export default async function handler(req, res) {
  try {
    return await handleAuth(req, res);
  } catch (err) {
    console.error("AUTH_HANDLER_CRASH:", err.message);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}

async function handleAuth(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  if (!USER_SESSION_SECRET) {
    // Fail loudly rather than silently issuing unsigned/broken tokens —
    // this is the same class of bug this whole rewrite exists to fix.
    console.error("MISSING_ENV: USER_SESSION_SECRET not set on this Vercel project");
    return res.status(500).json({ error: "Server misconfigured. Contact support." });
  }

  const { action, email, password, displayName } = req.body || {};

  if (!action || !email || !password) {
    return res.status(400).json({ error: "Missing: action, email, password" });
  }

  const normalEmail = email.trim().toLowerCase();
  const passHash    = hashPassword(password);

  if (action === "admin-login") {
    if (!ADMIN_PASS || !SESSION_SECRET) {
      return res.status(500).json({ error: "Server missing ADMIN_PASSWORD or ADMIN_SESSION_SECRET" });
    }
    const emailOk = normalEmail === ADMIN_EMAIL.toLowerCase();
    const a = Buffer.from(password), b = Buffer.from(ADMIN_PASS);
    const passOk = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!emailOk || !passOk) return res.status(401).json({ error: "Invalid credentials" });
    return res.status(200).json({ ok: true, token: createSessionToken(ADMIN_EMAIL) });
  }

  // ── Register ──────────────────────────────────────────────────────────────
  if (action === "register") {
    const check = await sb("GET", "/users", null, {
      select: "id",
      email:  `eq.${normalEmail}`,
    });

    if (check.ok && Array.isArray(check.data) && check.data.length > 0) {
      return res.status(409).json({ error: "Email already registered. Try signing in." });
    }

    const { ok, data } = await sb("POST", "/users", {
      email:         normalEmail,
      password_hash: passHash,
      display_name:  displayName || normalEmail.split("@")[0],
      created_at:    new Date().toISOString(),
      last_active:   new Date().toISOString(),
    });

    if (!ok) {
      console.error("Register error:", data);
      return res.status(500).json({ error: "Registration failed. Try again." });
    }

    const user = Array.isArray(data) ? data[0] : data;
    return res.status(200).json({
      ok:   true,
      user: { id: user.id, email: normalEmail, displayName: user.display_name, is_admin: user.is_admin || false },
      token: createUserSessionToken(user.id, normalEmail),
    });
  }

  // ── Login ─────────────────────────────────────────────────────────────────
  if (action === "login") {
    const { ok, data } = await sb("GET", "/users", null, {
      select:        "id,email,display_name,is_admin",
      email:         `eq.${normalEmail}`,
      password_hash: `eq.${passHash}`,
    });

    if (!ok || !Array.isArray(data) || data.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = data[0];

    sb("PATCH", `/users?id=eq.${user.id}`, { last_active: new Date().toISOString() }).catch(() => {});

    return res.status(200).json({
      ok:   true,
      user: { id: user.id, email: user.email, displayName: user.display_name, is_admin: user.is_admin || false },
      token: createUserSessionToken(user.id, user.email),
    });
  }

  return res.status(400).json({ error: "Unknown action. Use: register | login" });
}