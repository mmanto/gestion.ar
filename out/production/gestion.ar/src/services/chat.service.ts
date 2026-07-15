import api from './api';

const chatService = {
  /**
   * Solicita al backend el QR code del bot como PNG y devuelve un object URL
   * que puede usarse directamente como src de un <img>.
   * El llamador es responsable de llamar URL.revokeObjectURL() cuando ya no lo necesite.
   */
  async getQrCodeUrl(botId: string, baseUrl: string): Promise<string> {
    const response = await api.get(`/api/bots/${botId}/qr-code`, {
      params: { base_url: baseUrl },
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data);
  },
};

export default chatService;
