import api from './api';

export interface RAGDocument {
  doc_id: string;
  title: string;
  category: string;
  source: string;
  type: string;
  chunks_count: number;
  uploaded_at?: string;
}

export interface RAGStats {
  total_chunks: number;
  collection_name: string;
  embedding_dimension: number;
}

const documentsService = {
  async list(): Promise<RAGDocument[]> {
    const { data } = await api.get('/documents');
    return data.documents as RAGDocument[];
  },

  async upload(
    file: File,
    title: string,
    category: string,
    onUploadProgress?: (pct: number) => void
  ): Promise<{ doc_id: string; chunks_created: number; filename: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title || file.name);
    formData.append('category', category || 'general');
    const { data } = await api.post('/documents/upload', formData, {
      headers: { 'Content-Type': null },  // let browser set multipart/form-data with boundary
      onUploadProgress: (e) => {
        if (onUploadProgress && e.total) {
          onUploadProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    });
    return data;
  },

  async remove(docId: string): Promise<void> {
    await api.delete(`/documents/${docId}`);
  },

  async getStats(): Promise<RAGStats> {
    const { data } = await api.get('/rag/stats');
    return data.stats as RAGStats;
  },
};

export default documentsService;
