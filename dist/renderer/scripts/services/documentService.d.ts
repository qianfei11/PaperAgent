import { DocumentInfo } from '../../../shared/types';
export interface DocumentService {
    uploadDocument(file: File): Promise<DocumentInfo>;
    processDocument(documentPath: string): Promise<any>;
    extractTextFromPDF(filePath: string): Promise<string>;
    extractTextFromImage(filePath: string): Promise<string>;
    searchDocuments(query: string): Promise<DocumentInfo[]>;
    getDocumentContent(documentId: string): Promise<string>;
}
export declare class DefaultDocumentService implements DocumentService {
    uploadDocument(file: File): Promise<DocumentInfo>;
    processDocument(documentPath: string): Promise<any>;
    extractTextFromPDF(filePath: string): Promise<string>;
    extractTextFromImage(filePath: string): Promise<string>;
    searchDocuments(query: string): Promise<DocumentInfo[]>;
    getDocumentContent(documentId: string): Promise<string>;
    private getFileType;
}
//# sourceMappingURL=documentService.d.ts.map