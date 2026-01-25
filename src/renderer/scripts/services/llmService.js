class OpenAILLMService {
    apiKey;
    apiUrl = 'https://api.openai.com/v1/chat/completions';
    constructor(apiKey) {
        this.apiKey = apiKey;
    }
    async sendMessage(context, userMessage) {
        const prompt = this.constructPrompt(context, userMessage);
        try {
            console.log('Sending request to LLM:', prompt);
            await new Promise(resolve => setTimeout(resolve, 1000));
            return this.generateMockResponse(userMessage);
        }
        catch (error) {
            console.error('Error communicating with LLM:', error);
            throw error;
        }
    }
    async summarizeConversation(context) {
        console.log('Summarizing conversation...');
        return {
            summary: "这是一个对话总结的模拟结果。",
            keyPoints: ["关键点1", "关键点2", "关键点3"],
            entities: ["实体1", "实体2"]
        };
    }
    async extractKeyPoints(text) {
        console.log('Extracting key points from:', text.substring(0, 50) + '...');
        return [`关键点：${text.substring(0, 20)}`, '另一个关键点'];
    }
    async identifyEntities(text) {
        console.log('Identifying entities in text...');
        return ['entity1', 'entity2', 'concept1'];
    }
    constructPrompt(context, userMessage) {
        let prompt = "你是一个学术研究助手，帮助用户理解和分析论文及相关学术内容。\n\n";
        if (context.sessionData.outline && context.sessionData.outline.length > 0) {
            prompt += "当前讨论的大纲:\n";
            context.sessionData.outline.forEach((item, index) => {
                prompt += `${index + 1}. ${item.title}: ${item.summary}\n`;
            });
            prompt += "\n";
        }
        if (context.documents && context.documents.length > 0) {
            prompt += "相关文档:\n";
            context.documents.forEach((doc, index) => {
                prompt += `${index + 1}. ${doc.title || doc.path}\n`;
            });
            prompt += "\n";
        }
        if (context.sessionData.conversationHistory && context.sessionData.conversationHistory.length > 0) {
            prompt += "对话历史:\n";
            const recentHistory = context.sessionData.conversationHistory.slice(-5);
            recentHistory.forEach(msg => {
                prompt += `${msg.role === 'user' ? '用户' : '助手'}: ${msg.content}\n`;
            });
            prompt += "\n";
        }
        prompt += `用户当前问题: ${userMessage}\n\n`;
        prompt += "请基于以上上下文提供详细、准确的回答。如果涉及到特定文档，请指出相关信息来源。";
        return prompt;
    }
    generateMockResponse(userMessage) {
        const responses = [
            `关于"${userMessage}"，这是一个很有趣的话题。根据我的分析，有几个关键点需要注意...`,
            `感谢您提出关于"${userMessage}"的问题。基于当前上下文，我认为...`,
            `您提到的"${userMessage}"确实值得深入探讨。结合相关文档，我的见解如下...`,
            `这是一个很好的问题！关于"${userMessage}"，我建议您可以从以下几个方面考虑...`
        ];
        const randomIndex = Math.floor(Math.random() * responses.length);
        return responses[randomIndex] || "感谢您的提问，我会尽力帮助您。";
    }
}
//# sourceMappingURL=llmService.js.map;