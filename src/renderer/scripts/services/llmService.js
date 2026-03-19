export class OpenAILLMService {
    providerConfig = null;
    constructor(apiKey) {
        if (apiKey) {
            this.providerConfig = {
                provider: 'openai-compatible',
                baseUrl: 'https://api.openai.com',
                apiKey,
                model: 'gpt-4o',
                temperature: 0.7,
                maxTokens: 2048
            };
        }
    }
    setProviderConfig(config) {
        this.providerConfig = config;
    }
    sendMessageStreaming(messages, config, onChunk, onDone, onError) {
        const requestId = Date.now().toString();
        let fullText = '';
        window.electronAPI.removeLLMListeners();
        window.electronAPI.onLLMChunk((data) => {
            if (data.requestId === requestId) {
                fullText += data.text;
                onChunk(data.text);
            }
        });
        window.electronAPI.onLLMDone((data) => {
            if (data.requestId === requestId) {
                window.electronAPI.removeLLMListeners();
                onDone(fullText);
            }
        });
        window.electronAPI.onLLMError((data) => {
            if (data.requestId === requestId) {
                window.electronAPI.removeLLMListeners();
                onError(data.error);
            }
        });
        window.electronAPI.sendLLMMessage(requestId, messages, config);
    }
    async sendOnce(messages) {
        if (!this.providerConfig)
            throw new Error('LLM is not configured. Fill in the API settings first.');
        return new Promise((resolve, reject) => {
            this.sendMessageStreaming(messages, this.providerConfig, () => { }, resolve, reject);
        });
    }
    async sendMessage(context, userMessage) {
        const messages = this.buildMessages(context, userMessage);
        if (!this.providerConfig)
            throw new Error('LLM is not configured.');
        return new Promise((resolve, reject) => {
            this.sendMessageStreaming(messages, this.providerConfig, () => { }, resolve, reject);
        });
    }
    async summarizeConversation(context) {
        const recentHistory = context.sessionData.conversationHistory.slice(-10);
        const historyText = recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
        const messages = [
            {
                role: 'system',
                content: 'You are an academic research assistant. Summarize the following conversation as structured JSON with the fields summary (string), keyPoints (string array), and entities (string array). Reply with JSON only and do not wrap it in markdown.'
            },
            { role: 'user', content: historyText }
        ];
        try {
            const result = await this.sendOnce(messages);
            return JSON.parse(result);
        }
        catch (_e) {
            return { summary: 'Failed to generate a conversation summary.', keyPoints: [], entities: [] };
        }
    }
    async extractKeyPoints(text) {
        const messages = [
            {
                role: 'system',
                content: 'Extract 3 to 5 key points from the following text. Reply with a JSON array of strings only and do not wrap it in markdown.'
            },
            { role: 'user', content: text.substring(0, 1000) }
        ];
        try {
            const result = await this.sendOnce(messages);
            const parsed = JSON.parse(result);
            return Array.isArray(parsed) ? parsed : this.basicKeyPointExtraction(text);
        }
        catch (_e) {
            return this.basicKeyPointExtraction(text);
        }
    }
    async identifyEntities(text) {
        const messages = [
            {
                role: 'system',
                content: 'Identify the key entities in the following text, such as people, organizations, concepts, and methods. Reply with a JSON array of strings only and do not wrap it in markdown.'
            },
            { role: 'user', content: text.substring(0, 1000) }
        ];
        try {
            const result = await this.sendOnce(messages);
            const parsed = JSON.parse(result);
            return Array.isArray(parsed) ? parsed : this.basicEntityIdentification(text);
        }
        catch (_e) {
            return this.basicEntityIdentification(text);
        }
    }
    buildMessages(context, userMessage) {
        let systemContent = 'You are an academic research assistant who helps users understand and analyze papers and related scholarly content.\n\n';
        if (context.sessionData.outline?.length > 0) {
            systemContent += 'Current discussion outline:\n';
            context.sessionData.outline.forEach((item, index) => {
                systemContent += `${index + 1}. ${item.title}: ${item.summary}\n`;
            });
            systemContent += '\n';
        }
        if (context.documents?.length > 0) {
            systemContent += 'Related documents:\n';
            context.documents.forEach((doc, index) => {
                const preview = doc.contentPreview ? ` (${doc.contentPreview.substring(0, 100)}...)` : '';
                systemContent += `${index + 1}. ${doc.title || doc.path}${preview}\n`;
            });
            systemContent += '\n';
        }
        systemContent += 'Use the context above to provide a detailed and accurate answer.';
        const messages = [
            { role: 'system', content: systemContent }
        ];
        const recentHistory = context.sessionData.conversationHistory.slice(-8);
        for (const msg of recentHistory) {
            messages.push({ role: msg.role, content: msg.content });
        }
        messages.push({ role: 'user', content: userMessage });
        return messages;
    }
    basicKeyPointExtraction(text) {
        return text.split(/[.!?。！？]/).filter(s => s.trim().length > 10).slice(0, 3).map(s => s.trim());
    }
    basicEntityIdentification(text) {
        const matches = text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
        return [...new Set(matches)].slice(0, 5);
    }
}
//# sourceMappingURL=llmService.js.map
