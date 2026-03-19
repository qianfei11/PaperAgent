// src/main/index.ts
// Main-process entry point: window lifecycle, IPC, and native Node.js capabilities
// such as file I/O, PDF/OCR processing, and the LLM proxy.

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createMainWindow } from './mainWindow';
import { SessionData, AppConfig, LLMProviderConfig } from '../shared/types';
import { createNewSession } from '../shared/utils';

let mainWindow: BrowserWindow | null = null;
const pdfjsDistPath = path.dirname(require.resolve('pdfjs-dist/package.json'));
const pdfStandardFontDataUrl = path.join(pdfjsDistPath, 'standard_fonts/');

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('no-sandbox');
}

// Ensure only one application instance is running.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    mainWindow = createMainWindow();
    const storedSessionsDir = path.join(app.getPath('userData'), 'sessions');

    function getStoredSessionPath(sessionId: string): string {
      return path.join(storedSessionsDir, `${sessionId}.json`);
    }

    // ── Session ──────────────────────────────────────────────────────────────

    ipcMain.handle('create-new-session', () => {
      return createNewSession('Untitled Session');
    });

    ipcMain.handle('show-save-dialog', async (_event, options) => {
      const result = await dialog.showSaveDialog(mainWindow!, options);
      return result.filePath;
    });

    ipcMain.handle('show-open-dialog', async (_event, options) => {
      const result = await dialog.showOpenDialog(mainWindow!, options);
      return result.filePaths;
    });

    ipcMain.handle('save-session-to-file', async (_event, sessionData: SessionData, filePath: string) => {
      try {
        fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
        return { success: true, message: 'Session saved successfully' };
      } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    ipcMain.handle('save-session-snapshot', async (_event, sessionData: SessionData) => {
      try {
        fs.mkdirSync(storedSessionsDir, { recursive: true });
        const filePath = getStoredSessionPath(sessionData.sessionId);
        fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
        return { success: true, filePath };
      } catch (error) {
        return {
          success: false,
          filePath: '',
          message: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    ipcMain.handle('load-session-from-file', async (_event, filePath: string) => {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(fileContent);
      } catch (_error) {
        return null;
      }
    });

    ipcMain.handle('delete-session-snapshot', async (_event, sessionId: string) => {
      try {
        const filePath = getStoredSessionPath(sessionId);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        return { success: true };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    ipcMain.handle('select-directory', async () => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory']
      });
      return result.filePaths;
    });

    ipcMain.handle('select-files', async (_event, filters) => {
      const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile', 'multiSelections'],
        filters: filters || []
      });
      return result.filePaths;
    });

    // ── Config ────────────────────────────────────────────────────────────────

    const configPath = path.join(app.getPath('userData'), 'config.json');

    const defaultConfig: AppConfig = {
      version: '1.0',
      llm: {
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 2048
      }
    };

    ipcMain.handle('get-config', () => {
      try {
        if (fs.existsSync(configPath)) {
          const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          // Deep merge the top-level fields and the llm object so partial configs
          // do not lose default values.
          return {
            ...defaultConfig,
            ...raw,
            llm: { ...defaultConfig.llm, ...(raw.llm ?? {}) }
          };
        }
      } catch (_e) { /* Fall back to the default config on read failure. */ }
      return defaultConfig;
    });

    ipcMain.handle('save-config', (_event, config: AppConfig) => {
      try {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        return { success: true };
      } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    // ── File Reading ──────────────────────────────────────────────────────────

    ipcMain.handle('read-file-base64', async (_event, filePath: string) => {
      try {
        const buffer = fs.readFileSync(filePath);
        return { success: true, data: buffer.toString('base64') };
      } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    // ── Document Processing ──────────────────────────────────────────────────
    // PDF and OCR run in the main process because pdfjs and tesseract need Node.js.

    ipcMain.handle('extract-pdf-text', async (_event, filePath: string) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfjsLib = require('pdfjs-dist/build/pdf.js');
        const data = new Uint8Array(fs.readFileSync(filePath));
        const pdfDocument = await pdfjsLib.getDocument({
          data,
          standardFontDataUrl: pdfStandardFontDataUrl
        }).promise;
        let fullText = '';
        for (let i = 1; i <= pdfDocument.numPages; i++) {
          const page = await pdfDocument.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .filter((item: { str?: string }) => item.str)
            .map((item: { str: string }) => item.str)
            .join(' ');
          fullText += pageText + '\n';
        }
        return { success: true, text: fullText.trim() };
      } catch (error) {
        return { success: false, text: '', message: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    ipcMain.handle('extract-image-text', async (_event, filePath: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createWorker } = require('tesseract.js');
      let worker: { recognize: (p: string) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> } | null = null;
      try {
        worker = await createWorker(['chi_sim', 'eng']);
        const { data: { text } } = await worker!.recognize(filePath);
        return { success: true, text: text.trim() };
      } catch (error) {
        return { success: false, text: '', message: error instanceof Error ? error.message : 'Unknown error' };
      } finally {
        if (worker) {
          worker.terminate().catch(() => { /* Ignore cleanup failures. */ });
        }
      }
    });

    // ── LLM Streaming Proxy ──────────────────────────────────────────────────
    // Use ipcMain.on instead of handle because the renderer needs multiple streamed events.
    // Protocol: llm-send-message -> [llm-chunk*] -> llm-done | llm-error
    // Cancellation: llm-cancel-message(requestId) -> abort the matching request

    // Store in-flight requests (requestId -> AbortController).
    const pendingRequests = new Map<string, AbortController>();

    /**
     * Parses a single SSE line, extracts text content, and forwards it through a callback.
     * @param line SSE line, for example "data: {...}"
     * @param isAnthropic When true, parse Anthropic events; otherwise parse OpenAI-compatible events.
     * @param onText Callback invoked for each text fragment.
     */
    function parseSseLine(line: string, isAnthropic: boolean, onText: (text: string) => void): void {
      if (!line.startsWith('data: ')) return;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') return;
      try {
        const parsed = JSON.parse(jsonStr);
        if (isAnthropic) {
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            onText(parsed.delta.text);
          }
        } else {
          const text = parsed.choices?.[0]?.delta?.content;
          if (text) onText(text);
        }
      } catch (_e) { /* Ignore malformed lines. */ }
    }

    /**
     * Attaches SSE listeners to an axios stream and forwards chunk/done/error
     * events to the renderer. onComplete runs after stream end or failure.
     */
    function pipeStream(
      stream: NodeJS.ReadableStream,
      isAnthropic: boolean,
      send: (event: string, data: object) => void,
      requestId: string,
      onComplete: () => void
    ): void {
      let buffer = '';
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          parseSseLine(line, isAnthropic, (text) => send('llm-chunk', { requestId, text }));
        }
      });
      stream.on('end', () => { onComplete(); send('llm-done', { requestId }); });
      stream.on('error', (err: Error) => {
        onComplete();
        // Do not emit an error for axios cancellation because the renderer already handles it.
        if ((err as NodeJS.ErrnoException).code !== 'ERR_CANCELED') {
          send('llm-error', { requestId, error: err.message });
        }
      });
    }

    ipcMain.on('llm-send-message', async (event, payload: {
      requestId: string;
      messages: Array<{ role: string; content: string }>;
      config: LLMProviderConfig;
    }) => {
      const { requestId, messages, config } = payload;
      const send = (ch: string, data: object) => event.sender.send(ch, data);
      const controller = new AbortController();
      pendingRequests.set(requestId, controller);
      const cleanup = () => pendingRequests.delete(requestId);

      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const axios = require('axios');

        if (config.provider === 'anthropic') {
          // ── Anthropic Messages API ─────────────────────────────────────────
          const systemMessages = messages.filter(m => m.role === 'system');
          const userMessages = messages.filter(m => m.role !== 'system');
          const systemPrompt = systemMessages.map(m => m.content).join('\n') || undefined;

          const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
              model: config.model,
              max_tokens: config.maxTokens ?? 2048,
              temperature: config.temperature ?? 0.7,
              system: systemPrompt,
              messages: userMessages,
              stream: true
            },
            {
              headers: {
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
              },
              responseType: 'stream',
              signal: controller.signal
            }
          );
          pipeStream(response.data, true, send, requestId, cleanup);

        } else {
          // ── OpenAI-compatible Chat Completions API ────────────────────────
          const baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
          const response = await axios.post(
            `${baseUrl}/chat/completions`,
            {
              model: config.model,
              messages,
              temperature: config.temperature ?? 0.7,
              max_tokens: config.maxTokens ?? 2048,
              stream: true
            },
            {
              headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
              },
              responseType: 'stream',
              signal: controller.signal
            }
          );
          pipeStream(response.data, false, send, requestId, cleanup);
        }

      } catch (error) {
        cleanup();
        const axiosError = error as { code?: string; message?: string };
        // Ignore errors triggered by intentional cancellation.
        if (axiosError.code !== 'ERR_CANCELED') {
          send('llm-error', { requestId, error: axiosError.message ?? 'Unknown error' });
        }
      }
    });

    ipcMain.on('llm-cancel-message', (_event, requestId: string) => {
      const controller = pendingRequests.get(requestId);
      if (controller) {
        controller.abort();
        pendingRequests.delete(requestId);
      }
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
