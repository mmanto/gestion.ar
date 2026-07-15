import type { Client } from '../types/client.types';

/** Número de WhatsApp del cliente, si tiene uno: el capturado en `phone`, o
 * si llegó por ese canal, `external_id` (que ES el número para whatsapp). */
export const getWhatsappNumber = (client: Client): string | undefined =>
  client.phone || (client.source === 'whatsapp' ? client.external_id : undefined);

export const openWhatsapp = (number: string) => {
  window.open(`https://wa.me/${number.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer');
};
