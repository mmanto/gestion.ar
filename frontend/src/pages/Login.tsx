import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoginForm } from '../components/auth/LoginForm';

export const Login: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/clients');
    }
  }, [isAuthenticated, navigate]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: '#F2F1F1' }}
    >
      <div
        className="max-w-md w-full rounded-xl p-8 shadow-lg"
        style={{ background: 'white', border: '1px solid #e2e8f0' }}
      >
        <div className="flex flex-col items-center gap-6">

          {/* Marca */}
          <div className="flex items-center gap-3">
            <img src="/img/logo_vertical_ius.svg" alt="Asistente" className="h-16 w-16" />
            <p className="text-2xl font-bold" style={{ color: '#25357a' }}>
              Comunicación inteligente
            </p>
          </div>

          {/* Encabezado */}
          <div className="text-center">
            <h2 className="text-xl font-semibold" style={{ color: '#0f172a' }}>
              Iniciar sesión
            </h2>
            <p className="text-sm mt-1" style={{ color: '#64748b' }}>
              Accede a tu cuenta para continuar
            </p>
          </div>

          {/* Formulario */}
          <div className="w-full">
            <LoginForm />
          </div>

          {/* Footer */}
          <div
            className="pt-4 border-t w-full text-center"
            style={{ borderColor: '#e2e8f0' }}
          >
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              Asistente © 2026{' '}•{' '}
              <a href="#" className="hover:underline" style={{ color: '#25357a' }}>
                Términos
              </a>
              {' '}•{' '}
              <a href="#" className="hover:underline" style={{ color: '#25357a' }}>
                Privacidad
              </a>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
