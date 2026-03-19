// src/shared/utils.ts

import { SessionData, OutlineItem } from './types';

/**
 * Generates a UUID.
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/**
 * Returns the current timestamp.
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Creates a new session object.
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
 * Updates the session's lastModified timestamp.
 */
export function updateLastModified(sessionData: SessionData): SessionData {
  return {
    ...sessionData,
    lastModified: getCurrentTimestamp()
  };
}

/**
 * Adds a new item to the outline.
 */
export function addOutlineItem(
  outline: OutlineItem[],
  item: OutlineItem,
  parentId: string | null = null
): OutlineItem[] {
  if (parentId === null) {
    // Add to the top level.
    return [...outline, item];
  }

  // Recursively find the parent item and append the new child.
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
 * Finds an outline item by ID.
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
 * Updates an outline item.
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
 * Removes an outline item.
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
 * Estimates the token count for a string.
 */
export function estimateTokens(text: string): number {
  // Rough estimate: about 1 token per 4 characters.
  return Math.ceil(text.length / 4);
}

/**
 * Truncates text to fit within an estimated token limit.
 */
export function truncateToTokenLimit(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= maxTokens) {
    return text;
  }

  // Truncate proportionally.
  const ratio = maxTokens / estimatedTokens;
  const targetLength = Math.floor(text.length * ratio);
  
  // Try to truncate at a sentence boundary.
  let truncated = text.substring(0, targetLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('!')
  );
  
  if (lastSentenceEnd > targetLength * 0.8) {
    truncated = truncated.substring(0, lastSentenceEnd + 1);
  }

  return truncated;
}
