// ── IPC: Downloads ────────────────────────────────────────────────────────────
// Manages the download queue, spawns the downloader binary (legacy HLS),
// drives WebTorrent (new torrent engine), tracks progress, and handles
// all download-related IPC handlers.

const { app, ipcMain, shell, dialog, session } = require("electron");
const { spawn } = require("child_process");
const path  = require("path");
const fs    = require("fs");
const https = require("https");
const http  = require("http");
const os    = require("os");

// ── Download store ────────────────────────────────────────────────────────────

let downloads = [];
let _downloadsFile = null;
const downloadsFile = () =>
  _downloadsFile ||
  (_downloadsFile = path.join(app.getPath("userData"), "downloads.json"));

const activeProcs = new Map(); // binary child processes (legacy HLS)

// ── WebTorrent client (lazy-loaded so startup stays fast) ─────────────────────
let _wtClient = null;
function getWTClient() {
  if (!_wtClient) {
    // webtorrent is an optional dependency — install with: npm install webtorrent
    try {
      const WebTorrent = require("webtorrent");
      _wtClient = new WebTorrent({ maxConns: 55 });
      _wtClient.on("error", (err) =>
        console.error("[WebTorrent]", err.message || err)
      );
    } catch (e) {
      throw new Error(
        "WebTorrent not installed. Run: npm install webtorrent  then restart."
      );
    }
  }
  return _wtClient;
}

let _getMainWindow = () => null;

function sendProgress(update) {
  const mw = _getMainWindow();
  if (mw && !mw.isDestroyed()) {
    mw.webContents.send("download-progress", update);
  }
}

function loadDownloads() {
  try {
    const raw    = fs.readFileSync(downloadsFile(), "utf8");
    const parsed = JSON.parse(raw);
    const seen   = new Map();
    const sorted = [...parsed].sort(
      (a, b) =>
        (b.completedAt || b.startedAt || 0) -
        (a.completedAt || a.startedAt || 0)
    );
    for (const d of sorted) {
      const key =
        d.tmdbId && d.mediaType
          ? `${d.tmdbId}|${d.mediaType}|${d.season ?? ""}|${d.episode ?? ""}`
          : d.id;
      if (!seen.has(key)) seen.set(key, d);
    }
    downloads = [...seen.values()];
  } catch {
    downloads = [];
  }
}

function saveDownloads() {
  try {
    const toSave = downloads.filter(
      (d) => d.status !== "downloading" && d.status !== "error"
    );
    fs.writeFileSync(downloadsFile(), JSON.stringify(toSave, null, 2));
  } catch {}
}

function cleanupTempFiles(downloadPath) {
  if (!downloadPath) return;
  const TEMP_PATTERNS = [/\.part$/, /\.part\.\d+$/, /\.part\.tmp$/, /\.tmp$/, /\.ytdl$/, /\.part-Frag\d+$/];
  try {
    const entries = fs.readdirSync(downloadPath);
    for (const entry of entries) {
      if (TEMP_PATTERNS.some((p) => p.test(entry))) {
        try { fs.unlinkSync(path.join(downloadPath, entry)); } catch {}
      }
    }
  } catch {}
}

function killAllDownloads() {
  // Kill legacy binary processes
  for (const [id, proc] of activeProcs.entries()) {
    try { proc.kill("SIGKILL"); } catch {}
    const idx = downloads.findIndex((d) => d.id === id);
    if (idx !== -1) {
      downloads[idx].status      = "error";
      downloads[idx].lastMessage = "Cancelled on exit";
    }
    activeProcs.delete(id);
  }

  // Destroy WebTorrent client (tears down all active torrents cleanly)
  if (_wtClient) {
    try { _wtClient.destroy(); } catch {}
    _wtClient = null;
  }

  const folders = new Set(downloads.map((d) => d.downloadPath).filter(Boolean));
  for (const folder of folders) cleanupTempFiles(folder);
  saveDownloads();
}

// ── Subtitle file downloader ──────────────────────────────────────────────────

function downloadSubtitleFile(url, destPath) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === "file:") {
        try { fs.copyFileSync(decodeURIComponent(parsedUrl.pathname), destPath); resolve(true); }
        catch { resolve(false); }
        return;
      }
      const lib = parsedUrl.protocol === "https:" ? https : http;
      const req = lib.get(
        url,
        { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0", Referer: parsedUrl.origin, Accept: "*/*" } },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const loc = res.headers.location.startsWith("http")
              ? res.headers.location
              : parsedUrl.origin + res.headers.location;
            downloadSubtitleFile(loc, destPath).then(resolve);
            return;
          }
          if (res.statusCode !== 200) { res.resume(); resolve(false); return; }
          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on("finish", () => { file.close(); resolve(true); });
          file.on("error", () => { try { fs.unlinkSync(destPath); } catch {} resolve(false); });
          res.on("error", () => resolve(false));
        }
      );
      req.on("error", () => resolve(false));
      req.setTimeout(20000, () => { req.destroy(); resolve(false); });
    } catch { resolve(false); }
  });
}

// ── IPC registration ──────────────────────────────────────────────────────────

function register(getMainWindow) {
  _getMainWindow = getMainWindow;

  // ── downloader binary detection (legacy) ─────────────────────────────────
  ipcMain.handle("check-downloader", (_, folderPath) => {
    if (!folderPath) return { exists: false };
    try {
      const entries = fs.readdirSync(folderPath);
      if (!entries.includes("_internal")) return { exists: false };
      const binary = entries.find((e) => {
        if (e === "_internal" || e.startsWith(".")) return false;
        try { return fs.statSync(path.join(folderPath, e)).isFile(); } catch { return false; }
      });
      const binaryPath = binary ? path.join(folderPath, binary) : null;
      return { exists: !!binaryPath, binaryPath };
    } catch { return { exists: false }; }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ── NEW: WebTorrent download ─────────────────────────────────────────────
  // Called by DownloadModal when user picks a quality from YTS / EZTV / Torrentio
  // ════════════════════════════════════════════════════════════════════════════
  ipcMain.handle(
    "start-torrent",
    async (_, { magnet, torrentUrl, name, downloadPath, mediaId, mediaType, season, episode, posterPath, tmdbId }) => {
      try {
        if (!downloadPath) return { ok: false, error: "No download folder selected." };
        if (!fs.existsSync(downloadPath)) {
          try { fs.mkdirSync(downloadPath, { recursive: true }); } catch {
            return { ok: false, error: `Folder not found: ${downloadPath}` };
          }
        }

        const id = crypto.randomUUID();

        // Remove stale entries for the same media
        if (tmdbId && mediaType) {
          downloads = downloads.filter((d) =>
            !(d.tmdbId     === tmdbId    &&
              d.mediaType  === mediaType &&
              String(d.season  ?? "") === String(season  ?? "") &&
              String(d.episode ?? "") === String(episode ?? ""))
          );
        }

        const entry = {
          id,
          name:               name || "Video",
          m3u8Url:            null,
          magnet:             magnet || null,
          downloadPath,
          filePath:           null,
          status:             "downloading",
          progress:           0,
          speed:              "",
          size:               "",
          totalFragments:     0,
          completedFragments: 0,
          lastMessage:        "Connecting to peers…",
          startedAt:          Date.now(),
          completedAt:        null,
          mediaId:            mediaId   || null,
          mediaType:          mediaType || null,
          season:             season    || null,
          episode:            episode   || null,
          posterPath:         posterPath || null,
          tmdbId:             tmdbId || mediaId || null,
          subtitles:          [],
          subtitlePaths:      [],
          isTorrent:          true,
        };
        downloads.push(entry);
        sendProgress({ id, ...entry });

        const client     = getWTClient();
        // Prefer direct .torrent URL (faster metadata resolution) over magnet
        const torrentId  = torrentUrl || magnet;

        client.add(torrentId, { path: downloadPath }, (torrent) => {
          const idx = downloads.findIndex((d) => d.id === id);
          if (idx === -1) { try { torrent.destroy(); } catch {} return; }

          // Pin the largest file as the expected output (the video)
          const mainFile = torrent.files.slice().sort((a, b) => b.length - a.length)[0];
          if (mainFile) {
            downloads[idx].filePath = path.join(downloadPath, mainFile.path);
            sendProgress({ id, filePath: downloads[idx].filePath, status: "downloading" });
          }

          sendProgress({ id, lastMessage: `Connected · ${torrent.numPeers} peer(s)`, status: "downloading" });

          let lastSend = 0;

          torrent.on("download", () => {
            const now = Date.now();
            if (now - lastSend < 900) return; // throttle to ~1 update/sec
            lastSend = now;

            const i = downloads.findIndex((d) => d.id === id);
            if (i === -1) return;

            const pct    = Math.min(99, Math.round(torrent.progress * 100));
            const dlSpd  = torrent.downloadSpeed || 0;
            const speed  = dlSpd >= 1e6
              ? `${(dlSpd / 1e6).toFixed(1)} MB/s`
              : `${(dlSpd / 1e3).toFixed(0)} KB/s`;
            const eta    = torrent.timeRemaining;
            const etaStr = eta > 0 && isFinite(eta)
              ? eta > 3_600_000 ? `${Math.round(eta / 3_600_000)}h`
              : eta >    60_000 ? `${Math.round(eta / 60_000)}m`
              : `${Math.round(eta / 1000)}s`
              : "";
            const totalB = torrent.length || 0;
            const size   = totalB >= 1e9
              ? `${(totalB / 1e9).toFixed(2)} GB`
              : `${(totalB / 1e6).toFixed(1)} MB`;
            const msg    = `${pct}%${speed  ? ` · ${speed}`         : ""}${etaStr ? ` · ${etaStr} left` : ""}`;

            const update = { progress: pct, speed, size, lastMessage: msg };
            downloads[i] = { ...downloads[i], ...update };
            sendProgress({ id, ...update, status: "downloading" });
          });

          torrent.on("done", () => {
            const i = downloads.findIndex((d) => d.id === id);
            if (i === -1) return;

            const mf       = torrent.files.slice().sort((a, b) => b.length - a.length)[0];
            const filePath = mf ? path.join(downloadPath, mf.path) : downloads[i].filePath;
            const bytes    = torrent.length || 0;
            const size     = bytes >= 1e9
              ? `${(bytes / 1e9).toFixed(2)} GB`
              : `${(bytes / 1e6).toFixed(1)} MB`;

            downloads[i] = {
              ...downloads[i],
              status:      "completed",
              progress:    100,
              filePath,
              size,
              completedAt: Date.now(),
              lastMessage: "Complete",
            };
            sendProgress({
              id,
              status:      "completed",
              progress:    100,
              filePath,
              size,
              completedAt: downloads[i].completedAt,
              lastMessage: "Complete",
            });
            saveDownloads();
            try { torrent.destroy(); } catch {}
          });

          torrent.on("error", (err) => {
            const i = downloads.findIndex((d) => d.id === id);
            if (i === -1) return;
            const msg = err.message || "Torrent error";
            downloads[i] = { ...downloads[i], status: "error", lastMessage: msg };
            sendProgress({ id, status: "error", lastMessage: msg });
            saveDownloads();
          });
        });

        return { ok: true, id };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
  );

  // ── Cancel / remove a WebTorrent download ────────────────────────────────
  ipcMain.handle("cancel-torrent", (_, id) => {
    try {
      const dl = downloads.find((d) => d.id === id);
      if (dl?.magnet && _wtClient) {
        const hashMatch = dl.magnet.match(/xt=urn:btih:([a-f0-9]+)/i);
        if (hashMatch) {
          const t = _wtClient.torrents.find(
            (t) => t.infoHash === hashMatch[1].toLowerCase()
          );
          if (t) try { t.destroy(); } catch {}
        }
      }
      downloads = downloads.filter((d) => d.id !== id);
      saveDownloads();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ── LEGACY: binary HLS download (kept exactly as-was) ───────────────────
  // ════════════════════════════════════════════════════════════════════════════
  ipcMain.handle(
    "run-download",
    (_, { binaryPath, m3u8Url, name, downloadPath, mediaId, mediaType, season, episode, posterPath, tmdbId, subtitles }) => {
      try {
        const id      = crypto.randomUUID();
        const logPath = path.join(os.tmpdir(), `streambert_dl_${id}.log`);

        const entry = {
          id, name, m3u8Url, downloadPath,
          filePath: null, status: "downloading",
          progress: 0, speed: "", size: "",
          totalFragments: 0, completedFragments: 0,
          lastMessage: "Starting…",
          startedAt: Date.now(), completedAt: null,
          mediaId: mediaId || null, mediaType: mediaType || null,
          season: season || null, episode: episode || null,
          posterPath: posterPath || null,
          tmdbId: tmdbId || mediaId || null,
          subtitles: Array.isArray(subtitles) ? subtitles : [],
          subtitlePaths: [], logPath,
        };

        try { fs.writeFileSync(logPath, `Streambert Download Log\nName: ${name}\nURL: ${m3u8Url}\nStarted: ${new Date().toISOString()}\n${"─".repeat(60)}\n`, "utf8"); } catch {}

        downloads.push(entry);

        const isSameMedia = (d) =>
          d.id !== id && d.tmdbId && d.tmdbId === entry.tmdbId &&
          d.mediaType === entry.mediaType &&
          String(d.season  ?? "") === String(entry.season  ?? "") &&
          String(d.episode ?? "") === String(entry.episode ?? "");
        downloads = downloads.filter((d) => !isSameMedia(d));

        const args = ["--cli", m3u8Url, "-f", "mp4 (with Audio)", "-r", "best", "-b", "320", "-n", name, "-d", downloadPath];
        const proc = spawn(binaryPath, args, { stdio: ["ignore", "pipe", "pipe"] });
        activeProcs.set(id, proc);

        const handleLine = (line) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          const idx = downloads.findIndex((d) => d.id === id);
          if (idx === -1) return;
          const update = {};

          const fragMatch = trimmed.match(/\(frag\s+(\d+)\/(\d+)\)/);
          if (fragMatch) {
            const cur = parseInt(fragMatch[1]), total = parseInt(fragMatch[2]);
            update.completedFragments = cur; update.totalFragments = total;
            update.progress = Math.min(99, Math.round((cur / total) * 100));
            update.lastMessage = `Fragment ${cur} / ${total}`;
          }
          if (!fragMatch && !downloads[idx].totalFragments) {
            const dlPctMatch = trimmed.match(/^\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\s*(?:[KMGT]i?B|B))/i);
            if (dlPctMatch) {
              const pct = parseFloat(dlPctMatch[1]);
              update.progress = Math.min(99, Math.round(pct));
              update.size = dlPctMatch[2].trim();
              const sp = trimmed.match(/\bat\s+([\d.]+\s*(?:[KMGT]i?B|B)\/s)/i);
              if (sp) update.speed = sp[1].trim();
              update.lastMessage = `${Math.round(pct)}% of ${update.size}`;
            }
          }
          const durationMatch = trimmed.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
          if (durationMatch) {
            const t = parseInt(durationMatch[1])*3600 + parseInt(durationMatch[2])*60 + parseFloat(durationMatch[3]);
            if (t > 0) downloads[idx]._ffmpegTotalSecs = t;
            return;
          }
          const ffmpegMatch = trimmed.match(/size=\s*([\d.]+\s*\w+)\s+time=(\d+):(\d+):([\d.]+)/i);
          if (ffmpegMatch) {
            const elapsed = parseInt(ffmpegMatch[2])*3600 + parseInt(ffmpegMatch[3])*60 + parseFloat(ffmpegMatch[4]);
            const total   = downloads[idx]._ffmpegTotalSecs || 0;
            if (total > 0) update.progress = Math.min(99, Math.round((elapsed / total) * 100));
            const rawSize  = ffmpegMatch[1].trim();
            const kbMatch  = rawSize.match(/([\d.]+)\s*kB/i);
            if (kbMatch) { const mb = parseFloat(kbMatch[1]) / 1024; update.size = mb >= 1024 ? `${(mb/1024).toFixed(1)} GiB` : `${mb.toFixed(1)} MiB`; }
            else update.size = rawSize;
            const spdX = trimmed.match(/speed=\s*([\d.]+)x/i);
            if (spdX) update.speed = `${spdX[1]}x`;
            update.lastMessage = `Processing… ${update.size}${update.speed ? ` at ${update.speed}` : ""}`;
          }
          const retryMatch = trimmed.match(/Retrying\s+\(\d+\/\d+\)/i) || trimmed.match(/Got error:.*timed?\s*out/i) || trimmed.match(/Read timed? out/i);
          if (retryMatch) {
            update.speed = "0 MB/s";
            const rn = trimmed.match(/Retrying\s+\((\d+)\/(\d+)\)/i);
            update.lastMessage = rn ? `Retrying… (${rn[1]}/${rn[2]})` : "Retrying…";
            downloads[idx] = { ...downloads[idx], ...update };
            sendProgress({ id, ...update, status: downloads[idx].status });
            return;
          }
          const spMatch   = trimmed.match(/\bat\s+([\d.]+\s*(?:[KMGT]i?B|B)\/s)/i);
          if (spMatch) update.speed = spMatch[1].trim();
          const szMatch   = trimmed.match(/\bof\s+~?\s*([\d.]+\s*(?:[KMGT]i?B|B))\b/i);
          if (szMatch) update.size = szMatch[1].trim();
          const ftMatch   = trimmed.match(/Total fragments:\s+(\d+)/);
          if (ftMatch) { const tot = parseInt(ftMatch[1]); const u = { totalFragments: tot, completedFragments: 0, lastMessage: `HLS: ${tot} fragments` }; downloads[idx] = { ...downloads[idx], ...u }; sendProgress({ id, ...u, status: downloads[idx].status }); return; }
          const destMatch = trimmed.match(/^\[download\] Destination:\s+(.+)/);
          if (destMatch) { const u = { filePath: destMatch[1].trim(), lastMessage: "Downloading…" }; downloads[idx] = { ...downloads[idx], ...u }; sendProgress({ id, ...u, status: downloads[idx].status }); return; }
          const mergeMatch = trimmed.match(/\[Merger\] Merging formats into "(.+)"/);
          if (mergeMatch) { const u = { filePath: mergeMatch[1].trim(), lastMessage: "Merging…", progress: 99 }; downloads[idx] = { ...downloads[idx], ...u }; sendProgress({ id, ...u, status: downloads[idx].status }); return; }
          const SUPPRESS = [/Sleeping\s+[\d.]+\s+seconds/i, /^\[yt-dlp\s+DEBUG\]/i, /^\[debug\]/i];
          if (Object.keys(update).length === 0) {
            const suppress = downloads[idx].lastMessage.startsWith("Fragment") || downloads[idx].lastMessage.startsWith("Retrying") || SUPPRESS.some((p) => p.test(trimmed));
            if (!suppress) update.lastMessage = trimmed;
          }
          if (Object.keys(update).length > 0) { downloads[idx] = { ...downloads[idx], ...update }; sendProgress({ id, ...update, status: downloads[idx].status }); }
        };

        let buf = "", stderrBuf = "";
        const appendLog = (line) => { try { fs.appendFileSync(logPath, line + "\n", "utf8"); } catch {} };

        proc.stdout.on("data", (chunk) => {
          buf += chunk.toString();
          const lines = buf.split(/\r\n|\r|\n/); buf = lines.pop();
          lines.forEach((l) => { appendLog(l); handleLine(l); });
        });
        proc.stderr.on("data", (chunk) => {
          const text = chunk.toString(); stderrBuf += text;
          text.split(/\r\n|\r|\n/).forEach((l) => { appendLog(l); handleLine(l); });
        });

        proc.on("close", (code) => {
          activeProcs.delete(id);
          if (buf.trim()) { appendLog(buf.trim()); handleLine(buf.trim()); }
          const idx = downloads.findIndex((d) => d.id === id);
          if (idx === -1) return;

          const status = code === 0 ? "completed" : "error";
          downloads[idx].status = status;
          downloads[idx].completedAt = Date.now();

          if (code === 0) {
            downloads[idx].progress = 100;
            downloads[idx].logPath  = null;
            try { fs.unlinkSync(logPath); } catch {}
          } else {
            try { fs.appendFileSync(logPath, `${"─".repeat(60)}\nFailed: exit code ${code}\nFinished: ${new Date().toISOString()}\n`, "utf8"); } catch {}
            const errorLine = stderrBuf.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean).reverse().find((l) => /error|failed|unable|cannot|denied/i.test(l)) || "";
            const prev = downloads[idx].lastMessage || "";
            downloads[idx].lastMessage = (errorLine || prev) ? `${errorLine || prev} (exit ${code})` : `Download failed (exit code ${code})`;
          }

          if (code === 0 && !downloads[idx].filePath) {
            try {
              const VIDEO_EXTS = [".mp4", ".mkv", ".webm", ".avi", ".ts", ".m4v"];
              const match = fs.readdirSync(downloadPath)
                .filter((f) => VIDEO_EXTS.some((e) => f.toLowerCase().endsWith(e)))
                .map((f) => ({ f, mtime: fs.statSync(path.join(downloadPath, f)).mtimeMs }))
                .sort((a, b) => b.mtime - a.mtime)[0];
              if (match) downloads[idx].filePath = path.join(downloadPath, match.f);
            } catch {}
          }

          if (code === 0 && downloads[idx].filePath) {
            try {
              const ext      = path.extname(downloads[idx].filePath) || ".mp4";
              const safeName = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim();
              if (safeName) {
                const newPath = path.join(downloadPath, safeName + ext);
                if (newPath !== downloads[idx].filePath) { fs.renameSync(downloads[idx].filePath, newPath); downloads[idx].filePath = newPath; }
              }
            } catch {}
          }

          if (downloads[idx].filePath) {
            try {
              const bytes = fs.statSync(downloads[idx].filePath).size;
              downloads[idx].size = bytes > 1e9 ? (bytes/1e9).toFixed(2)+" GB" : bytes > 1e6 ? (bytes/1e6).toFixed(1)+" MB" : bytes > 1e3 ? (bytes/1e3).toFixed(1)+" KB" : bytes+" B";
            } catch {}
          }

          if (code === 0 && downloads[idx].subtitles?.length > 0 && downloads[idx].filePath) {
            const videoBase  = downloads[idx].filePath.replace(/\.[^.]+$/, "");
            const langCounter = {};
            const KNOWN_SUB_EXTS = [".vtt", ".srt", ".ass", ".ssa", ".sub", ".idx"];
            const subPromises = downloads[idx].subtitles.map(({ url, lang, name: subName, file_id }) => {
              const urlClean = url.split("?")[0].split("#")[0];
              const urlExt   = path.extname(urlClean).toLowerCase().replace(/[^a-z0-9.]/g, "");
              const nameExt  = subName ? path.extname(subName).toLowerCase().replace(/[^a-z0-9.]/g, "") : "";
              const subExt   = KNOWN_SUB_EXTS.includes(urlExt) ? urlExt : KNOWN_SUB_EXTS.includes(nameExt) ? nameExt : ".srt";
              const safeLang = (lang || "unknown").replace(/[^a-z0-9_-]/gi, "");
              const lIdx     = langCounter[safeLang] ?? 0; langCounter[safeLang] = lIdx + 1;
              const subDest  = `${videoBase}.${safeLang}${lIdx > 0 ? `.${lIdx}` : ""}${subExt}`;
              return downloadSubtitleFile(url, subDest).then((ok) => ok ? { lang: lang || "unknown", path: subDest, file_id: file_id || null } : null);
            });
            Promise.all(subPromises).then((results) => {
              const i2 = downloads.findIndex((d) => d.id === id);
              if (i2 !== -1) { downloads[i2].subtitlePaths = results.filter(Boolean); saveDownloads(); sendProgress({ id, subtitlePaths: downloads[i2].subtitlePaths }); }
            });
          }

          sendProgress({ id, name, status: downloads[idx].status, progress: downloads[idx].progress, completedAt: downloads[idx].completedAt, filePath: downloads[idx].filePath, size: downloads[idx].size, completedFragments: downloads[idx].completedFragments, totalFragments: downloads[idx].totalFragments, lastMessage: downloads[idx].lastMessage, logPath: downloads[idx].logPath });
          saveDownloads();
        });

        return { ok: true, id };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
  );

  // ── Read / manage downloads ───────────────────────────────────────────────
  ipcMain.handle("get-downloads", () => downloads);

  ipcMain.handle("delete-download", (_, { id, filePath }) => {
    try {
      const dlEntry = downloads.find((d) => d.id === id);
      if (activeProcs.has(id)) { try { activeProcs.get(id).kill("SIGKILL"); } catch {} activeProcs.delete(id); }
      // Also kill WebTorrent torrent if active
      if (dlEntry?.magnet && _wtClient) {
        const hm = dlEntry.magnet.match(/xt=urn:btih:([a-f0-9]+)/i);
        if (hm) { const t = _wtClient.torrents.find((t) => t.infoHash === hm[1].toLowerCase()); if (t) try { t.destroy(); } catch {} }
      }
      if (filePath) { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {} }
      for (const sp of dlEntry?.subtitlePaths || []) { try { if (sp?.path && fs.existsSync(sp.path)) fs.unlinkSync(sp.path); } catch {} }
      const dlPath = dlEntry?.downloadPath;
      if (dlPath) cleanupTempFiles(dlPath);
      downloads = downloads.filter((d) => d.id !== id);
      saveDownloads();
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle("delete-all-downloads", async () => {
    try {
      let deleted = 0, errors = 0;
      for (const dl of downloads) {
        if (dl.filePath) { try { if (fs.existsSync(dl.filePath)) { fs.unlinkSync(dl.filePath); deleted++; } } catch { errors++; } }
        for (const sp of dl.subtitlePaths || []) { try { if (sp?.path && fs.existsSync(sp.path)) fs.unlinkSync(sp.path); } catch {} }
      }
      // Destroy all active torrents
      if (_wtClient) { try { _wtClient.destroy(); } catch {} _wtClient = null; }
      downloads = [];
      saveDownloads();
      return { ok: true, deleted, errors };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle("get-downloads-size", async () => {
    let bytes = 0;
    await Promise.all(downloads.map(async (dl) => {
      if (!dl.filePath) return;
      try { const stat = await fs.promises.stat(dl.filePath); if (stat.isFile()) bytes += stat.size; } catch {}
    }));
    return { bytes };
  });

  ipcMain.handle("show-in-folder", (_, filePath) => {
    if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
    else shell.openPath(path.dirname(filePath || ""));
  });

  ipcMain.handle("file-exists", (_, filePath) => {
    try { return fs.existsSync(filePath); } catch { return false; }
  });

  ipcMain.handle("pick-folder", async () => {
    const mw = getMainWindow();
    if (!mw) return null;
    const result = await dialog.showOpenDialog(mw, { properties: ["openDirectory"], title: "Select Folder" });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("open-external", (_, url) => { shell.openExternal(url); });

  ipcMain.handle("open-path", (_, filePath) => {
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) shell.openPath(filePath);
      else shell.showItemInFolder(filePath);
    } catch { shell.openPath(filePath); }
  });

  ipcMain.handle("get-install-path", () => {
    if (process.env.APPIMAGE) return path.dirname(process.env.APPIMAGE);
    if (app.isPackaged) return path.dirname(process.execPath);
    return app.getAppPath();
  });

  ipcMain.handle("scan-directory", (_, folderPath) => {
    try {
      if (!folderPath || !fs.existsSync(folderPath)) return [];
      const VIDEO_EXTS = [".mp4", ".mkv", ".webm", ".avi", ".mov", ".m4v", ".ts"];
      const results = [];
      const scanDir = (dir, depth = 0) => {
        if (depth > 3) return;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) { scanDir(fullPath, depth + 1); }
          else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (VIDEO_EXTS.includes(ext)) {
              let size = "";
              try { const bytes = fs.statSync(fullPath).size; size = bytes > 1e9 ? (bytes/1e9).toFixed(2)+" GB" : bytes > 1e6 ? (bytes/1e6).toFixed(1)+" MB" : bytes > 1e3 ? (bytes/1e3).toFixed(1)+" KB" : bytes+" B"; } catch {}
              results.push({ filePath: fullPath, name: path.basename(entry.name, ext), size, ext });
            }
          }
        }
      };
      scanDir(folderPath);
      return results;
    } catch { return []; }
  });

  ipcMain.handle("clear-app-cache", async () => {
    try {
      const sessions = [session.defaultSession, session.fromPartition("persist:player"), session.fromPartition("persist:trailer")];
      await Promise.all(sessions.map((s) => s.clearCache()));
      await Promise.all(sessions.map((s) => s.clearStorageData({ storages: ["shadercache", "serviceworkers", "cachestorage"] })));
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle("clear-watch-data", async () => {
    try { const vs = session.fromPartition("persist:player"); await vs.clearStorageData(); await vs.clearCache(); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle("get-cache-size", async () => {
    try {
      const sessions = [session.defaultSession, session.fromPartition("persist:player"), session.fromPartition("persist:trailer")];
      const sizes = await Promise.all(sessions.map((s) => s.getCacheSize()));
      return { bytes: sizes.reduce((a, b) => a + b, 0) };
    } catch { return { bytes: 0 }; }
  });

  ipcMain.handle("reset-app", async () => {
    try {
      const sessions = [session.defaultSession, session.fromPartition("persist:player"), session.fromPartition("persist:trailer")];
      await Promise.all(sessions.map((s) => s.clearStorageData()));
      await Promise.all(sessions.map((s) => s.clearCache()));
      const dlFile = downloadsFile();
      if (fs.existsSync(dlFile)) fs.unlinkSync(dlFile);
      downloads = [];
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });
}

module.exports = {
  register,
  loadDownloads,
  saveDownloads,
  killAllDownloads,
  getDownloads: () => downloads,
};