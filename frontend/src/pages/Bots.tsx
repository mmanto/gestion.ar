import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { LoadingPage } from '../components/common/Spinner';
import { useBots } from '../hooks/useBots';
import type { Bot, BotStatus } from '../types/bot.types';
import botsService from '../services/bots.service';

const statusColors: Record<BotStatus, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  maintenance: 'bg-yellow-100 text-yellow-800',
};

const statusLabels: Record<BotStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  maintenance: 'Mantenimiento',
};

export const Bots = () => {
  const { bots, loading, error, total, page, pages, goToPage, refetch } = useBots({
    limit: 10,
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBot, setNewBot] = useState({
    name: '',
    description: '',
    business_type: '',
  });

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBot.name || !newBot.business_type) return;

    try {
      setCreating(true);
      await botsService.createBot(newBot);
      setShowCreateModal(false);
      setNewBot({ name: '', description: '', business_type: '' });
      refetch();
    } catch (err) {
      console.error('Error creating bot:', err);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <LoadingPage />;
  }

  return (
    <AppLayout>
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Mis Bots</h1>
              <p className="text-gray-600 mt-1">
                {total} bot{total !== 1 ? 's' : ''} en total
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + Crear Bot
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">Error: {error}</p>
            </div>
          )}

          {/* Bots Grid */}
          {bots.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <p className="text-gray-500 mb-4">No tienes bots creados</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-indigo-600 hover:text-indigo-800"
              >
                Crear tu primer bot
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {bots.map((bot: Bot) => (
                <Link
                  key={bot.bot_id}
                  to={`/bots/${bot.bot_id}`}
                  className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {bot.name}
                    </h3>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        statusColors[bot.status]
                      }`}
                    >
                      {statusLabels[bot.status]}
                    </span>
                  </div>

                  {bot.description && (
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                      {bot.description}
                    </p>
                  )}

                  <div className="text-sm text-gray-500 mb-4">
                    <span className="inline-block bg-gray-100 rounded px-2 py-1">
                      {bot.business_type}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {bot.total_clients}
                      </p>
                      <p className="text-gray-500">Clientes</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {bot.total_conversations}
                      </p>
                      <p className="text-gray-500">Chats</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {bot.total_messages}
                      </p>
                      <p className="text-gray-500">Mensajes</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex justify-center mt-8 gap-2">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Anterior
              </button>
              <span className="px-4 py-2">
                Página {page} de {pages}
              </span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page === pages}
                className="px-4 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Siguiente
              </button>
            </div>
          )}

      {/* Create Bot Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Crear Nuevo Bot</h2>
            <form onSubmit={handleCreateBot}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Bot *
                </label>
                <input
                  type="text"
                  value={newBot.name}
                  onChange={(e) => setNewBot({ ...newBot, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: Asistente Mi Negocio"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Negocio *
                </label>
                <input
                  type="text"
                  value={newBot.business_type}
                  onChange={(e) =>
                    setNewBot({ ...newBot, business_type: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Ej: restaurante, clínica, tienda"
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción
                </label>
                <textarea
                  value={newBot.description}
                  onChange={(e) =>
                    setNewBot({ ...newBot, description: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                  placeholder="Descripción opcional del bot"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? 'Creando...' : 'Crear Bot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </AppLayout>
  );
};

export default Bots;
