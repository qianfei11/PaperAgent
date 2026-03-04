// src/renderer/scripts/services/contextService.ts
// 负责维护会话上下文：对话历史、知识大纲、实体图谱。
// 每次对话结束后，调用 updateContext() 将新内容增量合并到 SessionData。

import type { SessionData, Context, OutlineItem, EntityMapping } from '../../../shared/types.js';
import { DefaultDocumentService } from './documentService.js';
import { OpenAILLMService } from './llmService.js';

export class ContextService {
  private documentService: DefaultDocumentService;
  readonly llmService: OpenAILLMService;

  constructor(llmService: OpenAILLMService) {
    this.documentService = new DefaultDocumentService();
    this.llmService = llmService;
  }

  /**
   * 一次对话轮次结束后调用，返回更新后的 SessionData（不可变风格，不修改入参）。
   * 流程：追加对话历史 → 提取要点与实体 → 更新大纲 → 更新实体图谱
   */
  async updateContext(
    sessionData: SessionData,
    userMessage: string,
    assistantResponse: string
  ): Promise<SessionData> {
    const updatedSession = this.updateConversationHistory(sessionData, userMessage, assistantResponse);

    const combinedText = `${userMessage} ${assistantResponse}`;
    const [keyPoints, entities] = await Promise.all([
      this.extractKeyPoints(combinedText),
      this.identifyEntities(combinedText)
    ]);

    updatedSession.outline = await this.updateOutline(
      updatedSession.outline,
      userMessage,
      assistantResponse,
      keyPoints,
      entities
    );

    // 使用大纲最后一项的真实 ID（字符串），而非数组索引
    const lastOutlineId = updatedSession.outline[updatedSession.outline.length - 1]?.id ?? '0';
    updatedSession.entitiesMap = this.updateEntitiesMap(
      updatedSession.entitiesMap,
      entities,
      lastOutlineId
    );

    updatedSession.metadata.totalMessages += 2;
    updatedSession.metadata.activeEntitiesCount = Object.keys(updatedSession.entitiesMap).length;

    return updatedSession;
  }

  /**
   * 追加用户和助手消息到对话历史。
   * 返回新对象（浅拷贝 + 独立的 conversationHistory 数组），不修改原 sessionData。
   */
  private updateConversationHistory(
    sessionData: SessionData,
    userMessage: string,
    assistantResponse: string
  ): SessionData {
    const now = new Date().toISOString();
    const newHistory = [
      ...sessionData.conversationHistory,
      {
        id: `${Date.now()}_user`,
        role: 'user' as const,
        content: userMessage,
        timestamp: now,
        relatedOutlineIds: [],
        referencedDocuments: []
      },
      {
        id: `${Date.now()}_assistant`,
        role: 'assistant' as const,
        content: assistantResponse,
        timestamp: now,
        relatedOutlineIds: [],
        referencedDocuments: []
      }
    ];
    return { ...sessionData, conversationHistory: newHistory };
  }

  private async extractKeyPoints(text: string): Promise<string[]> {
    try {
      return await this.llmService.extractKeyPoints(text);
    } catch (_e) {
      return this.basicKeyPointExtraction(text);
    }
  }

  private async identifyEntities(text: string): Promise<string[]> {
    try {
      return await this.llmService.identifyEntities(text);
    } catch (_e) {
      return this.basicEntityIdentification(text);
    }
  }

  private basicKeyPointExtraction(text: string): string[] {
    return text.split(/[.!?。！？]+/).filter(s => s.trim().length > 10).slice(0, 3).map(s => s.trim());
  }

  private basicEntityIdentification(text: string): string[] {
    const matches = text.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
    return [...new Set(matches)].slice(0, 5);
  }

  /**
   * 更新大纲：若已有相似主题的条目（Jaccard 相似度 > 0.7）则更新，否则新建条目。
   */
  private async updateOutline(
    outline: OutlineItem[],
    userMessage: string,
    assistantResponse: string,
    keyPoints: string[],
    entities: string[]
  ): Promise<OutlineItem[]> {
    const existingItemIndex = outline.findIndex(item =>
      this.calculateSimilarity(item.title, userMessage) > 0.7
    );

    if (existingItemIndex !== -1) {
      const updatedOutline = [...outline];
      const existingItem = { ...updatedOutline[existingItemIndex] } as OutlineItem;
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

    const newItem: OutlineItem = {
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

  /** 基于词集合的 Jaccard 相似度，用于判断话题重叠程度 */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2) return 1.0;
    const set1 = new Set(s1.split(/\s+/));
    const set2 = new Set(s2.split(/\s+/));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }

  /** 从消息中提取话题标题（取前 10 个词） */
  private extractTopic(message: string): string {
    const words = message.split(/\s+/);
    return words.slice(0, 10).join(' ') + (words.length > 10 ? '...' : '');
  }

  /**
   * 将新识别的实体追加到实体图谱，记录其出现位置（outlineId 为字符串型大纲条目 ID）。
   */
  private updateEntitiesMap(
    entitiesMap: Record<string, EntityMapping>,
    newEntities: string[],
    outlineId: string
  ): Record<string, EntityMapping> {
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
      updatedMap[entity]!.occurrences.push({
        outlineId,
        context: 'context placeholder',
        timestamp
      });
    }

    return updatedMap;
  }

  /**
   * 根据 sessionData 构建传递给 llmService 的 Context 对象。
   * 注意：Context.llmConfig 目前未被 buildMessages() 使用，
   * 实际 LLM 配置由 llmService.setProviderConfig() 管理。
   */
  async createContext(sessionData: SessionData): Promise<Context> {
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

  getDocumentService(): DefaultDocumentService {
    return this.documentService;
  }
}
