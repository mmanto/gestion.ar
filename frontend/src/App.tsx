import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { EntityViewProvider } from '@mmanto/devbout-ui';
import { AuthProvider } from './context/AuthContext';
import { TemplateProvider } from './context/TemplateContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { ThemePresetProvider } from './components/theme-preset-provider';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ToastContainer } from './components/common/ToastContainer';
import { LoadingPage } from './components/common/Spinner';

// Pages
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { ChatPage } from './pages/ChatPage';
import { Bots } from './pages/Bots';
import { BotDetail } from './pages/BotDetail';
import { BotChannels } from './pages/BotChannels';
import { UserLandingPage } from './pages/UserLandingPage';
import { ModulesProvider, useModulesState } from './modules/ModulesProvider';
import { ModuleGate } from './modules/ModuleGate';
import { moduleRoutes } from './modules/registry';
import { Tenants } from './pages/admin/Tenants';
import { TenantDetail } from './pages/admin/TenantDetail';
import { TenantEdit } from './pages/admin/TenantEdit';
import { Plans } from './pages/admin/Plans';
import { Apariencia } from './pages/Apariencia';
import { Settings } from './pages/Settings';

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ToastContainer />
        <ThemePresetProvider>
          <Router>
            <AuthProvider>
              <TemplateProvider>
                {/* Manifiesto de módulos instalados: de ahí salen la nav, las
                    rutas de módulo y los widgets de chat. */}
                <ModulesProvider>
                  {/* Superficie de las vistas de entidad (modal/drawer/página) del
                      DataTable: preferencia global, elegible en Ajustes. */}
                  <EntityViewProvider locale="es-AR">
                    <AppRoutes />
                  </EntityViewProvider>
                </ModulesProvider>
              </TemplateProvider>
            </AuthProvider>
          </Router>
        </ThemePresetProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function AppRoutes() {
  const { modules, loading } = useModulesState();

  return (
    <Routes>
                    {/* Rutas públicas */}
                    <Route path="/" element={<Landing />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/chat/c/:channelId" element={<ChatPage />} />
                    <Route path="/chat/:botId" element={<ChatPage />} />
                    <Route path="/u/:username" element={<UserLandingPage />} />

                    {/* Administración general — sólo super_admin */}
                    <Route
                      path="/admin/tenants"
                      element={
                        <ProtectedRoute roles={['super_admin']}>
                          <Tenants />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/tenants/:tenantId"
                      element={
                        <ProtectedRoute roles={['super_admin']}>
                          <TenantDetail />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/tenants/:tenantId/editar"
                      element={
                        <ProtectedRoute roles={['super_admin']}>
                          <TenantEdit />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/plans"
                      element={
                        <ProtectedRoute roles={['super_admin']}>
                          <Plans />
                        </ProtectedRoute>
                      }
                    />

                    {/* Configuración técnica de bots — sólo super_admin (servicio gestionado) */}
                    <Route
                      path="/bots"
                      element={
                        <ProtectedRoute roles={['super_admin']}>
                          <Bots />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/bots/:botId"
                      element={
                        <ProtectedRoute roles={['super_admin']}>
                          <BotDetail />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/bots/:botId/channels"
                      element={
                        <ProtectedRoute roles={['super_admin']}>
                          <BotChannels />
                        </ProtectedRoute>
                      }
                    />
                    {/* Rutas de los módulos: el manifiesto declara qué módulos
                        traen pantalla propia y el registry de esta SPA el
                        componente que las renderiza. */}
                    {moduleRoutes(modules).map(({ moduleKey, slug, Component }) => (
                      <Route
                        key={moduleKey}
                        path={`/bots/:botId/${slug}`}
                        element={
                          <ProtectedRoute roles={['super_admin']}>
                            <ModuleGate moduleKey={moduleKey}>
                              {(moduleInfo) => <Component moduleInfo={moduleInfo} />}
                            </ModuleGate>
                          </ProtectedRoute>
                        }
                      />
                    ))}

                    {/* Ajustes de cuenta — cualquier usuario autenticado */}
                    <Route
                      path="/settings"
                      element={
                        <ProtectedRoute>
                          <Settings />
                        </ProtectedRoute>
                      }
                    />

                    {/* Apariencia — tema global (presets, oscuro, tonos) */}
                    <Route
                      path="/apariencia"
                      element={
                        <ProtectedRoute roles={['super_admin']}>
                          <Apariencia />
                        </ProtectedRoute>
                      }
                    />

                    {/* Redirect por defecto. Mientras el manifiesto carga, las
                        rutas de módulo todavía no existen: un deep link directo
                        (p. ej. /bots/:id/documents) caería acá y redirigiría a
                        la landing antes de que el manifiesto llegue. */}
                    <Route
                      path="*"
                      element={loading ? <LoadingPage /> : <Navigate to="/" replace />}
                    />
    </Routes>
  );
}

export default App;
