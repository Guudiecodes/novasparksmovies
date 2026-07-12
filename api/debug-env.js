// api/debug-env.js — TEMPORARY diagnostic endpoint, safe to delete after use
// Does NOT expose full secret values — only length + safe preview

export default function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  res.status(200).json({
    SUPABASE_URL: {
      exists: url !== undefined,
      length: url ? url.length : 0,
      preview: url ? JSON.stringify(url.slice(0, 15)) : null,
      last5: url ? JSON.stringify(url.slice(-5)) : null,
    },
    SUPABASE_SERVICE_KEY: {
      exists: key !== undefined,
      length: key ? key.length : 0,
      preview: key ? key.slice(0, 6) + "..." : null,
    },
  });
}