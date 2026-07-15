import { useEffect, useState } from 'react';
import type { ClientColorStats } from '../types/client.types';
import clientsService from '../services/clients.service';

const EMPTY_STATS: ClientColorStats = { verde: 0, amarillo: 0, rojo: 0, sin_clasificar: 0 };

export const useColorStats = () => {
  const [colorStats, setColorStats] = useState<ClientColorStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clientsService.getColorStats()
      .then(setColorStats)
      .catch((err) => console.error('Error cargando estadísticas de clientes:', err))
      .finally(() => setLoading(false));
  }, []);

  return { colorStats, loading };
};
