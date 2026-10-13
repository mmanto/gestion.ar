import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, UserPlus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { biometricService } from '../../services/biometric.service';
import { isPasskeySupported, PasskeyCancelled } from '../../services/passkey.service';
import { Spinner } from '../common/Spinner';
import type { AuthProvider } from '../../types/auth.types';

const PRIMARY = '#25357a';

interface LoginFormProps {
  onSuccess?: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [oauthLoading, setOauthLoading] = useState<AuthProvider | null>(null);

  // Guard anti-reintento del OAuth: evita lanzar un segundo flujo si el clic
  // vuelve a llegar (o el estado se reseteó) mientras el login con Google
  // todavía está resolviendo — en conexiones lentas el usuario toca de nuevo
  // el botón y el proceso se reiniciaba.
  const oauthInFlight = useRef(false);

  // ¿Hay una credencial de huella enrolada en este dispositivo (solo nativo)?
  const [biometricReady, setBiometricReady] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupNombre, setSignupNombre] = useState('');
  const signupInFlight = useRef(false);

  // Se muestra cuando el sistema no encontró ninguna passkey en el dispositivo:
  // el picker solo ofrece escanear un QR con otro equipo (no hay forma de crear
  // una desde ahí) — la creación vive en Ajustes y requiere sesión iniciada.
  const [passkeyHint, setPasskeyHint] = useState<string | null>(null);

  // Mismo guard que el OAuth: el prompt de la passkey puede tardar (el usuario
  // elige el dispositivo), y un segundo clic reiniciaría la ceremonia.
  const passkeyInFlight = useRef(false);

  const { login, loginWithProvider, loginWithPasskey, signupWithPasskey, loginWithBiometric } = useAuth();
  const { tenantId } = useTenant();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    biometricService.isAvailable().then((s) => {
      if (!cancelled) setBiometricReady(s.enrolled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBiometric = async () => {
    setError('');
    setBiometricLoading(true);
    try {
      await loginWithBiometric();
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      const e = err as { message?: string; response?: { data?: { detail?: string } } };
      setError(e?.response?.data?.detail || e?.message || 'No se pudo iniciar sesión con la huella');
    } finally {
      setBiometricLoading(false);
    }
  };

  const handleProviderLogin = async (provider: AuthProvider) => {
    if (!tenantId || oauthInFlight.current) return;
    oauthInFlight.current = true;
    setError('');
    setOauthLoading(provider);
    try {
      await loginWithProvider(provider, tenantId);
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      const e = err as { message?: string; response?: { data?: { detail?: string } } };
      if (e?.message !== 'cancelled') {
        const name = provider === 'google' ? 'Google' : 'Microsoft';
        setError(e?.response?.data?.detail || e?.message || `No se pudo iniciar sesión con ${name}. Intenta nuevamente`);
      }
    } finally {
      oauthInFlight.current = false;
      setOauthLoading(null);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!tenantId || passkeyInFlight.current) return;
    passkeyInFlight.current = true;
    setError('');
    setPasskeyHint(null);
    setPasskeyLoading(true);
    try {
      // Si el usuario ya escribió su usuario se lo mandamos (acota las
      // credenciales que ofrece el navegador); si no, el navegador ofrece
      // cualquier passkey registrada (credencial descubrible) y el backend
      // resuelve la cuenta.
      await loginWithPasskey(tenantId, username.trim() || undefined);
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      // El navegador no distingue "cancelaste el prompt" de "este dispositivo no
      // tiene ninguna passkey" (lo hace a propósito, para no filtrar qué
      // credenciales existen), y un 401 también aparece cuando la passkey se
      // revocó desde otro lado: en todos esos casos se deja la instrucción de
      // cómo crear una. La creación vive en Ajustes porque requiere sesión.
      setPasskeyHint(
        'Si todavía no creaste una passkey, o la revocaste: entrá con tu contraseña (o con ' +
          'Google) y agregala en Ajustes → Passkeys. Si el dispositivo ya tenía una de este ' +
          'sitio, borrala del gestor de contraseñas del sistema para poder crear otra.',
      );
      if (!(err instanceof PasskeyCancelled)) {
        setError(err instanceof Error && err.message
          ? err.message
          : 'No se pudo iniciar sesión con passkey. Intentá nuevamente');
      }
    } finally {
      passkeyInFlight.current = false;
      setPasskeyLoading(false);
    }
  };

  /**
   * Alta de cuenta nueva con passkey desde el login: un solo paso, sin correo
   * ni contraseña (la cuenta queda sin datos de contacto y administración los
   * completa). Si la cuenta ya existe, lo que corresponde es entrar con
   * contraseña o Google y agregar la passkey desde Ajustes.
   */
  const handlePasskeySignup = async () => {
    if (!tenantId || signupInFlight.current) return;
    if (!signupNombre.trim()) {
      setError('Completá tu nombre para crear la cuenta.');
      return;
    }
    signupInFlight.current = true;
    setError('');
    setPasskeyHint(null);
    setSignupLoading(true);
    try {
      await signupWithPasskey(tenantId, { nombre: signupNombre.trim() });
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/dashboard');
      }
    } catch (err: unknown) {
      if (!(err instanceof PasskeyCancelled)) {
        setError(err instanceof Error && err.message
          ? err.message
          : 'No se pudo crear la cuenta con passkey. Intentá nuevamente');
      }
    } finally {
      signupInFlight.current = false;
      setSignupLoading(false);
    }
  };

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
        navigate('/dashboard');
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
    'w-full border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm text-gray-800 placeholder-gray-400 transition-shadow focus:outline-none focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/15';

  const labelClass = 'block text-sm font-semibold text-gray-800 mb-1.5';

  return oauthLoading ? (
    // Pantalla intermedia de carga del OAuth: en vez de mostrar el login con
    // el botón en "Cargando…" (donde el usuario podría re-tocar y reiniciar el
    // flujo, sobre todo con conexión lenta), se reemplaza el formulario por un
    // estado de carga claro y sin controles interactivos.
    <div className="flex flex-col items-center justify-center gap-4 py-14">
      <Spinner size="lg" />
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-800">Autenticando con Google…</p>
        <p className="text-xs text-gray-500 leading-relaxed mt-2 max-w-xs">
          Esperá un momento, no cierres la aplicación. Si se abrió la
          ventana de Google, completá el acceso y cerrá la ventana para volver.
        </p>
      </div>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Acceso rápido con huella (solo si hay credencial enrolada en el dispositivo) */}
      {biometricReady && (
        <>
          <button
            type="button"
            onClick={handleBiometric}
            disabled={biometricLoading}
            className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 py-3.5 font-semibold text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 11a2 2 0 0 1 2 2c0 .57-.24 1.09-.63 1.46" />
              <path d="M12 19a2 2 0 0 1-2-2 7 7 0 0 1 2-5" />
              <path d="M12 9a6 6 0 0 0-6 6" />
              <path d="M18 15a6 6 0 0 0-2-4.5" />
              <path d="M22 15a10 10 0 0 0-4-7.5" />
              <path d="M2 15a10 10 0 0 1 4-7.5" />
              <path d="M5.5 15a4.5 4.5 0 0 1 1.5-3.4" />
              <path d="M15 15a5 5 0 0 1 2-4" />
            </svg>
            {biometricLoading ? 'Verificando…' : 'Entrá con tu huella'}
          </button>

          <div className="flex items-center gap-3 my-1">
            <div className="h-px bg-gray-200 flex-1" />
            <span className="text-xs text-gray-400 whitespace-nowrap">o</span>
            <div className="h-px bg-gray-200 flex-1" />
          </div>
        </>
      )}

      {/* Usuario */}
      <label className="block">
        <span className={labelClass}>Usuario</span>
        <div className="relative">
          <svg
            className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          <input
            id="username"
            type="text"
            autoComplete="username"
            autoFocus
            placeholder="Ingresa tu usuario"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setPasskeyHint(null);
            }}
            disabled={loading}
            className={inputClass}
          />
        </div>
      </label>

      {/* Contraseña */}
      <label className="block">
        <span className={labelClass}>Contraseña</span>
        <div className="relative">
          <svg
            className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Ingresa tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className={`${inputClass} pr-11`}
          />
          <button
            type="button"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </label>

      {/* Botón */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all hover:scale-[1.01] shadow-lg disabled:opacity-60"
        style={{ background: `linear-gradient(135deg, ${PRIMARY}, #3b82f6)` }}
      >
        {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </button>

      {/* Separador */}
      <div className="flex items-center gap-3 my-1">
        <div className="h-px bg-gray-200 flex-1" />
        <span className="text-xs text-gray-400 whitespace-nowrap">o continúa con</span>
        <div className="h-px bg-gray-200 flex-1" />
      </div>

      {/* Login social */}
      <button
        type="button"
        onClick={() => handleProviderLogin('google')}
        disabled={oauthLoading !== null || !tenantId}
        className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl py-3.5 font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M23.52 12.27c0-.84-.07-1.64-.2-2.42H12v4.58h6.47a5.54 5.54 0 0 1-2.4 3.64v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A11.998 11.998 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.27 14.27A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.27V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4-3.11z" />
          <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.62l4 3.11C6.22 6.88 8.87 4.77 12 4.77z" />
        </svg>
        {oauthLoading === 'google' ? 'Conectando…' : 'Continuar con Google'}
      </button>

      {/* Login con passkey (WebAuthn: Face ID, huella, Windows Hello o llave) */}
      {isPasskeySupported() && (
        <button
          type="button"
          onClick={handlePasskeyLogin}
          disabled={passkeyLoading || oauthLoading !== null || !tenantId}
          className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl py-3.5 font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          <KeyRound className="w-5 h-5" />
          {passkeyLoading ? 'Verificando…' : 'Entrar con passkey'}
        </button>
      )}

      {passkeyHint && (
        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-500 text-center leading-relaxed">{passkeyHint}</p>
          {/* Alta de cuenta nueva con passkey: pide el nombre (es lo que el
              navegador/OS muestra en la lista de passkeys) y crea la cuenta
              sin correo ni contraseña. */}
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">Tu nombre</span>
            <input
              value={signupNombre}
              onChange={(e) => setSignupNombre(e.target.value)}
              type="text"
              placeholder="Nombre y apellido"
              className="w-full px-3 py-2 rounded-lg border-2 border-gray-200 outline-none transition-colors focus:border-[#2563eb]"
            />
          </label>
          <button
            type="button"
            onClick={handlePasskeySignup}
            disabled={signupLoading || passkeyLoading || !tenantId}
            className="w-full flex items-center justify-center gap-3 border border-dashed border-gray-300 rounded-xl py-3.5 font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            <UserPlus className="w-5 h-5" />
            {signupLoading ? 'Creando cuenta…' : 'Crear cuenta nueva con passkey'}
          </button>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center leading-relaxed">
        ¿No tenés cuenta? Ingresá con Google y se crea automáticamente, o pedile acceso a quien
        administra tu cuenta en la plataforma.
      </p>
    </form>
  );
};
