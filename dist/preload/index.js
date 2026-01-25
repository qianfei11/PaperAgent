import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('electronAPI', {
    createNewSession: () => ipcRenderer.invoke('create-new-session'),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
    saveSessionToFile: (sessionData, filePath) => ipcRenderer.invoke('save-session-to-file', sessionData, filePath),
    loadSessionFromFile: (filePath) => ipcRenderer.invoke('load-session-from-file', filePath),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectFiles: (filters) => ipcRenderer.invoke('select-files', filters),
    on: (channel, listener) => {
        ipcRenderer.on(channel, listener);
    },
    off: (channel, listener) => {
        ipcRenderer.removeListener(channel, listener);
    }
});
//# sourceMappingURL=index.js.map