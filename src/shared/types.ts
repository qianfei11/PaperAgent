// src/shared/types.ts
// Shared type definitions used by the main process, renderer, and preload layers.

// ── Outline ───────────────────────────────────────────────────────────────────

export interface OutlineItem {
  id: string;
  parentId: string | null;
  level: number;
  title: string;
  summary: string;
  content: string;
  keyPoints: string[];
  entities: string[];
  tags: string[];
  relatedDocuments: DocumentReference[];
  /** Confidence score assigned by the LLM for this item (0-1). */
  confidence: number;
  timestamp: string;
  children?: OutlineItem[];
}

export interface DocumentReference {
  key: string;
  path: string;
  type: string;
  extractedContent: string;
}

// ── Entity Graph ─────────────────────────────────────────────────────────────

export interface EntityMapping {
  name: string;
  description: string;
  relatedDocuments: string[];
  occurrences: EntityOccurrence[];
}

export interface EntityOccurrence {
  /** Linked outline item ID (OutlineItem.id, string). */
  outlineId: string;
  context: string;
  timestamp: string;
}

// ── Document Library ─────────────────────────────────────────────────────────

export interface DocumentInfo {
  key: string;
  path: string;
  type: string;
  title: string;
  /** Extracted text length in characters. Images or unparsed documents stay at 0. */
  size: number;
  uploadDate: string;
  metadata: Record<string, unknown>;
  contentPreview: string;
  /** Extracted full text, optional because large documents may not be stored in full. */
  fullContent?: string;
  associatedEntities: string[];
}

// ── Conversation History ─────────────────────────────────────────────────────

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  relatedOutlineIds: string[];
  referencedDocuments: string[];
}

// ── Session Data ─────────────────────────────────────────────────────────────

export interface SessionData {
  sessionId: string;
  title: string;
  description: string;
  createdAt: string;
  lastModified: string;
  version: string;
  outline: OutlineItem[];
  entitiesMap: Record<string, EntityMapping>;
  documentLibrary: {
    documents: DocumentInfo[];
  };
  conversationHistory: ConversationMessage[];
  metadata: {
    totalTokens: number;
    totalMessages: number;
    activeEntitiesCount: number;
    documentsCount: number;
  };
}

// ── LLM Configuration ────────────────────────────────────────────────────────

/**
 * Runtime LLM provider configuration used for IPC and API requests.
 * - When provider is 'anthropic', baseUrl is ignored and the official endpoint is used.
 * - When provider is 'openai-compatible', baseUrl is used as the API base URL directly.
 *   If the service needs a prefix like /v1, include it in baseUrl yourself.
 */
export interface LLMProviderConfig {
  provider: 'openai-compatible' | 'anthropic';
  baseUrl?: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AppConfig {
  llm: LLMProviderConfig;
  version: string;
}

// ── Context (passed into the LLM service layer) ─────────────────────────────

/**
 * LLMConfig is kept for the Context interface, but actual requests use LLMProviderConfig.
 * @deprecated New code should use LLMProviderConfig directly.
 */
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'local';
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Context snapshot passed to llmService.buildMessages(). */
export interface Context {
  sessionData: SessionData;
  /** Currently unused by buildMessages(); active config is injected via setProviderConfig(). */
  llmConfig: LLMConfig;
  documents: DocumentInfo[];
}
