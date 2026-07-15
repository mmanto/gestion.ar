/**
 * Prospect types - entidad propia de prospección (conceptualmente distinta
 * de Client, ver backend/app/db/models.py:Prospect)
 */

export interface Prospect {
  prospect_id: string;
  tenant_id: string;
  estado: string;
  nombre: string;
  fecha_interaccion: string;
  canal?: string;
  whatsapp?: string;
  email?: string;
  /** Solo presente en prospectos creados automáticamente por el agente (ver
   * prospect_auto_qualify_service.py) — null en altas manuales. */
  color_semaforo?: 'verde' | 'amarillo' | 'rojo' | null;
  notas?: string | null;
}

export interface ProspectsResponse {
  success: boolean;
  prospects: Prospect[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface ProspectResponse {
  success: boolean;
  prospect: Prospect;
}
