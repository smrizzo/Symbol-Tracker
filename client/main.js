const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Production: fixed userData path so requestSingleInstanceLock works correctly
// (the lock file lives in userData — a pid-based path gives every process its
// own directory, defeating the lock entirely).
// Dev: pid-based path to allow running multiple test instances side by side.
if (app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'SymbolTracker'));
} else {
  app.setPath('userData', path.join(
    app.getPath('appData'),
    'SymbolTracker-' + (process.env.INSTANCE_ID || process.pid)
  ));
}
app.commandLine.appendSwitch('--disable-gpu-shader-disk-cache');

// Enforce single instance — prevents two copies running simultaneously during
// an update restart. Quit immediately if another instance already holds the lock.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// If a second instance is launched while we're running (e.g. user double-clicks
// the shortcut again), bring the existing window to the front instead.
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

let mainWindow;
let isInteractive = true;
let currentRole = null;
let isUpdating = false;

function createWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  // Login size — tall enough for all fields including the session token input
  const windowWidth = 320;
  const windowHeight = 370;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: screenWidth - windowWidth - 20,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    minWidth: 320,
    minHeight: 320,
    maxWidth: 1200,
    maxHeight: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  mainWindow.loadFile('index.html');

  // Start in interactive mode so user can log in
  // Click-through mode can be toggled with Ctrl+Shift+S

  // Register global shortcut Ctrl+Shift+S to toggle interactive mode
  globalShortcut.register('Ctrl+Shift+S', () => {
    isInteractive = !isInteractive;
    mainWindow.setIgnoreMouseEvents(!isInteractive, { forward: true });
    mainWindow.webContents.send('mode-changed', isInteractive);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handle role changes to resize window
ipcMain.on('role-changed', (event, role) => {
  currentRole = role;
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  let windowWidth, windowHeight, minHeight;

  if (role === 'admin' || role === 'leader') {
    windowWidth = role === 'admin' ? 560 : 420;
    windowHeight = role === 'admin' ? 480 : 600;
    minHeight = role === 'admin' ? 400 : 420;
  } else {
    windowWidth = 320;
    windowHeight = 320;
    minHeight = 320;
  }

  mainWindow.setMinimumSize(320, minHeight);
  mainWindow.setSize(windowWidth, windowHeight);
  mainWindow.setPosition(screenWidth - windowWidth - 20, 20);
});

// Handle returning to login screen
ipcMain.on('reset-window', () => {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  // Reset to login size
  mainWindow.setSize(320, 460);
  mainWindow.setPosition(screenWidth - 340, 20);
});

// Get assets path
ipcMain.handle('get-assets-path', () => {
  // In development, assets are in parent directory
  // In production (packaged), they're in resources/assets
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets');
  }
  return path.join(__dirname, '..', 'assets');
});

// Get window size
ipcMain.handle('get-window-size', () => {
  if (!mainWindow) return { width: 320, height: 320 };
  const bounds = mainWindow.getBounds();
  return { width: bounds.width, height: bounds.height };
});

// Set window size
ipcMain.on('set-window-size', (event, { width, height }) => {
  if (!mainWindow) return;
  mainWindow.setSize(
    Math.max(300, Math.min(1200, width)),
    Math.max(300, Math.min(900, height))
  );
});

// Quit app
ipcMain.on('quit-app', () => {
  app.quit();
});

// Restart and install downloaded update.
// Give the renderer 1.5 s to disconnect its socket and show the restarting
// message, then hand off to the installer.
ipcMain.on('restart-to-update', () => {
  isUpdating = true;
  globalShortcut.unregisterAll();
  setTimeout(() => {
    autoUpdater.quitAndInstall(false, true);
  }, 1500);
});

app.whenReady().then(() => {
  createWindow();

  // Auto-update only runs in the packaged app — no update server in dev
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;

    autoUpdater.on('update-available', (info) => {
      console.log(`[UPDATER] Update available: ${info.version}`);
      if (mainWindow) mainWindow.webContents.send('update-available', info);
    });

    autoUpdater.on('download-progress', (progress) => {
      console.log(`[UPDATER] Download progress: ${Math.floor(progress.percent)}%`);
      if (mainWindow) mainWindow.webContents.send('download-progress', progress);
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[UPDATER] Update downloaded: ${info.version}`);
      if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
    });

    autoUpdater.checkForUpdates();
  }
});

app.on('window-all-closed', () => {
  // During an update the window may close before quitAndInstall fires —
  // don't quit the process early or the installer never gets to run.
  if (isUpdating) return;
  globalShortcut.unregisterAll();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
