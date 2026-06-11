/**
 * api/sources.js — NovaSparks Serverless Source Fetcher
 * GET /api/sources?type=movie&id=550
 * GET /api/sources?type=tv&id=1396&season=1&episode=1
 */

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type":                 "application/json",
};

async function go(url, opts = {}, ms = 10000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { ...opts, signal: c.signal }); clearTimeout(t); return r; }
  catch (e) { clearTimeout(t); throw e; }
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

async function fetchVidLink(type, id, s, e) {
  try {
    const url = type === "movie"
      ? `https://vidlink.pro/api/b/movie/${id}`
      : `https://vidlink.pro/api/b/tv/${id}/${s}/${e}`;
    const r = await go(url, { headers: { "User-Agent": UA, "Referer": "https://vidlink.pro/" } });
    if (!r.ok) return null;
    const j = await r.json();
    const playlist = j?.stream?.playlist || j?.playlist || j?.url;
    if (!playlist) return null;
    const caps = (j?.stream?.subtitles || j?.subtitles || []).map(x => ({
      url: x.file || x.url || "", display: x.label || x.language || "Unknown",
      language: x.lang || x.language || "", type: "vtt",
    })).filter(x => x.url);
    return { sources: [{ url: playlist, format: "hls", quality: "Auto", source: "Server 1" }], captions: caps };
  } catch { return null; }
}

async function fetchVideasy(type, id, s, e) {
  try {
    const url = type === "movie"
      ? `https://player.videasy.net/api/movie/${id}`
      : `https://player.videasy.net/api/tv/${id}/${s}/${e}`;
    const r = await go(url, { headers: { "User-Agent": UA, "Referer": "https://player.videasy.net/", "Origin": "https://player.videasy.net" } });
    if (!r.ok) return null;
    const j = await r.json();
    const stream = j?.url || j?.stream || j?.source || j?.data?.url;
    if (!stream) return null;
    return { sources: [{ url: stream, format: stream.includes(".m3u8") ? "hls" : "mp4", quality: "HD", source: "Server 2" }], captions: [] };
  } catch { return null; }
}

async function fetchAutoEmbed(type, id, s, e) {
  try {
    const url = type === "movie"
      ? `https://autoembed.co/api/getVideoInfo.php?id=${id}&type=movie`
      : `https://autoembed.co/api/getVideoInfo.php?id=${id}&type=tv&season=${s}&episode=${e}`;
    const r = await go(url, { headers: { "User-Agent": UA, "Referer": "https://player.autoembed.cc/", "Origin": "https://player.autoembed.cc" } });
    if (!r.ok) return null;
    const j = await r.json();
    const raw = j?.sources || j?.data?.sources || [];
    if (!raw.length) return null;
    const sources = raw.map(x => ({
      url: x.file || x.url || x.src || "",
      format: (x.file || x.url || "").includes(".m3u8") ? "hls" : "mp4",
      quality: x.label || x.quality || "HD",
      source: "Server 3",
    })).filter(x => x.url);
    const caps = (j?.tracks || j?.subtitles || [])
      .filter(t => t.kind === "captions" || t.kind === "subtitles")
      .map(t => ({ url: t.file || t.url || "", display: t.label || "Unknown", language: t.lang || "", type: "vtt" }))
      .filter(c => c.url);
    return { sources, captions: caps };
  } catch { return null; }
}

async function fetchVap(type, id, s, e) {
  try {
    const url = type === "movie"
      ? `https://vap.to/api/v1/movie/${id}`
      : `https://vap.to/api/v1/tv/${id}/${s}/${e}`;
    const r = await go(url, { headers: { "User-Agent": UA, "Referer": "https://vap.to/", "Origin": "https://vap.to" } }, 8000);
    if (!r.ok) return null;
    const j = await r.json();
    const stream = j?.url || j?.stream || j?.source || j?.data?.url || j?.playlist;
    if (!stream) return null;
    const caps = (j?.subtitles || j?.tracks || []).map(t => ({
      url: t.file || t.url || "", display: t.label || "Unknown", language: t.lang || "", type: "vtt",
    })).filter(c => c.url);
    return { sources: [{ url: stream, format: stream.includes(".m3u8") ? "hls" : "mp4", quality: "HD", source: "Server 4" }], captions: caps };
  } catch { return null; }
}

async function fetchVidsrcCC(type, id, s, e) {
  try {
    const embedUrl = type === "movie"
      ? `https://vidsrc.cc/v2/embed/movie/${id}`
      : `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`;
    const pageRes = await go(embedUrl, { headers: { "User-Agent": UA, "Referer": "https://vidsrc.cc/" } }, 8000);
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const apiMatch = html.match(/fetch\(['"]([^'"]*\/getSources[^'"]*)['"]/);
    if (!apiMatch) return null;
    const apiUrl = apiMatch[1].startsWith("http") ? apiMatch[1] : `https://vidsrc.cc${apiMatch[1]}`;
    const srcRes = await go(apiUrl, { headers: { "User-Agent": UA, "Referer": embedUrl } }, 8000);
    if (!srcRes.ok) return null;
    const j = await srcRes.json();
    const sources = (j?.sources || []).map(x => ({
      url: x.file || x.url || "", format: (x.file || "").includes(".m3u8") ? "hls" : "mp4", quality: x.label || "HD", source: "Server 5",
    })).filter(x => x.url);
    if (!sources.length) return null;
    const caps = (j?.tracks || []).filter(t => t.kind === "captions" || t.kind === "subtitles")
      .map(t => ({ url: t.file || "", display: t.label || "Unknown", language: t.lang || "", type: "vtt" })).filter(c => c.url);
    return { sources, captions: caps };
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  const { type, id, season, episode } = req.query;
  if (!type || !id) return res.status(400).json({ error: "Missing type or id" });

  const s = season  ? parseInt(season, 10)  : null;
  const e = episode ? parseInt(episode, 10) : null;

  const results = await Promise.allSettled([
    fetchVidLink(type, id, s, e),
    fetchVideasy(type, id, s, e),
    fetchAutoEmbed(type, id, s, e),
    fetchVap(type, id, s, e),
    fetchVidsrcCC(type, id, s, e),
  ]);

  const merged = { sources: [], captions: [] };
  const seenUrls = new Set();
  results.forEach(r => {
    if (r.status !== "fulfilled" || !r.value) return;
    (r.value.sources || []).forEach(src => {
      if (src.url && !seenUrls.has(src.url)) { seenUrls.add(src.url); merged.sources.push(src); }
    });
    (r.value.captions || []).forEach(cap => {
      if (!merged.captions.find(c => c.url === cap.url)) merged.captions.push(cap);
    });
  });

  // Also return in Rive BFF shape for compatibility
  return res.status(200).json({ ...merged, data: merged });
}