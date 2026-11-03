import api from './api';
import type { JsonObject, ValidationReport } from '../types/ius.types';

/**
 * `botId` es obligatorio: el backend corre el análisis semántico con el
 * proveedor de IA del tenant dueño del bot (ADR-038).
 */
export async function validateIusConfig(
  config: JsonObject,
  semantic = false,
  botId?: string
): Promise<ValidationReport> {
  const response = await api.post<ValidationReport>('/bots/validate-ius-config', {
    config,
    semantic,
    bot_id: botId,
  });
  return response.data;
}
