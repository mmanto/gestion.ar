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
    // En el APK nativo (Capacitor) todas las llamadas van directo al backend
    // (VITE_API_URL, ej. https://api.intellify.pro), así que el Host de la
    // request no es el dominio público del tenant (ej. ius.intellify.pro) y
    // /public/app-url devolvería la base del API — rota el link de chat
    // ("Compartir enlace", "Mi link de chat"). build-android (scripts/stack-*.sh)
    // hornea VITE_TENANT_PUBLIC_URL desde TENANT_PUBLIC_URL_<SLUG> en
    // .env.prod: si está presente se usa ese dominio y no se consulta al
    // backend. En la web la var no existe y el Host de la request sigue
    // siendo el del tenant (derivación actual, correcta).
    const bakedPublicUrl = (import.meta.env.VITE_TENANT_PUBLIC_URL as string | undefined)?.trim();
    if (bakedPublicUrl) {
      return bakedPublicUrl.replace(/\/+$/, '');
    }
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
