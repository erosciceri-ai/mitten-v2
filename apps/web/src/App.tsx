import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useDevice } from './context/DeviceContext';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { GestureLibraryPage } from './pages/GestureLibraryPage';
import { CreateGesturePage } from './pages/CreateGesturePage';
import { GestureDetailPage } from './pages/GestureDetailPage';
import { SyncPage } from './pages/SyncPage';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ToastContainer';
import { ConnectionBanner } from './components/ConnectionBanner';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" aria-hidden="true"></div>
        <span className="sr-only">Comprobando sesión…</span>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" aria-hidden="true"></div>
        <span className="sr-only">Comprobando sesión…</span>
      </div>
    );
  }
  
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

export function App() {
  const { isAuthenticated } = useAuth();
  const { connectionStatus } = useDevice();
  
  return (
    <ToastProvider>
      <div className="min-h-screen flex flex-col">
        <ConnectionBanner />
        <Layout>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/login" element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            } />
            <Route path="/register" element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            } />
            <Route path="/" element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } />
            <Route path="/gestures" element={
              <ProtectedRoute>
                <GestureLibraryPage />
              </ProtectedRoute>
            } />
            <Route path="/gestures/new" element={
              <ProtectedRoute>
                <CreateGesturePage />
              </ProtectedRoute>
            } />
            <Route path="/gestures/:id" element={
              <ProtectedRoute>
                <GestureDetailPage />
              </ProtectedRoute>
            } />
            <Route path="/sync" element={
              <ProtectedRoute>
                <SyncPage />
              </ProtectedRoute>
            } />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </Layout>
      </div>
    </ToastProvider>
  );
}
