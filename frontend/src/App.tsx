import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TemplateProvider } from './context/TemplateContext';
import { SidebarProvider } from './context/SidebarContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { ToastContainer } from './components/common/ToastContainer';

// Pages
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { ChatPage } from './pages/ChatPage';
import { Bots } from './pages/Bots';
import { BotDetail } from './pages/BotDetail';
import { BotChannels } from './pages/BotChannels';
import { BotAppointments } from './pages/BotAppointments';
import { UserLandingPage } from './pages/UserLandingPage';
import { BotDocuments } from './pages/BotDocuments';
import { Tenants } from './pages/admin/Tenants';
import { TenantDetail } from './pages/admin/TenantDetail';
import { Plans } from './pages/admin/Plans';
import { Settings } from './pages/Settings';

function App() {
  return (
    <ToastProvider>
      <ToastContainer />
      <Router>
        <AuthProvider>
          <TemplateProvider>
            <SidebarProvider>
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
                <Route
                  path="/bots/:botId/appointments"
                  element={
                    <ProtectedRoute roles={['super_admin']}>
                      <BotAppointments />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/bots/:botId/documents"
                  element={
                    <ProtectedRoute roles={['super_admin']}>
                      <BotDocuments />
                    </ProtectedRoute>
                  }
                />

                {/* Ajustes de cuenta — cualquier usuario autenticado */}
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  }
                />

                {/* Redirect por defecto */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </SidebarProvider>
          </TemplateProvider>
        </AuthProvider>
      </Router>
    </ToastProvider>
  );
}

export default App;
