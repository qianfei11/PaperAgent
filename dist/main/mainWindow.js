import { BrowserWindow, screen } from 'electron';
import * as path from 'path';
export function createMainWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const mainWindow = new BrowserWindow({
        width: Math.min(width - 50, 1400),
        height: Math.min(height - 50, 900),
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload/index.js'),
            webSecurity: false,
            allowRunningInsecureContent: true,
        },
        icon: path.join(__dirname, '../../assets/icons/icon.png'),
        show: false,
    });
    mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
    mainWindow.webContents.once('dom-ready', () => {
        mainWindow.show();
    });
    mainWindow.on('closed', () => {
    });
    return mainWindow;
}
//# sourceMappingURL=mainWindow.js.map