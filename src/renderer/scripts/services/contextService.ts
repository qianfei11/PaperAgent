// src/renderer/scripts/services/contextService.ts

import { SessionData, Context, OutlineItem } from '../../../shared/types';
import { DefaultDocumentService } from './documentService';
import { OpenAILLMService } from './llmService';

export class ContextService {
  private documentService: DefaultDocumentService;
  private llmService: OpenAILLMService;

  constructor(apiKey: string) {
    this.documentService = new DefaultDocumentService();
    this.llmService = new OpenAILLMService(apiKey);
  }

  async updateContext(
    sessionData: SessionData, 
    userMessage: string, 
    assistantResponse: string
  ): Promise<SessionData> {
    // 更新对话历史
    const updatedSession = this.updateConversationHistory(sessionData, userMessage, assistantResponse);
    
    // 提取关键点和实体
    const keyPoints = await this.extractKeyPoints(`${userMessage} ${assistantResponse}`);
    const entities = await this.identifyEntities(`${userMessage} ${assistantResponse}`);
    
    // 更新大纲
    const updatedOutline = await this.updateOutline(
      updatedSession.outline, 
      userMessage, 
      assistantResponse, 
      keyPoints, 
      entities
    );
    
    // 更新会话数据
    updatedSession.outline = updatedOutline;
    updatedSession.entitiesMap = this.updateEntitiesMap(updatedSession.entitiesMap, entities, updatedSession.outline.length - 1);
    
    // 更新元数据
    updatedSession.metadata.totalMessages += 2; // 用户消息 + 助手回复
    updatedSession.metadata.activeEntitiesCount = Object.keys(updatedSession.entitiesMap).length;
    
    return updatedSession;
  }

  private updateConversationHistory(
    sessionData: SessionData, 
    userMessage: string, 
    assistantResponse: string
  ): SessionData {
    const newSession = { ...sessionData };
    
    // 添加用户消息
    newSession.conversationHistory.push({
      id: Date.now().toString() + '_user',
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      relatedOutlineIds: [], // 这将在大纲更新后填充
      referencedDocuments: [] // 这将在后续实现中填充
    });
    
    // 添加助手回复
    newSession.conversationHistory.push({
      id: Date.now().toString() + '_assistant',
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date().toISOString(),
      relatedOutlineIds: [], // 这将在大纲更新后填充
      referencedDocuments: [] // 这将在后续实现中填充
    });
    
    return newSession;
  }

  private async extractKeyPoints(text: string): Promise<string[]> {
    try {
      return await this.llmService.extractKeyPoints(text);
    } catch (error) {
      console.error('Error extracting key points:', error);
      // 返回基于关键词的基本提取
      return this.basicKeyPointExtraction(text);
    }
  }

  private async identifyEntities(text: string): Promise<string[]> {
    try {
      return await this.llmService.identifyEntities(text);
    } catch (error) {
      console.error('Error identifying entities:', error);
      // 返回基于关键词的基本识别
      return this.basicEntityIdentification(text);
    }
  }

  private basicKeyPointExtraction(text: string): string[] {
    // 简单的关键词提取逻辑
    const sentences = text.split(/[.!?]+/);
    return sentences
      .filter(sentence => sentence.length > 10) // 过滤太短的句子
      .slice(0, 3) // 取前3个句子作为关键点
      .map(sentence => sentence.trim());
  }

  private basicEntityIdentification(text: string): string[] {
    // 简单的实体识别逻辑
    const entityRegex = /\b[A-Z][a-z]{2,}\b/g; // 匹配首字母大写的单词
    const matches = text.match(entityRegex);
    return matches ? [...new Set(matches)] : []; // 去重
  }

  private async updateOutline(
    outline: OutlineItem[],
    userMessage: string,
    assistantResponse: string,
    keyPoints: string[],
    entities: string[]
  ): Promise<OutlineItem[]> {
    // 在实际实现中，这里会更智能地更新大纲
    // 目前我们只是简单地添加一个新项
    
    // 检查是否已经有相似的主题，如果有则更新而不是创建新项
    const existingItemIndex = outline.findIndex(item => 
      this.calculateSimilarity(item.title, userMessage) > 0.7
    );
    
    if (existingItemIndex !== -1) {
      // 更新现有项
      const updatedOutline = [...outline];
      const existingItem = { ...updatedOutline[existingItemIndex] } as OutlineItem;
      
      // 更新摘要和关键点
      existingItem.summary = assistantResponse.substring(0, 100) + (assistantResponse.length > 100 ? '...' : '');
      existingItem.keyPoints = [...new Set([...(existingItem.keyPoints || []), ...keyPoints])]; // 合并并去重
      existingItem.entities = [...new Set([...(existingItem.entities || []), ...entities])]; // 合并并去重
      existingItem.timestamp = new Date().toISOString();
      
      updatedOutline[existingItemIndex] = existingItem;
      return updatedOutline;
    } else {
      // 添加新项
      const newItem: OutlineItem = {
        id: Date.now().toString(), // 实际应使用UUID
        parentId: null,
        level: 0,
        title: this.extractTopic(userMessage),
        summary: assistantResponse.substring(0, 100) + (assistantResponse.length > 100 ? '...' : ''),
        content: `${userMessage}\n\n${assistantResponse}`,
        keyPoints: keyPoints,
        entities: entities,
        tags: ['discussion'],
        relatedDocuments: [], // 实际应根据内容关联文档
        confidence: 0.8,
        timestamp: new Date().toISOString(),
        children: []
      };
      
      return [...outline, newItem];
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // 简单的字符串相似度计算
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    
    const set1 = new Set(s1.split(/\s+/));
    const set2 = new Set(s2.split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  private extractTopic(message: string): string {
    // 从消息中提取主题
    // 简单实现：取消息的前10个词
    const words = message.split(/\s+/);
    return words.slice(0, 10).join(' ') + (words.length > 10 ? '...' : '');
  }

  private updateEntitiesMap(
    entitiesMap: { [key: string]: any }, 
    newEntities: string[], 
    outlineItemId: number
  ): { [key: string]: any } {
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
      
      // 添加出现记录
      updatedMap[entity].occurrences.push({
        outlineId: outlineItemId.toString(),
        context: 'context placeholder',
        timestamp: new Date().toISOString()
      });
    });
    
    return updatedMap;
  }

  async createContext(sessionData: SessionData): Promise<Context> {
    // 构建上下文对象
    return {
      sessionData,
      llmConfig: {
        provider: 'openai',
        apiKey: this.llmService['apiKey'], // 注意：这里直接访问私有属性，实际中可能需要公共getter
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2048
      },
      documents: sessionData.documentLibrary.documents
    };
  }
}