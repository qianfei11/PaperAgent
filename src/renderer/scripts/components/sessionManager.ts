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
    // Check whether a session with the same ID already exists.
    const existingIndex = this.sessions.findIndex(s => s.id === session.id);
    if (existingIndex !== -1) {
      // Update the existing session entry.
      this.sessions[existingIndex] = session;
    } else {
      // Otherwise insert the new session at the top.
      this.sessions.unshift(session);
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
    return [...this.sessions];
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
      <h3>Session History</h3>
      <div class="session-list">
        ${this.sessions.length === 0 
          ? '<p class="no-sessions">No saved sessions yet.</p>' 
          : this.sessions.map(session => this.renderSessionItem(session)).join('')
        }
      </div>
    `;
    
    // Bind click handlers for each session item.
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

  public static async initSessionManagement(): Promise<void> {
    // Initialize session-management-related UI behavior.
    document.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('delete-session-btn')) {
        const sessionId = (e.target as HTMLElement).getAttribute('data-session-id');
        if (sessionId) {
          if (confirm('Delete this session? This action cannot be undone.')) {
            console.log(`Delete session: ${sessionId}`);
          }
        }
      }
    });
  }
}
