import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDevice } from '../context/DeviceContext';
import type { FirmwareState } from '../types';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout, isAuthenticated } = useAuth();
  const { firmwareState, isConnected, connectionStatus, deviceInfo } = useDevice();
  const location = useLocation();
  
  const navItems = [
    { path: '/', label: 'Dashboard', icon: '🏠' },
    { path: '/gestures', label: 'Gestos', icon: '📚' },
    { path: '/sync', label: 'Sincronizar', icon: '🔄' },
  ];

  const getStateColor = (state: FirmwareState) => {
    switch (state) {
      case 'IDLE': return 'bg-green-100 text-green-800';
      case 'CAPTURING': return 'bg-blue-100 text-blue-800';
      case 'SYNCING': return 'bg-purple-100 text-purple-800';
      case 'CALIBRATING': return 'bg-yellow-100 text-yellow-800';
      case 'INITIALIZING': return 'bg-gray-100 text-gray-800';
      case 'ERROR': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-100 text-green-800';
      case 'connecting':
      case 'handshake': return 'bg-yellow-100 text-yellow-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-surface border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-primary">
              <span>🤟</span>
              <span>MITTEN V2</span>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-primary-light text-primary'
                      : 'text-text-muted hover:text-text hover:bg-gray-100'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            {/* Right side: Device status + User menu */}
            <div className="flex items-center gap-4">
              {/* Device Status Indicator */}
              {isAuthenticated && (
                <div className="flex items-center gap-2">
                  <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${getConnectionStatusColor()}`}>
                    {connectionStatus === 'connected' ? '● Conectado' : 
                     connectionStatus === 'connecting' ? '◐ Conectando' :
                     connectionStatus === 'handshake' ? '◑ Handshake' :
                     connectionStatus === 'error' ? '● Error' : '○ Desconectado'}
                  </div>
                  
                  {isConnected && deviceInfo && (
                    <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStateColor(firmwareState)}`}>
                      {firmwareState}
                    </div>
                  )}
                </div>
              )}

              {/* User Menu */}
              {isAuthenticated && user && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-text-muted hidden sm:block">
                    {user.email}
                  </span>
                  <button
                    onClick={logout}
                    className="px-3 py-1.5 text-sm font-medium text-text-muted hover:text-text hover:bg-gray-100 rounded-md transition-colors"
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation */}
      <nav className="md:hidden bg-surface border-b border-border px-4 py-2 overflow-x-auto">
        <div className="flex gap-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                location.pathname === item.path
                  ? 'bg-primary-light text-primary'
                  : 'text-text-muted hover:text-text hover:bg-gray-100'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1">
        {children}
      </div>

      {/* Footer */}
      <footer className="bg-surface border-t border-border py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-text-muted">
          MITTEN V2 — Guante electrónico para traducción de gestos a audio
        </div>
      </footer>
    </div>
  );
}