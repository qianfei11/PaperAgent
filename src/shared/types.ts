// src/shared/types.ts
// 全局类型定义，在主进程、渲染进程和 preload 之间共享。

// ── 大纲 ───────────────────────────────────────────────────────────────────────

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
  /** LLM 对该条目信息的置信度（0–1） */
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

// ── 实体图谱 ──────────────────────────────────────────────────────────────────

export interface EntityMapping {
  name: string;
  description: string;
  relatedDocuments: string[];
  occurrences: EntityOccurrence[];
}

export interface EntityOccurrence {
  /** 关联的大纲条目 ID（OutlineItem.id，字符串） */
  outlineId: string;
  context: string;
  timestamp: string;
}

// ── 文档库 ────────────────────────────────────────────────────────────────────

export interface DocumentInfo {
  key: string;
  path: string;
  type: string;
  title: string;
  /** 文本长度（字符数），图片/未提取文档为 0 */
  size: number;
  uploadDate: string;
  metadata: Record<string, unknown>;
  contentPreview: string;
  /** 提取的完整文本内容（可选，大文档可能不存储） */
  fullContent?: string;
  associatedEntities: string[];
}

// ── 对话历史 ──────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  relatedOutlineIds: string[];
  referencedDocuments: string[];
}

// ── 会话数据 ──────────────────────────────────────────────────────────────────

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

// ── LLM 配置 ──────────────────────────────────────────────────────────────────

/**
 * LLM 提供商运行时配置，用于 IPC 通信和 API 请求。
 * - provider 为 'anthropic' 时，baseUrl 无效（固定调用官方端点）。
 * - provider 为 'openai-compatible' 时，支持任何兼容 OpenAI Chat API 的服务。
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

// ── Context（传递给 LLM 服务层）────────────────────────────────────────────────

/**
 * LLMConfig 保留用于 Context 接口，实际请求使用 LLMProviderConfig。
 * @deprecated 新代码请直接使用 LLMProviderConfig。
 */
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'local';
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/** 传递给 llmService.buildMessages() 的上下文快照 */
export interface Context {
  sessionData: SessionData;
  /** 目前未被 buildMessages() 使用，实际配置通过 setProviderConfig() 注入 */
  llmConfig: LLMConfig;
  documents: DocumentInfo[];
}
