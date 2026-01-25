import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { createMainWindow } from './mainWindow';
import { createNewSession } from '../shared/utils';
let mainWindow = null;
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}
else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
    app.whenReady().then(() => {
        mainWindow = createMainWindow();
        ipcMain.handle('create-new-session', () => {
            return createNewSession('Untitled Session');
        });
        ipcMain.handle('show-save-dialog', async (event, options) => {
            const result = await dialog.showSaveDialog(mainWindow, options);
            return result.filePath;
        });
        ipcMain.handle('show-open-dialog', async (event, options) => {
            const result = await dialog.showOpenDialog(mainWindow, options);
            return result.filePaths;
        });
        ipcMain.handle('save-session-to-file', async (event, sessionData, filePath) => {
            try {
                const fs = require('fs');
                fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
                console.log(`Session saved to: ${filePath}`);
                return { success: true, message: 'Session saved successfully' };
            }
            catch (error) {
                console.error('Error saving session to file:', error);
                return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
            }
        });
        ipcMain.handle('load-session-from-file', async (event, filePath) => {
            try {
                const fs = require('fs');
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const sessionData = JSON.parse(fileContent);
                console.log(`Session loaded from: ${filePath}`);
                return sessionData;
            }
            catch (error) {
                console.error('Error loading session from file:', error);
                return null;
            }
        });
        ipcMain.handle('select-directory', async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openDirectory']
            });
            return result.filePaths;
        });
        ipcMain.handle('select-files', async (event, filters) => {
            const result = await dialog.showOpenDialog(mainWindow, {
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
//# sourceMappingURL=index.js.map