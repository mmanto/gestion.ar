import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, MessageSquare, Eye, Users } from 'lucide-react';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { Drawer } from '../common/Drawer';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import MessagesList from '../messages/MessagesList';
import prospectsService from '../../services/prospects.service';
import type { Prospect } from '../../types/prospect.types';

const estadoColors: Record<string, string> = {
  nuevo: 'bg-blue-200 text-blue-950',
  contactado: 'bg-yellow-200 text-yellow-950',
  calificado: 'bg-green-200 text-green-950',
  descartado: 'bg-gray-200 text-gray-950',
};

const canalColors: Record<string, string> = {
  whatsapp: 'bg-green-200 text-green-950',
  telegram: 'bg-blue-200 text-blue-950',
  web: 'bg-purple-200 text-purple-950',
  manual: 'bg-gray-200 text-gray-950',
};

const ProspectsGrid = () => {
  const navigate = useNavigate();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchProspects = useCallback(async () => {
    try {
      setLoading(true);
      const response = await prospectsService.getProspects({ limit: 20 });
      setProspects(response.prospects);
    } catch (err) {
      console.error('Error cargando prospectos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProspects();
  }, [fetchProspects]);

  const handleOpenConversation = (prospect: Prospect) => {
    setSelectedProspect(prospect);
    setDrawerOpen(true);
  };

  const handleOpenWhatsapp = (prospect: Prospect) => {
    if (!prospect.whatsapp) return;
    const number = prospect.whatsapp.replace(/\D/g, '');
    window.open(`https://wa.me/${number}`, '_blank', 'noopener,noreferrer');
  };

  const handleViewDetail = (prospect: Prospect) => {
    navigate(`/prospects/${prospect.prospect_id}`);
  };

  if (loading && prospects.length === 0) {
    return (
      <Card className="mt-6" shadow="none">
        <p className="text-sm text-gray-700">Cargando prospectos...</p>
      </Card>
    );
  }

  return (
    <div className="mt-6">
      {prospects.length === 0 ? (
        <Card shadow="none">
          <EmptyState
            icon={<Users className="w-8 h-8 text-gray-800" />}
            title="Todavía no hay prospectos"
            description="Los prospectos aparecerán acá a medida que se vayan sumando"
            titleClassName="text-gray-900 text-xl"
            descriptionClassName="text-gray-900 text-base"
          />
        </Card>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Estado</TableHeaderCell>
              <TableHeaderCell>Nombre</TableHeaderCell>
              <TableHeaderCell>Última interacción</TableHeaderCell>
              <TableHeaderCell>Canal</TableHeaderCell>
              <TableHeaderCell align="right">Acciones</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {prospects.map((prospect) => (
              <TableRow key={prospect.prospect_id}>
                <TableCell>
                  <span
                    className={`px-2 py-1 text-base font-medium rounded-full capitalize ${
                      estadoColors[prospect.estado] || 'bg-gray-200 text-gray-950'
                    }`}
                  >
                    {prospect.estado}
                  </span>
                </TableCell>
                <TableCell>
                  <p className="text-lg font-normal text-gray-900">{prospect.nombre}</p>
                </TableCell>
                <TableCell textClassName="text-gray-800">
                  {new Date(prospect.fecha_interaccion).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </TableCell>
                <TableCell>
                  {prospect.canal ? (
                    <span
                      className={`px-2 py-1 text-base font-medium rounded-full capitalize ${
                        canalColors[prospect.canal] || 'bg-gray-200 text-gray-950'
                      }`}
                    >
                      {prospect.canal}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </TableCell>
                <TableCell align="right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenConversation(prospect)}
                      title="Ver conversación"
                      className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleOpenWhatsapp(prospect)}
                      title={prospect.whatsapp ? 'Abrir WhatsApp' : 'Sin número de WhatsApp'}
                      disabled={!prospect.whatsapp}
                      className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-green-50"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleViewDetail(prospect)}
                      title="Ver detalle"
                      className="p-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedProspect?.nombre || ''}
      >
        <MessagesList messages={[]} />
      </Drawer>
    </div>
  );
};

export default ProspectsGrid;
