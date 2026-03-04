// src/renderer/scripts/services/llmService.ts

import type { Context, LLMProviderConfig } from '../../../shared/types.js';

export interface LLMService {
  sendMessage(context: Context, userMessage: string): Promise<string>;
  summarizeConversation(context: Context): Promise<any>;
  extractKeyPoints(text: string): Promise<string[]>;
  identifyEntities(text: string): Promise<string[]>;
}

type ChunkCallback = (text: string) => void;
type DoneCallback = (fullText: string) => void;
type ErrorCallback = (error: string) => void;

declare const window: Window & {
  electronAPI: {
    sendLLMMessage: (requestId: string, messages: Array<{ role: string; content: string }>, config: LLMProviderConfig) => void;
    onLLMChunk: (cb: (data: { requestId: string; text: string }) => void) => void;
    onLLMDone: (cb: (data: { requestId: string }) => void) => void;
    onLLMError: (cb: (data: { requestId: string; error: string }) => void) => void;
    removeLLMListeners: () => void;
  };
};

export class OpenAILLMService implements LLMService {
  private providerConfig: LLMProviderConfig | null = null;

  constructor(apiKey?: string) {
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

  setProviderConfig(config: LLMProviderConfig): void {
    this.providerConfig = config;
  }

  /**
   * 流式发送消息，通过回调函数逐块返回文本
   */
  sendMessageStreaming(
    messages: Array<{ role: string; content: string }>,
    config: LLMProviderConfig,
    onChunk: ChunkCallback,
    onDone: DoneCallback,
    onError: ErrorCallback
  ): void {
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

  /**
   * 非流式发送，返回完整文本（供 extractKeyPoints / identifyEntities 使用）
   */
  private async sendOnce(messages: Array<{ role: string; content: string }>): Promise<string> {
    if (!this.providerConfig) throw new Error('LLM 未配置，请先在设置中填写 API 信息');
    return new Promise<string>((resolve, reject) => {
      this.sendMessageStreaming(messages, this.providerConfig!, () => { /* no-op */ }, resolve, reject);
    });
  }

  async sendMessage(context: Context, userMessage: string): Promise<string> {
    const messages = this.buildMessages(context, userMessage);
    if (!this.providerConfig) throw new Error('LLM 未配置');
    return new Promise<string>((resolve, reject) => {
      this.sendMessageStreaming(messages, this.providerConfig!, () => { /* no-op */ }, resolve, reject);
    });
  }

  async summarizeConversation(context: Context): Promise<{ summary: string; keyPoints: string[]; entities: string[] }> {
    const recentHistory = context.sessionData.conversationHistory.slice(-10);
    const historyText = recentHistory.map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n');
    const messages = [
      {
        role: 'system',
        content: '你是一个学术研究助手，请将以下对话总结为结构化数据，用JSON格式回复，包含 summary(字符串), keyPoints(字符串数组), entities(字符串数组) 三个字段，只回复JSON，不要加markdown代码块。'
      },
      { role: 'user', content: historyText }
    ];
    try {
      const result = await this.sendOnce(messages);
      return JSON.parse(result);
    } catch (_e) {
      return { summary: '对话总结生成失败', keyPoints: [], entities: [] };
    }
  }

  async extractKeyPoints(text: string): Promise<string[]> {
    const messages = [
      {
        role: 'system',
        content: '请从以下文本中提取3-5个关键点，用JSON数组格式回复（字符串数组），只回复JSON，不要加markdown代码块。'
      },
      { role: 'user', content: text.substring(0, 1000) }
    ];
    try {
      const result = await this.sendOnce(messages);
      const parsed = JSON.parse(result);
      return Array.isArray(parsed) ? parsed : this.basicKeyPointExtraction(text);
    } catch (_e) {
      return this.basicKeyPointExtraction(text);
    }
  }

  async identifyEntities(text: string): Promise<string[]> {
    const messages = [
      {
        role: 'system',
        content: '请识别以下文本中的关键实体（人名、机构、概念、方法等），用JSON数组格式回复（字符串数组），只回复JSON，不要加markdown代码块。'
      },
      { role: 'user', content: text.substring(0, 1000) }
    ];
    try {
      const result = await this.sendOnce(messages);
      const parsed = JSON.parse(result);
      return Array.isArray(parsed) ? parsed : this.basicEntityIdentification(text);
    } catch (_e) {
      return this.basicEntityIdentification(text);
    }
  }

  /**
   * 将 Context 转为 messages 数组（OpenAI / Anthropic 通用格式）
   */
  buildMessages(context: Context, userMessage: string): Array<{ role: string; content: string }> {
    let systemContent = '你是一个学术研究助手，帮助用户理解和分析论文及相关学术内容。\n\n';

    if (context.sessionData.outline?.length > 0) {
      systemContent += '当前讨论的大纲:\n';
      context.sessionData.outline.forEach((item, index) => {
        systemContent += `${index + 1}. ${item.title}: ${item.summary}\n`;
      });
      systemContent += '\n';
    }

    if (context.documents?.length > 0) {
      systemContent += '相关文档:\n';
      context.documents.forEach((doc, index) => {
        const preview = doc.contentPreview ? ` (${doc.contentPreview.substring(0, 100)}...)` : '';
        systemContent += `${index + 1}. ${doc.title || doc.path}${preview}\n`;
      });
      systemContent += '\n';
    }

    systemContent += '请基于以上上下文提供详细、准确的回答。';

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemContent }
    ];

    const recentHistory = context.sessionData.conversationHistory.slice(-8);
    for (const msg of recentHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }

    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  private basicKeyPointExtraction(text: string): string[] {
    return text.split(/[.!?。！？]/).filter(s => s.trim().length > 10).slice(0, 3).map(s => s.trim());
  }

  private basicEntityIdentification(text: string): string[] {
    const matches = text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
    return [...new Set(matches)].slice(0, 5);
  }
}
