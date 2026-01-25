import { Context } from '../../../shared/types';
export interface LLMService {
    sendMessage(context: Context, userMessage: string): Promise<string>;
    summarizeConversation(context: Context): Promise<any>;
    extractKeyPoints(text: string): Promise<string[]>;
    identifyEntities(text: string): Promise<string[]>;
}
export declare class OpenAILLMService implements LLMService {
    private apiKey;
    private apiUrl;
    constructor(apiKey: string);
    sendMessage(context: Context, userMessage: string): Promise<string>;
    summarizeConversation(context: Context): Promise<any>;
    extractKeyPoints(text: string): Promise<string[]>;
    identifyEntities(text: string): Promise<string[]>;
    private constructPrompt;
    private generateMockResponse;
}
//# sourceMappingURL=llmService.d.ts.map