// src/renderer/scripts/main.ts
// 渲染进程入口：初始化应用、处理用户交互、协调各服务。

import type { SessionData, OutlineItem, AppConfig, LLMProviderConfig } from '../../shared/types.js';
import { SessionManager } from './components/sessionManager.js';
import { OpenAILLMService } from './services/llmService.js';
import { ContextService } from './services/contextService.js';

declare global {
  interface Window {
    electronAPI: {
      createNewSession: () => Promise<SessionData>;
      showSaveDialog: (options: unknown) => Promise<string | undefined>;
      showOpenDialog: (options: unknown) => Promise<string[]>;
      saveSessionToFile: (data: SessionData, path: string) => Promise<{ success: boolean; message?: string }>;
      loadSessionFromFile: (path: string) => Promise<SessionData | null>;
      selectFiles: (filters: unknown[]) => Promise<string[]>;
      getConfig: () => Promise<AppConfig>;
      saveConfig: (config: AppConfig) => Promise<{ success: boolean; message?: string }>;
      extractPDFText: (path: string) => Promise<{ success: boolean; text: string; message?: string }>;
      extractImageText: (path: string) => Promise<{ success: boolean; text: string; message?: string }>;
      sendLLMMessage: (requestId: string, messages: Array<{ role: string; content: string }>, config: LLMProviderConfig) => void;
      cancelLLMMessage: (requestId: string) => void;
      onLLMChunk: (cb: (data: { requestId: string; text: string }) => void) => void;
      onLLMDone: (cb: (data: { requestId: string }) => void) => void;
      onLLMError: (cb: (data: { requestId: string; error: string }) => void) => void;
      removeLLMListeners: () => void;
    };
  }
}

class PaperAgentApp {
  private sessionData: SessionData | null = null;
  private chatContainer: HTMLElement | null = null;
  private outlineContainer: HTMLElement | null = null;
  private documentContainer: HTMLElement | null = null;
  private sessionHistoryContainer: HTMLElement | null = null;
  private messageInput: HTMLTextAreaElement | null = null;
  private sendButton: HTMLButtonElement | null = null;
  private cancelButton: HTMLButtonElement | null = null;
  private sessionTitle: HTMLElement | null = null;
  private cancelCurrentRequest: (() => void) | null = null;

  // 当前生效的 LLM 提供商配置，由设置页面更新
  private providerConfig: LLMProviderConfig = {
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 2048
  };

  private llmService: OpenAILLMService;
  private contextService: ContextService;

  constructor() {
    this.llmService = new OpenAILLMService();
    this.contextService = new ContextService(this.llmService);

    this.initializeElements();
    this.setupEventListeners();
    this.loadConfig();
    this.loadInitialView();
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  private initializeElements(): void {
    this.chatContainer = document.getElementById('chatContainer');
    this.outlineContainer = document.getElementById('outlineContainer');
    this.documentContainer = document.getElementById('documentContainer');
    this.sessionHistoryContainer = document.getElementById('sessionHistoryContainer');
    this.messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;
    this.sendButton = document.getElementById('sendBtn') as HTMLButtonElement;
    this.cancelButton = document.getElementById('cancelBtn') as HTMLButtonElement;
    this.sessionTitle = document.getElementById('sessionTitle');

    this.cancelButton?.addEventListener('click', () => {
      if (this.cancelCurrentRequest) {
        this.cancelCurrentRequest();
        this.cancelCurrentRequest = null;
      }
    });

    // 顶部工具栏按钮
    document.getElementById('newSessionBtn')?.addEventListener('click', () => this.createNewSession());
    document.getElementById('saveSessionBtn')?.addEventListener('click', () => this.saveSession());
    document.getElementById('loadSessionBtn')?.addEventListener('click', () => this.loadSession());
    document.getElementById('addDocumentBtn')?.addEventListener('click', () => this.addDocument());
    document.getElementById('settingsBtn')?.addEventListener('click', () => this.openSettings());

    // 设置 Modal 按钮（仅绑定一次，避免重复监听器）
    this.wireSettingsModal();

    this.renderSessionHistory();

    // 文档搜索
    document.getElementById('documentSearch')?.addEventListener('input', (e) => {
      this.filterDocuments((e.target as HTMLInputElement).value);
    });
  }

  private setupEventListeners(): void {
    // Enter 发送，Shift+Enter 换行
    this.messageInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    this.sendButton?.addEventListener('click', () => this.sendMessage());
  }

  private async loadConfig(): Promise<void> {
    try {
      const config = await window.electronAPI.getConfig();
      this.providerConfig = config.llm;
      this.llmService.setProviderConfig(this.providerConfig);
    } catch (e) {
      console.error('加载配置失败:', e);
    }
  }

  private loadInitialView(): void {
    this.updateSessionTitle('无活动会话');
  }

  // ── Toast Notifications ─────────────────────────────────────────────────────

  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ── Session Management ──────────────────────────────────────────────────────

  private async createNewSession(): Promise<void> {
    try {
      this.sessionData = await window.electronAPI.createNewSession();
      if (this.sessionData) {
        this.updateSessionTitle(this.sessionData.title);
        this.clearChat();
        this.renderOutline();
        this.renderDocuments();
        this.addMessageToChat('assistant', '您好！我是 PaperAgent 助手，可以帮助您进行论文阅读和思考。请告诉我您想讨论什么内容。');
        this.addToSessionHistory(this.sessionData);
      }
    } catch (error) {
      this.showNotification('创建新会话失败，请重试', 'error');
      console.error(error);
    }
  }

  private async saveSession(): Promise<void> {
    if (!this.sessionData) { this.showNotification('没有活动的会话可以保存', 'error'); return; }

    try {
      const filePath = await window.electronAPI.showSaveDialog({
        title: '保存会话',
        defaultPath: `${this.sessionData.title || 'session'}.json`,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });
      if (!filePath) return;

      const result = await window.electronAPI.saveSessionToFile(this.sessionData, filePath);
      if (result.success) {
        this.updateSessionFilePath(this.sessionData.sessionId, filePath);
        this.showNotification('会话已保存', 'success');
      } else {
        this.showNotification(`保存失败: ${result.message}`, 'error');
      }
    } catch (error) {
      this.showNotification('保存会话时发生错误', 'error');
      console.error(error);
    }
  }

  private async loadSession(): Promise<void> {
    try {
      const filePaths = await window.electronAPI.showOpenDialog({
        title: '加载会话',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (!filePaths || filePaths.length === 0) return;

      const filePath = filePaths[0]!;
      this.sessionData = await window.electronAPI.loadSessionFromFile(filePath);
      if (this.sessionData) {
        this.updateSessionTitle(this.sessionData.title);
        this.clearChat();
        this.renderOutline();
        this.renderDocuments();
        this.addToSessionHistory(this.sessionData);
        this.updateSessionFilePath(this.sessionData.sessionId, filePath);
        this.showNotification('会话加载成功', 'success');
      } else {
        this.showNotification('加载失败：文件格式不正确', 'error');
      }
    } catch (error) {
      this.showNotification('加载会话时发生错误', 'error');
      console.error(error);
    }
  }

  // ── Document Management ─────────────────────────────────────────────────────

  private async addDocument(): Promise<void> {
    if (!this.sessionData) { this.showNotification('请先创建或加载会话', 'error'); return; }

    try {
      const filePaths = await window.electronAPI.selectFiles([
        { name: '文档', extensions: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'bmp', 'tiff'] }
      ]);
      if (!filePaths || filePaths.length === 0) return;

      for (const filePath of filePaths) {
        const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
        this.showNotification(`正在处理 ${fileName}...`, 'info');
        try {
          const docInfo = await this.contextService.getDocumentService().uploadDocument(filePath);
          this.sessionData!.documentLibrary.documents.push(docInfo);
          this.sessionData!.metadata.documentsCount = this.sessionData!.documentLibrary.documents.length;
          this.showNotification(`文档 "${docInfo.title}" 添加成功`, 'success');
        } catch (_e) {
          this.showNotification(`文件 "${fileName}" 处理失败`, 'error');
        }
      }
      this.renderDocuments();
    } catch (error) {
      this.showNotification('添加文档时发生错误', 'error');
      console.error(error);
    }
  }

  // ── Messaging ───────────────────────────────────────────────────────────────

  private async sendMessage(): Promise<void> {
    if (!this.sessionData) { this.showNotification('请先创建或加载会话', 'error'); return; }
    if (!this.messageInput) return;

    const message = this.messageInput.value.trim();
    if (!message) return;

    if (!this.providerConfig.apiKey) {
      this.showNotification('请先在设置中配置 API Key', 'error');
      this.openSettings();
      return;
    }

    this.setSendingState(true);
    this.addMessageToChat('user', message);
    this.messageInput.value = '';

    // 预先创建 assistant 消息气泡，流式填充内容
    const assistantEl = this.createStreamingMessageElement();

    try {
      const context = await this.contextService.createContext(this.sessionData);
      const messages = this.llmService.buildMessages(context, message);

      await new Promise<void>((resolve, reject) => {
        this.cancelCurrentRequest = this.llmService.sendMessageStreaming(
          messages,
          this.providerConfig,
          (chunk) => {
            this.appendToStreamingMessage(assistantEl, chunk);
          },
          async (fullText) => {
            this.cancelCurrentRequest = null;
            this.finalizeStreamingMessage(assistantEl);
            try {
              this.sessionData = await this.contextService.updateContext(
                this.sessionData!,
                message,
                fullText
              );
              this.renderOutline();
            } catch (e) {
              console.error('上下文更新失败:', e);
            }
            resolve();
          },
          (error) => {
            this.cancelCurrentRequest = null;
            const cancelled = error === '已取消';
            this.finalizeStreamingMessage(assistantEl, !cancelled);
            if (!cancelled) {
              this.showNotification(`LLM 响应错误: ${error}`, 'error');
              reject(new Error(error));
            } else {
              resolve();
            }
          }
        );
      });
    } catch (error) {
      // LLM 错误已在 onError 回调中通知用户；其他错误仅记录日志
      console.error('发送消息失败:', error);
    } finally {
      this.setSendingState(false);
    }
  }

  private setSendingState(sending: boolean): void {
    if (this.sendButton) {
      this.sendButton.disabled = sending;
      this.sendButton.classList.toggle('loading', sending);
    }
    if (this.cancelButton) {
      this.cancelButton.style.display = sending ? '' : 'none';
    }
  }

  private createStreamingMessageElement(): HTMLElement {
    if (!this.chatContainer) return document.createElement('div');

    this.chatContainer.querySelector('.welcome-message')?.remove();

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'assistant', 'streaming');

    const header = document.createElement('div');
    header.classList.add('message-header');
    header.textContent = 'PaperAgent 助手';

    const content = document.createElement('div');
    content.classList.add('message-content');

    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    this.chatContainer.appendChild(messageDiv);
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;

    return messageDiv;
  }

  private appendToStreamingMessage(el: HTMLElement, text: string): void {
    const content = el.querySelector('.message-content');
    if (content) {
      content.textContent = (content.textContent ?? '') + text;
      this.chatContainer!.scrollTop = this.chatContainer!.scrollHeight;
    }
  }

  private finalizeStreamingMessage(el: HTMLElement, isError = false): void {
    el.classList.remove('streaming');
    if (isError) {
      const content = el.querySelector('.message-content');
      if (content && !content.textContent?.trim()) {
        content.textContent = '[响应出错，请检查设置后重试]';
      }
    }
  }

  private addMessageToChat(role: 'user' | 'assistant', content: string): void {
    if (!this.chatContainer) return;
    this.chatContainer.querySelector('.welcome-message')?.remove();

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', role);

    const header = document.createElement('div');
    header.classList.add('message-header');
    header.textContent = role === 'user' ? '您' : 'PaperAgent 助手';

    const contentEl = document.createElement('div');
    contentEl.classList.add('message-content');
    contentEl.textContent = content;

    messageDiv.appendChild(header);
    messageDiv.appendChild(contentEl);
    this.chatContainer.appendChild(messageDiv);
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  /** 绑定设置 Modal 内部按钮事件，仅在初始化时调用一次 */
  private wireSettingsModal(): void {
    document.getElementById('providerSelect')?.addEventListener('change', () => this.updateBaseUrlRowVisibility());
    const temperatureInput = document.getElementById('temperatureInput') as HTMLInputElement | null;
    const temperatureValue = document.getElementById('temperatureValue');
    temperatureInput?.addEventListener('input', () => {
      if (temperatureValue) temperatureValue.textContent = temperatureInput.value;
    });
    document.getElementById('closeSettingsBtn')?.addEventListener('click', () => this.closeSettings());
    document.getElementById('cancelSettingsBtn')?.addEventListener('click', () => this.closeSettings());
    document.getElementById('saveSettingsBtn')?.addEventListener('click', () => this.saveSettings());
    document.getElementById('testConnectionBtn')?.addEventListener('click', () => this.testConnection());
    document.getElementById('settingsModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeSettings();
    });

    // 文档查看器 Modal
    document.getElementById('closeDocViewerBtn')?.addEventListener('click', () => this.closeDocumentViewer());
    document.getElementById('docViewerModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeDocumentViewer();
    });
  }

  private openSettings(): void {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;

    // 将当前配置回填到表单
    const cfg = this.providerConfig;
    (document.getElementById('providerSelect') as HTMLSelectElement).value = cfg.provider;
    (document.getElementById('baseUrlInput') as HTMLInputElement).value = cfg.baseUrl ?? '';
    (document.getElementById('apiKeyInput') as HTMLInputElement).value = cfg.apiKey;
    (document.getElementById('modelInput') as HTMLInputElement).value = cfg.model;
    (document.getElementById('temperatureInput') as HTMLInputElement).value = String(cfg.temperature ?? 0.7);
    (document.getElementById('temperatureValue') as HTMLElement).textContent = String(cfg.temperature ?? 0.7);
    (document.getElementById('maxTokensInput') as HTMLInputElement).value = String(cfg.maxTokens ?? 2048);

    this.updateBaseUrlRowVisibility();

    const testResult = document.getElementById('testConnectionResult');
    if (testResult) testResult.style.display = 'none';

    modal.style.display = 'flex';
  }

  private updateBaseUrlRowVisibility(): void {
    const provider = (document.getElementById('providerSelect') as HTMLSelectElement)?.value;
    const baseUrlRow = document.getElementById('baseUrlRow');
    if (baseUrlRow) baseUrlRow.style.display = provider === 'anthropic' ? 'none' : '';
  }

  private closeSettings(): void {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'none';
  }

  private async saveSettings(): Promise<void> {
    const provider = (document.getElementById('providerSelect') as HTMLSelectElement).value as LLMProviderConfig['provider'];
    const baseUrl = (document.getElementById('baseUrlInput') as HTMLInputElement).value.trim();
    const apiKey = (document.getElementById('apiKeyInput') as HTMLInputElement).value.trim();
    const model = (document.getElementById('modelInput') as HTMLInputElement).value.trim();
    const temperature = parseFloat((document.getElementById('temperatureInput') as HTMLInputElement).value);
    const maxTokens = parseInt((document.getElementById('maxTokensInput') as HTMLInputElement).value, 10);

    if (!apiKey) { this.showNotification('API Key 不能为空', 'error'); return; }
    if (!model) { this.showNotification('Model 不能为空', 'error'); return; }

    this.providerConfig = {
      provider,
      baseUrl: provider === 'anthropic' ? undefined : baseUrl,
      apiKey,
      model,
      temperature,
      maxTokens
    };
    this.llmService.setProviderConfig(this.providerConfig);

    const config: AppConfig = { version: '1.0', llm: this.providerConfig };
    const result = await window.electronAPI.saveConfig(config);

    if (result.success) {
      this.showNotification('设置已保存', 'success');
      this.closeSettings();
    } else {
      this.showNotification(`保存失败: ${result.message}`, 'error');
    }
  }

  private async testConnection(): Promise<void> {
    const testResult = document.getElementById('testConnectionResult');
    if (!testResult) return;

    const apiKey = (document.getElementById('apiKeyInput') as HTMLInputElement).value.trim();
    const model = (document.getElementById('modelInput') as HTMLInputElement).value.trim();
    const provider = (document.getElementById('providerSelect') as HTMLSelectElement).value as LLMProviderConfig['provider'];
    const baseUrl = (document.getElementById('baseUrlInput') as HTMLInputElement).value.trim();

    if (!apiKey) { this.showNotification('请先填写 API Key', 'error'); return; }

    const testConfig: LLMProviderConfig = {
      provider,
      baseUrl: provider === 'anthropic' ? undefined : baseUrl,
      apiKey,
      model: model || 'gpt-4o',
      temperature: 0.1,
      maxTokens: 50
    };

    const testBtn = document.getElementById('testConnectionBtn') as HTMLButtonElement;
    testBtn.disabled = true;
    testBtn.textContent = '测试中...';
    testResult.style.display = 'none';

    let fullText = '';

    await new Promise<void>((resolve) => {
      this.llmService.sendMessageStreaming(
        [{ role: 'user', content: 'Hello, respond with "OK" only.' }],
        testConfig,
        (chunk) => { fullText += chunk; },
        () => {
          testResult.textContent = `✓ 连接成功！响应: ${fullText.substring(0, 80)}`;
          testResult.className = 'connection-result success';
          testResult.style.display = 'block';
          resolve();
        },
        (error) => {
          testResult.textContent = `✗ 连接失败: ${error}`;
          testResult.className = 'connection-result error';
          testResult.style.display = 'block';
          resolve();
        }
      );
    });

    testBtn.disabled = false;
    testBtn.textContent = '测试连接';
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  private renderOutline(): void {
    if (!this.outlineContainer || !this.sessionData) return;
    this.outlineContainer.innerHTML = '';

    if (this.sessionData.outline.length === 0) {
      this.outlineContainer.innerHTML = '<p>暂无大纲内容</p>';
      return;
    }

    const renderItems = (items: OutlineItem[], level = 0): DocumentFragment => {
      const fragment = document.createDocumentFragment();
      for (const item of items) {
        const div = document.createElement('div');
        div.classList.add('outline-item', `level-${level}`);
        div.dataset['id'] = item.id;

        const titleDiv = document.createElement('div');
        titleDiv.classList.add('outline-item-title');
        titleDiv.textContent = item.title;

        const summaryDiv = document.createElement('div');
        summaryDiv.classList.add('outline-item-summary');
        summaryDiv.textContent = item.summary;

        div.appendChild(titleDiv);
        div.appendChild(summaryDiv);
        div.addEventListener('click', () => {
          this.showNotification(`${item.title}：${item.summary}`, 'info');
        });
        fragment.appendChild(div);

        if (item.children && item.children.length > 0) {
          fragment.appendChild(renderItems(item.children, level + 1));
        }
      }
      return fragment;
    };

    this.outlineContainer.appendChild(renderItems(this.sessionData.outline));
  }

  private renderDocuments(): void {
    if (!this.documentContainer || !this.sessionData) return;
    this.documentContainer.innerHTML = '';

    if (this.sessionData.documentLibrary.documents.length === 0) {
      this.documentContainer.innerHTML = '<p>暂无文档</p>';
      return;
    }

    for (const doc of this.sessionData.documentLibrary.documents) {
      const div = document.createElement('div');
      div.classList.add('document-item');
      div.dataset['docKey'] = doc.key;

      const header = document.createElement('div');
      header.classList.add('document-item-header');

      const title = document.createElement('div');
      title.classList.add('document-item-title');
      title.textContent = doc.title || doc.path.split('/').pop() || '未知文档';

      const deleteBtn = document.createElement('button');
      deleteBtn.classList.add('delete-doc-btn');
      deleteBtn.textContent = '✕';
      deleteBtn.title = '移除文档';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteDocument(doc.key);
      });

      header.appendChild(title);
      header.appendChild(deleteBtn);

      const meta = document.createElement('div');
      meta.classList.add('document-item-meta');
      const sizeKb = doc.size > 0 ? `${Math.round(doc.size / 1024)} KB` : '未知大小';
      meta.textContent = `${doc.type.toUpperCase()} • ${sizeKb} • ${new Date(doc.uploadDate).toLocaleDateString()}`;

      div.appendChild(header);
      div.appendChild(meta);

      if (doc.contentPreview) {
        const preview = document.createElement('div');
        preview.classList.add('document-item-preview');
        preview.textContent = doc.contentPreview.substring(0, 80);
        div.appendChild(preview);
      }

      // 点击文档项查看全文
      div.addEventListener('click', () => this.showDocumentViewer(doc));

      this.documentContainer.appendChild(div);
    }
  }

  private deleteDocument(key: string): void {
    if (!this.sessionData) return;
    this.sessionData.documentLibrary.documents = this.sessionData.documentLibrary.documents.filter(d => d.key !== key);
    this.sessionData.metadata.documentsCount = this.sessionData.documentLibrary.documents.length;
    this.renderDocuments();
    this.showNotification('文档已移除', 'success');
  }

  private showDocumentViewer(doc: import('../../shared/types.js').DocumentInfo): void {
    const modal = document.getElementById('docViewerModal');
    const titleEl = document.getElementById('docViewerTitle');
    const contentEl = document.getElementById('docViewerContent');
    if (!modal || !titleEl || !contentEl) return;

    titleEl.textContent = doc.title || doc.path.split('/').pop() || '未知文档';
    const text = doc.fullContent || doc.contentPreview;
    contentEl.textContent = text || '（未提取到文本内容）';
    modal.style.display = 'flex';
  }

  private closeDocumentViewer(): void {
    const modal = document.getElementById('docViewerModal');
    if (modal) modal.style.display = 'none';
  }

  private filterDocuments(query: string): void {
    if (!this.documentContainer || !this.sessionData) return;
    const matched = this.contextService.getDocumentService()
      .searchDocuments(query, this.sessionData.documentLibrary.documents);
    const matchedKeys = new Set(matched.map(d => d.key));

    this.documentContainer.querySelectorAll<HTMLElement>('.document-item').forEach(item => {
      const key = item.dataset['docKey'];
      item.style.display = (!query.trim() || (key !== undefined && matchedKeys.has(key))) ? '' : 'none';
    });
  }

  private clearChat(): void {
    if (this.chatContainer) this.chatContainer.innerHTML = '';
  }

  private updateSessionTitle(title: string): void {
    if (this.sessionTitle) this.sessionTitle.textContent = title;
  }

  // ── Session History ──────────────────────────────────────────────────────────

  private addToSessionHistory(sessionData: SessionData): void {
    try {
      const sessions: Array<{ id: string; title: string; description: string; createdAt: string; lastModified: string; filePath: string }> =
        JSON.parse(localStorage.getItem('paperAgentSessions') ?? '[]');
      const sessionInfo = {
        id: sessionData.sessionId,
        title: sessionData.title,
        description: sessionData.description,
        createdAt: sessionData.createdAt,
        lastModified: sessionData.lastModified,
        filePath: ''
      };
      const idx = sessions.findIndex(s => s.id === sessionInfo.id);
      if (idx !== -1) sessions[idx] = sessionInfo;
      else sessions.unshift(sessionInfo);
      localStorage.setItem('paperAgentSessions', JSON.stringify(sessions));
      this.renderSessionHistory();
    } catch (e) {
      console.error('写入会话历史失败:', e);
    }
  }

  private renderSessionHistory(): void {
    if (!this.sessionHistoryContainer) return;
    try {
      const sessions: Array<{ id: string; title: string; description: string; createdAt: string; lastModified: string; filePath: string }> =
        JSON.parse(localStorage.getItem('paperAgentSessions') ?? '[]');

      if (sessions.length === 0) {
        this.sessionHistoryContainer.innerHTML = '<p class="no-sessions">暂无历史会话</p>';
        return;
      }

      this.sessionHistoryContainer.innerHTML = sessions.map(s => `
        <div class="session-item" data-session-id="${s.id}">
          <div class="session-header">
            <h4>${s.title}</h4>
            <div class="session-actions">
              <button class="load-session-btn" data-session-id="${s.id}">加载</button>
              <button class="delete-session-btn" data-session-id="${s.id}">删除</button>
            </div>
          </div>
          <div class="session-info">
            <p>${s.description || '无描述'}</p>
            <small>创建: ${new Date(s.createdAt).toLocaleString()}</small>
          </div>
        </div>`).join('');

      this.sessionHistoryContainer.querySelectorAll('.load-session-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const sessionId = (e.target as HTMLElement).dataset['sessionId'];
          if (sessionId) this.loadSessionById(sessionId);
        });
      });

      this.sessionHistoryContainer.querySelectorAll('.delete-session-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const sessionId = (e.target as HTMLElement).dataset['sessionId'];
          if (sessionId) this.deleteSessionById(sessionId);
        });
      });
    } catch (e) {
      console.error('渲染会话历史失败:', e);
      this.sessionHistoryContainer.innerHTML = '<p>加载历史时出错</p>';
    }
  }

  private deleteSessionById(sessionId: string): void {
    if (!confirm('确定要从历史列表移除这个会话吗？（不会删除文件）')) return;
    try {
      const sessions: Array<{ id: string }> = JSON.parse(localStorage.getItem('paperAgentSessions') ?? '[]');
      localStorage.setItem('paperAgentSessions', JSON.stringify(sessions.filter(s => s.id !== sessionId)));
      if (this.sessionData?.sessionId === sessionId) {
        this.sessionData = null;
        this.updateSessionTitle('无活动会话');
        this.clearChat();
        if (this.outlineContainer) this.outlineContainer.innerHTML = '';
        if (this.documentContainer) this.documentContainer.innerHTML = '';
      }
      this.renderSessionHistory();
      this.showNotification('会话已从历史中移除', 'success');
    } catch (e) {
      console.error(e);
      this.showNotification('删除失败', 'error');
    }
  }

  private async loadSessionById(sessionId: string): Promise<void> {
    const sessions: Array<{ id: string; filePath: string; title: string }> =
      JSON.parse(localStorage.getItem('paperAgentSessions') ?? '[]');
    const session = sessions.find(s => s.id === sessionId);
    if (!session?.filePath) {
      this.showNotification('找不到会话文件，请重新保存后再加载', 'error');
      return;
    }

    try {
      this.sessionData = await window.electronAPI.loadSessionFromFile(session.filePath);
      if (this.sessionData) {
        this.updateSessionTitle(this.sessionData.title);
        this.clearChat();
        this.renderOutline();
        this.renderDocuments();
        this.showNotification(`会话 "${session.title}" 加载成功`, 'success');
      } else {
        this.showNotification('加载失败：文件格式不正确', 'error');
      }
    } catch (e) {
      this.showNotification('加载会话时发生错误', 'error');
      console.error(e);
    }
  }

  private updateSessionFilePath(sessionId: string, filePath: string): void {
    try {
      const sessions: Array<{ id: string; filePath: string }> =
        JSON.parse(localStorage.getItem('paperAgentSessions') ?? '[]');
      const idx = sessions.findIndex(s => s.id === sessionId);
      if (idx !== -1) {
        sessions[idx]!.filePath = filePath;
        localStorage.setItem('paperAgentSessions', JSON.stringify(sessions));
      }
    } catch (e) {
      console.error(e);
    }
  }
}

// 初始化应用（DOMContentLoaded 保证 DOM 已就绪）
document.addEventListener('DOMContentLoaded', () => {
  new PaperAgentApp();
  SessionManager.initSessionManagement();
});
