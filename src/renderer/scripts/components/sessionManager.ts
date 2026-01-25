// src/renderer/scripts/components/sessionManager.ts

export interface SessionInfo {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  lastModified: string;
  filePath: string;
}

export class SessionManager {
  private sessions: SessionInfo[] = [];
  private container: HTMLElement;
  private onSelectCallback: ((session: SessionInfo) => void) | null = null;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId) as HTMLElement;
    
    if (!this.container) {
      throw new Error(`Element with id "${containerId}" not found.`);
    }
    
    this.loadSessionsFromStorage();
    this.render();
  }

  public addSession(session: SessionInfo): void {
    // 检查是否已存在相同ID的会话
    const existingIndex = this.sessions.findIndex(s => s.id === session.id);
    if (existingIndex !== -1) {
      // 如果存在，更新该会话
      this.sessions[existingIndex] = session;
    } else {
      // 否则添加新会话
      this.sessions.unshift(session); // 添加到开头
    }
    
    this.saveSessionsToStorage();
    this.render();
  }

  public removeSession(sessionId: string): boolean {
    const index = this.sessions.findIndex(s => s.id === sessionId);
    if (index !== -1) {
      this.sessions.splice(index, 1);
      this.saveSessionsToStorage();
      this.render();
      return true;
    }
    return false;
  }

  public getAllSessions(): SessionInfo[] {
    return [...this.sessions]; // 返回副本
  }

  public setOnSelect(callback: (session: SessionInfo) => void): void {
    this.onSelectCallback = callback;
  }

  private loadSessionsFromStorage(): void {
    try {
      const stored = localStorage.getItem('paperAgentSessions');
      if (stored) {
        this.sessions = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading sessions from storage:', error);
      this.sessions = [];
    }
  }

  private saveSessionsToStorage(): void {
    try {
      localStorage.setItem('paperAgentSessions', JSON.stringify(this.sessions));
    } catch (error) {
      console.error('Error saving sessions to storage:', error);
    }
  }

  public render(): void {
    this.container.innerHTML = `
      <h3>会话历史</h3>
      <div class="session-list">
        ${this.sessions.length === 0 
          ? '<p class="no-sessions">暂无历史会话</p>' 
          : this.sessions.map(session => this.renderSessionItem(session)).join('')
        }
      </div>
    `;
    
    // 为每个会话项添加点击事件
    this.sessions.forEach(session => {
      const element = document.getElementById(`session-${session.id}`);
      if (element) {
        element.addEventListener('click', () => {
          if (this.onSelectCallback) {
            this.onSelectCallback(session);
          }
        });
      }
    });
  }

  private renderSessionItem(session: SessionInfo): string {
    const createdDate = new Date(session.createdAt).toLocaleString();
    const modifiedDate = new Date(session.lastModified).toLocaleString();
    
    return `
      <div id="session-${session.id}" class="session-item">
        <div class="session-header">
          <h4>${session.title}</h4>
          <button class="delete-session-btn" data-session-id="${session.id}">删除</button>
        </div>
        <div class="session-info">
          <p>${session.description || '无描述'}</p>
          <small>创建于: ${createdDate}</small><br>
          <small>更新于: ${modifiedDate}</small>
        </div>
      </div>
    `;
  }

  public static async initSessionManagement(): Promise<void> {
    // 这个静态方法可以用来初始化会话管理相关的UI功能
    // 绑定删除按钮事件等
    document.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('delete-session-btn')) {
        const sessionId = (e.target as HTMLElement).getAttribute('data-session-id');
        if (sessionId) {
          if (confirm('确定要删除这个会话吗？此操作不可撤销。')) {
            // 这里可以触发删除会话的操作
            console.log(`删除会话: ${sessionId}`);
          }
        }
      }
    });
  }
}