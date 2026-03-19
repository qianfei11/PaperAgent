import { generateId, getCurrentTimestamp } from '../../../shared/utils';
export class DefaultDocumentService {
    async uploadDocument(filePath, onProgress) {
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
        }
        catch (_e) {
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
    async processDocument(documentPath) {
        const ext = documentPath.split('.').pop()?.toLowerCase() ?? '';
        const type = this.getFileType(ext);
        try {
            let text = '';
            if (type === 'pdf') {
                text = await this.extractTextFromPDF(documentPath);
            }
            else if (type === 'image') {
                text = await this.extractTextFromImage(documentPath);
            }
            return { success: true, text, metadata: { type, extractedAt: getCurrentTimestamp() } };
        }
        catch (error) {
            return {
                success: false,
                text: '',
                metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
            };
        }
    }
    async extractTextFromPDF(filePath) {
        const result = await window.electronAPI.extractPDFText(filePath);
        if (result.success)
            return result.text;
        throw new Error(result.message ?? 'Failed to extract text from PDF.');
    }
    async extractTextFromImage(filePath) {
        const result = await window.electronAPI.extractImageText(filePath);
        if (result.success)
            return result.text;
        throw new Error(result.message ?? 'Image OCR failed.');
    }
    searchDocuments(query, documents) {
        if (!query.trim())
            return documents;
        const q = query.toLowerCase();
        return documents.filter(doc => doc.title.toLowerCase().includes(q) ||
            doc.contentPreview.toLowerCase().includes(q) ||
            doc.type.toLowerCase().includes(q));
    }
    getDocumentContent(document) {
        return document.contentPreview;
    }
    getFileType(ext) {
        if (ext === 'pdf')
            return 'pdf';
        if (['doc', 'docx'].includes(ext))
            return 'doc';
        if (ext === 'txt')
            return 'txt';
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'].includes(ext))
            return 'image';
        return 'unknown';
    }
}
//# sourceMappingURL=documentService.js.map
