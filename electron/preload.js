const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Update events → renderer
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, info)     => cb(info)),
  onUpdateProgress:   (cb) => ipcRenderer.on('update-progress',   (_, progress) => cb(progress)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded',  (_, info)     => cb(info)),

  // Renderer → main
  downloadUpdate: () => ipcRenderer.send('download-update'),

  // Cleanup
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
  }
});
