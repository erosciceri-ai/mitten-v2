import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDevice } from '../context/DeviceContext';
import type { FirmwareState } from '../types';

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

const getStateDescription = (state: FirmwareState) => {
  switch (state) {
    case 'IDLE': return 'Listo para capturar o sincronizar';
    case 'CAPTURING': return 'Capturando datos de sensores';
    case 'SYNCING': return 'Sincronizando biblioteca de gestos';
    case 'CALIBRATING': return 'Calibrando sensores';
    case 'INITIALIZING': return 'Inicializando firmware';
    case 'ERROR': return 'Error - requiere reinicio del dispositivo';
    default: return 'Estado desconocido';
  }
};

export function DashboardPage() {
  const { user } = useAuth();
  const { 
    isConnected, 
    connectionStatus, 
    deviceInfo, 
    firmwareState, 
    activeProfile,
    connect,
    disconnect,
    getStatus
  } = useDevice();

  const handleConnect = async () => {
    try {
      await connect();
    } catch (error) {
      // Error handled by ConnectionBanner and toast
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
  };

  const handleGetStatus = async () => {
    try {
      await getStatus();
    } catch (error) {
      // Error handled by toast
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Panel de Control</h1>
          <p className="text-text-muted mt-1">Bienvenido, {user?.email}</p>
        </div>
      </div>

      {/* Connection Card */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-text mb-4">Conexión MITTEN</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-background border border-border">
            <p className="text-sm text-text-muted mb-1">Estado de Conexión</p>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' :
                connectionStatus === 'connecting' || connectionStatus === 'handshake' ? 'bg-yellow-500' :
                connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
              }`}></span>
              <span className="font-medium capitalize">{connectionStatus}</span>
            </div>
          </div>

          {isConnected && deviceInfo && (
            <>
              <div className="p-4 rounded-lg bg-background border border-border">
                <p className="text-sm text-text-muted mb-1">Estado del Firmware</p>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStateColor(firmwareState)}`}>
                  {firmwareState}
                </span>
                <p className="text-sm text-text-muted mt-1">{getStateDescription(firmwareState)}</p>
              </div>

              <div className="p-4 rounded-lg bg-background border border-border">
                <p className="text-sm text-text-muted mb-1">Versión</p>
                <p className="font-mono text-sm">v{deviceInfo.firmwareVersion}</p>
                <p className="text-xs text-text-muted">Protocolo v{deviceInfo.protocolVersion}</p>
              </div>
            </>
          )}
        </div>

        {/* Device Info */}
        {isConnected && deviceInfo && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 rounded-lg bg-background border border-border">
            <div>
              <p className="text-sm text-text-muted mb-1">Capacidad de Gestos</p>
              <p className="text-2xl font-bold text-text">{deviceInfo.capabilities.maxGestures}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted mb-1">Límite de Mensaje</p>
              <p className="text-2xl font-bold text-text">{deviceInfo.capabilities.maxMessageBytes.toLocaleString()} bytes</p>
            </div>
          </div>
        )}

        {/* Active Profile */}
        {isConnected && activeProfile && (
          <div className="mb-6 p-4 rounded-lg bg-primary-light border border-primary/20">
            <p className="text-sm text-primary mb-1">Perfil Activo</p>
            <div className="flex flex-wrap gap-4 text-sm">
              <span><strong>ID:</strong> {activeProfile.profileId}</span>
              <span><strong>Revisión:</strong> {activeProfile.profileRevision}</span>
              <span><strong>Gestos:</strong> {activeProfile.gestureCount} / {deviceInfo?.capabilities.maxGestures || 50}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {!isConnected ? (
            <button
              onClick={handleConnect}
              disabled={connectionStatus === 'connecting' || connectionStatus === 'handshake'}
              className="px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {connectionStatus === 'connecting' ? 'Conectando...' : 
               connectionStatus === 'handshake' ? 'Handshake...' : 'Conectar MITTEN'}
            </button>
          ) : (
            <>
              <button
                onClick={handleGetStatus}
                className="px-4 py-2 bg-gray-100 text-text font-medium rounded-md hover:bg-gray-200 transition-colors"
              >
                Actualizar Estado
              </button>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 bg-error text-white font-medium rounded-md hover:bg-error/90 transition-colors"
              >
                Desconectar
              </button>
            </>
          )}
          
          {isConnected && (
            <>
              <Link to="/gestures/new" className="px-4 py-2 bg-success text-white font-medium rounded-md hover:bg-success/90 transition-colors inline-flex items-center justify-center">
                Nuevo Gesto
              </Link>
              <Link to="/gestures" className="px-4 py-2 bg-gray-100 text-text font-medium rounded-md hover:bg-gray-200 transition-colors inline-flex items-center justify-center">
                Ver Biblioteca
              </Link>
              <Link to="/sync" className="px-4 py-2 bg-purple-600 text-white font-medium rounded-md hover:bg-purple-700 transition-colors inline-flex items-center justify-center">
                Sincronizar
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      {isConnected && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/gestures" className="bg-surface rounded-lg border border-border p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary-light text-primary">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-text-muted">Total Gestos</p>
                <p className="text-2xl font-bold text-text">{activeProfile?.gestureCount || 0}</p>
              </div>
            </div>
          </Link>

          <Link to="/gestures/new" className="bg-surface rounded-lg border border-border p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-success-light text-success">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-text-muted">Crear Gesto</p>
                <p className="text-2xl font-bold text-text">Nuevo</p>
              </div>
            </div>
          </Link>

          <Link to="/sync" className="bg-surface rounded-lg border border-border p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-100 text-purple-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-text-muted">Sincronizar</p>
                <p className="text-2xl font-bold text-text">MITTEN</p>
              </div>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}