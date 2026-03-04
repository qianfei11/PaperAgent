export class SessionManager {
    sessions = [];
    container;
    onSelectCallback = null;
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Element with id "${containerId}" not found.`);
        }
        this.loadSessionsFromStorage();
        this.render();
    }
    addSession(session) {
        const existingIndex = this.sessions.findIndex(s => s.id === session.id);
        if (existingIndex !== -1) {
            this.sessions[existingIndex] = session;
        }
        else {
            this.sessions.unshift(session);
        }
        this.saveSessionsToStorage();
        this.render();
    }
    removeSession(sessionId) {
        const index = this.sessions.findIndex(s => s.id === sessionId);
        if (index !== -1) {
            this.sessions.splice(index, 1);
            this.saveSessionsToStorage();
            this.render();
            return true;
        }
        return false;
    }
    getAllSessions() {
        return [...this.sessions];
    }
    setOnSelect(callback) {
        this.onSelectCallback = callback;
    }
    loadSessionsFromStorage() {
        try {
            const stored = localStorage.getItem('paperAgentSessions');
            if (stored) {
                this.sessions = JSON.parse(stored);
            }
        }
        catch (error) {
            console.error('Error loading sessions from storage:', error);
            this.sessions = [];
        }
    }
    saveSessionsToStorage() {
        try {
            localStorage.setItem('paperAgentSessions', JSON.stringify(this.sessions));
        }
        catch (error) {
            console.error('Error saving sessions to storage:', error);
        }
    }
    render() {
        this.container.innerHTML = `
      <h3>会话历史</h3>
      <div class="session-list">
        ${this.sessions.length === 0
            ? '<p class="no-sessions">暂无历史会话</p>'
            : this.sessions.map(session => this.renderSessionItem(session)).join('')}
      </div>
    `;
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
    renderSessionItem(session) {
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
    static async initSessionManagement() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-session-btn')) {
                const sessionId = e.target.getAttribute('data-session-id');
                if (sessionId) {
                    if (confirm('确定要删除这个会话吗？此操作不可撤销。')) {
                        console.log(`删除会话: ${sessionId}`);
                    }
                }
            }
        });
    }
}
//# sourceMappingURL=sessionManager.js.map