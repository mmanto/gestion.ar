import axios from 'axios';

/**
 * Mensaje legible de un error de la API.
 *
 * FastAPI devuelve `detail` string en los `HTTPException` y una lista de
 * errores de validación en los 422; sólo el string es apto para mostrar.
 */
export function apiErrorDetail(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null;
  const detail = err.response?.data?.detail;
  return typeof detail === 'string' ? detail : null;
}
