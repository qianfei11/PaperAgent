// src/renderer/scripts/services/contextService.ts
// Maintains session context: conversation history, knowledge outline, and entity graph.
// After each conversation turn, updateContext() incrementally merges the new content into SessionData.

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
   * Called after a conversation turn finishes and returns an updated SessionData object.
   * Flow: append conversation history -> extract key points and entities -> update outline -> update entity graph.
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

    // Use the actual ID of the last outline item, not the array index.
    const lastOutlineId = updatedSession.outline[updatedSession.outline.length - 1]?.id ?? '0';
    updatedSession.entitiesMap = this.updateEntitiesMap(
      updatedSession.entitiesMap,
      entities,
      lastOutlineId,
      combinedText
    );

    updatedSession.metadata.totalMessages += 2;
    updatedSession.metadata.activeEntitiesCount = Object.keys(updatedSession.entitiesMap).length;

    return updatedSession;
  }

  /**
   * Appends the user and assistant messages to conversation history.
   * Returns a new object without mutating the original sessionData.
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
   * Updates the outline. If a similar topic exists (Jaccard similarity > 0.7), it is updated;
   * otherwise a new top-level item is created.
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

  /** Jaccard similarity over token sets, used to estimate topic overlap. */
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

  /** Extracts a topic title from a message by taking the first 10 words. */
  private extractTopic(message: string): string {
    const words = message.split(/\s+/);
    return words.slice(0, 10).join(' ') + (words.length > 10 ? '...' : '');
  }

  /**
   * Appends newly identified entities to the entity graph and records where they occurred.
   * contextText is the raw text for the turn and is used to capture a nearby context snippet.
   */
  private updateEntitiesMap(
    entitiesMap: Record<string, EntityMapping>,
    newEntities: string[],
    outlineId: string,
    contextText: string
  ): Record<string, EntityMapping> {
    const updatedMap = { ...entitiesMap };
    const timestamp = new Date().toISOString();

    for (const entity of newEntities) {
      if (!updatedMap[entity]) {
        updatedMap[entity] = {
          name: entity,
          description: `Information about ${entity}`,
          relatedDocuments: [],
          occurrences: []
        };
      }
      // Capture a short snippet around the entity; fall back to the start of the text.
      const idx = contextText.toLowerCase().indexOf(entity.toLowerCase());
      const snippet = idx !== -1
        ? contextText.substring(Math.max(0, idx - 30), Math.min(contextText.length, idx + entity.length + 50)).trim()
        : contextText.substring(0, 80).trim();
      updatedMap[entity]!.occurrences.push({
        outlineId,
        context: snippet,
        timestamp
      });
    }

    return updatedMap;
  }

  /**
   * Builds the Context object passed to llmService from sessionData.
   * Context.llmConfig is currently kept for compatibility; the active LLM settings
   * are managed by llmService.setProviderConfig().
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
