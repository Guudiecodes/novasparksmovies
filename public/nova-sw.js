/**
 * nova-sw.js - NovaStream Service Worker
 * Intercepts iframe network requests, captures stream URLs, blocks ads
 */
const STREAM_PATTERNS = [/\.m3u8(\?.*)?$/i,/\.mp4(\?.*)?$/i,/\/manifest(\?.*)?$/i,/\/playlist(\?.*)?$/i,/hls\//i];
const AD_PATTERNS = [/doubleclick\.net/i,/googlesyndication/i,/adservice\.google/i,/exoclick/i,/trafficjunky/i,/propellerads/i,/adsterra/i,/popads/i,/clickadu/i];
const captured = new Set();
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const url = e.request.url;
  if (AD_PATTERNS.some(p => p.test(url))) { e.respondWith(new Response("",{status:204})); return; }
  if (e.request.mode === "navigate" && e.request.destination === "document") {
    const ref = e.request.referrer || "";
    if (ref && !ref.includes("localhost") && !ref.includes("127.0.0.1")) { e.respondWith(new Response("",{status:204})); return; }
  }
  if (STREAM_PATTERNS.some(p => p.test(url)) && !captured.has(url)) {
    captured.add(url);
    self.clients.matchAll({includeUncontrolled:true}).then(clients => clients.forEach(c => c.postMessage({type:"NOVA_STREAM_CAPTURED",url,ts:Date.now()})));
  }
});
