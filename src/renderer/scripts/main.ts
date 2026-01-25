// src/renderer/scripts/main.ts

import { SessionData, OutlineItem } from '../../shared/types';

declare global {
  interface Window {
    electronAPI: any;
  }
}

import { SessionManager } from './components/sessionManager';

class PaperAgentApp {
  private sessionData: SessionData | null = null;
  private chatContainer: HTMLElement | null = null;
  private outlineContainer: HTMLElement | null = null;
  private documentContainer: HTMLElement | null = null;
  private sessionHistoryContainer: HTMLElement | null = null;
  private messageInput: HTMLTextAreaElement | null = null;
  private sendButton: HTMLButtonElement | null = null;
  private sessionTitle: HTMLElement | null = null;
  private sessionManager: SessionManager | null = null;

  constructor() {
    this.initializeElements();
    this.setupEventListeners();
    this.loadInitialView();
    SessionManager.initSessionManagement();
  }

  private initializeElements(): void {
    this.chatContainer = document.getElementById('chatContainer');
    this.outlineContainer = document.getElementById('outlineContainer');
    this.documentContainer = document.getElementById('documentContainer');
    this.sessionHistoryContainer = document.getElementById('sessionHistoryContainer');
    this.messageInput = document.getElementById('messageInput') as HTMLTextAreaElement;
    this.sendButton = document.getElementById('sendBtn') as HTMLButtonElement;
    this.sessionTitle = document.getElementById('sessionTitle');

    // 按钮元素
    const newSessionBtn = document.getElementById('newSessionBtn');
    const saveSessionBtn = document.getElementById('saveSessionBtn');
    const loadSessionBtn = document.getElementById('loadSessionBtn');
    const addDocumentBtn = document.getElementById('addDocumentBtn');

    if (newSessionBtn) newSessionBtn.addEventListener('click', () => this.createNewSession());
    if (saveSessionBtn) saveSessionBtn.addEventListener('click', () => this.saveSession());
    if (loadSessionBtn) loadSessionBtn.addEventListener('click', () => this.loadSession());
    if (addDocumentBtn) addDocumentBtn.addEventListener('click', () => this.addDocument());
    
    // 初始化会话历史
    if (this.sessionHistoryContainer) {
      this.renderSessionHistory();
    }
  }

  private setupEventListeners(): void {
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

  private loadInitialView(): void {
    // 初始加载时显示欢迎信息
    this.updateSessionTitle('无活动会话');
  }

  private async createNewSession(): Promise<void> {
    try {
      this.sessionData = await window.electronAPI.createNewSession();
      if (this.sessionData) {
        this.updateSessionTitle(this.sessionData.title);
        this.clearChat();
        this.renderOutline();
        this.renderDocuments();
        
        // 添加欢迎消息
        this.addMessageToChat('assistant', '您好！我是PaperAgent助手，可以帮助您进行论文阅读和思考。请告诉我您想讨论什么内容。');
        
        // 将会话添加到会话管理器
        if (this.sessionData) {
          this.addToSessionHistory(this.sessionData);
        }
      }
    } catch (error) {
      console.error('创建新会话失败:', error);
      alert('创建新会话失败，请重试。');
    }
  }

  private async saveSession(): Promise<void> {
    if (!this.sessionData) {
      alert('没有活动的会话可以保存。');
      return;
    }

    try {
      // 请求主进程打开保存文件对话框
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
          // 更新会话历史记录中的文件路径
          this.updateSessionFilePath(this.sessionData.sessionId, filePath);
        } else {
          alert(`保存失败: ${result.message}`);
        }
      }
    } catch (error) {
      console.error('保存会话失败:', error);
      alert('保存会话时发生错误。');
    }
  }

  private async loadSession(): Promise<void> {
    try {
      // 请求主进程打开文件选择对话框
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
          
          // 更新会话历史记录
          this.addToSessionHistory(this.sessionData);
          // 更新文件路径
          this.updateSessionFilePath(this.sessionData.sessionId, filePath);
        } else {
          alert('加载会话失败：文件格式可能不正确。');
        }
      }
    } catch (error) {
      console.error('加载会话失败:', error);
      alert('加载会话时发生错误。');
    }
  }

  private async addDocument(): Promise<void> {
    try {
      const filePaths = await window.electronAPI.selectFiles([
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'jpeg', 'png'] }
      ]);

      if (filePaths && filePaths.length > 0) {
        // 在实际实现中，这里会处理文档上传和关联逻辑
        console.log('Selected files:', filePaths);
        alert(`已选择 ${filePaths.length} 个文件，实际实现中将处理这些文档。`);
      }
    } catch (error) {
      console.error('添加文档失败:', error);
      alert('添加文档时发生错误。');
    }
  }

  private async sendMessage(): Promise<void> {
    if (!this.messageInput || !this.sessionData) return;

    const message = this.messageInput.value.trim();
    if (!message) return;

    // 禁用发送按钮直到响应完成
    if (this.sendButton) {
      this.sendButton.disabled = true;
    }

    try {
      // 添加用户消息到聊天
      this.addMessageToChat('user', message);
      this.messageInput.value = '';

      // 模拟LLM响应 - 在实际实现中，这里会调用LLM服务
      setTimeout(() => {
        const response = this.generateMockResponse(message);
        this.addMessageToChat('assistant', response);
        
        // 更新会话大纲（模拟）
        this.updateOutlineWithMessage(message, response);
        
        // 重新启用发送按钮
        if (this.sendButton) {
          this.sendButton.disabled = false;
        }
      }, 1000);
    } catch (error) {
      console.error('发送消息失败:', error);
      alert('发送消息时发生错误。');
      
      // 重新启用发送按钮
      if (this.sendButton) {
        this.sendButton.disabled = false;
      }
    }
  }

  private addMessageToChat(role: 'user' | 'assistant', content: string): void {
    if (!this.chatContainer) return;

    // 移除欢迎消息（如果是第一次消息）
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

  private generateMockResponse(input: string): string {
    // 这是一个模拟响应生成器，在实际实现中会调用LLM
    const responses = [
      `关于"${input}"，这是一个很有趣的话题。根据我的分析，有几个关键点需要注意...`,
      `感谢您提出关于"${input}"的问题。基于当前上下文，我认为...`,
      `您提到的"${input}"确实值得深入探讨。结合相关文档，我的见解如下...`,
      `这是一个很好的问题！关于"${input}"，我建议您可以从以下几个方面考虑...`
    ];
    
    const randomIndex = Math.floor(Math.random() * responses.length);
    return responses[randomIndex] || "感谢您的提问，我会尽力帮助您。";
  }

  private updateOutlineWithMessage(userMessage: string, assistantResponse: string): void {
    if (!this.sessionData) return;

    // 这里应该是更复杂的逻辑，分析消息内容并更新大纲
    // 简单示例：添加一个新的大纲项
    const newItem = {
      id: Date.now().toString(), // 实际应使用UUID
      parentId: null,
      level: 0,
      title: `讨论: ${userMessage.substring(0, 30)}${userMessage.length > 30 ? '...' : ''}`,
      summary: assistantResponse.substring(0, 100) + (assistantResponse.length > 100 ? '...' : ''),
      content: `${userMessage}\n\n${assistantResponse}`,
      keyPoints: ['关键点1', '关键点2'], // 实际应从响应中提取
      entities: ['entity1', 'entity2'], // 实际应从消息中识别
      tags: ['discussion'],
      relatedDocuments: [], // 实际应根据内容关联文档
      confidence: 0.8,
      timestamp: new Date().toISOString()
    };

    this.sessionData.outline.push(newItem);
    this.renderOutline();
  }

  private renderOutline(): void {
    if (!this.outlineContainer || !this.sessionData) return;

    this.outlineContainer.innerHTML = '';

    if (this.sessionData.outline.length === 0) {
      this.outlineContainer.innerHTML = '<p>暂无大纲内容</p>';
      return;
    }

    // 递归渲染大纲项
    const renderItems = (items: OutlineItem[], level: number = 0): DocumentFragment => {
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

        // 添加点击事件来查看详细信息
        outlineItem.addEventListener('click', () => {
          this.showOutlineDetails(item);
        });

        fragment.appendChild(outlineItem);

        // 渲染子项
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

  private showOutlineDetails(item: OutlineItem): void {
    // 在实际实现中，这里会显示大纲项的详细信息
    console.log('Showing details for outline item:', item);
    alert(`大纲项详情:\n标题: ${item.title}\n摘要: ${item.summary}\n内容: ${item.content}`);
  }

  private renderDocuments(): void {
    if (!this.documentContainer || !this.sessionData) return;

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

      // 添加点击事件来查看文档
      docElement.addEventListener('click', () => {
        this.viewDocument(doc);
      });

      this.documentContainer!.appendChild(docElement);
    });
  }

  private viewDocument(document: any): void {
    // 在实际实现中，这里会打开文档查看器
    console.log('Viewing document:', document);
    alert(`正在查看文档: ${document.title || document.path}`);
  }

  private clearChat(): void {
    if (this.chatContainer) {
      this.chatContainer.innerHTML = '';
    }
  }

  private updateSessionTitle(title: string): void {
    if (this.sessionTitle) {
      this.sessionTitle.textContent = title;
    }
  }
  
  private addToSessionHistory(sessionData: SessionData): void {
    // 创建会话信息对象
    const sessionInfo = {
      id: sessionData.sessionId,
      title: sessionData.title,
      description: sessionData.description,
      createdAt: sessionData.createdAt,
      lastModified: sessionData.lastModified,
      filePath: '' // 临时空路径，实际保存后会更新
    };
    
    // 这里可以将会话信息添加到SessionManager，但现在先记录到localStorage
    try {
      let sessions: any[] = JSON.parse(localStorage.getItem('paperAgentSessions') || '[]');
      // 检查是否已存在该会话
      const existingIndex = sessions.findIndex((s: any) => s.id === sessionInfo.id);
      if (existingIndex !== -1) {
        sessions[existingIndex] = sessionInfo;
      } else {
        sessions.unshift(sessionInfo); // 添加到开头
      }
      localStorage.setItem('paperAgentSessions', JSON.stringify(sessions));
      // 重新渲染会话历史
      this.renderSessionHistory();
    } catch (error) {
      console.error('Error adding session to history:', error);
    }
  }
  
  private renderSessionHistory(): void {
    if (!this.sessionHistoryContainer) return;
    
    try {
      const sessions: any[] = JSON.parse(localStorage.getItem('paperAgentSessions') || '[]');
      
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
      
      // 为加载按钮添加事件监听器
      this.sessionHistoryContainer.querySelectorAll('.load-session-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const sessionId = (e.target as HTMLElement).getAttribute('data-session-id');
          if (sessionId) {
            this.loadSessionById(sessionId);
          }
        });
      });
    } catch (error) {
      console.error('Error rendering session history:', error);
      this.sessionHistoryContainer.innerHTML = '<p>加载会话历史时出错</p>';
    }
  }
  
  private async loadSessionById(sessionId: string): Promise<void> {
    try {
      // 尝试从localStorage中查找会话文件路径
      const sessions: any[] = JSON.parse(localStorage.getItem('paperAgentSessions') || '[]');
      const session = sessions.find((s: any) => s.id === sessionId);
      
      if (session && session.filePath) {
        // 如果有文件路径，则从文件加载
        this.sessionData = await window.electronAPI.loadSessionFromFile(session.filePath);
      } else {
        // 否则显示错误消息
        alert('找不到会话文件，请重新加载会话');
        return;
      }
      
      if (this.sessionData) {
        this.updateSessionTitle(this.sessionData.title);
        this.clearChat();
        this.renderOutline();
        this.renderDocuments();
        alert(`会话 ${session.title} 已成功加载！`);
      } else {
        alert('加载会话失败：文件格式可能不正确。');
      }
    } catch (error) {
      console.error('Error loading session by ID:', error);
      alert('加载会话时发生错误。');
    }
  }
  
  private updateSessionFilePath(sessionId: string, filePath: string): void {
    try {
      let sessions: any[] = JSON.parse(localStorage.getItem('paperAgentSessions') || '[]');
      const sessionIndex = sessions.findIndex((s: any) => s.id === sessionId);
      if (sessionIndex !== -1) {
        sessions[sessionIndex].filePath = filePath;
        localStorage.setItem('paperAgentSessions', JSON.stringify(sessions));
      }
    } catch (error) {
      console.error('Error updating session file path:', error);
    }
  }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new PaperAgentApp();
  
  // 初始化会话管理
  SessionManager.initSessionManagement();
});