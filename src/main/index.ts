// src/main/index.ts
// 主进程入口：负责窗口管理、IPC 通信及 Node.js 原生能力（文件 I/O、PDF/OCR、LLM 代理）

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createMainWindow } from './mainWindow';
import { SessionData, AppConfig, LLMProviderConfig } from '../shared/types';
import { createNewSession } from '../shared/utils';

let mainWindow: BrowserWindow | null = null;

// 确保只运行一个应用实例
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

    ipcMain.handle('load-session-from-file', async (_event, filePath: string) => {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(fileContent);
      } catch (_error) {
        return null;
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
        baseUrl: 'https://api.openai.com',
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
          // 深合并：顶层字段 + llm 子对象，避免存储的局部配置丢失默认值
          return {
            ...defaultConfig,
            ...raw,
            llm: { ...defaultConfig.llm, ...(raw.llm ?? {}) }
          };
        }
      } catch (_e) { /* 读取失败则返回默认配置 */ }
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
    // PDF 和 OCR 在主进程执行，因为 pdfjs / tesseract 需要 Node.js 环境

    ipcMain.handle('extract-pdf-text', async (_event, filePath: string) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
        const data = fs.readFileSync(filePath);
        const pdfDocument = await pdfjsLib.getDocument({ data }).promise;
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
          worker.terminate().catch(() => { /* 忽略清理错误 */ });
        }
      }
    });

    // ── LLM Streaming Proxy ──────────────────────────────────────────────────
    // 使用 ipcMain.on（非 handle）是因为需要向渲染器推送多条消息（流式）
    // 协议：llm-send-message → [llm-chunk*] → llm-done | llm-error
    // 取消协议：llm-cancel-message(requestId) → 中止对应请求

    // 存储进行中的请求（requestId → AbortController）
    const pendingRequests = new Map<string, AbortController>();

    /**
     * 解析单行 SSE 数据，提取文本内容并通过回调返回。
     * @param line  SSE 行（形如 "data: {...}"）
     * @param isAnthropic  true 时按 Anthropic 格式解析，否则按 OpenAI 格式
     * @param onText  收到文本片段时的回调
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
      } catch (_e) { /* 忽略格式异常行 */ }
    }

    /**
     * 为 axios 流建立 SSE 监听，将 chunk/done/error 事件转发给渲染器。
     * onComplete 在流结束或报错后调用，用于清理 pendingRequests。
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
        // axios CanceledError 时不发送错误（渲染端已处理取消）
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
          // ── OpenAI 兼容 Chat Completions API ──────────────────────────────
          const baseUrl = (config.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '');
          const response = await axios.post(
            `${baseUrl}/v1/chat/completions`,
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
        // 忽略主动取消产生的错误
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
