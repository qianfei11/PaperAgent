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

  async uploadDocument(filePath: string, onProgress?: (progress: number) => void): Promise<DocumentInfo> {
    onProgress?.(10);

    const fileName = filePath.split('/').pop() ?? filePath.split('\\').pop() ?? 'unknown';
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const type = this.getFileType(ext);
    const key = generateId();

    onProgress?.(30);

    let contentPreview = '';
    let size = 0;

    try {
      const result = await this.processDocument(filePath);
      if (result.success && result.text) {
        contentPreview = result.text.substring(0, 500);
        size = result.text.length;
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
    return documents.filter(doc =>
      doc.title.toLowerCase().includes(q) ||
      doc.contentPreview.toLowerCase().includes(q) ||
      doc.type.toLowerCase().includes(q)
    );
  }

  getDocumentContent(document: DocumentInfo): string {
    return document.contentPreview;
  }

  private getFileType(ext: string): string {
    if (ext === 'pdf') return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'doc';
    if (ext === 'txt') return 'txt';
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'].includes(ext)) return 'image';
    return 'unknown';
  }
}
