import api from './api';
import type { JsonObject, ValidationReport } from '../types/ius.types';

export async function validateIusConfig(
  config: JsonObject,
  semantic = false
): Promise<ValidationReport> {
  const response = await api.post<ValidationReport>('/bots/validate-ius-config', {
    config,
    semantic,
  });
  return response.data;
}
