// sw.js — NovaSpark Ad-Killer Service Worker · v2.0
// Intercepts every network request on the page — including those from embed iframes.
// Registered early in index.html so it is active BEFORE any content loads.
// This is what makes ad-free mode actually work.

const SW_VERSION = "ns-sw-2.0";
const CACHE_NAME = `novaspark-${SW_VERSION}`;

// ─── Ad & tracker hostnames — return instant empty 200 ───────────────────────
const AD_HOSTS = new Set([
  // Google ad ecosystem
  "doubleclick.net","googlesyndication.com","googleadservices.com",
  "adservice.google.com","pagead2.googlesyndication.com","adwords.google.com",
  "ads.google.com","googletagmanager.com","google-analytics.com",
  "analytics.google.com","stats.g.doubleclick.net",

  // Major video/streaming ad networks
  "juicyads.com","www.juicyads.com","trafficjunky.net","www.trafficjunky.net",
  "exoclick.com","www.exoclick.com","plugrush.com","hilltopads.net",
  "clickaine.com","adsterra.com","propellerads.com","www.propellerads.com",
  "realsrv.com","adspyglass.com","popads.net","popcash.net",
  "a-ads.com","coinzilla.io","admaven.com","rtmark.net",
  "adnxs.com","amazon-adsystem.com","ads.yahoo.com",
  "advertising.com","openx.net","rubiconproject.com","pubmatic.com",
  "criteo.com","taboola.com","outbrain.com","revcontent.com",

  // Popup/redirect services
  "go.redirectingat.com","shrinkme.io","adfoc.us","adf.ly","shink.me",
  "bc.vc","linkshrink.net","shorte.st","adfoc.us","bit.ly" /* conditional - see URL check */,

  // Tracking & analytics
  "hotjar.com","mixpanel.com","segment.io","segment.com","amplitude.com",
  "optimizely.com","crazyegg.com","fullstory.com","logrocket.com",
  "connect.facebook.net","pixel.facebook.com","tr.snapchat.com",
  "analytics.twitter.com","static.ads-twitter.com","bat.bing.com",

  // Streaming-site-specific ad servers
  "streamwreck.com","adincognito.com","videodivx.top","ads4.eu",
  "click4tds.com","tds.sly.io","popunder.xyz","xpopup.com",
  "tpc.googlesyndication.com","gads.g.doubleclick.net",
  "fundingchoicesmessages.google.com",

  // Notification/push spam
  "onesignal.com","pushcrew.com","subscribers.com","push.io",
  "webpushr.com","gravitec.net","sendpulse.com",
]);

// ─── URL patterns that indicate ad/tracker even if not in host list ───────────
const AD_URL_PATTERNS = [
  /\/ads?\//i, /\/adserver\//i, /\/banner\//i, /\/popunder\//i,
  /\/pop\.php/i, /\/popup\.js/i, /\/interstitial/i,
  /[?&]ad_id=/i, /[?&]campaign_id=/i, /[?&]click_id=/i,
  /\/pixel\.(gif|png|js)/i, /\/beacon\.(gif|png|js)/i,
  /[?&]utm_source=ad/i, /\/track\//i,
  /\.php\?.*redirect/i, /go\.php\?/i,
  // Streaming embed ad patterns
  /\/vast\b/i, /\/vpaid\b/i, /ima3\.js/i, /\/ad\.js/i,
  /adbreaker/i, /adblock.*detection/i, /antiadblock/i,
];

// ─── Whitelist — never block these even if hostname matches ──────────────────
const ALWAYS_ALLOW_HOSTS = new Set([
  "api.themoviedb.org","image.tmdb.org","api.groq.com",
  "generativelanguage.googleapis.com","api.cohere.com",
  "api.mistral.ai","api.deepseek.com","openrouter.ai",
  "api.sambanova.ai","api.together.xyz","api.paystack.co",
  "novasparks.xyz","novaspark.app","novasparks.app",
]);

// ─── Empty responses for blocked requests ─────────────────────────────────────
const EMPTY_JS  = new Response("(function(){})()", { status:200, headers:{"Content-Type":"application/javascript"} });
const EMPTY_IMG = new Response(new Uint8Array(0), { status:200, headers:{"Content-Type":"image/gif"} });
const EMPTY_ANY = new Response("", { status:200, headers:{"Content-Type":"text/plain"} });

function isBlocked(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return false; }

  const host = parsed.hostname.replace(/^www\./,"");
  const path = parsed.pathname + parsed.search;

  // Never block whitelisted
  if (ALWAYS_ALLOW_HOSTS.has(host)) return false;
  // Check known ad hosts
  if (AD_HOSTS.has(host)) return true;
  // Check parent domains (e.g. ads.somenetwork.net → somenetwork.net)
  const parts = host.split(".");
  for (let i=1; i<parts.length-1; i++) {
    if (AD_HOSTS.has(parts.slice(i).join("."))) return true;
  }
  // Check URL patterns
  if (AD_URL_PATTERNS.some(p => p.test(path))) return true;
  return false;
}

function blockedResponse(url) {
  const u = url.toLowerCase();
  if (u.endsWith(".js") || u.includes(".js?") || u.includes("javascript")) return EMPTY_JS.clone();
  if (u.match(/\.(gif|png|jpg|jpeg|webp|svg|ico)(\?|$)/i)) return EMPTY_IMG.clone();
  return EMPTY_ANY.clone();
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
self.addEventListener("install", (e) => {
  self.skipWaiting(); // activate immediately, don't wait
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // take control of all open pages immediately
  );
});

// ─── Fetch intercept — the core ad blocker ───────────────────────────────────
self.addEventListener("fetch", (e) => {
  const url = e.request.url;

  // ── Block known ad/tracker requests ─────────────────────────────────────────
  if (isBlocked(url)) {
    e.respondWith(blockedResponse(url));
    return;
  }

  // ── Block notification permission prompts ────────────────────────────────────
  if (url.includes("push-notification") || url.includes("web-push")) {
    e.respondWith(EMPTY_ANY.clone());
    return;
  }

  // ── Cache static NovaSpark assets (fonts, icons, SW itself) ─────────────────
  if (e.request.method === "GET" && url.includes(self.location.origin)) {
    const parsed = new URL(url);
    const ext = parsed.pathname.split(".").pop().toLowerCase();
    if (["woff","woff2","ttf","svg","ico","png"].includes(ext)) {
      e.respondWith(
        caches.open(CACHE_NAME).then(cache =>
          cache.match(e.request).then(hit => {
            if (hit) return hit;
            return fetch(e.request).then(res => {
              if (res.ok) cache.put(e.request, res.clone());
              return res;
            }).catch(() => new Response("", { status:503 }));
          })
        )
      );
      return;
    }
  }

  // ── Everything else: pass through normally ────────────────────────────────────
  // Don't touch streaming video requests — let them flow at full speed
  e.respondWith(fetch(e.request));
});

// ─── Message handler — allows page to communicate with SW ────────────────────
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (e.data?.type === "CLEAR_CACHE") {
    caches.delete(CACHE_NAME).then(() => {
      e.ports[0]?.postMessage({ ok: true });
    });
  }
});