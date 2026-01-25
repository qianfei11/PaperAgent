// src/main/mainWindow.ts

import { BrowserWindow, screen } from 'electron';
import * as path from 'path';

export function createMainWindow(): BrowserWindow {
  // 获取屏幕信息
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // 创建浏览器窗口
  const mainWindow = new BrowserWindow({
    width: Math.min(width - 50, 1400), // 最大宽度为屏幕宽度减去50像素，但不超过1400（增加了侧边栏）
    height: Math.min(height - 50, 900), // 最大高度为屏幕高度减去50像素，但不超过900
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false, // 不推荐启用，出于安全考虑
      contextIsolation: true, // 推荐启用，增强安全性
      preload: path.join(__dirname, '../preload/index.js'), // 预加载脚本路径
      webSecurity: false, // 禁用web安全（仅开发环境）
      allowRunningInsecureContent: true,
    },
    icon: path.join(__dirname, '../../assets/icons/icon.png'), // 应用图标
    show: false, // 先不显示，等页面加载完成再显示
  });

  // 加载应用的index.html
  mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));

  // 打开开发者工具（仅在开发环境中）
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // 页面加载完成后显示窗口
  mainWindow.webContents.once('dom-ready', () => {
    mainWindow.show();
  });

  // 窗口关闭事件处理
  mainWindow.on('closed', () => {
    // 在这里可以处理窗口关闭后的清理工作
  });

  return mainWindow;
}