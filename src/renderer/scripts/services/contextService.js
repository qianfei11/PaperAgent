import { DefaultDocumentService } from './documentService';
export class ContextService {
    documentService;
    llmService;
    constructor(llmService) {
        this.documentService = new DefaultDocumentService();
        this.llmService = llmService;
    }
    async updateContext(sessionData, userMessage, assistantResponse) {
        const updatedSession = this.updateConversationHistory(sessionData, userMessage, assistantResponse);
        const combinedText = `${userMessage} ${assistantResponse}`;
        const [keyPoints, entities] = await Promise.all([
            this.extractKeyPoints(combinedText),
            this.identifyEntities(combinedText)
        ]);
        updatedSession.outline = await this.updateOutline(updatedSession.outline, userMessage, assistantResponse, keyPoints, entities);
        const lastOutlineId = updatedSession.outline[updatedSession.outline.length - 1]?.id ?? '0';
        updatedSession.entitiesMap = this.updateEntitiesMap(updatedSession.entitiesMap, entities, lastOutlineId);
        updatedSession.metadata.totalMessages += 2;
        updatedSession.metadata.activeEntitiesCount = Object.keys(updatedSession.entitiesMap).length;
        return updatedSession;
    }
    updateConversationHistory(sessionData, userMessage, assistantResponse) {
        const now = new Date().toISOString();
        const newHistory = [
            ...sessionData.conversationHistory,
            {
                id: `${Date.now()}_user`,
                role: 'user',
                content: userMessage,
                timestamp: now,
                relatedOutlineIds: [],
                referencedDocuments: []
            },
            {
                id: `${Date.now()}_assistant`,
                role: 'assistant',
                content: assistantResponse,
                timestamp: now,
                relatedOutlineIds: [],
                referencedDocuments: []
            }
        ];
        return { ...sessionData, conversationHistory: newHistory };
    }
    async extractKeyPoints(text) {
        try {
            return await this.llmService.extractKeyPoints(text);
        }
        catch (_e) {
            return this.basicKeyPointExtraction(text);
        }
    }
    async identifyEntities(text) {
        try {
            return await this.llmService.identifyEntities(text);
        }
        catch (_e) {
            return this.basicEntityIdentification(text);
        }
    }
    basicKeyPointExtraction(text) {
        return text.split(/[.!?。！？]+/).filter(s => s.trim().length > 10).slice(0, 3).map(s => s.trim());
    }
    basicEntityIdentification(text) {
        const matches = text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
        return [...new Set(matches)].slice(0, 5);
    }
    async updateOutline(outline, userMessage, assistantResponse, keyPoints, entities) {
        const existingItemIndex = outline.findIndex(item => this.calculateSimilarity(item.title, userMessage) > 0.7);
        if (existingItemIndex !== -1) {
            const updatedOutline = [...outline];
            const existingItem = { ...updatedOutline[existingItemIndex] };
            existingItem.summary = assistantResponse.length > 100
                ? assistantResponse.substring(0, 100) + '...'
                : assistantResponse;
            existingItem.keyPoints = [...new Set([...(existingItem.keyPoints ?? []), ...keyPoints])];
            existingItem.entities = [...new Set([...(existingItem.entities ?? []), ...entities])];
            existingItem.timestamp = new Date().toISOString();
            updatedOutline[existingItemIndex] = existingItem;
            return updatedOutline;
        }
        const summary = assistantResponse.length > 100
            ? assistantResponse.substring(0, 100) + '...'
            : assistantResponse;
        const newItem = {
            id: Date.now().toString(),
            parentId: null,
            level: 0,
            title: this.extractTopic(userMessage),
            summary,
            content: `${userMessage}\n\n${assistantResponse}`,
            keyPoints,
            entities,
            tags: ['discussion'],
            relatedDocuments: [],
            confidence: 0.8,
            timestamp: new Date().toISOString(),
            children: []
        };
        return [...outline, newItem];
    }
    calculateSimilarity(str1, str2) {
        const s1 = str1.toLowerCase().trim();
        const s2 = str2.toLowerCase().trim();
        if (s1 === s2)
            return 1.0;
        const set1 = new Set(s1.split(/\s+/));
        const set2 = new Set(s2.split(/\s+/));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }
    extractTopic(message) {
        const words = message.split(/\s+/);
        return words.slice(0, 10).join(' ') + (words.length > 10 ? '...' : '');
    }
    updateEntitiesMap(entitiesMap, newEntities, outlineId) {
        const updatedMap = { ...entitiesMap };
        const timestamp = new Date().toISOString();
        for (const entity of newEntities) {
            if (!updatedMap[entity]) {
                updatedMap[entity] = {
                    name: entity,
                    description: `关于 ${entity} 的信息`,
                    relatedDocuments: [],
                    occurrences: []
                };
            }
            updatedMap[entity].occurrences.push({
                outlineId,
                context: 'context placeholder',
                timestamp
            });
        }
        return updatedMap;
    }
    async createContext(sessionData) {
        return {
            sessionData,
            llmConfig: {
                provider: 'openai',
                model: 'gpt-4o',
                temperature: 0.7,
                maxTokens: 2048
            },
            documents: sessionData.documentLibrary.documents
        };
    }
    getDocumentService() {
        return this.documentService;
    }
}
//# sourceMappingURL=contextService.js.map