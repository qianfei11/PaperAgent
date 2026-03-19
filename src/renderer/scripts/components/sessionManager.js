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
      <h3>Session History</h3>
      <div class="session-list">
        ${this.sessions.length === 0
            ? '<p class="no-sessions">No saved sessions yet.</p>'
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
          <button class="delete-session-btn" data-session-id="${session.id}">Delete</button>
        </div>
        <div class="session-info">
          <p>${session.description || 'No description'}</p>
          <small>Created: ${createdDate}</small><br>
          <small>Updated: ${modifiedDate}</small>
        </div>
      </div>
    `;
    }
    static async initSessionManagement() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-session-btn')) {
                const sessionId = e.target.getAttribute('data-session-id');
                if (sessionId) {
                    if (confirm('Delete this session? This action cannot be undone.')) {
                        console.log(`Delete session: ${sessionId}`);
                    }
                }
            }
        });
    }
}
//# sourceMappingURL=sessionManager.js.map
