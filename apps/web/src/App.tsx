import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ToastContainer';
import { ConnectionBanner } from './components/ConnectionBanner';

const PublicHomePage = lazy(() => import('./pages/PublicHomePage').then((module) => ({ default: module.PublicHomePage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then((module) => ({ default: module.RegisterPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const GestureLibraryPage = lazy(() => import('./pages/GestureLibraryPage').then((module) => ({ default: module.GestureLibraryPage })));
const CreateGesturePage = lazy(() => import('./pages/CreateGesturePage').then((module) => ({ default: module.CreateGesturePage })));
const GestureDetailPage = lazy(() => import('./pages/GestureDetailPage').then((module) => ({ default: module.GestureDetailPage })));
const SyncPage = lazy(() => import('./pages/SyncPage').then((module) => ({ default: module.SyncPage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then((module) => ({ default: module.AccountPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));

function getRouteTitle(pathname: string): string {
  if (pathname === '/') return 'MITTEN V2.1 — Gestos convertidos en voz';
  if (pathname === '/privacidad') return 'Privacidad — MITTEN V2.1';
  if (pathname === '/login') return 'Iniciar sesión — MITTEN V2.1';
  if (pathname === '/register') return 'Crear cuenta — MITTEN V2.1';
  if (pathname === '/app') return 'Panel — MITTEN V2.1';
  if (pathname === '/gestures') return 'Biblioteca de gestos — MITTEN V2.1';
  if (pathname === '/gestures/new') return 'Enseñar un gesto — MITTEN V2.1';
  if (pathname.startsWith('/gestures/')) return 'Detalle de gesto — MITTEN V2.1';
  if (pathname === '/sync') return 'Sincronizar con MITTEN — MITTEN V2.1';
  if (pathname === '/account') return 'Tu cuenta — MITTEN V2.1';
  return 'Página no encontrada — MITTEN V2.1';
}

function RouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = getRouteTitle(pathname);
  }, [pathname]);
  return null;
}

function RouteFallback() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center" role="status" aria-live="polite">
      <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" aria-hidden="true" />
      <span className="sr-only">Cargando pantalla…</span>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" aria-hidden="true" />
        <span className="sr-only">Comprobando sesión…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent" aria-hidden="true" />
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
        <main id="main-content" className="app-main flex-1 w-full max-w-7xl mx-auto px-4 sm:px-5 py-7 sm:py-10">
          {page}
        </main>
      </Layout>
    </ProtectedRoute>
  );

  return (
    <ToastProvider>
      <RouteTitle />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<PublicHomePage />} />
          <Route path="/privacidad" element={<PrivacyPage />} />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <RegisterPage />
              </PublicRoute>
            }
          />
          <Route path="/app" element={protectedPage(<DashboardPage />)} />
          <Route path="/gestures" element={protectedPage(<GestureLibraryPage />)} />
          <Route path="/gestures/new" element={protectedPage(<CreateGesturePage />)} />
          <Route path="/gestures/:id" element={protectedPage(<GestureDetailPage />)} />
          <Route path="/sync" element={protectedPage(<SyncPage />)} />
          <Route path="/account" element={protectedPage(<AccountPage />)} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ToastProvider>
  );
}
