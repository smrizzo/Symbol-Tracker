const { ipcRenderer } = require('electron');

// Expose electronAPI to window
window.electronAPI = {
  onModeChanged: (callback) => ipcRenderer.on('mode-changed', (event, isInteractive) => callback(isInteractive)),
  notifyRoleChanged: (role) => ipcRenderer.send('role-changed', role),
  resetWindow: () => ipcRenderer.send('reset-window'),
  getAssetsPath: () => ipcRenderer.invoke('get-assets-path'),
  getWindowSize: () => ipcRenderer.invoke('get-window-size'),
  setWindowSize: (width, height) => ipcRenderer.send('set-window-size', { width, height }),
  quitApp: () => ipcRenderer.send('quit-app'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, info) => callback(info)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (event, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, info) => callback(info)),
  restartToUpdate: () => ipcRenderer.send('restart-to-update')
};
