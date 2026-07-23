/**
 * api/sources.js — NovaSparks Serverless Source Fetcher
 *
 * NS 1  Consumet   → set env CONSUMET_URL   (self-hosted, ad-free direct HLS)
 * NS 2  HiAnime    → set env HIANIME_URL    (self-hosted, anime)
 * NS 3  Jellyfin   → set env JELLYFIN_URL + JELLYFIN_TOKEN
 * NS 4  CinePro    → set env CINEPRO_URL    (self-hosted scraper)
 * NS 5  VidSrc.to  → public, no env needed
 * NS 6  SRS Live   → set env SRS_URL        (self-hosted live server)
 * NS 7  VidLink    → public
 * NS 8  Videasy    → public
 * NS 9  AutoEmbed  → public
 * NS 10 Vap        → public
 * NS 11 VidsrcCC   → public
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
  try {
    const r = await fetch(url, { ...opts, signal: c.signal });
    clearTimeout(t);
    return r;
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

// ── NS 1: Consumet API (self-hosted) ──────────────────────────────────────────
async function fetchNS1(type, id, s, e) {
  const base = process.env.CONSUMET_URL;
  if (!base) return null;
  try {
    const searchRes = await go(
      `${base}/movies/flixhq/${encodeURIComponent(id)}`,
      { headers: { "User-Agent": UA } }, 8000
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const match = searchData?.results?.[0];
    if (!match?.id) return null;
    const watchEndpoint = type === "movie"
      ? `${base}/movies/flixhq/watch?episodeId=${match.id}&mediaId=${match.id}`
      : `${base}/movies/flixhq/watch?episodeId=${match.id}&mediaId=${match.id}&season=${s}&episode=${e}`;
    const watchRes = await go(watchEndpoint, { headers: { "User-Agent": UA } }, 8000);
    if (!watchRes.ok) return null;
    const d = await watchRes.json();
    const src = d?.sources?.find(x => x.quality === "auto") || d?.sources?.[0];
    if (!src?.url) return null;
    const caps = (d?.subtitles || [])
      .map(x => ({ url: x.url || "", display: x.lang || "Unknown", language: x.lang || "", type: "vtt" }))
      .filter(x => x.url);
    return {
      sources: [{ url: src.url, format: src.url.includes(".m3u8") ? "hls" : "mp4", quality: src.quality || "Auto", source: "NS 1" }],
      captions: caps,
    };
  } catch { return null; }
}

// ── NS 2: HiAnime/AniWatch API (self-hosted) ──────────────────────────────────
async function fetchNS2(type, id, s, e) {
  const base = process.env.HIANIME_URL;
  if (!base) return null;
  try {
    const searchRes = await go(
      `${base}/anime/search?q=${encodeURIComponent(String(id))}`,
      { headers: { "User-Agent": UA } }, 8000
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const anime = searchData?.data?.animes?.[0];
    if (!anime?.id) return null;
    const epRes = await go(`${base}/anime/${anime.id}/episodes`, { headers: { "User-Agent": UA } }, 8000);
    if (!epRes.ok) return null;
    const epData = await epRes.json();
    const episodes = epData?.data?.episodes || [];
    const ep = type === "tv" ? (episodes.find(x => x.number === e) || episodes[0]) : episodes[0];
    if (!ep?.episodeId) return null;
    const srcRes = await go(
      `${base}/anime/episode-srcs?id=${ep.episodeId}&server=hd-1&category=sub`,
      { headers: { "User-Agent": UA } }, 8000
    );
    if (!srcRes.ok) return null;
    const srcData = await srcRes.json();
    const src = srcData?.data?.sources?.find(x => x.type === "hls") || srcData?.data?.sources?.[0];
    if (!src?.url) return null;
    const caps = (srcData?.data?.tracks || [])
      .filter(t => t.kind === "captions")
      .map(t => ({ url: t.file || "", display: t.label || "Unknown", language: t.label || "", type: "vtt" }))
      .filter(c => c.url);
    return {
      sources: [{ url: src.url, format: "hls", quality: "Auto", source: "NS 2" }],
      captions: caps,
    };
  } catch { return null; }
}

// ── NS 3: Jellyfin (self-hosted) ──────────────────────────────────────────────
async function fetchNS3(type, id, s, e) {
  const base  = process.env.JELLYFIN_URL;
  const token = process.env.JELLYFIN_TOKEN;
  if (!base || !token) return null;
  try {
    const itemType = type === "movie" ? "Movie" : "Episode";
    const query = type === "movie"
      ? `AnyProviderIdEquals=tmdb.${id}`
      : `AnyProviderIdEquals=tmdb.${id}&ParentIndexNumber=${s}&IndexNumber=${e}`;
    const searchRes = await go(
      `${base}/Items?Recursive=true&IncludeItemTypes=${itemType}&${query}`,
      { headers: { "X-Emby-Token": token, "User-Agent": UA } }, 8000
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const item = searchData?.Items?.[0];
    if (!item?.Id) return null;
    const streamUrl = `${base}/Videos/${item.Id}/stream.m3u8?api_key=${token}&Container=ts&VideoCodec=copy&AudioCodec=aac&TranscodingProtocol=hls`;
    return {
      sources: [{ url: streamUrl, format: "hls", quality: "Direct", source: "NS 3" }],
      captions: [],
    };
  } catch { return null; }
}

// ── NS 4: CinePro Core (self-hosted) ──────────────────────────────────────────
async function fetchNS4(type, id, s, e) {
  const base = process.env.CINEPRO_URL;
  if (!base) return null;
  try {
    const url = type === "movie"
      ? `${base}/api/stream/movie/${id}`
      : `${base}/api/stream/tv/${id}?season=${s}&episode=${e}`;
    const r = await go(url, { headers: { "User-Agent": UA, "Referer": base } }, 10000);
    if (!r.ok) return null;
    const j = await r.json();
    const raw = j?.sources || (j?.stream ? [{ url: j.stream }] : []);
    const sources = raw
      .map(x => ({
        url: x.url || x.stream || "",
        format: (x.url || "").includes(".m3u8") ? "hls" : "mp4",
        quality: x.quality || "Auto",
        source: "NS 4",
      }))
      .filter(x => x.url);
    if (!sources.length) return null;
    const caps = (j?.subtitles || j?.captions || [])
      .map(x => ({ url: x.url || x.file || "", display: x.label || "Unknown", language: x.language || x.lang || "", type: "vtt" }))
      .filter(x => x.url);
    return { sources, captions: caps };
  } catch { return null; }
}

// ── NS 5: VidSrc.to ───────────────────────────────────────────────────────────
async function fetchNS5(type, id, s, e) {
  try {
    const embedUrl = type === "movie"
      ? `https://vidsrc.to/embed/movie/${id}`
      : `https://vidsrc.to/embed/tv/${id}/${s}/${e}`;
    const pageRes = await go(embedUrl, { headers: { "User-Agent": UA, "Referer": "https://vidsrc.to/" } }, 8000);
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const dataIdMatch = html.match(/data-id="([^"]+)"/);
    if (!dataIdMatch) return null;
    const dataId = dataIdMatch[1];
    const srcRes = await go(
      `https://vidsrc.to/ajax/embed/episode/${dataId}/sources`,
      { headers: { "User-Agent": UA, "Referer": embedUrl } }, 8000
    );
    if (!srcRes.ok) return null;
    const srcJson = await srcRes.json();
    const firstSrc = (srcJson?.result || [])[0];
    if (!firstSrc?.id) return null;
    const detailRes = await go(
      `https://vidsrc.to/ajax/embed/source/${firstSrc.id}`,
      { headers: { "User-Agent": UA, "Referer": embedUrl } }, 8000
    );
    if (!detailRes.ok) return null;
    const detail = await detailRes.json();
    const url = detail?.result?.url;
    if (!url) return null;
    return {
      sources: [{ url, format: url.includes(".m3u8") ? "hls" : "mp4", quality: "HD", source: "NS 5" }],
      captions: [],
    };
  } catch { return null; }
}

// ── NS 6: SRS Live (self-hosted) ──────────────────────────────────────────────
async function fetchNS6(type, id, s, e) {
  const base = process.env.SRS_URL;
  if (!base) return null;
  try {
    const key = type === "movie" ? `movie_${id}` : `tv_${id}_s${s}e${e}`;
    const url = `${base}/live/${key}.m3u8`;
    const probe = await go(url, { method: "HEAD" }, 4000);
    if (!probe.ok) return null;
    return {
      sources: [{ url, format: "hls", quality: "Live", source: "NS 6" }],
      captions: [],
    };
  } catch { return null; }
}

// ── NS 7: VidLink ─────────────────────────────────────────────────────────────
async function fetchNS7(type, id, s, e) {
  try {
    const url = type === "movie"
      ? `https://vidlink.pro/api/b/movie/${id}`
      : `https://vidlink.pro/api/b/tv/${id}/${s}/${e}`;
    const r = await go(url, { headers: { "User-Agent": UA, "Referer": "https://vidlink.pro/" } });
    if (!r.ok) return null;
    const j = await r.json();
    const playlist = j?.stream?.playlist || j?.playlist || j?.url;
    if (!playlist) return null;
    const caps = (j?.stream?.subtitles || j?.subtitles || [])
      .map(x => ({ url: x.file || x.url || "", display: x.label || x.language || "Unknown", language: x.lang || x.language || "", type: "vtt" }))
      .filter(x => x.url);
    return { sources: [{ url: playlist, format: "hls", quality: "Auto", source: "NS 7" }], captions: caps };
  } catch { return null; }
}

// ── NS 8: Videasy ─────────────────────────────────────────────────────────────
async function fetchNS8(type, id, s, e) {
  try {
    const url = type === "movie"
      ? `https://player.videasy.net/api/movie/${id}`
      : `https://player.videasy.net/api/tv/${id}/${s}/${e}`;
    const r = await go(url, { headers: { "User-Agent": UA, "Referer": "https://player.videasy.net/", "Origin": "https://player.videasy.net" } });
    if (!r.ok) return null;
    const j = await r.json();
    const stream = j?.url || j?.stream || j?.source || j?.data?.url;
    if (!stream) return null;
    return { sources: [{ url: stream, format: stream.includes(".m3u8") ? "hls" : "mp4", quality: "HD", source: "NS 8" }], captions: [] };
  } catch { return null; }
}

// ── NS 9: AutoEmbed ───────────────────────────────────────────────────────────
async function fetchNS9(type, id, s, e) {
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
      source: "NS 9",
    })).filter(x => x.url);
    const caps = (j?.tracks || j?.subtitles || [])
      .filter(t => t.kind === "captions" || t.kind === "subtitles")
      .map(t => ({ url: t.file || t.url || "", display: t.label || "Unknown", language: t.lang || "", type: "vtt" }))
      .filter(c => c.url);
    return { sources, captions: caps };
  } catch { return null; }
}

// ── NS 10: Vap ────────────────────────────────────────────────────────────────
async function fetchNS10(type, id, s, e) {
  try {
    const url = type === "movie"
      ? `https://vap.to/api/v1/movie/${id}`
      : `https://vap.to/api/v1/tv/${id}/${s}/${e}`;
    const r = await go(url, { headers: { "User-Agent": UA, "Referer": "https://vap.to/", "Origin": "https://vap.to" } }, 8000);
    if (!r.ok) return null;
    const j = await r.json();
    const stream = j?.url || j?.stream || j?.source || j?.data?.url || j?.playlist;
    if (!stream) return null;
    const caps = (j?.subtitles || j?.tracks || [])
      .map(t => ({ url: t.file || t.url || "", display: t.label || "Unknown", language: t.lang || "", type: "vtt" }))
      .filter(c => c.url);
    return { sources: [{ url: stream, format: stream.includes(".m3u8") ? "hls" : "mp4", quality: "HD", source: "NS 10" }], captions: caps };
  } catch { return null; }
}

// ── NS 11: VidsrcCC ───────────────────────────────────────────────────────────
async function fetchNS11(type, id, s, e) {
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
    const sources = (j?.sources || [])
      .map(x => ({ url: x.file || x.url || "", format: (x.file || "").includes(".m3u8") ? "hls" : "mp4", quality: x.label || "HD", source: "NS 11" }))
      .filter(x => x.url);
    if (!sources.length) return null;
    const caps = (j?.tracks || [])
      .filter(t => t.kind === "captions" || t.kind === "subtitles")
      .map(t => ({ url: t.file || "", display: t.label || "Unknown", language: t.lang || "", type: "vtt" }))
      .filter(c => c.url);
    return { sources, captions: caps };
  } catch { return null; }
}

// ── Route map ──────────────────────────────────────────────────────────────────
const FETCHERS = {
  "1":  fetchNS1,
  "2":  fetchNS2,
  "3":  fetchNS3,
  "4":  fetchNS4,
  "5":  fetchNS5,
  "6":  fetchNS6,
  "7":  fetchNS7,
  "8":  fetchNS8,
  "9":  fetchNS9,
  "10": fetchNS10,
  "11": fetchNS11,
};

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  const { type, id, season, episode, service } = req.query;
  if (!type || !id) return res.status(400).json({ error: "Missing type or id" });

  const s = season  ? parseInt(season,  10) : null;
  const e = episode ? parseInt(episode, 10) : null;

  // Single-service route (called by fetchAllNonEmbedSources per service)
  if (service && FETCHERS[service]) {
    const result = await FETCHERS[service](type, id, s, e);
    if (!result) return res.status(404).json({ error: "No source found", data: null });
    return res.status(200).json({ ...result, data: result });
  }

  // No service — run all in parallel (legacy fallback)
  const all = await Promise.allSettled(
    Object.values(FETCHERS).map(fn => fn(type, id, s, e))
  );
  const merged = { sources: [], captions: [] };
  const seen = new Set();
  all.forEach(r => {
    if (r.status !== "fulfilled" || !r.value) return;
    (r.value.sources || []).forEach(src => {
      if (src.url && !seen.has(src.url)) { seen.add(src.url); merged.sources.push(src); }
    });
    (r.value.captions || []).forEach(cap => {
      if (!merged.captions.find(c => c.url === cap.url)) merged.captions.push(cap);
    });
  });
  return res.status(200).json({ ...merged, data: merged });
}