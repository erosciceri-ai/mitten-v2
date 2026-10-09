import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
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
import { PublicHomePage } from './pages/PublicHomePage';
import { AccountPage } from './pages/AccountPage';
import { PrivacyPage } from './pages/PrivacyPage';

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
    return <Navigate to="/app" replace />;
  }
  
  return <>{children}</>;
}

export function App() {
  const protectedPage = (page: React.ReactNode) => (
    <ProtectedRoute>
      <ConnectionBanner />
      <Layout>
        <main id="main-content" className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
          {page}
        </main>
      </Layout>
    </ProtectedRoute>
  );

  return (
    <ToastProvider>
      <Routes>
            <Route path="/" element={<PublicHomePage />} />
            <Route path="/privacidad" element={<PrivacyPage />} />
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
            <Route path="/app" element={protectedPage(<DashboardPage />)} />
            <Route path="/gestures" element={protectedPage(<GestureLibraryPage />)} />
            <Route path="/gestures/new" element={protectedPage(<CreateGesturePage />)} />
            <Route path="/gestures/:id" element={protectedPage(<GestureDetailPage />)} />
            <Route path="/sync" element={protectedPage(<SyncPage />)} />
            <Route path="/account" element={protectedPage(<AccountPage />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
