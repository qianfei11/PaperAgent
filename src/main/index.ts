// src/main/index.ts

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { createMainWindow } from './mainWindow';
import { SessionData } from '../shared/types';
import { createNewSession } from '../shared/utils';

let mainWindow: BrowserWindow | null = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 当运行第二个实例时，激活窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    mainWindow = createMainWindow();

    // 处理来自渲染进程的IPC消息
    ipcMain.handle('create-new-session', () => {
      return createNewSession('Untitled Session');
    });

    ipcMain.handle('show-save-dialog', async (event, options) => {
      const result = await dialog.showSaveDialog(mainWindow!, options);
      return result.filePath;
    });

    ipcMain.handle('show-open-dialog', async (event, options) => {
      const result = await dialog.showOpenDialog(mainWindow!, options);
      return result.filePaths;
    });

    ipcMain.handle('save-session-to-file', async (event, sessionData: SessionData, filePath: string) => {
      try {
        const fs = require('fs');
        // 将会话数据保存到指定文件
        fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
        console.log(`Session saved to: ${filePath}`);
        return { success: true, message: 'Session saved successfully' };
      } catch (error) {
        console.error('Error saving session to file:', error);
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    ipcMain.handle('load-session-from-file', async (event, filePath: string) => {
      try {
        const fs = require('fs');
        // 从指定文件加载会话数据
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const sessionData = JSON.parse(fileContent);
        console.log(`Session loaded from: ${filePath}`);
        return sessionData;
      } catch (error) {
        console.error('Error loading session from file:', error);
        return null;
      }
    });

    ipcMain.handle('select-directory', async () => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory']
      });
      return result.filePaths;
    });

    ipcMain.handle('select-files', async (event, filters) => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile', 'multiSelections'],
        filters: filters || []
      });
      return result.filePaths;
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});