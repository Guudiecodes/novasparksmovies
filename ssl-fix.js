const { app, session } = require('electron');

// FIX: Bypass strict SSL checks for streaming CDNs that fail handshake
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');
app.commandLine.appendSwitch('disable-features', 'IsolateOrigins,site-per-process');

// FIX: Handle certificate errors gracefully instead of crashing
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
  console.warn('[SSL] Certificate error bypassed for:', url);
});

// FIX: Log all network errors to identify which stream host fails
app.whenReady().then(() => {
  session.defaultSession.webRequest.onErrorOccurred((details) => {
    if (details.error && !details.error.includes('ERR_ABORTED')) {
      console.error('[NET] Request failed:', details.url, '| Error:', details.error);
    }
  });
});
