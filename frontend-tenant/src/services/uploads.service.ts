/**
 * Uploads Service - subida de archivos (avatares)
 */

import api from './api';

const uploadsService = {
  async uploadAvatar(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await api.post<{ success: boolean; url: string }>(
      '/uploads/avatar',
      formData,
      { headers: { 'Content-Type': null } } // el browser setea multipart/form-data con boundary
    );
    return data.url;
  },
};

export default uploadsService;
