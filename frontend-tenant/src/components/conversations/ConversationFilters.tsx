import { useState, useEffect } from 'react';
import { Search, Filter, X } from 'lucide-react';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import { useDebounce } from '../../hooks/useDebounce';
import type { ConversationFilters as Filters } from '../../types/conversation.types';

interface ConversationFiltersProps {
  onFiltersChange: (filters: Partial<Filters>) => void;
  totalResults: number;
}

const ConversationFilters = ({ onFiltersChange, totalResults }: ConversationFiltersProps) => {
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState<string>('');
  const [sortBy, setSortBy] = useState('updated_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  const debouncedSearch = useDebounce(search, 500);

  useEffect(() => {
    onFiltersChange({ search: debouncedSearch || undefined });
  }, [debouncedSearch]);

  const handlePlatformChange = (value: string) => {
    setPlatform(value);
    onFiltersChange({ platform: value ? (value as Filters['platform']) : undefined });
  };

  const handleSortChange = (value: string) => {
    setSortBy(value);
    onFiltersChange({ sort_by: value });
  };

  const handleOrderChange = (value: 'asc' | 'desc') => {
    setOrder(value);
    onFiltersChange({ order: value });
  };

  const clearFilters = () => {
    setSearch('');
    setPlatform('');
    setSortBy('updated_at');
    setOrder('desc');
    onFiltersChange({ search: undefined, platform: undefined, sort_by: 'updated_at', order: 'desc' });
  };

  const hasActiveFilters = search || platform;

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-4 items-end">
        <div className="flex-1 relative">
          <Input
            label="Buscar conversaciones"
            placeholder="Buscar por user ID o contenido..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
          <Search className="w-5 h-5 text-gray-400 absolute left-3 bottom-3" />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2"
        >
          <Filter className="w-4 h-4" />
          Filtros
        </Button>
        {hasActiveFilters && (
          <Button variant="outline" onClick={clearFilters} className="flex items-center gap-2">
            <X className="w-4 h-4" />
            Limpiar
          </Button>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-600">
        {totalResults} {totalResults === 1 ? 'conversación encontrada' : 'conversaciones encontradas'}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Platform Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plataforma</label>
              <select
                value={platform}
                onChange={(e) => handlePlatformChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Todas</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
              </select>
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ordenar por</label>
              <select
                value={sortBy}
                onChange={(e) => handleSortChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="updated_at">Última actualización</option>
                <option value="created_at">Fecha de creación</option>
                <option value="total_messages">Cantidad de mensajes</option>
                <option value="total_cost_usd">Costo</option>
              </select>
            </div>

            {/* Order */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Orden</label>
              <select
                value={order}
                onChange={(e) => handleOrderChange(e.target.value as 'asc' | 'desc')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="desc">Descendente</option>
                <option value="asc">Ascendente</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConversationFilters;
