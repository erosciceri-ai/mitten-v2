import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDevice } from '../context/DeviceContext';
import type { FirmwareState } from '../types';
import { getConnectionLabel, getFirmwareStateLabel } from '../utils/devicePresentation';
import { BrandMark } from './BrandMark';

const navItems = [
  { path: '/app', label: 'Panel', icon: 'home' },
  { path: '/gestures', label: 'Gestos', icon: 'gesture' },
  { path: '/sync', label: 'Sincronizar', icon: 'sync' },
] as const;

function NavIcon({ name }: { name: (typeof navItems)[number]['icon'] }) {
  if (name === 'home') return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10M9 20v-6h6v6" />;
  if (name === 'gesture') return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v5c0 4.4-3.6 8-8 8h-1a7 7 0 0 1-6.2-3.7L2.5 15A1.7 1.7 0 0 1 5 12.8L7 15" />;
  return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h11l-3-3m8 13H9l3 3M20 7l-2-2m2 2-2 2M4 17l2-2m-2 2 2 2" />;
}

function getStateColor(state: FirmwareState) {
  switch (state) {
    case 'IDLE': return 'bg-green-100 text-green-800';
    case 'CAPTURING': return 'bg-blue-100 text-blue-800';
    case 'SYNCING': return 'bg-purple-100 text-purple-800';
    case 'CALIBRATING': return 'bg-yellow-100 text-yellow-800';
    case 'ERROR': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAuthenticated } = useAuth();
  const { firmwareState, isConnected, connectionStatus, deviceInfo } = useDevice();
  const location = useLocation();
  const connectionColor = connectionStatus === 'connected'
    ? 'bg-green-100 text-green-800'
    : connectionStatus === 'error'
      ? 'bg-red-100 text-red-800'
      : connectionStatus === 'connecting' || connectionStatus === 'handshake'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-gray-100 text-gray-700';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="app-header bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between gap-3 h-16">
            <BrandMark to="/app" />

            <nav className="hidden md:flex items-center gap-1" aria-label="Navegación principal">
              {navItems.map((item) => (
                <Link key={item.path} to={item.path} aria-current={location.pathname === item.path ? 'page' : undefined} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${location.pathname === item.path ? 'bg-primary-light text-primary' : 'text-text-muted hover:text-text hover:bg-gray-100'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><NavIcon name={item.icon} /></svg>
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {isAuthenticated && (
                <div className="flex items-center gap-1.5" role="status" aria-live="polite">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${connectionColor}`}>
                    <span aria-hidden="true">{connectionStatus === 'connected' ? '● ' : '○ '}</span>{getConnectionLabel(connectionStatus)}
                  </span>
                  {isConnected && deviceInfo && <span className={`hidden lg:inline px-2.5 py-1 rounded-full text-xs font-medium ${getStateColor(firmwareState)}`}>{getFirmwareStateLabel(firmwareState)}</span>}
                </div>
              )}
              {isAuthenticated && user && (
                <div className="flex items-center gap-2 min-w-0">
                  <Link to="/account" className="flex items-center gap-1.5 px-2 sm:px-2.5 py-2 text-sm text-text-muted hover:text-primary hover:bg-primary-light rounded-md transition-colors min-w-0" aria-current={location.pathname === '/account' ? 'page' : undefined} aria-label={`Cuenta de ${user.email}`}>
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" /></svg>
                    <span className="hidden xl:block truncate max-w-44">{user.email}</span>
                    <span className="hidden sm:block xl:hidden">Cuenta</span>
                  </Link>
                  <button onClick={logout} className="px-2.5 sm:px-3 py-2 text-sm font-medium text-text-muted hover:text-text hover:bg-gray-100 rounded-md transition-colors whitespace-nowrap">
                    <span className="hidden sm:inline">Cerrar sesión</span><span className="sm:hidden">Salir</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav className="md:hidden bg-surface border-b border-border px-3 py-2 overflow-x-auto" aria-label="Navegación principal">
        <div className="flex justify-between gap-1 min-w-max">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path} aria-current={location.pathname === item.path ? 'page' : undefined} className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${location.pathname === item.path ? 'bg-primary-light text-primary' : 'text-text-muted hover:text-text hover:bg-gray-100'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><NavIcon name={item.icon} /></svg>{item.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="flex-1">{children}</div>
      <footer className="bg-surface border-t border-border py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left text-sm text-text-muted">
          <span>Configura tus gestos y prepara MITTEN para comunicarte sin la computadora.</span>
          <div className="flex items-center gap-4">
            <Link to="/privacidad" className="font-medium hover:underline">Privacidad</Link>
            <Link to="/" className="font-medium hover:underline">Conocer el proyecto</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
