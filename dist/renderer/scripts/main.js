import { SessionManager } from './components/sessionManager';
class PaperAgentApp {
    sessionData = null;
    chatContainer = null;
    outlineContainer = null;
    documentContainer = null;
    sessionHistoryContainer = null;
    messageInput = null;
    sendButton = null;
    sessionTitle = null;
    sessionManager = null;
    constructor() {
        this.initializeElements();
        this.setupEventListeners();
        this.loadInitialView();
        SessionManager.initSessionManagement();
    }
    initializeElements() {
        this.chatContainer = document.getElementById('chatContainer');
        this.outlineContainer = document.getElementById('outlineContainer');
        this.documentContainer = document.getElementById('documentContainer');
        this.sessionHistoryContainer = document.getElementById('sessionHistoryContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendBtn');
        this.sessionTitle = document.getElementById('sessionTitle');
        const newSessionBtn = document.getElementById('newSessionBtn');
        const saveSessionBtn = document.getElementById('saveSessionBtn');
        const loadSessionBtn = document.getElementById('loadSessionBtn');
        const addDocumentBtn = document.getElementById('addDocumentBtn');
        if (newSessionBtn)
            newSessionBtn.addEventListener('click', () => this.createNewSession());
        if (saveSessionBtn)
            saveSessionBtn.addEventListener('click', () => this.saveSession());
        if (loadSessionBtn)
            loadSessionBtn.addEventListener('click', () => this.loadSession());
        if (addDocumentBtn)
            addDocumentBtn.addEventListener('click', () => this.addDocument());
        if (this.sessionHistoryContainer) {
            this.renderSessionHistory();
        }
    }
    setupEventListeners() {
        if (this.messageInput && this.sendButton) {
            this.messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            this.sendButton.addEventListener('click', () => this.sendMessage());
        }
    }
    loadInitialView() {
        this.updateSessionTitle('无活动会话');
    }
    async createNewSession() {
        try {
            this.sessionData = await window.electronAPI.createNewSession();
            if (this.sessionData) {
                this.updateSessionTitle(this.sessionData.title);
                this.clearChat();
                this.renderOutline();
                this.renderDocuments();
                this.addMessageToChat('assistant', '您好！我是PaperAgent助手，可以帮助您进行论文阅读和思考。请告诉我您想讨论什么内容。');
                if (this.sessionData) {
                    this.addToSessionHistory(this.sessionData);
                }
            }
        }
        catch (error) {
            console.error('创建新会话失败:', error);
            alert('创建新会话失败，请重试。');
        }
    }
    async saveSession() {
        if (!this.sessionData) {
            alert('没有活动的会话可以保存。');
            return;
        }
        try {
            const filePath = await window.electronAPI.showSaveDialog({
                title: '保存会话',
                defaultPath: `${this.sessionData.title || 'session'}.json`,
                filters: [
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            });
            if (filePath) {
                const result = await window.electronAPI.saveSessionToFile(this.sessionData, filePath);
                if (result.success) {
                    alert(`会话已成功保存到: ${filePath}`);
                    this.updateSessionFilePath(this.sessionData.sessionId, filePath);
                }
                else {
                    alert(`保存失败: ${result.message}`);
                }
            }
        }
        catch (error) {
            console.error('保存会话失败:', error);
            alert('保存会话时发生错误。');
        }
    }
    async loadSession() {
        try {
            const filePaths = await window.electronAPI.showOpenDialog({
                title: '加载会话',
                filters: [
                    { name: 'JSON Files', extensions: ['json'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['openFile']
            });
            if (filePaths && filePaths.length > 0) {
                const filePath = filePaths[0];
                this.sessionData = await window.electronAPI.loadSessionFromFile(filePath);
                if (this.sessionData) {
                    this.updateSessionTitle(this.sessionData.title);
                    this.clearChat();
                    this.renderOutline();
                    this.renderDocuments();
                    alert(`会话已从 ${filePath} 成功加载！`);
                    this.addToSessionHistory(this.sessionData);
                    this.updateSessionFilePath(this.sessionData.sessionId, filePath);
                }
                else {
                    alert('加载会话失败：文件格式可能不正确。');
                }
            }
        }
        catch (error) {
            console.error('加载会话失败:', error);
            alert('加载会话时发生错误。');
        }
    }
    async addDocument() {
        try {
            const filePaths = await window.electronAPI.selectFiles([
                { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png'] }
            ]);
            if (filePaths && filePaths.length > 0) {
                console.log('Selected files:', filePaths);
                alert(`已选择 ${filePaths.length} 个文件，实际实现中将处理这些文档。`);
            }
        }
        catch (error) {
            console.error('添加文档失败:', error);
            alert('添加文档时发生错误。');
        }
    }
    async sendMessage() {
        if (!this.messageInput || !this.sessionData)
            return;
        const message = this.messageInput.value.trim();
        if (!message)
            return;
        if (this.sendButton) {
            this.sendButton.disabled = true;
        }
        try {
            this.addMessageToChat('user', message);
            this.messageInput.value = '';
            setTimeout(() => {
                const response = this.generateMockResponse(message);
                this.addMessageToChat('assistant', response);
                this.updateOutlineWithMessage(message, response);
                if (this.sendButton) {
                    this.sendButton.disabled = false;
                }
            }, 1000);
        }
        catch (error) {
            console.error('发送消息失败:', error);
            alert('发送消息时发生错误。');
            if (this.sendButton) {
                this.sendButton.disabled = false;
            }
        }
    }
    addMessageToChat(role, content) {
        if (!this.chatContainer)
            return;
        const welcomeMessage = this.chatContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', role);
        const messageHeader = document.createElement('div');
        messageHeader.classList.add('message-header');
        messageHeader.textContent = role === 'user' ? '您' : 'PaperAgent助手';
        const messageContent = document.createElement('div');
        messageContent.textContent = content;
        messageDiv.appendChild(messageHeader);
        messageDiv.appendChild(messageContent);
        this.chatContainer.appendChild(messageDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    }
    generateMockResponse(input) {
        const responses = [
            `关于"${input}"，这是一个很有趣的话题。根据我的分析，有几个关键点需要注意...`,
            `感谢您提出关于"${input}"的问题。基于当前上下文，我认为...`,
            `您提到的"${input}"确实值得深入探讨。结合相关文档，我的见解如下...`,
            `这是一个很好的问题！关于"${input}"，我建议您可以从以下几个方面考虑...`
        ];
        const randomIndex = Math.floor(Math.random() * responses.length);
        return responses[randomIndex] || "感谢您的提问，我会尽力帮助您。";
    }
    updateOutlineWithMessage(userMessage, assistantResponse) {
        if (!this.sessionData)
            return;
        const newItem = {
            id: Date.now().toString(),
            parentId: null,
            level: 0,
            title: `讨论: ${userMessage.substring(0, 30)}${userMessage.length > 30 ? '...' : ''}`,
            summary: assistantResponse.substring(0, 100) + (assistantResponse.length > 100 ? '...' : ''),
            content: `${userMessage}\n\n${assistantResponse}`,
            keyPoints: ['关键点1', '关键点2'],
            entities: ['entity1', 'entity2'],
            tags: ['discussion'],
            relatedDocuments: [],
            confidence: 0.8,
            timestamp: new Date().toISOString()
        };
        this.sessionData.outline.push(newItem);
        this.renderOutline();
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
            items.forEach(item => {
                const outlineItem = document.createElement('div');
                outlineItem.classList.add('outline-item', `level-${level}`);
                outlineItem.dataset.id = item.id;
                const titleDiv = document.createElement('div');
                titleDiv.classList.add('outline-item-title');
                titleDiv.textContent = item.title;
                const summaryDiv = document.createElement('div');
                summaryDiv.classList.add('outline-item-summary');
                summaryDiv.textContent = item.summary;
                outlineItem.appendChild(titleDiv);
                outlineItem.appendChild(summaryDiv);
                outlineItem.addEventListener('click', () => {
                    this.showOutlineDetails(item);
                });
                fragment.appendChild(outlineItem);
                if (item.children && item.children.length > 0) {
                    const childFragment = renderItems(item.children, level + 1);
                    fragment.appendChild(childFragment);
                }
            });
            return fragment;
        };
        const outlineFragment = renderItems(this.sessionData.outline);
        this.outlineContainer.appendChild(outlineFragment);
    }
    showOutlineDetails(item) {
        console.log('Showing details for outline item:', item);
        alert(`大纲项详情:\n标题: ${item.title}\n摘要: ${item.summary}\n内容: ${item.content}`);
    }
    renderDocuments() {
        if (!this.documentContainer || !this.sessionData)
            return;
        this.documentContainer.innerHTML = '';
        if (this.sessionData.documentLibrary.documents.length === 0) {
            this.documentContainer.innerHTML = '<p>暂无文档</p>';
            return;
        }
        this.sessionData.documentLibrary.documents.forEach(doc => {
            const docElement = document.createElement('div');
            docElement.classList.add('document-item');
            const titleElement = document.createElement('div');
            titleElement.classList.add('document-item-title');
            titleElement.textContent = doc.title || doc.path.split('/').pop() || '未知文档';
            const metaElement = document.createElement('div');
            metaElement.classList.add('document-item-meta');
            metaElement.textContent = `${doc.type.toUpperCase()} • ${Math.round(doc.size / 1024)} KB • ${new Date(doc.uploadDate).toLocaleDateString()}`;
            docElement.appendChild(titleElement);
            docElement.appendChild(metaElement);
            docElement.addEventListener('click', () => {
                this.viewDocument(doc);
            });
            this.documentContainer.appendChild(docElement);
        });
    }
    viewDocument(document) {
        console.log('Viewing document:', document);
        alert(`正在查看文档: ${document.title || document.path}`);
    }
    clearChat() {
        if (this.chatContainer) {
            this.chatContainer.innerHTML = '';
        }
    }
    updateSessionTitle(title) {
        if (this.sessionTitle) {
            this.sessionTitle.textContent = title;
        }
    }
    addToSessionHistory(sessionData) {
        const sessionInfo = {
            id: sessionData.sessionId,
            title: sessionData.title,
            description: sessionData.description,
            createdAt: sessionData.createdAt,
            lastModified: sessionData.lastModified,
            filePath: ''
        };
        try {
            let sessions = JSON.parse(localStorage.getItem('paperAgentSessions') || '[]');
            const existingIndex = sessions.findIndex((s) => s.id === sessionInfo.id);
            if (existingIndex !== -1) {
                sessions[existingIndex] = sessionInfo;
            }
            else {
                sessions.unshift(sessionInfo);
            }
            localStorage.setItem('paperAgentSessions', JSON.stringify(sessions));
            this.renderSessionHistory();
        }
        catch (error) {
            console.error('Error adding session to history:', error);
        }
    }
    renderSessionHistory() {
        if (!this.sessionHistoryContainer)
            return;
        try {
            const sessions = JSON.parse(localStorage.getItem('paperAgentSessions') || '[]');
            if (sessions.length === 0) {
                this.sessionHistoryContainer.innerHTML = '<p class="no-sessions">暂无历史会话</p>';
                return;
            }
            const sessionListHtml = sessions.map(session => {
                const createdDate = new Date(session.createdAt).toLocaleString();
                const modifiedDate = new Date(session.lastModified).toLocaleString();
                return `
          <div class="session-item" data-session-id="${session.id}">
            <div class="session-header">
              <h4>${session.title}</h4>
              <button class="load-session-btn" data-session-id="${session.id}">加载</button>
            </div>
            <div class="session-info">
              <p>${session.description || '无描述'}</p>
              <small>创建于: ${createdDate}</small><br>
              <small>更新于: ${modifiedDate}</small>
            </div>
          </div>
        `;
            }).join('');
            this.sessionHistoryContainer.innerHTML = `
        <div class="session-list">
          ${sessionListHtml}
        </div>
      `;
            this.sessionHistoryContainer.querySelectorAll('.load-session-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const sessionId = e.target.getAttribute('data-session-id');
                    if (sessionId) {
                        this.loadSessionById(sessionId);
                    }
                });
            });
        }
        catch (error) {
            console.error('Error rendering session history:', error);
            this.sessionHistoryContainer.innerHTML = '<p>加载会话历史时出错</p>';
        }
    }
    async loadSessionById(sessionId) {
        try {
            const sessions = JSON.parse(localStorage.getItem('paperAgentSessions') || '[]');
            const session = sessions.find((s) => s.id === sessionId);
            if (session && session.filePath) {
                this.sessionData = await window.electronAPI.loadSessionFromFile(session.filePath);
            }
            else {
                alert('找不到会话文件，请重新加载会话');
                return;
            }
            if (this.sessionData) {
                this.updateSessionTitle(this.sessionData.title);
                this.clearChat();
                this.renderOutline();
                this.renderDocuments();
                alert(`会话 ${session.title} 已成功加载！`);
            }
            else {
                alert('加载会话失败：文件格式可能不正确。');
            }
        }
        catch (error) {
            console.error('Error loading session by ID:', error);
            alert('加载会话时发生错误。');
        }
    }
    updateSessionFilePath(sessionId, filePath) {
        try {
            let sessions = JSON.parse(localStorage.getItem('paperAgentSessions') || '[]');
            const sessionIndex = sessions.findIndex((s) => s.id === sessionId);
            if (sessionIndex !== -1) {
                sessions[sessionIndex].filePath = filePath;
                localStorage.setItem('paperAgentSessions', JSON.stringify(sessions));
            }
        }
        catch (error) {
            console.error('Error updating session file path:', error);
        }
    }
}
document.addEventListener('DOMContentLoaded', () => {
    new PaperAgentApp();
    SessionManager.initSessionManagement();
});
//# sourceMappingURL=main.js.map