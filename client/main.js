const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');

// Give each instance its own cache dir to avoid GPU cache conflicts when
// running multiple instances simultaneously.
app.setPath('userData', path.join(
  app.getPath('appData'),
  'SymbolTracker-' + (process.env.INSTANCE_ID || process.pid)
));
app.commandLine.appendSwitch('--disable-gpu-shader-disk-cache');

let mainWindow;
let isInteractive = true;
let currentRole = null;

function createWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  // Default to raider size, will resize based on role
  const windowWidth = 320;
  const windowHeight = 320;

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

  // Reset to raider size for login screen
  mainWindow.setSize(320, 380);
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
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
