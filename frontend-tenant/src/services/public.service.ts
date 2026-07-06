import axios from 'axios';
import type { PublicChannelInfo, PublicUserInfo } from '../types/public.types';

// BASE_URL ya incluye /api (ej: http://localhost:8000/api o /api en prod)
const BASE_URL = import.meta.env.VITE_API_URL?.startsWith('http')
  ? import.meta.env.VITE_API_URL
  : '/api';

export const publicService = {
  async getChannelInfo(channelId: string): Promise<PublicChannelInfo> {
    const res = await axios.get(`${BASE_URL}/public/channels/${channelId}`);
    return res.data;
  },

  async getUserInfo(username: string): Promise<PublicUserInfo> {
    const res = await axios.get(`${BASE_URL}/public/users/${username}`);
    return res.data;
  },

  async getPublicUrl(): Promise<string> {
    const res = await axios.get(`${BASE_URL}/public/app-url`);
    return res.data.url;
  },

  async getLlmInfo(): Promise<{ provider: string; model: string }> {
    const res = await axios.get(`${BASE_URL}/public/llm-info`);
    return res.data;
  },

  getQrCodeUrl(channelId: string, publicUrl?: string): string {
    const origin = encodeURIComponent(publicUrl || window.location.origin);
    return `${BASE_URL}/public/channels/${channelId}/qr-code?base_url=${origin}`;
  },
};
