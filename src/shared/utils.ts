// src/shared/utils.ts

import { v4 as uuidv4 } from 'uuid';
import { SessionData, OutlineItem } from './types';

/**
 * 生成UUID
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * 获取当前时间戳
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 创建新的会话数据
 */
export function createNewSession(title: string, description: string = ''): SessionData {
  return {
    sessionId: generateId(),
    title,
    description,
    createdAt: getCurrentTimestamp(),
    lastModified: getCurrentTimestamp(),
    version: '1.0',
    outline: [],
    entitiesMap: {},
    documentLibrary: {
      documents: []
    },
    conversationHistory: [],
    metadata: {
      totalTokens: 0,
      totalMessages: 0,
      activeEntitiesCount: 0,
      documentsCount: 0
    }
  };
}

/**
 * 更新会话的最后修改时间
 */
export function updateLastModified(sessionData: SessionData): SessionData {
  return {
    ...sessionData,
    lastModified: getCurrentTimestamp()
  };
}

/**
 * 在大纲中添加新项目
 */
export function addOutlineItem(
  outline: OutlineItem[],
  item: OutlineItem,
  parentId: string | null = null
): OutlineItem[] {
  if (parentId === null) {
    // 添加到顶层
    return [...outline, item];
  }

  // 递归查找父项并添加到其子项中
  const addToParent = (items: OutlineItem[]): OutlineItem[] => {
    return items.map(i => {
      if (i.id === parentId) {
        const children = i.children ? [...i.children, item] : [item];
        return { ...i, children };
      }
      if (i.children) {
        return { ...i, children: addToParent(i.children) };
      }
      return i;
    });
  };

  return addToParent(outline);
}

/**
 * 查找大纲项
 */
export function findOutlineItem(outline: OutlineItem[], id: string): OutlineItem | null {
  for (const item of outline) {
    if (item.id === id) {
      return item;
    }
    if (item.children) {
      const found = findOutlineItem(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 更新大纲项
 */
export function updateOutlineItem(
  outline: OutlineItem[],
  id: string,
  updates: Partial<OutlineItem>
): OutlineItem[] {
  return outline.map(item => {
    if (item.id === id) {
      return { ...item, ...updates };
    }
    if (item.children) {
      return { ...item, children: updateOutlineItem(item.children, id, updates) };
    }
    return item;
  });
}

/**
 * 删除大纲项
 */
export function removeOutlineItem(outline: OutlineItem[], id: string): OutlineItem[] {
  return outline
    .filter(item => item.id !== id)
    .map(item => {
      if (item.children) {
        return { ...item, children: removeOutlineItem(item.children, id) };
      }
      return item;
    });
}

/**
 * 计算字符串的token数量（简单估算）
 */
export function estimateTokens(text: string): number {
  // 简单估算：每4个字符约等于1个token
  return Math.ceil(text.length / 4);
}

/**
 * 截断文本以适应指定的token限制
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= maxTokens) {
    return text;
  }

  // 按比例截断文本
  const ratio = maxTokens / estimatedTokens;
  const targetLength = Math.floor(text.length * ratio);
  
  // 尝试在句子边界处截断
  let truncated = text.substring(0, targetLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('!')
  );
  
  if (lastSentenceEnd > targetLength * 0.8) { // 只有在句子结尾靠近截断点时才使用
    truncated = truncated.substring(0, lastSentenceEnd + 1);
  }

  return truncated;
}