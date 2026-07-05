import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TemplateProvider } from './context/TemplateContext';
import { SidebarProvider } from './context/SidebarContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Pages
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { ChatPage } from './pages/ChatPage';
import { Dashboard } from './pages/Dashboard';
import { Conversations } from './pages/Conversations';
import { ConversationView } from './pages/ConversationView';
import { Bots } from './pages/Bots';
import { BotDetail } from './pages/BotDetail';
import { BotClients } from './pages/BotClients';
import { BotChannels } from './pages/BotChannels';
import { BotAppointments } from './pages/BotAppointments';
import { Clients } from './pages/Clients';
import PwaSubscriptions from './pages/PwaSubscriptions';
import { UserLandingPage } from './pages/UserLandingPage';
import { BotDocuments } from './pages/BotDocuments';

function App() {
  return (
    <Router>
      <AuthProvider>
        <TemplateProvider>
          <SidebarProvider>
          <Routes>
            {/* Rutas públicas */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/chat/c/:channelId" element={<ChatPage />} />
            <Route path="/chat/:botId" element={<ChatPage />} />
            <Route path="/u/:username" element={<UserLandingPage />} />

            {/* Rutas protegidas */}
            <Route
              path="/clients"
              element={
                <ProtectedRoute>
                  <Clients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/conversations"
              element={
                <ProtectedRoute>
                  <Conversations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/conversations/:id"
              element={
                <ProtectedRoute>
                  <ConversationView />
                </ProtectedRoute>
              }
            />

            {/* Rutas de Bots */}
            <Route
              path="/bots"
              element={
                <ProtectedRoute>
                  <Bots />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bots/:botId"
              element={
                <ProtectedRoute>
                  <BotDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bots/:botId/clients"
              element={
                <ProtectedRoute>
                  <BotClients />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bots/:botId/channels"
              element={
                <ProtectedRoute>
                  <BotChannels />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bots/:botId/appointments"
              element={
                <ProtectedRoute>
                  <BotAppointments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bots/:botId/pwa/:channelId"
              element={
                <ProtectedRoute>
                  <PwaSubscriptions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bots/:botId/documents"
              element={
                <ProtectedRoute>
                  <BotDocuments />
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
  );
}

export default App;
