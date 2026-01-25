class DefaultDocumentService {
    async uploadDocument(file) {
        console.log('Uploading document:', file.name);
        const documentInfo = {
            key: `doc_${Date.now()}`,
            path: file.name,
            type: this.getFileType(file.name),
            title: file.name.replace(/\.[^/.]+$/, ""),
            size: file.size,
            uploadDate: new Date().toISOString(),
            metadata: {},
            contentPreview: `预览内容：这是${file.name}的预览...`,
            associatedEntities: []
        };
        await new Promise(resolve => setTimeout(resolve, 500));
        return documentInfo;
    }
    async processDocument(documentPath) {
        console.log('Processing document:', documentPath);
        return {
            success: true,
            message: '文档处理成功',
            extractedContent: `从${documentPath}中提取的内容...`
        };
    }
    async extractTextFromPDF(filePath) {
        console.log('Extracting text from PDF:', filePath);
        return `从PDF ${filePath} 中提取的文本内容...`;
    }
    async extractTextFromImage(filePath) {
        console.log('Extracting text from image:', filePath);
        return `从图像 ${filePath} 中识别的文本...`;
    }
    async searchDocuments(query) {
        console.log('Searching documents for:', query);
        return [];
    }
    async getDocumentContent(documentId) {
        console.log('Getting content for document:', documentId);
        return `文档 ${documentId} 的内容...`;
    }
    getFileType(fileName) {
        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        const typeMap = {
            'pdf': 'pdf',
            'doc': 'doc',
            'docx': 'docx',
            'txt': 'txt',
            'jpg': 'image',
            'jpeg': 'image',
            'png': 'image',
            'gif': 'image'
        };
        return typeMap[extension] || 'unknown';
    }
}
//# sourceMappingURL=documentService.js.map;