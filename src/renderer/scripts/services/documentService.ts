// src/renderer/scripts/services/documentService.ts

import type { DocumentInfo } from '../../../shared/types.js';

function generateId(): string { return crypto.randomUUID(); }
function getCurrentTimestamp(): string { return new Date().toISOString(); }

export interface DocumentService {
  uploadDocument(filePath: string, onProgress?: (progress: number) => void): Promise<DocumentInfo>;
  processDocument(documentPath: string): Promise<{ success: boolean; text: string; metadata: Record<string, unknown> }>;
  extractTextFromPDF(filePath: string): Promise<string>;
  extractTextFromImage(filePath: string): Promise<string>;
  searchDocuments(query: string, documents: DocumentInfo[]): DocumentInfo[];
  getDocumentContent(document: DocumentInfo): string;
}

declare const window: Window & {
  electronAPI: {
    extractPDFText: (filePath: string) => Promise<{ success: boolean; text: string; message?: string }>;
    extractImageText: (filePath: string) => Promise<{ success: boolean; text: string; message?: string }>;
  };
};

export class DefaultDocumentService implements DocumentService {

  // ── localStorage 缓存键前缀 ────────────────────────────────────────────────
  private static readonly CACHE_PREFIX = 'pa_doc_';

  private getFromCache(filePath: string): string | null {
    try {
      return localStorage.getItem(DefaultDocumentService.CACHE_PREFIX + filePath);
    } catch (_e) { return null; }
  }

  private saveToCache(filePath: string, text: string): void {
    try {
      // 只缓存不超过 2MB 的文本，避免撑满 localStorage
      if (text.length < 2 * 1024 * 1024) {
        localStorage.setItem(DefaultDocumentService.CACHE_PREFIX + filePath, text);
      }
    } catch (_e) { /* 存储已满时静默忽略 */ }
  }

  async uploadDocument(filePath: string, onProgress?: (progress: number) => void): Promise<DocumentInfo> {
    onProgress?.(10);

    const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'unknown';
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const type = this.getFileType(ext);
    const key = generateId();

    onProgress?.(30);

    let contentPreview = '';
    let fullContent: string | undefined;
    let size = 0;

    try {
      // 优先读缓存，避免重复 PDF/OCR 提取
      const cached = this.getFromCache(filePath);
      if (cached !== null) {
        fullContent = cached;
      } else {
        const result = await this.processDocument(filePath);
        if (result.success && result.text) {
          fullContent = result.text;
          this.saveToCache(filePath, fullContent);
        }
      }
      if (fullContent) {
        contentPreview = fullContent.substring(0, 500);
        size = fullContent.length;
      }
      onProgress?.(90);
    } catch (_e) {
      // 文本提取失败不影响文档注册
    }

    onProgress?.(100);

    return {
      key,
      path: filePath,
      type,
      title: fileName,
      size,
      uploadDate: getCurrentTimestamp(),
      metadata: { extension: ext },
      contentPreview,
      fullContent,
      associatedEntities: []
    };
  }

  async processDocument(documentPath: string): Promise<{ success: boolean; text: string; metadata: Record<string, unknown> }> {
    const ext = documentPath.split('.').pop()?.toLowerCase() ?? '';
    const type = this.getFileType(ext);

    try {
      let text = '';
      if (type === 'pdf') {
        text = await this.extractTextFromPDF(documentPath);
      } else if (type === 'image') {
        text = await this.extractTextFromImage(documentPath);
      }

      return { success: true, text, metadata: { type, extractedAt: getCurrentTimestamp() } };
    } catch (error) {
      return {
        success: false,
        text: '',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  async extractTextFromPDF(filePath: string): Promise<string> {
    const result = await window.electronAPI.extractPDFText(filePath);
    if (result.success) return result.text;
    throw new Error(result.message ?? 'PDF 文本提取失败');
  }

  async extractTextFromImage(filePath: string): Promise<string> {
    const result = await window.electronAPI.extractImageText(filePath);
    if (result.success) return result.text;
    throw new Error(result.message ?? '图片 OCR 失败');
  }

  searchDocuments(query: string, documents: DocumentInfo[]): DocumentInfo[] {
    if (!query.trim()) return documents;
    const q = query.toLowerCase();
    return documents.filter(doc => {
      if (doc.title.toLowerCase().includes(q)) return true;
      if (doc.type.toLowerCase().includes(q)) return true;
      // 优先搜索全文，其次搜索预览
      const content = (doc.fullContent ?? doc.contentPreview).toLowerCase();
      return content.includes(q);
    });
  }

  getDocumentContent(document: DocumentInfo): string {
    return document.fullContent ?? document.contentPreview;
  }

  private getFileType(ext: string): string {
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'doc';
    if (ext === 'txt') return 'txt';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'].includes(ext)) return 'image';
    return 'unknown';
  }
}
