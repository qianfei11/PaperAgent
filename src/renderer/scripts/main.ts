// src/renderer/scripts/main.ts
// Renderer entry point: initializes the app, handles user interaction, and coordinates services.

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
      saveSessionSnapshot: (data: SessionData) => Promise<{ success: boolean; filePath: string; message?: string }>;
      loadSessionFromFile: (path: string) => Promise<SessionData | null>;
      deleteSessionSnapshot: (sessionId: string) => Promise<{ success: boolean; message?: string }>;
      selectFiles: (filters: unknown[]) => Promise<string[]>;
      getConfig: () => Promise<AppConfig>;
      saveConfig: (config: AppConfig) => Promise<{ success: boolean; message?: string }>;
      selectDirectory: () => Promise<string[]>;
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

interface SessionHistoryEntry {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  lastModified: string;
  filePath: string;
  storagePath: string;
}

const SESSION_HISTORY_KEY = 'paperAgentSessions';
const PANEL_STATE_KEY = 'paperAgentCollapsedPanels';

function touchSession(sessionData: SessionData): SessionData {
  return {
    ...sessionData,
    lastModified: new Date().toISOString()
  };
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
  private sessionTitleInput: HTMLInputElement | null = null;
  private editSessionTitleBtn: HTMLButtonElement | null = null;
  private saveSessionTitleBtn: HTMLButtonElement | null = null;
  private cancelSessionTitleBtn: HTMLButtonElement | null = null;
  private cancelCurrentRequest: (() => void) | null = null;
  private collapsedPanels = new Set<string>();

  // Active LLM provider configuration, updated from the settings dialog.
  private providerConfig: LLMProviderConfig = {
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
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
    this.sessionTitleInput = document.getElementById('sessionTitleInput') as HTMLInputElement;
    this.editSessionTitleBtn = document.getElementById('editSessionTitleBtn') as HTMLButtonElement;
    this.saveSessionTitleBtn = document.getElementById('saveSessionTitleBtn') as HTMLButtonElement;
    this.cancelSessionTitleBtn = document.getElementById('cancelSessionTitleBtn') as HTMLButtonElement;

    this.cancelButton?.addEventListener('click', () => {
      if (this.cancelCurrentRequest) {
        this.cancelCurrentRequest();
        this.cancelCurrentRequest = null;
      }
    });

    // Top toolbar buttons
    document.getElementById('newSessionBtn')?.addEventListener('click', () => this.createNewSession());
    document.getElementById('saveSessionBtn')?.addEventListener('click', () => this.saveSession());
    document.getElementById('loadSessionBtn')?.addEventListener('click', () => this.loadSession());
    document.getElementById('addDocumentBtn')?.addEventListener('click', () => this.addDocument());
    document.getElementById('settingsBtn')?.addEventListener('click', () => this.openSettings());
    this.editSessionTitleBtn?.addEventListener('click', () => this.startSessionTitleEdit());
    this.saveSessionTitleBtn?.addEventListener('click', () => { void this.commitSessionTitleEdit(); });
    this.cancelSessionTitleBtn?.addEventListener('click', () => this.cancelSessionTitleEdit());
    this.sessionTitleInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.commitSessionTitleEdit();
      } else if (e.key === 'Escape') {
        this.cancelSessionTitleEdit();
      }
    });

    // Settings modal buttons. Bind once to avoid duplicate listeners.
    this.wireSettingsModal();
    this.setupPanelToggles();
    this.syncSessionTitleEditState();

    this.renderSessionHistory();

    // Document search
    document.getElementById('documentSearch')?.addEventListener('input', (e) => {
      this.filterDocuments((e.target as HTMLInputElement).value);
    });
  }

  private setupEventListeners(): void {
    // Enter sends, Shift+Enter inserts a newline.
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
      console.error('Failed to load config:', e);
    }
  }

  private loadInitialView(): void {
    this.updateSessionTitle('No Active Session');
    this.syncSessionTitleEditState();
  }

  private setupPanelToggles(): void {
    document.querySelectorAll<HTMLButtonElement>('.panel-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const panelId = btn.dataset['panelTarget'];
        if (panelId) this.togglePanel(panelId);
      });
    });
    this.restoreCollapsedPanels();
  }

  private restoreCollapsedPanels(): void {
    try {
      const stored = JSON.parse(localStorage.getItem(PANEL_STATE_KEY) ?? '[]');
      if (Array.isArray(stored)) {
        this.collapsedPanels = new Set(stored.filter((panelId): panelId is string => typeof panelId === 'string'));
      }
    } catch (error) {
      console.error('Failed to restore collapsed panel state:', error);
      this.collapsedPanels.clear();
    }
    this.applyCollapsedPanels();
  }

  private saveCollapsedPanels(): void {
    localStorage.setItem(PANEL_STATE_KEY, JSON.stringify([...this.collapsedPanels]));
  }

  private togglePanel(panelId: string): void {
    if (this.collapsedPanels.has(panelId)) {
      this.collapsedPanels.delete(panelId);
    } else {
      this.collapsedPanels.add(panelId);
    }
    this.applyCollapsedPanels();
    this.saveCollapsedPanels();
  }

  private applyCollapsedPanels(): void {
    document.querySelectorAll<HTMLElement>('.sidebar[data-panel-id]').forEach(panel => {
      const panelId = panel.dataset['panelId'];
      const collapsed = panelId !== undefined && this.collapsedPanels.has(panelId);
      panel.classList.toggle('collapsed', collapsed);
      const toggle = panel.querySelector<HTMLButtonElement>('.panel-toggle');
      if (toggle) {
        toggle.textContent = collapsed ? '▸' : '▾';
        toggle.setAttribute('aria-expanded', String(!collapsed));
      }
    });
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
        this.syncSessionTitleEditState();
        this.clearChat();
        this.renderOutline();
        this.renderDocuments();
        this.addMessageToChat('assistant', 'Hello. I am the PaperAgent Assistant. I can help you read, analyze, and discuss research papers. What would you like to work on?');
        await this.persistSessionSnapshot({ touch: false });
      }
    } catch (error) {
      this.showNotification('Failed to create a new session. Please try again.', 'error');
      console.error(error);
    }
  }

  private async saveSession(): Promise<void> {
    if (!this.sessionData) { this.showNotification('There is no active session to save.', 'error'); return; }

    try {
      const filePath = await window.electronAPI.showSaveDialog({
        title: 'Save Session',
        defaultPath: `${this.sessionData.title || 'session'}.json`,
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });
      if (!filePath) return;

      this.sessionData = touchSession(this.sessionData);
      const result = await window.electronAPI.saveSessionToFile(this.sessionData, filePath);
      if (result.success) {
        await this.persistSessionSnapshot({ filePath, touch: false });
        this.showNotification('Session saved.', 'success');
      } else {
        this.showNotification(`Save failed: ${result.message}`, 'error');
      }
    } catch (error) {
      this.showNotification('An error occurred while saving the session.', 'error');
      console.error(error);
    }
  }

  private async loadSession(): Promise<void> {
    try {
      const filePaths = await window.electronAPI.showOpenDialog({
        title: 'Load Session',
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (!filePaths || filePaths.length === 0) return;

      const filePath = filePaths[0]!;
      this.sessionData = await window.electronAPI.loadSessionFromFile(filePath);
      if (this.sessionData) {
        this.renderSession();
        await this.persistSessionSnapshot({ filePath, touch: false });
        this.showNotification('Session loaded.', 'success');
      } else {
        this.showNotification('Load failed: the file format is invalid.', 'error');
      }
    } catch (error) {
      this.showNotification('An error occurred while loading the session.', 'error');
      console.error(error);
    }
  }

  // ── Document Management ─────────────────────────────────────────────────────

  private async addDocument(): Promise<void> {
    if (!this.sessionData) { this.showNotification('Create or load a session first.', 'error'); return; }

    try {
      const filePaths = await window.electronAPI.selectFiles([
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'bmp', 'tiff'] }
      ]);
      if (!filePaths || filePaths.length === 0) return;

      let hasChanges = false;
      for (const filePath of filePaths) {
        const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
        this.showNotification(`Processing ${fileName}...`, 'info');
        try {
          const docInfo = await this.contextService.getDocumentService().uploadDocument(filePath);
          this.sessionData!.documentLibrary.documents.push(docInfo);
          this.sessionData!.metadata.documentsCount = this.sessionData!.documentLibrary.documents.length;
          hasChanges = true;
          this.showNotification(`Document "${docInfo.title}" added.`, 'success');
        } catch (_e) {
          this.showNotification(`Failed to process "${fileName}".`, 'error');
        }
      }
      this.renderDocuments();
      if (hasChanges) {
        await this.persistSessionSnapshot();
      }
    } catch (error) {
      this.showNotification('An error occurred while adding documents.', 'error');
      console.error(error);
    }
  }

  // ── Messaging ───────────────────────────────────────────────────────────────

  private async sendMessage(): Promise<void> {
    if (!this.sessionData) { this.showNotification('Create or load a session first.', 'error'); return; }
    if (!this.messageInput) return;

    const message = this.messageInput.value.trim();
    if (!message) return;

    if (!this.providerConfig.apiKey) {
      this.showNotification('Configure an API key in Settings first.', 'error');
      this.openSettings();
      return;
    }

    this.setSendingState(true);
    this.addMessageToChat('user', message);
    this.messageInput.value = '';

    // Create the assistant message shell up front and stream content into it.
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
              await this.persistSessionSnapshot();
            } catch (e) {
              console.error('Failed to update context:', e);
            }
            resolve();
          },
          (error) => {
            this.cancelCurrentRequest = null;
            const cancelled = error === 'Cancelled';
            this.finalizeStreamingMessage(assistantEl, !cancelled);
            if (!cancelled) {
              this.showNotification(`LLM response error: ${error}`, 'error');
              reject(new Error(error));
            } else {
              resolve();
            }
          }
        );
      });
    } catch (error) {
      // LLM errors are already surfaced in onError; keep other failures in the log.
      console.error('Failed to send message:', error);
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

  private renderMessageContent(contentEl: HTMLElement, role: 'user' | 'assistant', content: string): void {
    if (role === 'assistant') {
      contentEl.innerHTML = this.renderMarkdown(content);
    } else {
      contentEl.textContent = content;
    }
  }

  private renderMarkdown(markdown: string): string {
    const normalized = markdown.replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');
    const blocks: string[] = [];
    let index = 0;

    while (index < lines.length) {
      const rawLine = lines[index] ?? '';
      const trimmed = rawLine.trim();

      if (!trimmed) {
        index++;
        continue;
      }

      if (trimmed.startsWith('```')) {
        const language = trimmed.slice(3).trim().replace(/[^a-zA-Z0-9_-]/g, '');
        const codeLines: string[] = [];
        index++;
        while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
          codeLines.push(lines[index] ?? '');
          index++;
        }
        if (index < lines.length) index++;
        const languageClass = language ? ` class="language-${this.escapeAttribute(language)}"` : '';
        blocks.push(`<pre><code${languageClass}>${this.escapeHtml(codeLines.join('\n'))}</code></pre>`);
        continue;
      }

      const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (headingMatch) {
        const hashes = headingMatch[1] ?? '';
        const headingText = headingMatch[2] ?? '';
        const level = hashes.length;
        blocks.push(`<h${level}>${this.renderInlineMarkdown(headingText)}</h${level}>`);
        index++;
        continue;
      }

      if (/^>\s?/.test(trimmed)) {
        const quoteLines: string[] = [];
        while (index < lines.length && /^>\s?/.test((lines[index] ?? '').trim())) {
          quoteLines.push((lines[index] ?? '').trim().replace(/^>\s?/, ''));
          index++;
        }
        blocks.push(`<blockquote><p>${quoteLines.map(line => this.renderInlineMarkdown(line)).join('<br>')}</p></blockquote>`);
        continue;
      }

      if (/^(\*|-|\+)\s+/.test(trimmed)) {
        const items: string[] = [];
        while (index < lines.length && /^(\*|-|\+)\s+/.test((lines[index] ?? '').trim())) {
          items.push((lines[index] ?? '').trim().replace(/^(\*|-|\+)\s+/, ''));
          index++;
        }
        blocks.push(`<ul>${items.map(item => `<li>${this.renderInlineMarkdown(item)}</li>`).join('')}</ul>`);
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        const items: string[] = [];
        while (index < lines.length && /^\d+\.\s+/.test((lines[index] ?? '').trim())) {
          items.push((lines[index] ?? '').trim().replace(/^\d+\.\s+/, ''));
          index++;
        }
        blocks.push(`<ol>${items.map(item => `<li>${this.renderInlineMarkdown(item)}</li>`).join('')}</ol>`);
        continue;
      }

      if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
        blocks.push('<hr>');
        index++;
        continue;
      }

      const paragraphLines: string[] = [];
      while (index < lines.length) {
        const line = lines[index] ?? '';
        const lineTrimmed = line.trim();
        if (!lineTrimmed) {
          index++;
          break;
        }
        if (paragraphLines.length > 0 && this.isMarkdownBlockBoundary(lineTrimmed)) {
          break;
        }
        paragraphLines.push(lineTrimmed);
        index++;
      }
      blocks.push(`<p>${paragraphLines.map(line => this.renderInlineMarkdown(line)).join('<br>')}</p>`);
    }

    if (blocks.length === 0) {
      return `<p>${this.renderInlineMarkdown(normalized)}</p>`;
    }

    return blocks.join('');
  }

  private isMarkdownBlockBoundary(trimmed: string): boolean {
    return trimmed.startsWith('```') ||
      /^#{1,6}\s+/.test(trimmed) ||
      /^>\s?/.test(trimmed) ||
      /^(\*|-|\+)\s+/.test(trimmed) ||
      /^\d+\.\s+/.test(trimmed) ||
      /^(-{3,}|\*{3,})$/.test(trimmed);
  }

  private renderInlineMarkdown(text: string): string {
    const codeTokens: string[] = [];
    let rendered = text.replace(/`([^`]+)`/g, (_match, code: string) => {
      const token = `@@CODE${codeTokens.length}@@`;
      codeTokens.push(`<code>${this.escapeHtml(code)}</code>`);
      return token;
    });

    rendered = this.escapeHtml(rendered);
    rendered = rendered.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label: string, url: string) => {
      const safeUrl = this.sanitizeLinkUrl(url);
      if (!safeUrl) return label;
      return `<a href="${this.escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    rendered = rendered.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    rendered = rendered.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    rendered = rendered.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    rendered = rendered.replace(/_([^_]+)_/g, '<em>$1</em>');
    rendered = rendered.replace(/@@CODE(\d+)@@/g, (_match, tokenIndex: string) => {
      return codeTokens[Number(tokenIndex)] ?? '';
    });

    return rendered;
  }

  private sanitizeLinkUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }
    } catch (_error) {
      return null;
    }
    return null;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeAttribute(value: string): string {
    return this.escapeHtml(value);
  }

  private createStreamingMessageElement(): HTMLElement {
    if (!this.chatContainer) return document.createElement('div');

    this.chatContainer.querySelector('.welcome-message')?.remove();

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', 'assistant', 'streaming');

    const header = document.createElement('div');
    header.classList.add('message-header');
    header.textContent = 'PaperAgent Assistant';

    const content = document.createElement('div');
    content.classList.add('message-content');
    content.dataset['rawText'] = '';

    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    this.chatContainer.appendChild(messageDiv);
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;

    return messageDiv;
  }

  private appendToStreamingMessage(el: HTMLElement, text: string): void {
    const content = el.querySelector<HTMLElement>('.message-content');
    if (content) {
      const nextText = (content.dataset['rawText'] ?? '') + text;
      content.dataset['rawText'] = nextText;
      this.renderMessageContent(content, 'assistant', nextText);
      this.chatContainer!.scrollTop = this.chatContainer!.scrollHeight;
    }
  }

  private finalizeStreamingMessage(el: HTMLElement, isError = false): void {
    el.classList.remove('streaming');
    if (isError) {
      const content = el.querySelector<HTMLElement>('.message-content');
      if (content && !(content.dataset['rawText'] ?? '').trim()) {
        const errorText = '[Response failed. Check your settings and try again.]';
        content.dataset['rawText'] = errorText;
        this.renderMessageContent(content, 'assistant', errorText);
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
    header.textContent = role === 'user' ? 'You' : 'PaperAgent Assistant';

    const contentEl = document.createElement('div');
    contentEl.classList.add('message-content');
    this.renderMessageContent(contentEl, role, content);

    messageDiv.appendChild(header);
    messageDiv.appendChild(contentEl);
    this.chatContainer.appendChild(messageDiv);
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  /** Bind settings modal events once during initialization. */
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

    // Document viewer modal
    document.getElementById('closeDocViewerBtn')?.addEventListener('click', () => this.closeDocumentViewer());
    document.getElementById('docViewerModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeDocumentViewer();
    });
  }

  private openSettings(): void {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;

    // Fill the form with the current configuration.
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

    if (!apiKey) { this.showNotification('API Key cannot be empty.', 'error'); return; }
    if (!model) { this.showNotification('Model cannot be empty.', 'error'); return; }

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
      this.showNotification('Settings saved.', 'success');
      this.closeSettings();
    } else {
      this.showNotification(`Save failed: ${result.message}`, 'error');
    }
  }

  private async testConnection(): Promise<void> {
    const testResult = document.getElementById('testConnectionResult');
    if (!testResult) return;

    const apiKey = (document.getElementById('apiKeyInput') as HTMLInputElement).value.trim();
    const model = (document.getElementById('modelInput') as HTMLInputElement).value.trim();
    const provider = (document.getElementById('providerSelect') as HTMLSelectElement).value as LLMProviderConfig['provider'];
    const baseUrl = (document.getElementById('baseUrlInput') as HTMLInputElement).value.trim();

    if (!apiKey) { this.showNotification('Enter an API key first.', 'error'); return; }

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
    testBtn.textContent = 'Testing...';
    testResult.style.display = 'none';

    let fullText = '';

    await new Promise<void>((resolve) => {
      this.llmService.sendMessageStreaming(
        [{ role: 'user', content: 'Hello, respond with "OK" only.' }],
        testConfig,
        (chunk) => { fullText += chunk; },
        () => {
          testResult.textContent = `✓ Connection successful. Response: ${fullText.substring(0, 80)}`;
          testResult.className = 'connection-result success';
          testResult.style.display = 'block';
          resolve();
        },
        (error) => {
          testResult.textContent = `✗ Connection failed: ${error}`;
          testResult.className = 'connection-result error';
          testResult.style.display = 'block';
          resolve();
        }
      );
    });

    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';
  }

  // ── Rendering ────────────────────────────────────────────────────────────────

  private renderOutline(): void {
    if (!this.outlineContainer || !this.sessionData) return;
    this.outlineContainer.innerHTML = '';

    if (this.sessionData.outline.length === 0) {
      this.outlineContainer.innerHTML = '<p>No outline yet.</p>';
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
          this.showNotification(`${item.title}: ${item.summary}`, 'info');
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
      this.documentContainer.innerHTML = '<p>No documents yet.</p>';
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
      title.textContent = doc.title || doc.path.split('/').pop() || 'Untitled Document';

      const deleteBtn = document.createElement('button');
      deleteBtn.classList.add('delete-doc-btn');
      deleteBtn.textContent = '✕';
      deleteBtn.title = 'Remove document';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        void this.deleteDocument(doc.key);
      });

      header.appendChild(title);
      header.appendChild(deleteBtn);

      const meta = document.createElement('div');
      meta.classList.add('document-item-meta');
      const sizeKb = doc.size > 0 ? `${Math.round(doc.size / 1024)} KB` : 'Unknown size';
      meta.textContent = `${doc.type.toUpperCase()} • ${sizeKb} • ${new Date(doc.uploadDate).toLocaleDateString()}`;

      div.appendChild(header);
      div.appendChild(meta);

      if (doc.contentPreview) {
        const preview = document.createElement('div');
        preview.classList.add('document-item-preview');
        preview.textContent = doc.contentPreview.substring(0, 80);
        div.appendChild(preview);
      }

      // Click a document item to view the full extracted content.
      div.addEventListener('click', () => this.showDocumentViewer(doc));

      this.documentContainer.appendChild(div);
    }
  }

  private async deleteDocument(key: string): Promise<void> {
    if (!this.sessionData) return;
    this.sessionData.documentLibrary.documents = this.sessionData.documentLibrary.documents.filter(d => d.key !== key);
    this.sessionData.metadata.documentsCount = this.sessionData.documentLibrary.documents.length;
    this.renderDocuments();
    await this.persistSessionSnapshot();
    this.showNotification('Document removed.', 'success');
  }

  private showDocumentViewer(doc: import('../../shared/types.js').DocumentInfo): void {
    const modal = document.getElementById('docViewerModal');
    const titleEl = document.getElementById('docViewerTitle');
    const contentEl = document.getElementById('docViewerContent');
    if (!modal || !titleEl || !contentEl) return;

    titleEl.textContent = doc.title || doc.path.split('/').pop() || 'Untitled Document';
    const text = doc.fullContent || doc.contentPreview;
    contentEl.textContent = text || '(No extracted text available.)';
    modal.style.display = 'flex';
  }

  private closeDocumentViewer(): void {
    const modal = document.getElementById('docViewerModal');
    if (modal) modal.style.display = 'none';
  }

  private startSessionTitleEdit(): void {
    if (!this.sessionData) {
      this.showNotification('Create or load a session first.', 'error');
      return;
    }
    if (!this.sessionTitle || !this.sessionTitleInput || !this.editSessionTitleBtn || !this.saveSessionTitleBtn || !this.cancelSessionTitleBtn) {
      return;
    }

    this.sessionTitleInput.value = this.sessionData.title;
    this.sessionTitle.style.display = 'none';
    this.sessionTitleInput.style.display = '';
    this.editSessionTitleBtn.style.display = 'none';
    this.saveSessionTitleBtn.style.display = '';
    this.cancelSessionTitleBtn.style.display = '';
    this.sessionTitleInput.focus();
    this.sessionTitleInput.select();
  }

  private cancelSessionTitleEdit(): void {
    this.syncSessionTitleEditState();
  }

  private async commitSessionTitleEdit(): Promise<void> {
    if (!this.sessionData || !this.sessionTitleInput) return;

    const nextTitle = this.sessionTitleInput.value.trim();
    if (!nextTitle) {
      this.showNotification('Session name cannot be empty.', 'error');
      this.sessionTitleInput.focus();
      return;
    }

    if (nextTitle !== this.sessionData.title) {
      this.sessionData = touchSession({
        ...this.sessionData,
        title: nextTitle
      });
      this.updateSessionTitle(nextTitle);
      await this.persistSessionSnapshot({ touch: false });
      this.showNotification('Session name updated.', 'success');
    }

    this.syncSessionTitleEditState();
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

  private renderConversationHistory(): void {
    if (!this.chatContainer || !this.sessionData) return;
    this.chatContainer.innerHTML = '';
    for (const message of this.sessionData.conversationHistory) {
      this.addMessageToChat(message.role, message.content);
    }
  }

  private renderSession(): void {
    if (!this.sessionData) return;
    this.updateSessionTitle(this.sessionData.title);
    this.syncSessionTitleEditState();
    this.renderConversationHistory();
    this.renderOutline();
    this.renderDocuments();
  }

  private updateSessionTitle(title: string): void {
    if (this.sessionTitle) this.sessionTitle.textContent = title;
    if (this.sessionTitleInput) this.sessionTitleInput.value = title;
  }

  private syncSessionTitleEditState(): void {
    if (!this.sessionTitle || !this.sessionTitleInput || !this.editSessionTitleBtn || !this.saveSessionTitleBtn || !this.cancelSessionTitleBtn) {
      return;
    }

    this.sessionTitle.style.display = '';
    this.sessionTitleInput.style.display = 'none';
    this.saveSessionTitleBtn.style.display = 'none';
    this.cancelSessionTitleBtn.style.display = 'none';
    this.editSessionTitleBtn.style.display = '';
    this.editSessionTitleBtn.disabled = !this.sessionData;
    this.editSessionTitleBtn.title = this.sessionData ? 'Rename session' : 'Create or load a session first';

    if (this.sessionData) {
      this.sessionTitleInput.value = this.sessionData.title;
    }
  }

  // ── Session History ──────────────────────────────────────────────────────────

  private normalizeSessionHistoryEntry(raw: Record<string, unknown>): SessionHistoryEntry | null {
    const id = typeof raw['id'] === 'string' ? raw['id'] : '';
    if (!id) return null;

    const filePath = typeof raw['filePath'] === 'string' ? raw['filePath'] : '';
    const storagePath = typeof raw['storagePath'] === 'string' && raw['storagePath']
      ? raw['storagePath']
      : filePath;

    return {
      id,
      title: typeof raw['title'] === 'string' ? raw['title'] : 'Untitled Session',
      description: typeof raw['description'] === 'string' ? raw['description'] : '',
      createdAt: typeof raw['createdAt'] === 'string' ? raw['createdAt'] : new Date().toISOString(),
      lastModified: typeof raw['lastModified'] === 'string' ? raw['lastModified'] : new Date().toISOString(),
      filePath,
      storagePath
    };
  }

  private getSessionHistory(): SessionHistoryEntry[] {
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_HISTORY_KEY) ?? '[]');
      if (!Array.isArray(stored)) return [];

      return stored
        .map(entry => this.normalizeSessionHistoryEntry(entry as Record<string, unknown>))
        .filter((entry): entry is SessionHistoryEntry => entry !== null);
    } catch (e) {
      console.error('Failed to read session history:', e);
      return [];
    }
  }

  private saveSessionHistory(sessions: SessionHistoryEntry[]): void {
    localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(sessions));
  }

  private upsertSessionHistory(sessionData: SessionData, paths: Partial<Pick<SessionHistoryEntry, 'filePath' | 'storagePath'>> = {}): void {
    try {
      const sessions = this.getSessionHistory();
      const existing = sessions.find(s => s.id === sessionData.sessionId);
      const sessionInfo: SessionHistoryEntry = {
        id: sessionData.sessionId,
        title: sessionData.title,
        description: sessionData.description,
        createdAt: sessionData.createdAt,
        lastModified: sessionData.lastModified,
        filePath: paths.filePath ?? existing?.filePath ?? '',
        storagePath: paths.storagePath ?? existing?.storagePath ?? existing?.filePath ?? ''
      };
      const idx = sessions.findIndex(s => s.id === sessionInfo.id);
      if (idx !== -1) sessions[idx] = sessionInfo;
      else sessions.unshift(sessionInfo);
      this.saveSessionHistory(sessions);
      this.renderSessionHistory();
    } catch (e) {
      console.error('Failed to write session history:', e);
    }
  }

  private async persistSessionSnapshot(options: { filePath?: string; touch?: boolean } = {}): Promise<void> {
    if (!this.sessionData) return;

    try {
      if (options.touch !== false) {
        this.sessionData = touchSession(this.sessionData);
      }

      const result = await window.electronAPI.saveSessionSnapshot(this.sessionData);
      if (!result.success || !result.filePath) {
        this.showNotification(`Autosave failed: ${result.message ?? 'Unknown error'}`, 'error');
        return;
      }

      this.upsertSessionHistory(this.sessionData, {
        filePath: options.filePath,
        storagePath: result.filePath
      });
    } catch (e) {
      console.error('Failed to autosave session:', e);
      this.showNotification('Failed to autosave session.', 'error');
    }
  }

  private renderSessionHistory(): void {
    if (!this.sessionHistoryContainer) return;
    try {
      const sessions = this.getSessionHistory();

      if (sessions.length === 0) {
        this.sessionHistoryContainer.innerHTML = '<p class="no-sessions">No saved sessions yet.</p>';
        return;
      }

      this.sessionHistoryContainer.innerHTML = sessions.map(s => `
        <div class="session-item" data-session-id="${s.id}">
          <div class="session-header">
            <h4>${s.title}</h4>
            <div class="session-actions">
              <button class="delete-session-btn" data-session-id="${s.id}">Delete</button>
            </div>
          </div>
          <div class="session-info">
            <p>${s.description || 'No description'}</p>
            <small>Updated: ${new Date(s.lastModified).toLocaleString()}</small>
          </div>
        </div>`).join('');

      this.sessionHistoryContainer.querySelectorAll('.session-item').forEach(item => {
        item.addEventListener('click', () => {
          const sessionId = (item as HTMLElement).dataset['sessionId'];
          if (sessionId) void this.loadSessionById(sessionId);
        });
      });

      this.sessionHistoryContainer.querySelectorAll('.delete-session-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const sessionId = (e.target as HTMLElement).dataset['sessionId'];
          if (sessionId) void this.deleteSessionById(sessionId);
        });
      });
    } catch (e) {
      console.error('Failed to render session history:', e);
      this.sessionHistoryContainer.innerHTML = '<p>Error loading session history.</p>';
    }
  }

  private async deleteSessionById(sessionId: string): Promise<void> {
    if (!confirm('Remove this session from history? Exported files will not be deleted.')) return;
    try {
      const sessions = this.getSessionHistory().filter(s => s.id !== sessionId);
      this.saveSessionHistory(sessions);
      const result = await window.electronAPI.deleteSessionSnapshot(sessionId);
      if (!result.success) {
        console.error('Failed to delete autosave file:', result.message);
      }
      if (this.sessionData?.sessionId === sessionId) {
        this.sessionData = null;
        this.updateSessionTitle('No Active Session');
        this.syncSessionTitleEditState();
        this.clearChat();
        if (this.outlineContainer) this.outlineContainer.innerHTML = '';
        if (this.documentContainer) this.documentContainer.innerHTML = '';
      }
      this.renderSessionHistory();
      this.showNotification('Session removed from history.', 'success');
    } catch (e) {
      console.error(e);
      this.showNotification('Delete failed.', 'error');
    }
  }

  private async loadSessionById(sessionId: string): Promise<void> {
    const sessions = this.getSessionHistory();
    const session = sessions.find(s => s.id === sessionId);
    const loadPaths = [...new Set([session?.storagePath, session?.filePath].filter((value): value is string => Boolean(value)))];
    if (!session || loadPaths.length === 0) {
      this.showNotification('Session data was not found. Save it again before loading.', 'error');
      return;
    }

    try {
      for (const filePath of loadPaths) {
        const loaded = await window.electronAPI.loadSessionFromFile(filePath);
        if (!loaded) continue;

        this.sessionData = loaded;
        this.renderSession();
        await this.persistSessionSnapshot({
          filePath: session.filePath,
          touch: false
        });
        this.showNotification(`Session "${session.title}" loaded.`, 'success');
        return;
      }

      this.showNotification('The session file is missing or corrupted.', 'error');
    } catch (e) {
      this.showNotification('An error occurred while loading the session.', 'error');
      console.error(e);
    }
  }
}

// Initialize the app after the DOM is ready.
document.addEventListener('DOMContentLoaded', () => {
  new PaperAgentApp();
  SessionManager.initSessionManagement();
});
