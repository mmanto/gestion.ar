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
