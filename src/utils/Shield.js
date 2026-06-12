/**
 * ─────────────────────────────────────────────────────────────────────────────
 * NovaShield — Chrome-native 3-layer ad/redirect defense
 * src/utils/shield.js
 *
 * No sandbox. No extensions. No proxy. No backend.
 * Pure browser APIs that work in Chrome 102+.
 *
 * HOW EMBED REDIRECTS WORK (the attack):
 *  ① iframe script calls window.top.location = "https://ad.com"
 *     → hijacks the entire parent page (most dangerous)
 *  ② iframe script calls window.open("https://ad.com")
 *     → opens new tab/window (annoying, Chrome sometimes blocks already)
 *  ③ iframe script navigates the iframe itself to an ad page
 *     → video area shows ad instead of content
 *
 * HOW WE STOP EACH (our defense):
 *  ① Navigation API addEventListener('navigate') → event.preventDefault()
 *     Runs BEFORE the navigation happens. Silent. No dialog. No user sees it.
 *     Chrome 102+. All modern Chrome supports this.
 *  ② Override window.open on parent + track user gesture state
 *     Any window.open not preceded by our own UI interaction = null
 *  ③ iframe 'load' event fires again when iframe self-navigates
 *     Detect second 'load' → immediately reset iframe.src to embed URL
 *
 * WHY THIS WORKS BETTER THAN SANDBOX:
 *  Sandbox breaks players because many embed players use sub-iframes,
 *  orientation locks, and pointer events that sandbox restricts.
 *  These three layers target ONLY the redirect mechanisms, not player features.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Known ad/tracker/redirect domains ────────────────────────────────────────
// Comprehensive list of domains used in embed redirect chains.
// Any navigation to these (from iframe scripts) is silently blocked.
const AD_DOMAINS = new Set([
  // Google ad infrastructure
  'doubleclick.net','googleadservices.com','googlesyndication.com',
  'pagead2.googlesyndication.com','securepubads.g.doubleclick.net',
  'adservice.google.com','ads.google.com',
  // Major ad networks (commonly injected by embed players)
  'adnxs.com','advertising.com','pubmatic.com','rubiconproject.com',
  'openx.net','casalemedia.com','criteo.com','taboola.com','outbrain.com',
  'adsrvr.org','smartadserver.com','indexexchange.com','33across.com',
  'sovrn.com','lijit.com','triplelift.com','sharethrough.com',
  // Popup/popunder specialists (most common in embed players)
  'popads.net','popcash.net','pop.cash','trafficjunky.com','trafficfactory.biz',
  'exoclick.com','juicyads.com','hilltopads.net','propellerads.com',
  'ero-advertising.com','adcash.com','zeropark.com','clickaine.com',
  'sublimemedia.net','instantfwd.com','adf.ly','za.gl','ay.gy',
  'revcontent.com','mgid.com','content.ad','valueclick.com',
  // Specifically observed in embed player redirect chains
  'vsembed.ru','tnaflix.com','hornywatcher.com',
  // Generic redirect/shortener services used in ad chains
  'bit.ly','tinyurl.com','shorte.st','linkvertise.com','exe.io',
  // Tracker pixels and analytics used in ad chains
  'mc.yandex.ru','counter.yadro.ru','hits.dwntsk.com',
  'gemius.pl','scorecardresearch.com','quantserve.com',
]);

// These are the EMBED server domains — never block navigation within them
// (e.g. embed.su navigating to embed.su/player/... is fine)
const TRUSTED_EMBED_ORIGINS = new Set([
  'embed.su','moviesapi.club','vidfast.pro',
  'player.smashy.stream','player.videasy.net',
  'vidlink.pro','vidsrc.cc','vidsrc.fyi',
  'vidsrc.net','vidsrc.to','player.autoembed.cc',
  'allmanga.to','vidsrc.to',
  'vidsrc.wtf',
  'cinepro.cc',
  // CDNs commonly used by embed players (legitimate)
  'cdn.jwplayer.com','ssl.p.jwpcdn.com','cdn.plyr.io',
  'vjs.zencdn.net','player.vimeo.com',
  'www.youtube-nocookie.com',
  // Common video CDN patterns
  'storage.googleapis.com','cloudfront.net','fastly.net',
]);

/**
 * Check if a URL belongs to a known ad/redirect domain.
 * Uses suffix matching so subdomains are caught (e.g. track.popads.net).
 */
function isAdUrl(urlStr) {
  if (!urlStr) return false;
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase().replace(/^www\./, '');
    // Exact match
    if (AD_DOMAINS.has(hostname)) return true;
    // Subdomain match: check if hostname ends with any ad domain
    for (const domain of AD_DOMAINS) {
      if (hostname.endsWith('.' + domain)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Check if a URL is from a trusted embed player domain.
 */
function isTrustedEmbed(urlStr) {
  if (!urlStr) return false;
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase().replace(/^www\./, '');
    if (TRUSTED_EMBED_ORIGINS.has(hostname)) return true;
    for (const domain of TRUSTED_EMBED_ORIGINS) {
      if (hostname.endsWith('.' + domain)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Shield state ──────────────────────────────────────────────────────────────
let _shieldInstalled    = false;
let _originalWindowOpen = null;
let _navHandler         = null;

// Set to true by our own UI navigation calls (Back button, source switch, etc.)
// so the Navigation API guard knows to allow THOSE navigations.
let _ourNavigationAllowed = false;

/**
 * Allow the next navigation (call before any intentional navigation from our UI).
 * e.g. call this before onBack() navigates to the home page.
 */
export function allowNextNavigation() {
  _ourNavigationAllowed = true;
  // Auto-reset after 500ms in case the navigation doesn't happen
  setTimeout(() => { _ourNavigationAllowed = false; }, 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LAYER 1: Navigation API guard
// ─────────────────────────────────────────────────────────────────────────────
function installNavigationGuard(appOrigin) {
  if (!('navigation' in window)) {
    // Navigation API not available (Chrome < 102 or non-Chromium)
    // Fall back to beforeunload approach
    installBeforeUnloadGuard();
    return;
  }

  _navHandler = (event) => {
    const dest = event.destination?.url || '';

    // Always allow navigations WE triggered (Back button, source switch, etc.)
    if (_ourNavigationAllowed) {
      _ourNavigationAllowed = false;
      return; // allow
    }

    // Always allow same-origin navigations (our own SPA routing via React Router etc.)
    try {
      if (appOrigin && new URL(dest).origin === appOrigin) return;
    } catch {}

    // Always allow about:blank (iframe resets use this)
    if (!dest || dest === 'about:blank' || dest === 'about:srcdoc') return;

    // Allow user-initiated navigations to trusted embed domains
    // (e.g. opening embed.su in a new tab manually)
    if (event.userInitiated && isTrustedEmbed(dest)) return;

    // ── Block: ad domain ─────────────────────────────────────────────────────
    if (isAdUrl(dest)) {
      event.preventDefault();
      return;
    }

    // ── Block: any NON-user-initiated external navigation ────────────────────
    // If a script (not the user clicking something) is trying to navigate us
    // to an external URL, it's almost certainly an iframe redirect attack.
    if (!event.userInitiated) {
      try {
        const destOrigin = new URL(dest).origin;
        if (destOrigin !== appOrigin) {
          event.preventDefault();
          return;
        }
      } catch {
        event.preventDefault();
        return;
      }
    }
  };

  // Use capture phase so we get it before any other handler
  window.navigation.addEventListener('navigate', _navHandler, { capture: true });
}

// Fallback for older Chrome: beforeunload
// Less elegant (may show "Leave site?" dialog) but better than nothing.
function installBeforeUnloadGuard() {
  window.addEventListener('beforeunload', (e) => {
    if (_ourNavigationAllowed) {
      _ourNavigationAllowed = false;
      return;
    }
    // If we're in watch mode and didn't initiate this, block it
    if (window.__nsWatchActive) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LAYER 2: window.open nullifier
// ─────────────────────────────────────────────────────────────────────────────
// Note: cross-origin iframes have their OWN window.open — we cannot override that.
// This catches cases where embed scripts call window.top.open("ad") or
// where a first-party script (injected into our page by an ad relay) tries to open.
function installOpenNullifier() {
  _originalWindowOpen = window.open.bind(window);

  window.open = function(url, target, features) {
    // If URL is a known ad domain — always block
    if (url && isAdUrl(String(url))) {
      return null;
    }
    // Allow if we explicitly said to (e.g. opening a trailer)
    if (window._nsAllowOpen) {
      window._nsAllowOpen = false;
      return _originalWindowOpen(url, target, features);
    }
    // Block all other programmatic window.open calls while in watch mode
    if (window.__nsWatchActive) {
      return null;
    }
    return _originalWindowOpen(url, target, features);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Activate NovaShield.
 * Call once at app startup. Installs Layers 1 and 2 globally.
 * Idempotent — safe to call multiple times.
 *
 * @param {string} appOrigin - Your app's origin (e.g. "http://localhost:5173")
 *   Used to distinguish your own SPA navigations from iframe redirect attacks.
 *   Defaults to window.location.origin.
 */
export function activateShield(appOrigin = window.location.origin) {
  if (_shieldInstalled) return;
  _shieldInstalled = true;

  // Don't run in Electron — Electron's webRequest handles everything
  if (typeof window !== 'undefined' && window?.electron) return;

  installNavigationGuard(appOrigin);
  installOpenNullifier();
}

/**
 * Deactivate NovaShield.
 * Restores original window.open. Removes navigation listener.
 * Call when the user is not in watch mode (optional — shield is lightweight).
 */
export function deactivateShield() {
  if (!_shieldInstalled) return;
  _shieldInstalled = false;

  if (_navHandler && 'navigation' in window) {
    window.navigation.removeEventListener('navigate', _navHandler, { capture: true });
    _navHandler = null;
  }

  if (_originalWindowOpen) {
    window.open = _originalWindowOpen;
    _originalWindowOpen = null;
  }

  window.__nsWatchActive = false;
}

/**
 * Enter watch mode — tightens the shield while the player is visible.
 * Call when WatchPage mounts. The shield is stricter in watch mode.
 */
export function enterWatchMode() {
  window.__nsWatchActive = true;
}

/**
 * Exit watch mode — relaxes the shield for normal browsing.
 * Call when WatchPage unmounts.
 */
export function exitWatchMode() {
  window.__nsWatchActive = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LAYER 3: iframe self-redirect reset guard
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Watches an iframe for self-navigation attacks.
 *
 * Attack vector: embed script sets window.location (or document.location)
 * inside the iframe to redirect the iframe's own content to an ad page.
 * This replaces the video with an ad page. The iframe fires a second 'load'
 * event when this happens.
 *
 * Defense: on every 'load' event after the first one, immediately reset
 * the iframe's src back to the original embed URL.
 *
 * @param {HTMLIFrameElement} iframeEl - the iframe element
 * @param {string} embedUrl            - the correct embed URL to reset to
 * @param {Function} [onRedirectCaught] - callback when a redirect is caught
 * @returns {Function} cleanup — call to stop watching (on unmount)
 */
export function watchIframe(iframeEl, embedUrl, onRedirectCaught) {
  if (!iframeEl || typeof window === 'undefined' || window?.electron) {
    return () => {};
  }

  let loadCount     = 0;
  let currentUrl    = embedUrl;
  let resetPending  = false;

  const handleLoad = () => {
    loadCount++;

    if (loadCount === 1) {
      // First load: expected — the embed player loaded normally.
      return;
    }

    // Second or later load: the iframe navigated somewhere new.
    // This is almost always an ad redirect.
    // Exception: we just reset it ourselves (resetPending flag prevents loop).
    if (resetPending) {
      resetPending = false;
      return;
    }

    // ── Redirect caught — reset immediately ─────────────────────────────────
    resetPending = true;
    loadCount    = 0; // reset counter so next real load is treated as first

    // Step 1: blank the iframe (stops any scripts the ad page is running)
    iframeEl.src = 'about:blank';

    // Step 2: restore original embed URL after a brief pause
    // (50ms is enough for about:blank to fully load)
    setTimeout(() => {
      if (iframeEl) {
        iframeEl.src = currentUrl;
        onRedirectCaught?.();
      }
    }, 50);
  };

  iframeEl.addEventListener('load', handleLoad);

  // Return cleanup function
  return function cleanup() {
    iframeEl.removeEventListener('load', handleLoad);
  };
}

/**
 * Update the embed URL that the iframe watcher resets to.
 * Call this when the user switches server or episode — returns a NEW watcher.
 * Always call cleanup() on the old watcher first.
 */
export { watchIframe as createIframeGuard };

// ─────────────────────────────────────────────────────────────────────────────
// ── BONUS: postMessage ad-signal filter
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Some embed players send postMessages with URL parameters that trigger
 * redirect behavior in poorly-written wrapper apps. This filter sits between
 * the iframe postMessages and our own message handler to strip ad signals.
 *
 * Install this once globally. It wraps window.addEventListener so that any
 * 'message' handler registered after this point gets pre-filtered messages.
 */
export function installPostMessageFilter() {
  if (window.__nsPostMessageFilter) return;
  window.__nsPostMessageFilter = true;

  const _addEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, handler, options) {
    if (type === 'message' && this === window) {
      const filtered = function(event) {
        // Block postMessages from known ad origins
        try {
          const origin = event.origin || '';
          if (isAdUrl(origin + '/')) return; // block message entirely
        } catch {}

        // Block messages that contain redirect URLs
        try {
          const data = typeof event.data === 'string' 
            ? JSON.parse(event.data) 
            : event.data;
          if (data && typeof data === 'object') {
            const url = data.url || data.redirect || data.href || data.location || '';
            if (url && isAdUrl(String(url))) return; // block message
          }
        } catch {}

        handler.call(this, event);
      };
      return _addEventListener.call(this, type, filtered, options);
    }
    return _addEventListener.call(this, type, handler, options);
  };
}