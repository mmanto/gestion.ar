import { useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import uploadsService from '../../services/uploads.service';

interface AvatarPickerProps {
  value?: string;
  onChange: (url: string) => void;
  /** Letra a mostrar cuando no hay imagen todavía */
  fallbackLabel?: string;
}

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const AvatarPicker: React.FC<AvatarPickerProps> = ({ value, onChange, fallbackLabel = '?' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Formato no soportado — usá JPG, PNG, WEBP o GIF');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('La imagen supera el tamaño máximo de 2MB');
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const url = await uploadsService.uploadAvatar(file);
      onChange(url);
    } catch {
      setError('No se pudo subir la imagen');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="relative w-16 h-16 flex-shrink-0">
          <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
            {value ? (
              <img src={value} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl font-semibold text-gray-600">{fallbackLabel.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            title="Subir imagen"
            className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="text-sm text-gray-700">
          {uploading ? 'Subiendo...' : 'JPG, PNG, WEBP o GIF — hasta 2MB'}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

export default AvatarPicker;
