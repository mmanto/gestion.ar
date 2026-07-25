import { Users, Search, X, Star } from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';
import { Drawer } from '../../components/common/Drawer';
import { Button } from '../../components/common/Button';
import { ActionMenu } from '../../components/common/ActionMenu';
import MessagesList from '../../components/messages/MessagesList';
import { useClientsGrid } from '../../hooks/useClientsGrid';
import type { ColorFilter } from '../../types/client.types';
import { buildClientActionItems } from '../../utils/clientActions';
import { formatTimeAgo } from '../../utils/formatters';

const sourceLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  web: 'Web',
  manual: 'Manual',
};

// Mismo mapeo de color que StatsCards (el semáforo de calificación
// automática) — el punto de color retoma ese código para que el estado del
// cliente se lea de un vistazo en la propia fila.
const semaforoDot: Record<string, string> = {
  verde: 'bg-green-500',
  amarillo: 'bg-yellow-400',
  rojo: 'bg-red-500',
};

interface ClientsGridProps {
  /** Si viene, restringe la grilla a clientes de ese color de semáforo. */
  colorFilter?: ColorFilter;
}

// Diseño de kero para la grilla de clientes del Escritorio: a diferencia del
// resto de la app (sin cajas propias), esta tabla lleva un panel con borde y
// grilla de celdas propia — la información que muestra pide identidad
// visual reconocible. El punto de semáforo por fila retoma el código de
// color de las stat cards de arriba. Comparte todo el estado/lógica con la
// versión default vía useClientsGrid — solo cambia la presentación.
const KeroClientsGrid = ({ colorFilter }: ClientsGridProps) => {
  const {
    canBlock,
    isMobile,
    clients,
    loading,
    search,
    setSearch,
    searchExpanded,
    setSearchExpanded,
    handleSearch,
    handleCloseSearch,
    selectedClient,
    drawerOpen,
    setDrawerOpen,
    conversationMessages,
    conversationLoading,
    conversationError,
    summaryClient,
    summaryDrawerOpen,
    setSummaryDrawerOpen,
    detailClient,
    detailDrawerOpen,
    setDetailDrawerOpen,
    handleOpenWhatsapp,
    handleOpenSummary,
    handleOpenDetail,
    handleToggleDestacado,
    handleToggleBlock,
    handleOpenConversation,
  } = useClientsGrid(colorFilter);

  return (
    <div className="mt-6">
      {isMobile ? (
        searchExpanded ? (
          <form onSubmit={handleSearch} className="flex items-center gap-2 mb-6">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, teléfono o email..."
              className="flex-1 px-4 py-2.5 rounded-full border border-[#dee2e6] bg-white focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 outline-none text-sm"
            />
            <button
              type="button"
              onClick={handleCloseSearch}
              aria-label="Cerrar búsqueda"
              className="p-2 rounded-full text-gray-700 hover:bg-blue-600/10 transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </form>
        ) : (
          <div className="flex justify-end mb-6">
            <button
              type="button"
              onClick={() => setSearchExpanded(true)}
              aria-label="Buscar"
              className="p-2 rounded-full text-gray-700 hover:bg-blue-600/10 transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
          </div>
        )
      ) : (
        <form onSubmit={handleSearch} className="flex gap-2 mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email..."
            className="flex-1 px-4 py-2.5 rounded-full border border-[#dee2e6] bg-white focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 outline-none text-sm"
          />
          <Button type="submit" variant="primary">
            Buscar
          </Button>
        </form>
      )}

      {loading && clients.length === 0 ? (
        <div className="border border-[#dee2e6] rounded-[1.4rem] bg-white px-4 py-6">
          <p className="text-sm text-gray-700">Cargando clientes...</p>
        </div>
      ) : clients.length === 0 ? (
        <div className="border border-[#dee2e6] rounded-[1.4rem] bg-white">
          <EmptyState
            icon={<Users className="w-8 h-8 text-gray-800" />}
            title="No hay contactos todavía"
            description="Los clientes aparecerán aquí cuando interactúen con tus agentes"
            titleClassName="text-gray-900 text-xl"
            descriptionClassName="text-gray-900 text-base"
          />
        </div>
      ) : (
        // Tabla con grilla propia (a diferencia del resto de la app, esta
        // información pide una caja reconocible con identidad) — panel con
        // borde y esquinas redondeadas (la forma característica de kero),
        // líneas verticales y horizontales entre celdas.
        <div className="border border-[#dee2e6] rounded-[1.4rem] bg-white overflow-hidden overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-white border-b border-[#dee2e6]">
              <tr className="divide-x divide-[#dee2e6]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Canal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Último contacto</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dee2e6]">
              {clients.map((client) => (
                <tr key={client.client_id} className="divide-x divide-[#dee2e6] hover:bg-blue-600/5 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${semaforoDot[client.color_semaforo ?? ''] ?? 'bg-gray-300'}`}
                        title="Semáforo"
                      />
                      <div className="min-w-0">
                        <p className="font-editorial font-semibold text-gray-900 truncate">
                          {client.name || client.external_id}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {client.dni ? `DNI: ${client.dni}` : client.external_id}
                        </p>
                      </div>
                      {client.destacado && (
                        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-400 flex-shrink-0" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-medium text-gray-600 px-2 py-0.5 rounded-full bg-gray-100">
                      {sourceLabels[client.source] || client.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatTimeAgo(client.last_contact_at)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center">
                      <ActionMenu
                        ariaLabel={`Acciones para ${client.name || client.external_id}`}
                        items={buildClientActionItems(client, {
                          onToggleDestacado: handleToggleDestacado,
                          onOpenDetail: handleOpenDetail,
                          onOpenSummary: handleOpenSummary,
                          onOpenConversation: handleOpenConversation,
                          onOpenWhatsapp: handleOpenWhatsapp,
                        })}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedClient ? selectedClient.name || selectedClient.external_id : ''}
      >
        {conversationLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-700 text-sm">Cargando conversación...</p>
          </div>
        ) : conversationError ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-red-600 text-sm">{conversationError}</p>
          </div>
        ) : (
          <MessagesList messages={conversationMessages} />
        )}
      </Drawer>

      <Drawer
        open={summaryDrawerOpen}
        onClose={() => setSummaryDrawerOpen(false)}
        title="Resumen ejecutivo"
      >
        <div className="p-6">
          <p className="text-base text-gray-900 whitespace-pre-wrap">{summaryClient?.notas}</p>
        </div>
      </Drawer>

      <Drawer
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        title={detailClient ? detailClient.name || detailClient.external_id : ''}
      >
        {detailClient && (
          <div className="p-6 space-y-4">
            <div>
              <p className="text-sm text-gray-800">Canal</p>
              <span className="inline-block mt-1 px-2 py-1 text-base font-medium rounded-full bg-gray-100 text-gray-700">
                {sourceLabels[detailClient.source] || detailClient.source}
              </span>
            </div>
            <div>
              <p className="text-sm text-gray-800">Conversaciones</p>
              <p className="text-lg text-gray-900">{detailClient.total_conversations}</p>
            </div>
            <div>
              <p className="text-sm text-gray-800">Último contacto</p>
              <p className="text-lg text-gray-900">
                {new Date(detailClient.last_contact_at).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
              </p>
            </div>
            {detailClient.dni && (
              <div>
                <p className="text-sm text-gray-800">DNI</p>
                <p className="text-lg text-gray-900">{detailClient.dni}</p>
              </div>
            )}
            {detailClient.email && (
              <div>
                <p className="text-sm text-gray-800">Email</p>
                <p className="text-lg text-gray-900">{detailClient.email}</p>
              </div>
            )}
            {detailClient.phone && (
              <div>
                <p className="text-sm text-gray-800">Teléfono</p>
                <p className="text-lg text-gray-900">{detailClient.phone}</p>
              </div>
            )}
            {canBlock && (
              <div className="pt-2">
                <Button variant="outline" onClick={() => handleToggleBlock(detailClient)}>
                  {detailClient.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default KeroClientsGrid;
