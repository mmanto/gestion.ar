import { AxiosError } from 'axios';

interface PydanticValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

interface FastApiErrorBody {
  detail?: string | PydanticValidationError[];
}

/**
 * Traduce un error de axios/FastAPI a un mensaje legible para el usuario.
 * FastAPI devuelve `{ detail: "mensaje" }` en HTTPException y
 * `{ detail: [{ loc, msg, type }] }` en errores de validación de Pydantic (422).
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    if (!error.response) {
      return 'No se pudo conectar con el servidor. Verificá tu conexión.';
    }

    const body = error.response.data as FastApiErrorBody | undefined;
    const detail = body?.detail;

    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }

    if (Array.isArray(detail) && detail.length > 0) {
      return detail
        .map((e) => {
          const field = e.loc?.[e.loc.length - 1];
          return field ? `${field}: ${e.msg}` : e.msg;
        })
        .join(' — ');
    }

    return `Error ${error.response.status}: ${error.response.statusText || 'algo salió mal'}`;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Ocurrió un error inesperado.';
}
