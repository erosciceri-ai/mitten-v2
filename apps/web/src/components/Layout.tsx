import { Hand, Home, LogOut, RefreshCw, UserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDevice } from '../context/DeviceContext';
import { getConnectionLabel, getFirmwareStateLabel } from '../utils/devicePresentation';
import { BrandMark } from './BrandMark';
import { StatusBadge } from './ui/mitten-ui';

const navItems = [
  { path: '/app', label: 'Panel', icon: Home },
  { path: '/gestures', label: 'Gestos', icon: Hand },
  { path: '/sync', label: 'Sincronizar', icon: RefreshCw },
] as const;

function isCurrentPath(currentPath: string, target: string) {
  return target === '/gestures' ? currentPath.startsWith('/gestures') : currentPath === target;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAuthenticated } = useAuth();
  const { firmwareState, isConnected, connectionStatus, deviceInfo } = useDevice();
  const location = useLocation();
  const connectionTone = connectionStatus === 'connected'
    ? 'success'
    : connectionStatus === 'error'
      ? 'error'
      : connectionStatus === 'connecting' || connectionStatus === 'handshake'
        ? 'warning'
        : 'neutral';

  return (
    <div className="app-shell flex min-h-screen flex-col">
      <header className="app-header sticky top-0 z-40 border-b border-border">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-4 px-3 sm:px-5">
          <BrandMark to="/app" />

          <nav className="hidden items-center gap-1 md:flex" aria-label="Navegación principal">
            {navItems.map(({ path, label, icon: Icon }) => {
              const current = isCurrentPath(location.pathname, path);
              return (
                <Link key={path} to={path} aria-current={current ? 'page' : undefined} className={`flex min-h-11 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors ${current ? 'bg-primary-light text-primary' : 'text-text-muted hover:bg-mist hover:text-text'}`}>
                  <Icon className="size-4" aria-hidden="true" />{label}
                </Link>
              );
            })}
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            {isAuthenticated ? (
              <div className="hidden items-center gap-1.5 sm:flex" role="status" aria-live="polite">
                <StatusBadge tone={connectionTone}>{getConnectionLabel(connectionStatus)}</StatusBadge>
                {isConnected && deviceInfo ? <StatusBadge tone="primary" className="hidden lg:inline-flex">{getFirmwareStateLabel(firmwareState)}</StatusBadge> : null}
              </div>
            ) : null}
            {isAuthenticated && user ? (
              <>
                <Link to="/account" className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-text-muted transition-colors hover:bg-mist hover:text-primary" aria-current={location.pathname === '/account' ? 'page' : undefined} aria-label={`Cuenta de ${user.email}`}>
                  <UserRound className="size-4" aria-hidden="true" /><span className="hidden xl:block max-w-44 truncate">{user.email}</span>
                </Link>
                <button onClick={logout} className="flex min-h-11 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-text-muted transition-colors hover:bg-mist hover:text-text" aria-label="Cerrar sesión">
                  <LogOut className="size-4" aria-hidden="true" /><span className="hidden lg:inline">Salir</span>
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <nav className="app-mobile-nav fixed inset-x-0 bottom-0 z-50 border-t border-border px-3 pt-2 md:hidden" aria-label="Navegación principal">
        <div className="mx-auto flex max-w-md items-center justify-around gap-1">
          {navItems.map(({ path, label, icon: Icon }) => {
            const current = isCurrentPath(location.pathname, path);
            return (
              <Link key={path} to={path} aria-current={current ? 'page' : undefined} className={`flex flex-col items-center justify-center gap-1 rounded-lg px-3 text-[.72rem] font-semibold transition-colors ${current ? 'bg-primary-light text-primary' : 'text-text-muted hover:bg-mist hover:text-text'}`}>
                <Icon className="size-[1.15rem]" aria-hidden="true" />{label}
              </Link>
            );
          })}
        </div>
      </nav>

      <footer className="mt-auto hidden border-t border-border bg-surface py-4 md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 text-sm text-text-muted">
          <span>Configurá el perfil. MITTEN se comunica de forma autónoma después de sincronizar.</span>
          <div className="flex items-center gap-4"><Link to="/privacidad" className="font-semibold hover:underline">Privacidad</Link><Link to="/" className="font-semibold hover:underline">Conocer el proyecto</Link></div>
        </div>
      </footer>
    </div>
  );
}
