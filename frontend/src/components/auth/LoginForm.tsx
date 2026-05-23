import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const PRIMARY = '#25357a';
const MUTED_FG = '#64748b';
const BORDER = '#e2e8f0';
const MUTED_BG = '#f1f5f9';
const TEXT = '#0f172a';

interface LoginFormProps {
  onSuccess?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Por favor, completa todos los campos');
      return;
    }

    setLoading(true);

    try {
      await login({ username, password });
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/clients');
      }
    } catch (err: unknown) {
      type AxiosLike = { response?: { status: number; data?: { detail?: string } }; request?: unknown };
      const e = err as AxiosLike;
      if (e.response) {
        if (e.response.status === 401) {
          setError('Usuario o contraseña incorrectos');
        } else if (e.response.status >= 500) {
          setError('Error del servidor. Intenta nuevamente más tarde');
        } else {
          setError(e.response.data?.detail || 'Error al iniciar sesión');
        }
      } else if (e.request) {
        setError('Error de conexión. Verifica tu conexión a internet');
      } else {
        setError('Error inesperado. Intenta nuevamente');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'h-9 w-full rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors ' +
    'placeholder:text-slate-400 focus:border-[#25357a] focus:ring-2 focus:ring-[#25357a]/20 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">

      {/* Descripción */}
      <p className="text-sm" style={{ color: MUTED_FG }}>
        Accede a tu cuenta para gestionar las conversaciones con los ciudadanos.
      </p>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Usuario */}
      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-sm font-medium" style={{ color: TEXT }}>
          Usuario
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          autoFocus
          placeholder="Ingresa tu usuario"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          className={inputClass}
          style={{ borderColor: BORDER, color: TEXT }}
        />
      </div>

      {/* Contraseña */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium" style={{ color: TEXT }}>
            Contraseña
          </label>
          <a
            href="#"
            className="text-xs hover:underline"
            style={{ color: PRIMARY }}
            tabIndex={-1}
          >
            ¿Olvidaste tu contraseña?
          </a>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          className={inputClass}
          style={{ borderColor: BORDER, color: TEXT }}
        />
      </div>

      {/* Botón */}
      <button
        type="submit"
        disabled={loading}
        className="mt-1 h-9 w-full rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: PRIMARY }}
      >
        {loading ? 'Iniciando sesión…' : 'Iniciar sesión en el portal'}
      </button>

      {/* Divisor */}
      <div className="relative my-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t" style={{ borderColor: BORDER }} />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2" style={{ color: MUTED_FG }}>
            Acceso de demostración
          </span>
        </div>
      </div>

      {/* Demo credentials */}
      <div className="rounded-lg p-3 text-xs" style={{ background: MUTED_BG }}>
        <p style={{ color: MUTED_FG }}>
          <strong>Cuenta de administrador:</strong>
        </p>
        <p className="mt-1" style={{ color: MUTED_FG }}>
          • <strong>Usuario:</strong> admin &nbsp;/&nbsp; <strong>Contraseña:</strong> admin123
        </p>
      </div>

      {/* Registro */}
      <div className="flex flex-col items-center text-sm mt-2">
        <p style={{ color: MUTED_FG }}>
          ¿No tienes cuenta?{' '}
          <Link
            to="/register"
            className="font-medium hover:underline"
            style={{ color: PRIMARY }}
          >
            Regístrate
          </Link>
        </p>
      </div>

    </form>
  );
};
