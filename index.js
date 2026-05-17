// -- NovaSpark main process entry point ----------------------------------------
const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  webContents,
  Notification,
  shell,
} = require("electron");
const path = require("path");

// -- RAM / performance flags ---------------------------------------------------
app.commandLine.appendSwitch(
  "js-flags",
  "--max-old-space-size=256 --expose-gc",
);
app.commandLine.appendSwitch(
  "disable-features",
  "HardwareMediaKeyHandling,MediaSessionService,UseSandboxedXdgPortal",
);
app.commandLine.appendSwitch("enable-features", "NetworkServiceInProcess2");
app.commandLine.appendSwitch("disk-cache-size", String(80 * 1024 * 1024));
app.commandLine.appendSwitch("renderer-process-limit", "3");

// FIX: Prevent SSL handshake reset from killing the renderer
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');

// -- Startup benchmark ---------------------------------------------------------
const _t0 = Date.now();
const _bench = (label) =>
  console.log(`[boot] ${label}: +${Date.now() - _t0}ms`);

// -- Sub-modules ---------------------------------------------------------------
const blockStats = require("./src/ipc/blockStats");
const storageIpc = require("./src/ipc/storage");
const downloadsIpc = require("./src/ipc/downloads");
const subtitlesIpc = require("./src/ipc/subtitles");
const allmangaIpc = require("./src/ipc/allmanga");
const playerIpc = require("./src/ipc/player");

// -- Ad/tracker block list -----------------------------------------------------
const BLOCKED_HOSTS = [
  "*://www.google-analytics.com/*",
  "*://analytics.google.com/*",
  "*://googletagmanager.com/*",
  "*://www.googletagmanager.com/*",
  "*://googletagservices.com/*",
  "*://doubleclick.net/*",
  "*://*.doubleclick.net/*",
  "*://adservice.google.com/*",
  "*://adservice.google.de/*",
  "*://pagead2.googlesyndication.com/*",
  "*://stats.g.doubleclick.net/*",
  "*://yt3.ggpht.com/ytc/*",
  "*://fonts.googleapis.com/*",
  "*://fonts.gstatic.com/*",
  "*://googleapis.com/*",
  "*://gstatic.com/*",
  "*://cdn.adx1.com/*",
  "*://intelligenceadx.com/*",
  "*://adsco.re/*",
  "*://mc.yandex.com/*",
  "*://mc.yandex.ru/*",
  "*://bvtpk.com/*",
  "*://my.rtmark.net/*",
  "*://bvtpk.com/*",
  "*://b7510.com/*",
  "*://gt.unbrownunflat.com/*",
  "*://im.malocacomals.com/*",
  "*://users.videasy.net/*",
  "*://nf.sixmossin.com/*",
  "*://realizationnewestfangs.com/*",
  "*://acscdn.com/*",
  "*://lt.taloseempest.com/*",
  "*://pl26708123.profitableratecpm.com/*",
  "*://preferencenail.com/*",
  "*://protrafficinspector.com/*",
  "*://s10.histats.com/*",
  "*://weirdopt.com/*",
  "*://static.cloudflareinsights.com/*",
  "*://kettledroopingcontinuation.com/*",
  "*://wayfarerorthodox.com/*",
  "*://woxaglasuy.net/*",
  "*://adeptspiritual.com/*",
  "*://www.calculating-laugh.com/*",
  "*://amavhxdlofklxjg.xyz/*",
  "*://7jtjubf8p5kq7x3z2.u3qleufcm6vure326ktfpbj.cfd/*",
  "*://5mq.get64t9vqg8pnbex1y463o.rest/*",
  "*://usrpubtrk.com/*",
  "*://adexchangeclear.com/*",
  "*://rzjzjnavztycv.online/*",
  "*://tmstr4.cloudnestra.com/*",
  "*://tmstr4.neonhorizonworkshops.com/*",
];

// -- Module-level state --------------------------------------------------------
let mainWindow = null;
const getMainWindow = () => mainWindow;

const playerWcIds = new Set();
let sessionsConfigured = false;

// FIX: track whether the user intentionally closed the app
// so window-all-closed doesn't quit on webview crashes
let intentionalQuit = false;

function setupSession(playerSession, trailerSession) {
  const stripHeaders = (details, callback) => {
    const headers = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === "x-frame-options" || lower === "content-security-policy")
        delete headers[key];
    }
    callback({ responseHeaders: headers });
  };

  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  playerSession.setUserAgent(UA);
  trailerSession.setUserAgent(UA);

  playerSession.webRequest.onHeadersReceived(
    { urls: ["*://*/*"] },
    stripHeaders,
  );
  trailerSession.webRequest.onHeadersReceived(
    { urls: ["*://*/*"] },
    stripHeaders,
  );

  trailerSession.webRequest.onBeforeRequest({ urls: BLOCKED_HOSTS }, (_, cb) =>
    cb({ cancel: true }),
  );

  const MEDIA_URLS = [
    "*://*/*.m3u8*",
    "*://*/*.m3u8",
    "*://*/*.vtt*",
    "*://*/*.vtt",
  ];
  playerSession.webRequest.onBeforeRequest(
    { urls: [...BLOCKED_HOSTS, ...MEDIA_URLS] },
    (details, callback) => {
      const { url } = details;
      const isMedia = url.includes(".m3u8") || url.includes(".vtt");
      if (!isMedia) {
        blockStats.recordBlockedRequest(url);
        callback({ cancel: true });
        return;
      }
      try {
        const host = new URL(url).hostname;
        const blocked = BLOCKED_HOSTS.some((pat) => {
          const hostPat = pat.replace(/^\*:\/\//, "").split("/")[0];
          return hostPat.startsWith("*.")
            ? host.endsWith(hostPat.slice(1))
            : host === hostPat || host === hostPat.replace(/^\*\./, "");
        });
        if (blocked) {
          blockStats.recordBlockedRequest(url);
          callback({ cancel: true });
          return;
        }
      } catch {}
      const mw = getMainWindow();
      if (mw && !mw.isDestroyed()) {
        if (url.includes(".m3u8")) {
          mw.webContents.send("m3u8-found", url);
        } else if (url.includes(".vtt")) {
          const { extractSubtitleLang } = require("./src/ipc/subtitles");
          mw.webContents.send("subtitle-found", {
            url,
            lang: extractSubtitleLang(url),
          });
        }
      }
      callback({});
    },
  );

  // FIX: Log network errors on player session without crashing
  playerSession.webRequest.onErrorOccurred((details) => {
    if (details.error && !details.error.includes('ERR_ABORTED')) {
      console.error('[PLAYER-NET]', details.url, '=>', details.error);
    }
  });

  const ytCookie = {
    url: "https://www.youtube.com",
    name: "SOCS",
    value: "CAI",
    path: "/",
    secure: true,
    httpOnly: false,
    sameSite: "no_restriction",
    expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 2,
  };
  for (const domain of [".youtube.com", ".youtube-nocookie.com"]) {
    const cookie = { ...ytCookie, domain };
    trailerSession.cookies.set(cookie).catch(() => {});
    playerSession.cookies.set(cookie).catch(() => {});
  }
}

function createWindow() {
  storageIpc.applySecretMigrationIfNeeded();
  downloadsIpc.loadDownloads();
  blockStats.loadBlockStats();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    frame: process.platform !== "win32",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      backgroundThrottling: true,
      spellcheck: false,
      additionalArguments: ["--js-flags=--max-old-space-size=256 --expose-gc"],
    },
  });

  // FIX: if the renderer crashes, reload instead of closing the window
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[main] renderer gone:", details.reason);
    intentionalQuit = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadFile(path.join(__dirname, "dist/index.html"));
    }
  });

  // FIX: Catch unresponsive renderer (hanging on SSL handshake)
  mainWindow.webContents.on("unresponsive", () => {
    console.error("[main] renderer unresponsive");
    intentionalQuit = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadFile(path.join(__dirname, "dist/index.html"));
    }
  });

  // FIX: Catch page load failures
  mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) { // -3 = aborted (normal)
      console.error("[LOAD-FAIL]", validatedURL, errorCode, errorDescription);
    }
  });

  // Force long-lived disk caching for TMDB images
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["*://image.tmdb.org/*"] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      headers["cache-control"] = ["public, max-age=604800, immutable"];
      delete headers["pragma"];
      delete headers["expires"];
      callback({ responseHeaders: headers });
    },
  );

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const isLocal =
      url.startsWith("file://") ||
      url.startsWith("http://localhost") ||
      url.startsWith("https://localhost");
    if (!isLocal) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  mainWindow.webContents.on("will-redirect", (event, url) => {
    const isLocal =
      url.startsWith("file://") ||
      url.startsWith("http://localhost") ||
      url.startsWith("https://localhost");
    if (!isLocal) {
      event.preventDefault();
      shell.openExternal(url).catch(() => {});
    }
  });

  mainWindow.webContents.on("did-attach-webview", (_, wc) => {
    if (!sessionsConfigured) {
      sessionsConfigured = true;
      const playerSession = session.fromPartition("persist:player");
      const trailerSession = session.fromPartition("persist:trailer");
      setupSession(playerSession, trailerSession);
    }

    try {
      if (wc.session === session.fromPartition("persist:player")) {
        playerWcIds.add(wc.id);
        wc.once("destroyed", () => playerWcIds.delete(wc.id));
      }
    } catch {}

    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("close", () => {});

    // FIX: webview renderer crash must NOT propagate to close the main window
    wc.on("render-process-gone", (_event, details) => {
      console.error("[webview] renderer gone:", details.reason);
      intentionalQuit = false;
    });

    wc.on("will-navigate", (event, url) => {
      const adPatterns = [
        "doubleclick", "googlesyndication", "adservice",
        "adexchange", "tracking", "click.", "redirect",
      ];
      try {
        const host = new URL(url).hostname.toLowerCase();
        const isAd = adPatterns.some((p) => host.includes(p));
        if (isAd) {
          event.preventDefault();
        }
      } catch {}
    });

    wc.on("enter-html-full-screen", () =>
      mainWindow.webContents.send("webview-enter-fullscreen"),
    );
    wc.on("leave-html-full-screen", () =>
      mainWindow.webContents.send("webview-leave-fullscreen"),
    );
  });

  mainWindow.loadFile(path.join(__dirname, "dist/index.html"));

  mainWindow.webContents.once("did-finish-load", () => {
    _bench("renderer loaded");
    const sbSettings = storageIpc.loadScheduledBackupSettings();
    if (storageIpc.shouldRunScheduledBackup(sbSettings)) {
      mainWindow.webContents.send("scheduled-backup-requested");
    }
  });

mainWindow.on("closed", () => {
    mainWindow = null;
    if (intentionalQuit) app.quit();
  });
}

// -- Register all IPC modules --------------------------------------------------
storageIpc.register();
downloadsIpc.register(getMainWindow);
subtitlesIpc.register({
  getDownloads: downloadsIpc.getDownloads,
  saveDownloads: downloadsIpc.saveDownloads,
});
allmangaIpc.register();
playerIpc.register(getMainWindow, {
  writeSecretMigration: storageIpc.writeSecretMigration,
});
blockStats.init(getMainWindow);

ipcMain.handle("get-block-stats", () => blockStats.getBlockStats());

// -- Player memory cleanup -----------------------------------------------------
ipcMain.on("player-stopped", () => {
  // FIX: Destroy player webviews safely without crashing main renderer
  for (const id of [...playerWcIds]) {
    try {
      const wc = webContents.fromId(id);
      if (wc && !wc.isDestroyed()) {
        try { wc.stop(); } catch {}
        setTimeout(() => {
          try { if (!wc.isDestroyed()) wc.destroy(); } catch {}
        }, 100);
      }
    } catch {}
    playerWcIds.delete(id);
  }

  try {
    const ps = session.fromPartition("persist:player");
    ps.clearCache().catch(() => {});
    ps.clearStorageData({ storages: ["shadercache", "cachestorage"] }).catch(() => {});
  } catch {}

  if (typeof global.gc === "function") global.gc();
  const mw = mainWindow;
  if (mw && !mw.isDestroyed()) {
    mw.webContents.executeJavaScript("if(typeof gc==='function') gc();").catch(() => {});
  }
});

// -- Wyzie API Key Redemption Window -------------------------------------------
ipcMain.handle("wyzie-open-redeem", async () => {
  return new Promise((resolve) => {
    const { BrowserWindow: BW, session: electronSession } = require("electron");
    const redeemSession = electronSession.fromPartition("partition:wyzie-redeem");
    redeemSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      delete headers["content-security-policy"];
      delete headers["Content-Security-Policy"];
      callback({ responseHeaders: headers });
    });

    const win = new BW({
      width: 960,
      height: 720,
      title: "Claim your Wyzie API Key",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        session: redeemSession,
      },
      backgroundColor: "#ffffff",
      autoHideMenuBar: true,
    });

    let resolved = false;
    let timeout = null;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      if (!win.isDestroyed()) win.close();
      resolve(result);
    };

    win.on("closed", () => {
      if (!resolved) resolve({ ok: false, key: null, cancelled: true });
      clearTimeout(timeout);
    });

    win.webContents.once("did-finish-load", () => {
      timeout = setTimeout(() => {
        finish({ ok: false, key: null, timeout: true });
      }, 20000);
    });

    const checkUrl = (url) => {
      try {
        const u = new URL(url);
        if (u.hostname === "sub.wyzie.io" && u.pathname === "/notice") {
          const key = u.searchParams.get("key");
          if (key && key.startsWith("wyzie-") && key.length > 10) {
            finish({ ok: true, key });
            return true;
          }
        }
      } catch {}
      return false;
    };

    win.webContents.on("will-navigate", (_, url) => checkUrl(url));
    win.webContents.on("did-navigate", (_, url) => checkUrl(url));
    win.webContents.on("did-navigate-in-page", (_, url) => checkUrl(url));

    win.loadURL("https://sub.wyzie.io/redeem");
  });
});

// -- Wyzie API Key Validation --------------------------------------------------
ipcMain.handle("wyzie-validate-key", async (_, key) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(
      `https://sub.wyzie.io/search?id=550&format=srt&key=${encodeURIComponent(key)}`,
      { signal: controller.signal },
    ).finally(() => clearTimeout(timer));
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Invalid or expired key" };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// -- Desktop notifications -----------------------------------------------------
ipcMain.handle(
  "show-notification",
  (_event, { title, body, silent = false }) => {
    try {
      if (!Notification.isSupported()) return;
      const n = new Notification({
        title: String(title),
        body: String(body),
        silent,
      });
      n.show();
    } catch {}
  },
);

// -- Picture-in-Picture / Pop-Out window ---------------------------------------
let pipWindow = null;
const getPipWindow = () => pipWindow;

ipcMain.handle("open-pip-window", (_, { url, title }) => {
  if (!url || url === "about:blank") return { ok: false, reason: "no-url" };

  if (!sessionsConfigured) {
    sessionsConfigured = true;
    const playerSession = session.fromPartition("persist:player");
    const trailerSession = session.fromPartition("persist:trailer");
    setupSession(playerSession, trailerSession);
  }

  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.loadURL(url);
    pipWindow.focus();
    return { ok: true };
  }

  pipWindow = new BrowserWindow({
    width: 640,
    height: 360,
    minWidth: 320,
    minHeight: 180,
    alwaysOnTop: true,
    title: title ? `${title} - Pop-out` : "Pop-out Player",
    backgroundColor: "#000000",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    frame: process.platform !== "win32",
    webPreferences: {
      partition: "persist:player",
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "popout-preload.js"),
    },
  });

  pipWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  pipWindow.webContents.on("close", () => {});

  pipWindow.webContents.on("will-navigate", (event, url) => {
    const isLocal =
      url.startsWith("file://") ||
      url.startsWith("http://localhost") ||
      url.startsWith("https://localhost");
    if (!isLocal) {
      event.preventDefault();
    }
  });

  pipWindow.webContents.on("did-attach-webview", (_, wc) => {
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("close", () => {});
  });

  pipWindow.loadURL(url);

  pipWindow.on("maximize", () => {
    if (!pipWindow.isDestroyed())
      pipWindow.webContents.send("popout-window-maximized", true);
  });
  pipWindow.on("unmaximize", () => {
    if (!pipWindow.isDestroyed())
      pipWindow.webContents.send("popout-window-maximized", false);
  });

  const notifyMain = (channel) => {
    const mw = getMainWindow();
    if (mw && !mw.isDestroyed()) mw.webContents.send(channel);
  };

  pipWindow.on("closed", () => {
    pipWindow = null;
    notifyMain("pip-window-closed");
  });

  notifyMain("pip-window-opened");
  return { ok: true };
});

ipcMain.handle("close-pip-window", () => {
  if (pipWindow && !pipWindow.isDestroyed()) pipWindow.close();
});

ipcMain.handle("get-pip-webcontents-id", () => {
  if (pipWindow && !pipWindow.isDestroyed()) return pipWindow.webContents.id;
  return null;
});

// -- Popout window controls ----------------------------------------------------
ipcMain.handle("popout-window-minimize", () => {
  if (pipWindow && !pipWindow.isDestroyed()) pipWindow.minimize();
});
ipcMain.handle("popout-window-toggle-maximize", () => {
  if (!pipWindow || pipWindow.isDestroyed()) return;
  if (pipWindow.isMaximized()) pipWindow.unmaximize();
  else pipWindow.maximize();
});
ipcMain.handle("popout-window-close", () => {
  if (pipWindow && !pipWindow.isDestroyed()) pipWindow.close();
});
ipcMain.handle("popout-window-is-maximized", () => {
  return pipWindow && !pipWindow.isDestroyed()
    ? pipWindow.isMaximized()
    : false;
});

// -- Single-instance lock ------------------------------------------------------
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    _bench("app ready");
    createWindow();
  });

  // FIX: Handle certificate errors globally
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    console.warn('[SSL] Certificate error for:', url, error);
    event.preventDefault();
    callback(true);
  });

  // FIX: only quit when the user intentionally closed — not on webview/renderer crashes
  app.on("window-all-closed", () => {
    if (intentionalQuit) app.quit();
  });

  app.on("activate", () => {
    if (mainWindow === null) createWindow();
  });
}

// CRASH RECEIVER
const _fs = require('fs');
const _os = require('os');
ipcMain.on('renderer-error', function(_, data) {
  const line = new Date().toISOString() + ' MSG=' + data.msg + ' SRC=' + (data.src||'') + ' STACK=' + (data.stack||'') + '\n';
  _fs.appendFileSync(_os.homedir() + '/novaspark-crash.log', line);
  console.error('[RENDERER CRASH]', data.msg, data.src);
});