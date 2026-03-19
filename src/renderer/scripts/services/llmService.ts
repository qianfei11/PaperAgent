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
    cancelLLMMessage: (requestId: string) => void;
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
        baseUrl: 'https://api.openai.com/v1',
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
   * Sends a message in streaming mode and returns text chunks through callbacks.
   * @param timeoutMs Timeout in milliseconds. Defaults to 90 seconds and resets on each chunk.
   * @returns A cancel function that aborts the request immediately and triggers onError ('Cancelled').
   */
  sendMessageStreaming(
    messages: Array<{ role: string; content: string }>,
    config: LLMProviderConfig,
    onChunk: ChunkCallback,
    onDone: DoneCallback,
    onError: ErrorCallback,
    timeoutMs = 90_000
  ): () => void {
    const requestId = crypto.randomUUID();
    let fullText = '';
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const resetTimeout = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      timeoutHandle = setTimeout(() => {
        if (!settled) cancel('Request timed out. Check the network connection or try again.');
      }, timeoutMs);
    };

    const cancel = (reason = 'Cancelled') => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      window.electronAPI.removeLLMListeners();
      window.electronAPI.cancelLLMMessage(requestId);
      onError(reason);
    };

    window.electronAPI.removeLLMListeners();

    window.electronAPI.onLLMChunk((data) => {
      if (data.requestId === requestId && !settled) {
        resetTimeout();
        fullText += data.text;
        onChunk(data.text);
      }
    });

    window.electronAPI.onLLMDone((data) => {
      if (data.requestId === requestId && !settled) {
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        window.electronAPI.removeLLMListeners();
        onDone(fullText);
      }
    });

    window.electronAPI.onLLMError((data) => {
      if (data.requestId === requestId && !settled) {
        settled = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        window.electronAPI.removeLLMListeners();
        onError(data.error);
      }
    });

    resetTimeout();
    window.electronAPI.sendLLMMessage(requestId, messages, config);

    return () => cancel();
  }

  /**
   * Sends a non-streaming request and returns the full text.
   * Used by extractKeyPoints() and identifyEntities().
   */
  private async sendOnce(messages: Array<{ role: string; content: string }>): Promise<string> {
    if (!this.providerConfig) throw new Error('LLM is not configured. Fill in the API settings first.');
    return new Promise<string>((resolve, reject) => {
      this.sendMessageStreaming(messages, this.providerConfig!, () => { /* no-op */ }, resolve, (e) => reject(new Error(e)));
    });
  }

  async sendMessage(context: Context, userMessage: string): Promise<string> {
    const messages = this.buildMessages(context, userMessage);
    if (!this.providerConfig) throw new Error('LLM is not configured.');
    return new Promise<string>((resolve, reject) => {
      this.sendMessageStreaming(messages, this.providerConfig!, () => { /* no-op */ }, resolve, (e) => reject(new Error(e)));
    });
  }

  async summarizeConversation(context: Context): Promise<{ summary: string; keyPoints: string[]; entities: string[] }> {
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
    } catch (_e) {
      return { summary: 'Failed to generate a conversation summary.', keyPoints: [], entities: [] };
    }
  }

  async extractKeyPoints(text: string): Promise<string[]> {
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
    } catch (_e) {
      return this.basicKeyPointExtraction(text);
    }
  }

  async identifyEntities(text: string): Promise<string[]> {
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
    } catch (_e) {
      return this.basicEntityIdentification(text);
    }
  }

  /**
   * Converts Context into a messages array compatible with OpenAI and Anthropic.
   */
  buildMessages(context: Context, userMessage: string): Array<{ role: string; content: string }> {
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
