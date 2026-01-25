import { SessionData, Context } from '../../../shared/types';
export declare class ContextService {
    private documentService;
    private llmService;
    constructor(apiKey: string);
    updateContext(sessionData: SessionData, userMessage: string, assistantResponse: string): Promise<SessionData>;
    private updateConversationHistory;
    private extractKeyPoints;
    private identifyEntities;
    private basicKeyPointExtraction;
    private basicEntityIdentification;
    private updateOutline;
    private calculateSimilarity;
    private extractTopic;
    private updateEntitiesMap;
    createContext(sessionData: SessionData): Promise<Context>;
}
//# sourceMappingURL=contextService.d.ts.map