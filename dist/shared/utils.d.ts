import { SessionData, OutlineItem } from './types';
export declare function generateId(): string;
export declare function getCurrentTimestamp(): string;
export declare function createNewSession(title: string, description?: string): SessionData;
export declare function updateLastModified(sessionData: SessionData): SessionData;
export declare function addOutlineItem(outline: OutlineItem[], item: OutlineItem, parentId?: string | null): OutlineItem[];
export declare function findOutlineItem(outline: OutlineItem[], id: string): OutlineItem | null;
export declare function updateOutlineItem(outline: OutlineItem[], id: string, updates: Partial<OutlineItem>): OutlineItem[];
export declare function removeOutlineItem(outline: OutlineItem[], id: string): OutlineItem[];
export declare function estimateTokens(text: string): number;
export declare function truncateToTokenLimit(text: string, maxTokens: number): string;
//# sourceMappingURL=utils.d.ts.map