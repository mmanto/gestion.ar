import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTenant } from '../hooks/useTenant';
import { resolveAssetUrl } from '../utils/assetUrl';
import type { AuthProvider, RegisterPlan } from '../types/auth.types';

const PRIMARY = '#25357a';
const TEXT = '#0f172a';

const PLANES: Record<RegisterPlan, { label: string; price: string; suffix: string; note: string }> = {
  mensual: { label: 'Plan mensual', price: '$690.00 MXN', suffix: '/mes', note: 'Cancela cuando quieras' },
  anual: { label: 'Plan anual', price: '$5,490.00 MXN', suffix: '/año', note: '¡Ahorra 2 meses!' },
};

export const Register: React.FC = () => {
  const { tenantId, tenant } = useTenant();
  const { register, loginWithProvider } = useAuth();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<RegisterPlan>('mensual');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<AuthProvider | null>(null);

  const brand = tenant?.branding;
  const primaryColor = brand?.primary_color || PRIMARY;
  const logo = resolveAssetUrl(brand?.logo_url_vertical || brand?.logo_url);
  const tenantName = tenant?.name || 'Tu cuenta';

  if (tenantId == null) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-sm" style={{ background: '#F8F9FD', color: TEXT }}>
        Este contenedor no tiene un tenant configurado.
      </div>
    );
  }

  const handleGoogle = async () => {
    setError('');
    setOauthLoading('google');
    try {
      await loginWithProvider('google', tenantId);
      navigate('/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error && err.message !== 'cancelled' ? err.message : 'No se pudo completar el registro con Google.';
      setError(message);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!nombre.trim() || !email.trim() || !password) {
      setError('Completa nombre, correo y contraseña.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (!aceptaTerminos || !aceptaPrivacidad) {
      setError('Debes aceptar los Términos y el Aviso de Privacidad.');
      return;
    }

    setLoading(true);
    try {
      const response = await register({
        tenant_id: tenantId,
        nombre: nombre.trim(),
        email: email.trim(),
        password,
        plan,
      });
      // Cuenta creada + sesión iniciada → pasar al pago de Mercado Pago del
      // plan elegido (paridad con la landing ius).
      window.location.href = response.payment.url;
    } catch (err: unknown) {
      let detail: string | undefined;
      if (err && typeof err === 'object' && 'response' in err) {
        const res = (err as { response: unknown }).response;
        if (res && typeof res === 'object' && 'data' in res) {
          const data = res.data;
          if (data && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string') {
            detail = data.detail;
          }
        }
      }
      setError(detail || 'No se pudo crear la cuenta. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full border border-gray-200 rounded-xl pl-11 pr-4 py-3 text-sm text-gray-800 placeholder-gray-400 transition-shadow focus:outline-none focus:border-[#2563eb] focus:ring-[3px] focus:ring-[#2563eb]/15';

  const labelClass = 'block text-sm font-semibold text-gray-800 mb-1.5';

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12" style={{ background: '#F8F9FD' }}>
      <div className="w-full max-w-md">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Volver al inicio de sesión
        </Link>

        <div className="bg-white rounded-3xl shadow-2xl shadow-black/15 overflow-hidden">
          {/* Header de marca */}
          <div className="px-8 pt-7 pb-8 flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${primaryColor}, #3b82f6)` }}>
            <span className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              {logo ? (
                <img src={logo} alt={tenantName} className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
              ) : (
                <span className="text-white font-extrabold text-xl">{tenantName.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <div>
              <span className="inline-block text-[11px] font-bold tracking-wide text-white bg-white/20 rounded-full px-2.5 py-1 mb-1">{tenantName}</span>
              <p className="text-2xl font-extrabold text-white leading-none">Crea tu cuenta</p>
            </div>
          </div>

          <div className="px-8 pt-7">
            <div className="text-center mb-6">
              <h2 className="text-xl font-extrabold text-gray-900 mb-1">Elige tu plan</h2>
              <p className="text-gray-500 text-sm">Podrás confirmarlo en el siguiente paso.</p>
            </div>

            <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1 mb-6">
              <button
                type="button"
                onClick={() => setPlan('mensual')}
                className={`rounded-lg py-2.5 text-sm font-semibold transition-all ${plan === 'mensual' ? 'bg-white text-[#1d4ed8] shadow' : 'text-gray-500'}`}
              >
                Plan Mensual
              </button>
              <button
                type="button"
                onClick={() => setPlan('anual')}
                className={`rounded-lg py-2.5 text-sm font-semibold transition-all ${plan === 'anual' ? 'bg-white text-[#1d4ed8] shadow' : 'text-gray-500'}`}
              >
                Plan Anual <span className="text-[10px] font-bold text-green-600">-2 meses</span>
              </button>
            </div>

            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-7">
              <div>
                <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide">{PLANES[plan].label}</div>
                <div className="text-lg font-extrabold text-gray-900">
                  {PLANES[plan].price} <span className="text-xs font-medium text-gray-500">{PLANES[plan].suffix}</span>
                </div>
              </div>
              <span className="text-xs text-gray-500">{PLANES[plan].note}</span>
            </div>
          </div>

          <form className="px-8 pb-8" onSubmit={handleSubmit}>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={oauthLoading !== null}
              className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl py-3.5 mb-6 font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.52 12.27c0-.84-.07-1.64-.2-2.42H12v4.58h6.47a5.54 5.54 0 0 1-2.4 3.64v3h3.88c2.27-2.09 3.57-5.17 3.57-8.8z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A11.998 11.998 0 0 0 12 24z" />
                <path fill="#FBBC05" d="M5.27 14.27A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.27V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4-3.11z" />
                <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.62l4 3.11C6.22 6.88 8.87 4.77 12 4.77z" />
              </svg>
              {oauthLoading === 'google' ? 'Conectando…' : 'Registrarme con Google'}
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="h-px bg-gray-200 flex-1" />
              <span className="text-xs text-gray-400 whitespace-nowrap">o regístrate con tu correo</span>
              <div className="h-px bg-gray-200 flex-1" />
            </div>

            <label className="block mb-4">
              <span className={labelClass}>Nombre Completo</span>
              <div className="relative">
                <svg className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} type="text" required placeholder="Ingresa tu nombre completo" className={inputClass} />
              </div>
            </label>

            <label className="block mb-4">
              <span className={labelClass}>Correo Electrónico</span>
              <div className="relative">
                <svg className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="Ingresa tu correo electrónico" className={inputClass} />
              </div>
            </label>

            <label className="block mb-5">
              <span className={labelClass}>Contraseña</span>
              <div className="relative">
                <svg className="w-5 h-5 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="9" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="Crea una contraseña segura"
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </label>

            <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
              <input type="checkbox" checked={aceptaTerminos} onChange={(e) => setAceptaTerminos(e.target.checked)} required className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-[#2563eb]" />
              <span className="text-sm text-gray-600 leading-snug">Acepto los <span className="text-[#2563eb] font-medium hover:underline cursor-pointer">Términos y Condiciones de Uso del SaaS</span>.</span>
            </label>

            <label className="flex items-start gap-2.5 mb-6 cursor-pointer">
              <input type="checkbox" checked={aceptaPrivacidad} onChange={(e) => setAceptaPrivacidad(e.target.checked)} required className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-[#2563eb]" />
              <span className="text-sm text-gray-600 leading-snug">Acepto el <span className="text-[#2563eb] font-medium hover:underline cursor-pointer">Aviso de Privacidad Integral del SaaS</span>.</span>
            </label>

            {error && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition-all hover:scale-[1.01] shadow-lg disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${primaryColor}, #3b82f6)` }}
            >
              {loading ? 'Creando cuenta…' : 'Registrarme y Proceder al Pago'}
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>

            <p className="text-xs text-gray-400 text-center mt-5 flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              Tu información está protegida con cifrado de nivel bancario.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};
