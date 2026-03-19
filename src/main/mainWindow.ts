// src/main/mainWindow.ts

import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

export function createMainWindow(): BrowserWindow {
  // Read the primary display dimensions.
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: Math.min(width - 50, 1400),
    height: Math.min(height - 50, 900),
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, '../preload/index.js'),
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    show: false,
  });

  // Load the app entry HTML.
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development mode.
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Show the window after the page is ready.
  mainWindow.webContents.once('dom-ready', () => {
    mainWindow.show();
  });

  // Window cleanup hook.
  mainWindow.on('closed', () => {
    // Reserved for cleanup logic.
  });

  return mainWindow;
}
