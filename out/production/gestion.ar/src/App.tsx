import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { TenantProvider } from './context/TenantContext';
import { AuthProvider } from './context/AuthContext';
import { TemplateProvider } from './context/TemplateContext';
import { SidebarProvider } from './context/SidebarContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

// Pages
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { ChatPage } from './pages/ChatPage';
import { Dashboard } from './pages/Dashboard';
import { Customers } from './pages/Customers';
import { Clients } from './pages/Clients';
import { Conversations } from './pages/Conversations';
import { ConversationView } from './pages/ConversationView';
import { Records } from './pages/Records';
import { Reports } from './pages/Reports';
import { ProspectDetail } from './pages/ProspectDetail';
import { Modules } from './pages/Modules';
import { TrainingSettings } from './pages/TrainingSettings';
import { Users } from './pages/Users';
import { StaffAppProvider } from './targets/staff/StaffAppProvider'
import { Settings } from './pages/Settings';

interface AppProps {
  target: 'staff' | 'client'
}

function App({ target }: AppProps) {
  const isStaff = target === 'staff'


  const content = (
    <TemplateProvider>
      <SidebarProvider>
        <Routes>
          {/* ── Rutas comunes (ambos targets) ── */}
          <Route path="/login" element={<Login />} />
          <Route path="/chat/c/:channelId" element={<ChatPage />} />
          <Route path="/chat/:botId" element={<ChatPage />} />

          {isStaff ? (
            <>
              {/* ── Staff: Backoffice ── */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<ProtectedRoute roles={['admin', 'operativo']}><Dashboard /></ProtectedRoute>} />
              <Route path="/customers" element={<ProtectedRoute roles={['admin', 'operativo']}><Customers /></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute roles={['admin', 'operativo']}><Clients /></ProtectedRoute>} />
              <Route path="/records" element={<ProtectedRoute roles={['admin', 'operativo']}><Records /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute roles={['admin', 'operativo']}><Reports /></ProtectedRoute>} />
              <Route path="/prospects/:id" element={<ProtectedRoute roles={['admin', 'operativo']}><ProspectDetail /></ProtectedRoute>} />
              <Route path="/conversations" element={<ProtectedRoute roles={['admin', 'operativo']}><Conversations /></ProtectedRoute>} />
              <Route path="/conversations/:id" element={<ProtectedRoute roles={['admin', 'operativo']}><ConversationView /></ProtectedRoute>} />
              <Route path="/modules" element={<ProtectedRoute roles={['admin']}><Modules /></ProtectedRoute>} />
              <Route path="/training" element={<ProtectedRoute roles={['admin', 'operativo']}><TrainingSettings /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute roles={['admin']}><Users /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute roles={['admin', 'operativo']}><Settings /></ProtectedRoute>} />
            </>
          ) : (
            <Route path="/" element={<Landing />} />
          )}

          <Route path="*" element={<Navigate to={isStaff ? '/dashboard' : '/'} replace />} />
        </Routes>
      </SidebarProvider>
    </TemplateProvider>
  )

  return (
    <Router>
      <TenantProvider>
        <AuthProvider>
          {isStaff
            ? <StaffAppProvider botId={null}>{content}</StaffAppProvider>
            : content
          }
        </AuthProvider>
      </TenantProvider>
    </Router>
  )
}

export default App
