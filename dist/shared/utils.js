import { v4 as uuidv4 } from 'uuid';
export function generateId() {
    return uuidv4();
}
export function getCurrentTimestamp() {
    return new Date().toISOString();
}
export function createNewSession(title, description = '') {
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
export function updateLastModified(sessionData) {
    return {
        ...sessionData,
        lastModified: getCurrentTimestamp()
    };
}
export function addOutlineItem(outline, item, parentId = null) {
    if (parentId === null) {
        return [...outline, item];
    }
    const addToParent = (items) => {
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
export function findOutlineItem(outline, id) {
    for (const item of outline) {
        if (item.id === id) {
            return item;
        }
        if (item.children) {
            const found = findOutlineItem(item.children, id);
            if (found)
                return found;
        }
    }
    return null;
}
export function updateOutlineItem(outline, id, updates) {
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
export function removeOutlineItem(outline, id) {
    return outline
        .filter(item => item.id !== id)
        .map(item => {
        if (item.children) {
            return { ...item, children: removeOutlineItem(item.children, id) };
        }
        return item;
    });
}
export function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
export function truncateToTokenLimit(text, maxTokens) {
    const estimatedTokens = estimateTokens(text);
    if (estimatedTokens <= maxTokens) {
        return text;
    }
    const ratio = maxTokens / estimatedTokens;
    const targetLength = Math.floor(text.length * ratio);
    let truncated = text.substring(0, targetLength);
    const lastSentenceEnd = Math.max(truncated.lastIndexOf('. '), truncated.lastIndexOf('?'), truncated.lastIndexOf('!'));
    if (lastSentenceEnd > targetLength * 0.8) {
        truncated = truncated.substring(0, lastSentenceEnd + 1);
    }
    return truncated;
}
//# sourceMappingURL=utils.js.map