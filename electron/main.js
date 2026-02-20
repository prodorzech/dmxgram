const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

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

  autoUpdater.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version:     info.version,
        releaseDate: info.releaseDate,
      });
    }
  });

  ipcMain.once('download-update', () => {
    showUpdateWindow();
    autoUpdater.downloadUpdate().catch((err) => {
      console.error('Download failed:', err.message);
    });
  });

  autoUpdater.on('download-progress', (p) => {
    if (updateWindow && !updateWindow.isDestroyed()) {
      updateWindow.webContents
        .executeJavaScript(`updateProgress(${p.percent},${p.transferred},${p.total},${p.bytesPerSecond})`)
        .catch(() => {});
    }
  });

  autoUpdater.on('update-downloaded', () => {
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 1500);
  });

  autoUpdater.on('error', () => {}); // silence – expected if no publish config

  autoUpdater.checkForUpdates().catch(() => {});
}

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
