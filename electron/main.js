const { app, BrowserWindow, Menu, ipcMain, Notification, shell, session } = require('electron');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const fs   = require('fs');

// ── Persistent per-installation JWT secret ───────────────────────────────
// Generated once on first launch and stored in userData so tokens survive
// app restarts but are unique per machine.
function ensureJwtSecret(userData) {
  const secretFile = path.join(userData, 'jwt.secret');

  // Try to read existing persisted secret
  try {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch (_) {}

  // Generate a strong new secret
  const secret = crypto.randomBytes(48).toString('hex');

  // Try to persist it (best-effort; if it fails we use a deterministic fallback next time)
  try {
    fs.mkdirSync(userData, { recursive: true });
    // Write without mode flag for Windows compatibility, then verify
    fs.writeFileSync(secretFile, secret);
    // Verify the write succeeded
    const verify = fs.readFileSync(secretFile, 'utf8').trim();
    if (verify !== secret) throw new Error('Verify mismatch');
  } catch (e) {
    console.error('Could not persist JWT secret, using deterministic fallback:', e.message);
    // Deterministic fallback: hash the userData path with a fixed salt.
    // This is stable per-machine even without file I/O.
    return crypto.createHash('sha256').update('dmxgram-v1-' + userData).digest('hex');
  }

  return secret;
}

// Enable high refresh rate rendering (120fps+ for GIFs and animations)
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('force-high-performance-gpu');

let mainWindow   = null;
let splashWindow = null;
let updateWindow = null;

// ── Wait until the Express server is responding ───────────────────────────
function waitForServer(retries = 60) {
  return new Promise((resolve, reject) => {
    function attempt(remaining) {
      const req = http.get('http://localhost:3001/api/health', (res) => {
        if (res.statusCode === 200) return resolve();
        tryAgain(remaining);
      });
      req.on('error', () => tryAgain(remaining));
      req.setTimeout(500, () => { req.destroy(); tryAgain(remaining); });
    }
    function tryAgain(remaining) {
      if (remaining <= 0) return reject(new Error('Server failed to start in time'));
      setTimeout(() => attempt(remaining - 1), 500);
    }
    attempt(retries);
  });
}

let serverStartError = null;

// ── Start Express server inside Electron's Node.js process ───────────────
function startServer() {
  const serverRoot = path.join(__dirname, '..', 'server');
  // Set env before requiring so dotenv / process.env picks them up
  process.env.PORT        = process.env.PORT        || '3001';
  process.env.NODE_ENV    = process.env.NODE_ENV    || 'production';

  // Writable user-data directory (AppData/Roaming/DMXGram on Windows)
  const userData = app.getPath('userData');
  // Use a strong, persistent, per-installation JWT secret (never a hardcoded string)
  process.env.JWT_SECRET  = process.env.JWT_SECRET  || ensureJwtSecret(userData);

  process.env.DB_DATA_PATH  = path.join(userData, 'data');
  process.env.UPLOADS_PATH  = path.join(userData, 'uploads');

  // ── Locate client/dist reliably ─────────────────────────────────────────
  // Try candidates in order until index.html is found.
  // process.resourcesPath is the most reliable for packaged apps.
  const candidatePaths = [
    // Packaged (asar): resources/app.asar.unpacked/client/dist
    path.join(process.resourcesPath, 'app.asar.unpacked', 'client', 'dist'),
    // Packaged (no-asar): resources/app/client/dist
    path.join(process.resourcesPath, 'app', 'client', 'dist'),
    // Dev / legacy path via getAppPath()
    path.join(app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked'), 'client', 'dist'),
    // Fallback relative to this file (dev)
    path.join(__dirname, '..', 'client', 'dist'),
  ];

  const clientDist = candidatePaths.find(p => {
    try { return fs.existsSync(path.join(p, 'index.html')); } catch (_) { return false; }
  }) || candidatePaths[0]; // use first candidate even if not found (server will log error)

  process.env.CLIENT_DIST_PATH = clientDist;

  // Supabase credentials – must be set BEFORE requiring server because
  // TypeScript compiles imports to require() calls that run before dotenv.config()
  process.env.SUPABASE_URL              = process.env.SUPABASE_URL              || 'https://ablmfqqlpbvppviwozxa.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibG1mcXFscGJ2cHB2aXdvenhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYwMjQ0OSwiZXhwIjoyMDg3MTc4NDQ5fQ._pQagB_5-qVN6Wz13DAROhL1BbDTiMNedfwJSixM03E';

  // Resend email API key — paste your key from resend.com/api-keys
  process.env.RESEND_API_KEY   = process.env.RESEND_API_KEY   || 're_bRM7JFSS_6xr9EgR6XvuMNSGE2Q8F4iWY';
  process.env.RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'DMXGram <noreply@svnhost.pl>';

  process.env.STRIPE_SECRET_KEY  = process.env.STRIPE_SECRET_KEY  || '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';
  process.env.STRIPE_PUBLIC_KEY  = process.env.STRIPE_PUBLIC_KEY  || 'pk_live_51T3jvfFlcY9Rqc9FuzZS7hJ1iuC65J967NPW38pFLHHWAt0Y2GJ4964oXOOvKxGDxVKMGOMSvU346Vwd1NtTustk00zy9vS5mP';

  // Change cwd so any remaining relative paths resolve correctly
  try { process.chdir(serverRoot); } catch (_) {}

  // Log startup info to a file for debugging packaged-app issues
  const logFile = path.join(app.getPath('userData'), 'startup.log');
  const log = (msg) => { try { fs.appendFileSync(logFile, new Date().toISOString() + ' ' + msg + '\n'); } catch(_){} };
  log('--- SERVER STARTUP ---');
  log('serverRoot: ' + serverRoot);
  log('CLIENT_DIST_PATH: ' + process.env.CLIENT_DIST_PATH);
  log('resourcesPath: ' + process.resourcesPath);
  log('appPath: ' + app.getAppPath());
  log('__dirname: ' + __dirname);
  log('cwd: ' + process.cwd());
  log('NODE_ENV: ' + process.env.NODE_ENV);
  log('PORT: ' + process.env.PORT);

  // Require compiled server – this starts Express + Socket.IO
  try {
    log('Requiring server...');
    require('../server/dist/index.js');
    log('Server required OK');
  } catch (err) {
    serverStartError = err;
    log('SERVER STARTUP FAILED: ' + err.message);
    log(err.stack || '(no stack)');
    console.error('SERVER STARTUP FAILED:', err.message, err.stack);
  }
}

// ── Splash screen ─────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 440,
    height: 440,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
}

// ── Update progress window ────────────────────────────────────────────────
function showUpdateWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();

  updateWindow = new BrowserWindow({
    width: 440,
    height: 340,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  updateWindow.loadFile(path.join(__dirname, 'update-progress.html'));
  updateWindow.center();
}

// ── Main application window ───────────────────────────────────────────────
function createMain() {
  const iconPath = path.join(__dirname, '..', 'client', 'public', 'logo.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    show: true,
    frame: false,
    // Dark window background from frame 0 — Electron paints this color before ANY HTML loads
    backgroundColor: '#1a1a1a',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });

  // Forward maximize / unmaximize state to renderer for titlebar icon
  mainWindow.on('maximize',   () => mainWindow.webContents.send('maximized-change', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('maximized-change', false));

  // CSP removed — Electron desktop app doesn't need restrictive CSP,
  // and it was blocking Supabase avatars + potentially JS/CSS resources.
  // Helmet on Express also has CSP disabled.

  mainWindow.setContentProtection(true);
  mainWindow.maximize();

  // Load the React app from Express. Simple and direct.
  mainWindow.loadURL('http://localhost:3001');

  // If page fails to load, retry up to 5 times then show visible error
  let failCount = 0;
  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('did-fail-load #' + (++failCount) + ':', code, desc);
    if (failCount >= 3) {
      // Show a visible diagnostic page directly in the window
      const srvErr = serverStartError ? serverStartError.message + '\n' + (serverStartError.stack || '') : '(brak – serwer uruchomiony OK)';
      const errHtml = `data:text/html;charset=utf-8,` + encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f0f0f;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:2rem;text-align:center}
h2{color:#dc2626;font-size:1.4rem;margin-bottom:1rem}
label{font-size:0.7rem;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.25rem;display:block;text-align:left;max-width:640px;width:100%}
.code{background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:1rem;color:#f87171;font-family:monospace;font-size:0.75rem;max-width:640px;width:100%;text-align:left;white-space:pre-wrap;word-break:break-all;margin-bottom:1rem}
.green{color:#4ade80}
button{padding:0.6rem 1.5rem;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;margin:0.5rem;margin-top:1rem}
</style></head><body>
<h2>&#x26A0; DMXGram – serwer nie odpowiada</h2>
<label>Błąd sieci (loadURL):</label>
<div class="code">Kod: ${code}\nOpis: ${desc}\nPróby: ${failCount}\nAdres: http://localhost:3001</div>
<label>Błąd startu serwera Express:</label>
<div class="code">${srvErr}</div>
<button onclick="fetch('http://localhost:3001/api/health').then(r=>r.ok?location.replace('http://localhost:3001'):0).catch(e=>document.querySelector('.code').textContent+='\nFetch: '+e)">Sprawdź ponownie</button>
</body></html>`);
      mainWindow.loadURL(errHtml);
      failCount = 0; // reset so next retry works
    } else {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL('http://localhost:3001');
        }
      }, 1500);
    }
  });

  // F11 toggles fullscreen, F12 opens DevTools for debugging
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
      event.preventDefault();
    }
  });

  // Forward renderer console errors to main process for debugging
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[Renderer L${level}] ${message} (${sourceId}:${line})`);
  });

  // If renderer process crashes entirely — show dialog
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    const { dialog } = require('electron');
    dialog.showErrorBox('DMXGram – błąd', `Renderer crashed: ${details.reason}\nExitCode: ${details.exitCode}`);
  });

  // After page loads, inject a global error handler to catch uncaught JS errors
  mainWindow.webContents.on('dom-ready', () => {
    mainWindow.webContents.executeJavaScript(`
      window.__dmxErrorShown = false;
      window.onerror = function(msg, src, line, col, err) {
        if (window.__dmxErrorShown) return;
        window.__dmxErrorShown = true;
        var d = document.getElementById('root');
        if (d && !d.children.length) {
          d.innerHTML = '<div style="position:fixed;inset:0;background:#0f0f0f;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;padding:2rem;text-align:center;">' +
            '<h2 style="color:#dc2626;margin-bottom:1rem">DMXGram – błąd startu</h2>' +
            '<pre style="background:#1a1a1a;padding:1rem;border-radius:8px;color:#f87171;max-width:90%;overflow:auto;font-size:0.75rem;text-align:left">' + msg + '\\n' + src + ':' + line + '</pre>' +
            '<button onclick="location.reload()" style="margin-top:1.5rem;padding:0.6rem 1.5rem;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem">Odśwież</button>' +
            '</div>';
        }
      };
    `).catch(() => {});
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  setTimeout(() => initAutoUpdater(), 5000);
}

// ── Auto-updater ──────────────────────────────────────────────────────────
function initAutoUpdater() {
  let autoUpdater;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (e) {
    return; // not available in dev
  }

  autoUpdater.autoDownload         = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger               = null;

  let downloading = false;

  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version:     info.version,
        releaseDate: info.releaseDate,
      });
      // Bring window to front so the blocking modal is visible
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Use ipcMain.on (not .once) so it works for every app session
  ipcMain.on('download-update', () => {
    if (downloading) return;
    downloading = true;
    autoUpdater.downloadUpdate().catch((err) => {
      console.error('Download failed:', err.message);
      downloading = false;
    });
  });

  autoUpdater.on('download-progress', (p) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', p);
    }
  });

  autoUpdater.on('update-downloaded', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {});
    }
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 2500);
  });

  autoUpdater.on('error', () => { downloading = false; }); // reset on error

  // Check immediately on launch, then every 15 minutes
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 15 * 60 * 1000);
}

// ── Window controls (custom titlebar) ─────────────────────────────────────
ipcMain.on('window-minimize', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
});
ipcMain.on('window-close', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close(); });
ipcMain.handle('window-is-maximized', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  return mainWindow.isMaximized();
});

// ── Open URL in system browser ────────────────────────────────────────────
ipcMain.on('open-external', (_, url) => {
  shell.openExternal(url);
});

// ── Desktop notifications ────────────────────────────────────────────────
ipcMain.on('show-notification', (_, { title, body }) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title,
    body,
    icon: path.join(__dirname, '..', 'client', 'public', 'logo.png'),
    silent: false,
  });
  n.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  n.show();
});

// ── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  createSplash();

  try {
    startServer();
  } catch (err) {
    console.error('startServer threw:', err.message);
  }

  try {
    await waitForServer();
  } catch (err) {
    console.error('Server did not respond in time:', err.message);
  }

  // ── Close splash HERE, unconditionally, before opening main window ──────
  // This is the ONLY place splash is closed. No timers, no events, no race conditions.
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }

  createMain();
});

app.on('window-all-closed', () => {
  app.quit();
});
