export interface SessionInfo {
    id: string;
    title: string;
    description: string;
    createdAt: string;
    lastModified: string;
    filePath: string;
}
export declare class SessionManager {
    private sessions;
    private container;
    private onSelectCallback;
    constructor(containerId: string);
    addSession(session: SessionInfo): void;
    removeSession(sessionId: string): boolean;
    getAllSessions(): SessionInfo[];
    setOnSelect(callback: (session: SessionInfo) => void): void;
    private loadSessionsFromStorage;
    private saveSessionsToStorage;
    render(): void;
    private renderSessionItem;
    static initSessionManagement(): Promise<void>;
}
//# sourceMappingURL=sessionManager.d.ts.map