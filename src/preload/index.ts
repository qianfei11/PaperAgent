// src/preload/index.ts

import { contextBridge, ipcRenderer } from 'electron';
import { SessionData, AppConfig, LLMProviderConfig } from '../shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Session ────────────────────────────────────────────────────────────────
  createNewSession: () => ipcRenderer.invoke('create-new-session'),
  showSaveDialog: (options: Electron.SaveDialogOptions) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options: Electron.OpenDialogOptions) => ipcRenderer.invoke('show-open-dialog', options),
  saveSessionToFile: (sessionData: SessionData, filePath: string) =>
    ipcRenderer.invoke('save-session-to-file', sessionData, filePath),
  loadSessionFromFile: (filePath: string) =>
    ipcRenderer.invoke('load-session-from-file', filePath),

  // ── File ──────────────────────────────────────────────────────────────────
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  selectFiles: (filters: Electron.FileFilter[]) => ipcRenderer.invoke('select-files', filters),

  // ── Config ─────────────────────────────────────────────────────────────────
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke('save-config', config),

  // ── Document Processing ───────────────────────────────────────────────────
  readFileBase64: (filePath: string) => ipcRenderer.invoke('read-file-base64', filePath),
  extractPDFText: (filePath: string) => ipcRenderer.invoke('extract-pdf-text', filePath),
  extractImageText: (filePath: string) => ipcRenderer.invoke('extract-image-text', filePath),

  // ── LLM Streaming ─────────────────────────────────────────────────────────
  sendLLMMessage: (requestId: string, messages: Array<{ role: string; content: string }>, config: LLMProviderConfig) =>
    ipcRenderer.send('llm-send-message', { requestId, messages, config }),
  onLLMChunk: (cb: (data: { requestId: string; text: string }) => void) =>
    ipcRenderer.on('llm-chunk', (_event, data) => cb(data)),
  onLLMDone: (cb: (data: { requestId: string }) => void) =>
    ipcRenderer.on('llm-done', (_event, data) => cb(data)),
  onLLMError: (cb: (data: { requestId: string; error: string }) => void) =>
    ipcRenderer.on('llm-error', (_event, data) => cb(data)),
  removeLLMListeners: () => {
    ipcRenderer.removeAllListeners('llm-chunk');
    ipcRenderer.removeAllListeners('llm-done');
    ipcRenderer.removeAllListeners('llm-error');
  },

  // ── Generic IPC ───────────────────────────────────────────────────────────
  on: (channel: string, listener: (_event: Electron.IpcRendererEvent, ...args: unknown[]) => void) => {
    ipcRenderer.on(channel, listener);
  },
  off: (channel: string, listener: (_event: Electron.IpcRendererEvent, ...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, listener);
  }
});
