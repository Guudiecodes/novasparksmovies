/**
 * api/proxy.js — NovaSparks HLS/M3U8 Proxy
 * /api/proxy?url=https%3A%2F%2F...
 */

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Origin, Accept",
  "Access-Control-Expose-Headers":"Content-Length, Content-Range",
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });

  let target;
  try { target = decodeURIComponent(url); new URL(target); }
  catch { return res.status(400).json({ error: "Invalid url" }); }

  const path = target.split("?")[0].toLowerCase();
  const ok = [".m3u8", ".ts", ".mp4", ".webm", ".vtt", ".srt"].some(x => path.endsWith(x)) ||
    ["playlist", "manifest", "segment", "stream"].some(x => path.includes(x));
  if (!ok) return res.status(403).json({ error: "Streaming content only" });

  try {
    const origin = new URL(target).origin;
    const up = await fetch(target, {
      method: req.method,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "Accept": "*/*", "Origin": origin, "Referer": origin + "/",
        ...(req.headers["range"] ? { "Range": req.headers["range"] } : {}),
      },
    });

    const ct = up.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", ct);
    const cl = up.headers.get("content-length"); if (cl) res.setHeader("Content-Length", cl);
    const cr = up.headers.get("content-range");  if (cr) res.setHeader("Content-Range", cr);
    res.status(up.status);

    if (ct.includes("mpegurl") || ct.includes("m3u8") || target.endsWith(".m3u8")) {
      const text = await up.text();
      const base  = target.substring(0, target.lastIndexOf("/") + 1);
      const host  = req.headers["x-forwarded-host"]
        ? `https://${req.headers["x-forwarded-host"]}`
        : "https://novasparks.xyz";
      const rewritten = text.split("\n").map(line => {
        const t = line.trim();
        if (!t || t.startsWith("#")) return line;
        if (t.startsWith("http://") || t.startsWith("https://"))
          return `${host}/api/proxy?url=${encodeURIComponent(t)}`;
        return `${host}/api/proxy?url=${encodeURIComponent(base + t)}`;
      }).join("\n");
      return res.send(rewritten);
    }

    const buf = await up.arrayBuffer();
    return res.send(Buffer.from(buf));
  } catch (err) {
    return res.status(502).json({ error: "Upstream failed", detail: err.message });
  }
}