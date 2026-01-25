// src/preload/index.ts

import { contextBridge, ipcRenderer } from 'electron';
import { SessionData } from '../shared/types';

// 将API暴露给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 会话管理
  createNewSession: () => ipcRenderer.invoke('create-new-session'),
  showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),
  saveSessionToFile: (sessionData: SessionData, filePath: string) => ipcRenderer.invoke('save-session-to-file', sessionData, filePath),
  loadSessionFromFile: (filePath: string) => ipcRenderer.invoke('load-session-from-file', filePath),

  // 文件操作
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFiles: (filters: Electron.FileFilter[]) => ipcRenderer.invoke('select-files', filters),

  // 监听来自主进程的消息
  on: (channel: string, listener: (event: any, ...args: any[]) => void) => {
    ipcRenderer.on(channel, listener);
  },
  off: (channel: string, listener: (event: any, ...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, listener);
  }
});