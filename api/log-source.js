// api/log-source.js — NovaSpark source success/failure logger
// Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY in Vercel env vars

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
    return await handleLog(req, res);
  } catch (err) {
    console.error("LOG_SOURCE_CRASH:", err.message);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}

async function handleLog(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── Record an outcome ────────────────────────────────────────────────────
  if (req.method === "POST") {
    const { tmdbId, mediaType, season, episode, sourceId, worked } = req.body || {};

    if (!tmdbId || !mediaType || !sourceId || typeof worked !== "boolean") {
      return res.status(400).json({ error: "Missing: tmdbId, mediaType, sourceId, worked" });
    }

    const { ok, data } = await sb("POST", "/source_success_log", {
      tmdb_id:    tmdbId,
      media_type: mediaType,
      season:     season ?? null,
      episode:    episode ?? null,
      source_id:  sourceId,
      worked:     worked,
    });

    if (!ok) {
      console.error("Log insert error:", data);
      return res.status(500).json({ error: "Log failed." });
    }

    return res.status(200).json({ ok: true });
  }

  // ── Read recent history for a title, to inform source ordering ──────────
  if (req.method === "GET") {
    const { tmdbId, mediaType, season, episode } = req.query || {};

    if (!tmdbId || !mediaType) {
      return res.status(400).json({ error: "Missing: tmdbId, mediaType" });
    }

    const params = {
      select:    "source_id,worked,created_at",
      tmdb_id:   `eq.${tmdbId}`,
      media_type:`eq.${mediaType}`,
      order:     "created_at.desc",
      limit:     100,
    };
    if (season)  params.season  = `eq.${season}`;
    if (episode) params.episode = `eq.${episode}`;

    const { ok, data } = await sb("GET", "/source_success_log", null, params);

    if (!ok) {
      return res.status(500).json({ error: "Lookup failed." });
    }

    return res.status(200).json({ ok: true, history: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
}