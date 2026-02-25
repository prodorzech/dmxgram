const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Update events → renderer
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, info)     => cb(info)),
  onUpdateProgress:   (cb) => ipcRenderer.on('update-progress',   (_, progress) => cb(progress)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded',  (_, info)     => cb(info)),

  // Renderer → main
  downloadUpdate: () => ipcRenderer.send('download-update'),
  showNotification: (opts) => ipcRenderer.send('show-notification', opts),
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // Window controls (custom titlebar)
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose:    () => ipcRenderer.send('window-close'),
  isMaximized:    () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizedChange: (cb) => ipcRenderer.on('maximized-change', (_, val) => cb(val)),

  // Cleanup
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
  }
});
