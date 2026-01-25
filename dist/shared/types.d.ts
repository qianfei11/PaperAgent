export interface OutlineItem {
    id: string;
    parentId: string | null;
    level: number;
    title: string;
    summary: string;
    content: string;
    keyPoints: string[];
    entities: string[];
    tags: string[];
    relatedDocuments: DocumentReference[];
    confidence: number;
    timestamp: string;
    children?: OutlineItem[];
}
export interface DocumentReference {
    key: string;
    path: string;
    type: string;
    extractedContent: string;
}
export interface EntityMapping {
    name: string;
    description: string;
    relatedDocuments: string[];
    occurrences: EntityOccurrence[];
}
export interface EntityOccurrence {
    outlineId: string;
    context: string;
    timestamp: string;
}
export interface DocumentInfo {
    key: string;
    path: string;
    type: string;
    title: string;
    size: number;
    uploadDate: string;
    metadata: Record<string, any>;
    contentPreview: string;
    associatedEntities: string[];
}
export interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    relatedOutlineIds: string[];
    referencedDocuments: string[];
}
export interface SessionData {
    sessionId: string;
    title: string;
    description: string;
    createdAt: string;
    lastModified: string;
    version: string;
    outline: OutlineItem[];
    entitiesMap: Record<string, EntityMapping>;
    documentLibrary: {
        documents: DocumentInfo[];
    };
    conversationHistory: ConversationMessage[];
    metadata: {
        totalTokens: number;
        totalMessages: number;
        activeEntitiesCount: number;
        documentsCount: number;
    };
}
export interface LLMConfig {
    provider: 'openai' | 'anthropic' | 'local';
    apiKey?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
}
export interface Context {
    sessionData: SessionData;
    llmConfig: LLMConfig;
    documents: DocumentInfo[];
}
//# sourceMappingURL=types.d.ts.map