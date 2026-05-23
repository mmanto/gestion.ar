import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/common/Card';

export const Register: React.FC = () => {
  const { isAuthenticated, register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Si ya está autenticado, redirigir al dashboard
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/clients');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password || !confirmPassword) {
      setError('Por favor, completa todos los campos obligatorios');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      await register({ username, password, email: email || undefined });
      navigate('/clients');
    } catch (err: unknown) {
      console.error('Register error:', err);
      type AxiosLike = { response?: { status: number; data?: { detail?: string } }; request?: unknown };
      const e = err as AxiosLike;

      if (e.response) {
        if (e.response.status === 400) {
          setError(e.response.data?.detail || 'El usuario ya existe');
        } else if (e.response.status >= 500) {
          setError('Error del servidor. Intenta nuevamente más tarde');
        } else {
          setError(e.response.data?.detail || 'Error al registrar usuario');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/img/logo_vertical_ius.svg" alt="Asistente" className="w-16 h-16" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Asistente</h1>
          <p className="mt-2 text-gray-600">Crea tu cuenta para comenzar</p>
        </div>

        {/* Card de registro */}
        <Card shadow="lg" padding="lg">
          <CardHeader>
            <CardTitle>Crear cuenta</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <Input
                type="text"
                label="Usuario *"
                placeholder="Elige un nombre de usuario"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                fullWidth
                autoComplete="username"
              />

              <Input
                type="email"
                label="Email (opcional)"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                fullWidth
                autoComplete="email"
              />

              <Input
                type="password"
                label="Contraseña *"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                fullWidth
                autoComplete="new-password"
              />

              <Input
                type="password"
                label="Confirmar contraseña *"
                placeholder="Repite tu contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                fullWidth
                autoComplete="new-password"
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                disabled={loading}
              >
                Crear cuenta
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Links */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-sm text-gray-600">
            ¿Ya tienes cuenta?{' '}
            <Link
              to="/login"
              className="text-primary hover:text-primary-700 font-medium transition-colors"
            >
              Inicia sesión
            </Link>
          </p>
          <a
            href="/"
            className="block text-sm text-primary hover:text-primary-700 transition-colors"
          >
            ← Volver al inicio
          </a>
        </div>
      </div>
    </div>
  );
};
