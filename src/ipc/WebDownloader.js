/**
 * webDownloader.js
 * Browser-native video downloader using ffmpeg.wasm
 * Works entirely client-side — no server, no external service
 */

let _ffmpeg = null;
let _ffmpegLoading = false;
let _ffmpegReady = false;

async function loadFFmpeg() {
  if (_ffmpegReady) return _ffmpeg;
  if (_ffmpegLoading) {
    while (_ffmpegLoading) await new Promise(r => setTimeout(r, 100));
    return _ffmpeg;
  }
  _ffmpegLoading = true;
  try {
    const { FFmpeg } = await import("https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js");
    const { toBlobURL } = await import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js");

    _ffmpeg = new FFmpeg();
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm";
    await _ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });
    _ffmpegReady = true;
    return _ffmpeg;
  } finally {
    _ffmpegLoading = false;
  }
}

export async function downloadWithFFmpeg({ m3u8Url, name, onProgress, onStatus }) {
  onStatus?.("Loading download engine…");
  onProgress?.(0);

  const ffmpeg = await loadFFmpeg();
  const { fetchFile } = await import("https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/dist/esm/index.js");

  ffmpeg.on("progress", ({ progress }) => {
    onProgress?.(Math.min(99, Math.round(progress * 100)));
  });

  try {
    onStatus?.("Fetching stream…");
    await ffmpeg.writeFile("input.m3u8", await fetchFile(m3u8Url));

    onStatus?.("Merging video…");
    await ffmpeg.exec([
      "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
      "-allowed_extensions", "ALL",
      "-i", "input.m3u8",
      "-c", "copy",
      "-movflags", "faststart",
      "output.mp4"
    ]);

    onStatus?.("Saving to device…");
    onProgress?.(100);

    const data = await ffmpeg.readFile("output.mp4");
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    try { await ffmpeg.deleteFile("input.m3u8"); } catch {}
    try { await ffmpeg.deleteFile("output.mp4"); } catch {}

    onStatus?.("Done!");
  } catch (err) {
    throw new Error(`Download failed: ${err.message}`);
  }
}

export function isFFmpegSupported() {
  return typeof WebAssembly !== "undefined";
}