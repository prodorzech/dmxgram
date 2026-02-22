const { app, BrowserWindow, Menu, ipcMain, Notification } = require('electron');
const path = require('path');
const http = require('http');

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

// ── Start Express server inside Electron's Node.js process ───────────────
function startServer() {
  const serverRoot = path.join(__dirname, '..', 'server');
  // Set env before requiring so dotenv / process.env picks them up
  process.env.PORT        = process.env.PORT        || '3001';
  process.env.NODE_ENV    = process.env.NODE_ENV    || 'production';
  process.env.JWT_SECRET  = process.env.JWT_SECRET  || 'dmxgram_super_secret_key_2024';

  // Writable user-data directory (AppData/Roaming/DMXGram on Windows)
  const userData = app.getPath('userData');
  process.env.DB_DATA_PATH  = path.join(userData, 'data');
  process.env.UPLOADS_PATH  = path.join(userData, 'uploads');

  // When asar is enabled, client/dist is unpacked to app.asar.unpacked/
  // When asar is disabled (dev/zip), it's just next to the app directory
  const appPath = app.getAppPath(); // e.g. .../resources/app.asar  or .../resources/app
  const isAsar = appPath.endsWith('app.asar');
  const basePath = isAsar ? appPath.replace('app.asar', 'app.asar.unpacked') : appPath;
  process.env.CLIENT_DIST_PATH = path.join(basePath, 'client', 'dist');

  // Supabase credentials – must be set BEFORE requiring server because
  // TypeScript compiles imports to require() calls that run before dotenv.config()
  process.env.SUPABASE_URL              = process.env.SUPABASE_URL              || 'https://ablmfqqlpbvppviwozxa.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibG1mcXFscGJ2cHB2aXdvenhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTYwMjQ0OSwiZXhwIjoyMDg3MTc4NDQ5fQ._pQagB_5-qVN6Wz13DAROhL1BbDTiMNedfwJSixM03E';

  // Resend email API key — paste your key from resend.com/api-keys
  process.env.RESEND_API_KEY   = process.env.RESEND_API_KEY   || 're_bRM7JFSS_6xr9EgR6XvuMNSGE2Q8F4iWY';
  process.env.RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'DMXGram <noreply@dmxgram.eu>';

  // Change cwd so any remaining relative paths resolve correctly
  try { process.chdir(serverRoot); } catch (_) {}

  // Require compiled server – this starts Express + Socket.IO
  require('../server/dist/index.js');
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
    show: false,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });

  mainWindow.loadURL('http://localhost:3001');

  // F11 toggles fullscreen
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.maximize();
    mainWindow.show();
    mainWindow.focus();

    // Check for updates ~3 s after the window is visible
    setTimeout(() => initAutoUpdater(), 3000);
  });

  mainWindow.on('closed', () => { mainWindow = null; });
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
  startServer();

  try {
    await waitForServer();
    createMain();
  } catch (err) {
    console.error('Could not start server:', err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
