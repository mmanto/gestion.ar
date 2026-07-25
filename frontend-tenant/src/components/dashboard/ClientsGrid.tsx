import { Users, Search, X } from 'lucide-react';
import { Card } from '../common/Card';
import { EmptyState } from '../common/EmptyState';
import { Drawer } from '../common/Drawer';
import { Button } from '../common/Button';
import { ActionMenu } from '../common/ActionMenu';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import MessagesList from '../messages/MessagesList';
import { useClientsGrid } from '../../hooks/useClientsGrid';
import type { ColorFilter } from '../../types/client.types';
import { buildClientActionItems } from '../../utils/clientActions';

const sourceColors: Record<string, string> = {
  whatsapp: 'bg-green-200 text-green-950',
  telegram: 'bg-blue-200 text-blue-950',
  web: 'bg-purple-200 text-purple-950',
  manual: 'bg-gray-200 text-gray-950',
};

interface ClientsGridProps {
  /** Si viene, restringe la grilla a clientes de ese color de semáforo. */
  colorFilter?: ColorFilter;
}

const ClientsGrid = ({ colorFilter }: ClientsGridProps) => {
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
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
            <button
              type="button"
              onClick={handleCloseSearch}
              aria-label="Cerrar búsqueda"
              className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
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
              className="p-2 rounded-full text-gray-700 hover:bg-gray-100 transition-colors"
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
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          />
          <Button type="submit" variant="primary">
            Buscar
          </Button>
        </form>
      )}

      {loading && clients.length === 0 ? (
        <Card shadow="none">
          <p className="text-sm text-gray-700">Cargando clientes...</p>
        </Card>
      ) : clients.length === 0 ? (
        <Card shadow="none">
          <EmptyState
            icon={<Users className="w-8 h-8 text-gray-800" />}
            title="No hay contactos todavía"
            description="Los clientes aparecerán aquí cuando interactúen con tus agentes"
            titleClassName="text-gray-900 text-xl"
            descriptionClassName="text-gray-900 text-base"
          />
        </Card>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Cliente</TableHeaderCell>
              <TableHeaderCell align="center">Acciones</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.client_id}>
                <TableCell>
                  <div>
                    <p className="text-lg font-normal text-gray-900">
                      {client.name || client.external_id}
                    </p>
                    {client.dni && (
                      <p className="text-base text-gray-800">DNI: {client.dni}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell align="center">
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
              <span
                className={`inline-block mt-1 px-2 py-1 text-base font-medium rounded-full capitalize ${
                  sourceColors[detailClient.source] || 'bg-gray-200 text-gray-950'
                }`}
              >
                {detailClient.source}
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

export default ClientsGrid;
