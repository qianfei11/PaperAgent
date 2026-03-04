import { SessionManager } from './components/sessionManager';
import { OpenAILLMService } from './services/llmService';
import { ContextService } from './services/contextService';
class PaperAgentApp {
    sessionData = null;
    chatContainer = null;
    outlineContainer = null;
    documentContainer = null;
    sessionHistoryContainer = null;
    messageInput = null;
    sendButton = null;
    sessionTitle = null;
    providerConfig = {
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com',
        apiKey: '',
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 2048
    };
    llmService;
    contextService;
    constructor() {
        this.llmService = new OpenAILLMService();
        this.contextService = new ContextService(this.llmService);
        this.initializeElements();
        this.setupEventListeners();
        this.loadConfig();
        this.loadInitialView();
    }
    initializeElements() {
        this.chatContainer = document.getElementById('chatContainer');
        this.outlineContainer = document.getElementById('outlineContainer');
        this.documentContainer = document.getElementById('documentContainer');
        this.sessionHistoryContainer = document.getElementById('sessionHistoryContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendBtn');
        this.sessionTitle = document.getElementById('sessionTitle');
        document.getElementById('newSessionBtn')?.addEventListener('click', () => this.createNewSession());
        document.getElementById('saveSessionBtn')?.addEventListener('click', () => this.saveSession());
        document.getElementById('loadSessionBtn')?.addEventListener('click', () => this.loadSession());
        document.getElementById('addDocumentBtn')?.addEventListener('click', () => this.addDocument());
        document.getElementById('settingsBtn')?.addEventListener('click', () => this.openSettings());
        this.wireSettingsModal();
        this.renderSessionHistory();
    }
    setupEventListeners() {
        this.messageInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        this.sendButton?.addEventListener('click', () => this.sendMessage());
    }
    async loadConfig() {
        try {
            const config = await window.electronAPI.getConfig();
            this.providerConfig = config.llm;
            this.llmService.setProviderConfig(this.providerConfig);
        }
        catch (e) {
            console.error('加载配置失败:', e);
        }
    }
    loadInitialView() {
        this.updateSessionTitle('无活动会话');
    }
    showNotification(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container)
            return;
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
    async createNewSession() {
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
        }
        catch (error) {
            this.showNotification('创建新会话失败，请重试', 'error');
            console.error(error);
        }
    }
    async saveSession() {
        if (!this.sessionData) {
            this.showNotification('没有活动的会话可以保存', 'error');
            return;
        }
        try {
            const filePath = await window.electronAPI.showSaveDialog({
                title: '保存会话',
                defaultPath: `${this.sessionData.title || 'session'}.json`,
                filters: [{ name: 'JSON Files', extensions: ['json'] }]
            });
            if (!filePath)
                return;
            const result = await window.electronAPI.saveSessionToFile(this.sessionData, filePath);
            if (result.success) {
                this.updateSessionFilePath(this.sessionData.sessionId, filePath);
                this.showNotification('会话已保存', 'success');
            }
            else {
                this.showNotification(`保存失败: ${result.message}`, 'error');
            }
        }
        catch (error) {
            this.showNotification('保存会话时发生错误', 'error');
            console.error(error);
        }
    }
    async loadSession() {
        try {
            const filePaths = await window.electronAPI.showOpenDialog({
                title: '加载会话',
                filters: [{ name: 'JSON Files', extensions: ['json'] }],
                properties: ['openFile']
            });
            if (!filePaths || filePaths.length === 0)
                return;
            const filePath = filePaths[0];
            this.sessionData = await window.electronAPI.loadSessionFromFile(filePath);
            if (this.sessionData) {
                this.updateSessionTitle(this.sessionData.title);
                this.clearChat();
                this.renderOutline();
                this.renderDocuments();
                this.addToSessionHistory(this.sessionData);
                this.updateSessionFilePath(this.sessionData.sessionId, filePath);
                this.showNotification('会话加载成功', 'success');
            }
            else {
                this.showNotification('加载失败：文件格式不正确', 'error');
            }
        }
        catch (error) {
            this.showNotification('加载会话时发生错误', 'error');
            console.error(error);
        }
    }
    async addDocument() {
        if (!this.sessionData) {
            this.showNotification('请先创建或加载会话', 'error');
            return;
        }
        try {
            const filePaths = await window.electronAPI.selectFiles([
                { name: '文档', extensions: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png', 'bmp', 'tiff'] }
            ]);
            if (!filePaths || filePaths.length === 0)
                return;
            for (const filePath of filePaths) {
                const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? filePath;
                this.showNotification(`正在处理 ${fileName}...`, 'info');
                try {
                    const docInfo = await this.contextService.getDocumentService().uploadDocument(filePath);
                    this.sessionData.documentLibrary.documents.push(docInfo);
                    this.sessionData.metadata.documentsCount = this.sessionData.documentLibrary.documents.length;
                    this.showNotification(`文档 "${docInfo.title}" 添加成功`, 'success');
                }
                catch (_e) {
                    this.showNotification(`文件 "${fileName}" 处理失败`, 'error');
                }
            }
            this.renderDocuments();
        }
        catch (error) {
            this.showNotification('添加文档时发生错误', 'error');
            console.error(error);
        }
    }
    async sendMessage() {
        if (!this.sessionData) {
            this.showNotification('请先创建或加载会话', 'error');
            return;
        }
        if (!this.messageInput)
            return;
        const message = this.messageInput.value.trim();
        if (!message)
            return;
        if (!this.providerConfig.apiKey) {
            this.showNotification('请先在设置中配置 API Key', 'error');
            this.openSettings();
            return;
        }
        this.setSendingState(true);
        this.addMessageToChat('user', message);
        this.messageInput.value = '';
        const assistantEl = this.createStreamingMessageElement();
        try {
            const context = await this.contextService.createContext(this.sessionData);
            const messages = this.llmService.buildMessages(context, message);
            await new Promise((resolve, reject) => {
                this.llmService.sendMessageStreaming(messages, this.providerConfig, (chunk) => {
                    this.appendToStreamingMessage(assistantEl, chunk);
                }, async (fullText) => {
                    this.finalizeStreamingMessage(assistantEl);
                    try {
                        this.sessionData = await this.contextService.updateContext(this.sessionData, message, fullText);
                        this.renderOutline();
                    }
                    catch (e) {
                        console.error('上下文更新失败:', e);
                    }
                    resolve();
                }, (error) => {
                    this.finalizeStreamingMessage(assistantEl, true);
                    this.showNotification(`LLM 响应错误: ${error}`, 'error');
                    reject(new Error(error));
                });
            });
        }
        catch (error) {
            console.error('发送消息失败:', error);
        }
        finally {
            this.setSendingState(false);
        }
    }
    setSendingState(sending) {
        if (!this.sendButton)
            return;
        this.sendButton.disabled = sending;
        this.sendButton.classList.toggle('loading', sending);
    }
    createStreamingMessageElement() {
        if (!this.chatContainer)
            return document.createElement('div');
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
    appendToStreamingMessage(el, text) {
        const content = el.querySelector('.message-content');
        if (content) {
            content.textContent = (content.textContent ?? '') + text;
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }
    }
    finalizeStreamingMessage(el, isError = false) {
        el.classList.remove('streaming');
        if (isError) {
            const content = el.querySelector('.message-content');
            if (content && !content.textContent?.trim()) {
                content.textContent = '[响应出错，请检查设置后重试]';
            }
        }
    }
    addMessageToChat(role, content) {
        if (!this.chatContainer)
            return;
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
    wireSettingsModal() {
        document.getElementById('providerSelect')?.addEventListener('change', () => this.updateBaseUrlRowVisibility());
        const temperatureInput = document.getElementById('temperatureInput');
        const temperatureValue = document.getElementById('temperatureValue');
        temperatureInput?.addEventListener('input', () => {
            if (temperatureValue)
                temperatureValue.textContent = temperatureInput.value;
        });
        document.getElementById('closeSettingsBtn')?.addEventListener('click', () => this.closeSettings());
        document.getElementById('cancelSettingsBtn')?.addEventListener('click', () => this.closeSettings());
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => this.saveSettings());
        document.getElementById('testConnectionBtn')?.addEventListener('click', () => this.testConnection());
        document.getElementById('settingsModal')?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget)
                this.closeSettings();
        });
    }
    openSettings() {
        const modal = document.getElementById('settingsModal');
        if (!modal)
            return;
        const cfg = this.providerConfig;
        document.getElementById('providerSelect').value = cfg.provider;
        document.getElementById('baseUrlInput').value = cfg.baseUrl ?? '';
        document.getElementById('apiKeyInput').value = cfg.apiKey;
        document.getElementById('modelInput').value = cfg.model;
        document.getElementById('temperatureInput').value = String(cfg.temperature ?? 0.7);
        document.getElementById('temperatureValue').textContent = String(cfg.temperature ?? 0.7);
        document.getElementById('maxTokensInput').value = String(cfg.maxTokens ?? 2048);
        this.updateBaseUrlRowVisibility();
        const testResult = document.getElementById('testConnectionResult');
        if (testResult)
            testResult.style.display = 'none';
        modal.style.display = 'flex';
    }
    updateBaseUrlRowVisibility() {
        const provider = document.getElementById('providerSelect')?.value;
        const baseUrlRow = document.getElementById('baseUrlRow');
        if (baseUrlRow)
            baseUrlRow.style.display = provider === 'anthropic' ? 'none' : '';
    }
    closeSettings() {
        const modal = document.getElementById('settingsModal');
        if (modal)
            modal.style.display = 'none';
    }
    async saveSettings() {
        const provider = document.getElementById('providerSelect').value;
        const baseUrl = document.getElementById('baseUrlInput').value.trim();
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        const model = document.getElementById('modelInput').value.trim();
        const temperature = parseFloat(document.getElementById('temperatureInput').value);
        const maxTokens = parseInt(document.getElementById('maxTokensInput').value, 10);
        if (!apiKey) {
            this.showNotification('API Key 不能为空', 'error');
            return;
        }
        if (!model) {
            this.showNotification('Model 不能为空', 'error');
            return;
        }
        this.providerConfig = {
            provider,
            baseUrl: provider === 'anthropic' ? undefined : baseUrl,
            apiKey,
            model,
            temperature,
            maxTokens
        };
        this.llmService.setProviderConfig(this.providerConfig);
        const config = { version: '1.0', llm: this.providerConfig };
        const result = await window.electronAPI.saveConfig(config);
        if (result.success) {
            this.showNotification('设置已保存', 'success');
            this.closeSettings();
        }
        else {
            this.showNotification(`保存失败: ${result.message}`, 'error');
        }
    }
    async testConnection() {
        const testResult = document.getElementById('testConnectionResult');
        if (!testResult)
            return;
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        const model = document.getElementById('modelInput').value.trim();
        const provider = document.getElementById('providerSelect').value;
        const baseUrl = document.getElementById('baseUrlInput').value.trim();
        if (!apiKey) {
            this.showNotification('请先填写 API Key', 'error');
            return;
        }
        const testConfig = {
            provider,
            baseUrl: provider === 'anthropic' ? undefined : baseUrl,
            apiKey,
            model: model || 'gpt-4o',
            temperature: 0.1,
            maxTokens: 50
        };
        const testBtn = document.getElementById('testConnectionBtn');
        testBtn.disabled = true;
        testBtn.textContent = '测试中...';
        testResult.style.display = 'none';
        let fullText = '';
        await new Promise((resolve) => {
            this.llmService.sendMessageStreaming([{ role: 'user', content: 'Hello, respond with "OK" only.' }], testConfig, (chunk) => { fullText += chunk; }, () => {
                testResult.textContent = `✓ 连接成功！响应: ${fullText.substring(0, 80)}`;
                testResult.className = 'connection-result success';
                testResult.style.display = 'block';
                resolve();
            }, (error) => {
                testResult.textContent = `✗ 连接失败: ${error}`;
                testResult.className = 'connection-result error';
                testResult.style.display = 'block';
                resolve();
            });
        });
        testBtn.disabled = false;
        testBtn.textContent = '测试连接';
    }
    renderOutline() {
        if (!this.outlineContainer || !this.sessionData)
            return;
        this.outlineContainer.innerHTML = '';
        if (this.sessionData.outline.length === 0) {
            this.outlineContainer.innerHTML = '<p>暂无大纲内容</p>';
            return;
        }
        const renderItems = (items, level = 0) => {
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
    renderDocuments() {
        if (!this.documentContainer || !this.sessionData)
            return;
        this.documentContainer.innerHTML = '';
        if (this.sessionData.documentLibrary.documents.length === 0) {
            this.documentContainer.innerHTML = '<p>暂无文档</p>';
            return;
        }
        for (const doc of this.sessionData.documentLibrary.documents) {
            const div = document.createElement('div');
            div.classList.add('document-item');
            const title = document.createElement('div');
            title.classList.add('document-item-title');
            title.textContent = doc.title || doc.path.split('/').pop() || '未知文档';
            const meta = document.createElement('div');
            meta.classList.add('document-item-meta');
            const sizeKb = doc.size > 0 ? `${Math.round(doc.size / 1024)} KB` : '未知大小';
            meta.textContent = `${doc.type.toUpperCase()} • ${sizeKb} • ${new Date(doc.uploadDate).toLocaleDateString()}`;
            div.appendChild(title);
            div.appendChild(meta);
            if (doc.contentPreview) {
                const preview = document.createElement('div');
                preview.classList.add('document-item-preview');
                preview.style.cssText = 'font-size:0.8em;color:#6b7280;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
                preview.textContent = doc.contentPreview.substring(0, 80);
                div.appendChild(preview);
            }
            this.documentContainer.appendChild(div);
        }
    }
    clearChat() {
        if (this.chatContainer)
            this.chatContainer.innerHTML = '';
    }
    updateSessionTitle(title) {
        if (this.sessionTitle)
            this.sessionTitle.textContent = title;
    }
    addToSessionHistory(sessionData) {
        try {
            const sessions = JSON.parse(localStorage.getItem('paperAgentSessions') ?? '[]');
            const sessionInfo = {
                id: sessionData.sessionId,
                title: sessionData.title,
                description: sessionData.description,
                createdAt: sessionData.createdAt,
                lastModified: sessionData.lastModified,
                filePath: ''
            };
            const idx = sessions.findIndex(s => s.id === sessionInfo.id);
            if (idx !== -1)
                sessions[idx] = sessionInfo;
            else
                sessions.unshift(sessionInfo);
            localStorage.setItem('paperAgentSessions', JSON.stringify(sessions));
            this.renderSessionHistory();
        }
        catch (e) {
            console.error('写入会话历史失败:', e);
        }
    }
    renderSessionHistory() {
        if (!this.sessionHistoryContainer)
            return;
        try {
            const sessions = JSON.parse(localStorage.getItem('paperAgentSessions') ?? '[]');
            if (sessions.length === 0) {
                this.sessionHistoryContainer.innerHTML = '<p class="no-sessions">暂无历史会话</p>';
                return;
            }
            this.sessionHistoryContainer.innerHTML = sessions.map(s => `
        <div class="session-item" data-session-id="${s.id}">
          <div class="session-header">
            <h4>${s.title}</h4>
            <button class="load-session-btn" data-session-id="${s.id}">加载</button>
          </div>
          <div class="session-info">
            <p>${s.description || '无描述'}</p>
            <small>创建: ${new Date(s.createdAt).toLocaleString()}</small>
          </div>
        </div>`).join('');
            this.sessionHistoryContainer.querySelectorAll('.load-session-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const sessionId = e.target.dataset['sessionId'];
                    if (sessionId)
                        this.loadSessionById(sessionId);
                });
            });
        }
        catch (e) {
            console.error('渲染会话历史失败:', e);
            this.sessionHistoryContainer.innerHTML = '<p>加载历史时出错</p>';
        }
    }
    async loadSessionById(sessionId) {
        const sessions = JSON.parse(localStorage.getItem('paperAgentSessions') ?? '[]');
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
            }
            else {
                this.showNotification('加载失败：文件格式不正确', 'error');
            }
        }
        catch (e) {
            this.showNotification('加载会话时发生错误', 'error');
            console.error(e);
        }
    }
    updateSessionFilePath(sessionId, filePath) {
        try {
            const sessions = JSON.parse(localStorage.getItem('paperAgentSessions') ?? '[]');
            const idx = sessions.findIndex(s => s.id === sessionId);
            if (idx !== -1) {
                sessions[idx].filePath = filePath;
                localStorage.setItem('paperAgentSessions', JSON.stringify(sessions));
            }
        }
        catch (e) {
            console.error(e);
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    new PaperAgentApp();
    SessionManager.initSessionManagement();
});
//# sourceMappingURL=main.js.map