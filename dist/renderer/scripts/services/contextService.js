import { DefaultDocumentService } from './documentService';
import { OpenAILLMService } from './llmService';
export class ContextService {
    documentService;
    llmService;
    constructor(apiKey) {
        this.documentService = new DefaultDocumentService();
        this.llmService = new OpenAILLMService(apiKey);
    }
    async updateContext(sessionData, userMessage, assistantResponse) {
        const updatedSession = this.updateConversationHistory(sessionData, userMessage, assistantResponse);
        const keyPoints = await this.extractKeyPoints(`${userMessage} ${assistantResponse}`);
        const entities = await this.identifyEntities(`${userMessage} ${assistantResponse}`);
        const updatedOutline = await this.updateOutline(updatedSession.outline, userMessage, assistantResponse, keyPoints, entities);
        updatedSession.outline = updatedOutline;
        updatedSession.entitiesMap = this.updateEntitiesMap(updatedSession.entitiesMap, entities, updatedSession.outline.length - 1);
        updatedSession.metadata.totalMessages += 2;
        updatedSession.metadata.activeEntitiesCount = Object.keys(updatedSession.entitiesMap).length;
        return updatedSession;
    }
    updateConversationHistory(sessionData, userMessage, assistantResponse) {
        const newSession = { ...sessionData };
        newSession.conversationHistory.push({
            id: Date.now().toString() + '_user',
            role: 'user',
            content: userMessage,
            timestamp: new Date().toISOString(),
            relatedOutlineIds: [],
            referencedDocuments: []
        });
        newSession.conversationHistory.push({
            id: Date.now().toString() + '_assistant',
            role: 'assistant',
            content: assistantResponse,
            timestamp: new Date().toISOString(),
            relatedOutlineIds: [],
            referencedDocuments: []
        });
        return newSession;
    }
    async extractKeyPoints(text) {
        try {
            return await this.llmService.extractKeyPoints(text);
        }
        catch (error) {
            console.error('Error extracting key points:', error);
            return this.basicKeyPointExtraction(text);
        }
    }
    async identifyEntities(text) {
        try {
            return await this.llmService.identifyEntities(text);
        }
        catch (error) {
            console.error('Error identifying entities:', error);
            return this.basicEntityIdentification(text);
        }
    }
    basicKeyPointExtraction(text) {
        const sentences = text.split(/[.!?]+/);
        return sentences
            .filter(sentence => sentence.length > 10)
            .slice(0, 3)
            .map(sentence => sentence.trim());
    }
    basicEntityIdentification(text) {
        const entityRegex = /\b[A-Z][a-z]{2,}\b/g;
        const matches = text.match(entityRegex);
        return matches ? [...new Set(matches)] : [];
    }
    async updateOutline(outline, userMessage, assistantResponse, keyPoints, entities) {
        const existingItemIndex = outline.findIndex(item => this.calculateSimilarity(item.title, userMessage) > 0.7);
        if (existingItemIndex !== -1) {
            const updatedOutline = [...outline];
            const existingItem = { ...updatedOutline[existingItemIndex] };
            existingItem.summary = assistantResponse.substring(0, 100) + (assistantResponse.length > 100 ? '...' : '');
            existingItem.keyPoints = [...new Set([...(existingItem.keyPoints || []), ...keyPoints])];
            existingItem.entities = [...new Set([...(existingItem.entities || []), ...entities])];
            existingItem.timestamp = new Date().toISOString();
            updatedOutline[existingItemIndex] = existingItem;
            return updatedOutline;
        }
        else {
            const newItem = {
                id: Date.now().toString(),
                parentId: null,
                level: 0,
                title: this.extractTopic(userMessage),
                summary: assistantResponse.substring(0, 100) + (assistantResponse.length > 100 ? '...' : ''),
                content: `${userMessage}\n\n${assistantResponse}`,
                keyPoints: keyPoints,
                entities: entities,
                tags: ['discussion'],
                relatedDocuments: [],
                confidence: 0.8,
                timestamp: new Date().toISOString(),
                children: []
            };
            return [...outline, newItem];
        }
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
    updateEntitiesMap(entitiesMap, newEntities, outlineItemId) {
        const updatedMap = { ...entitiesMap };
        newEntities.forEach(entity => {
            if (!updatedMap[entity]) {
                updatedMap[entity] = {
                    name: entity,
                    description: `关于${entity}的信息`,
                    relatedDocuments: [],
                    occurrences: []
                };
            }
            updatedMap[entity].occurrences.push({
                outlineId: outlineItemId.toString(),
                context: 'context placeholder',
                timestamp: new Date().toISOString()
            });
        });
        return updatedMap;
    }
    async createContext(sessionData) {
        return {
            sessionData,
            llmConfig: {
                provider: 'openai',
                apiKey: this.llmService['apiKey'],
                model: 'gpt-4',
                temperature: 0.7,
                maxTokens: 2048
            },
            documents: sessionData.documentLibrary.documents
        };
    }
}
//# sourceMappingURL=contextService.js.map