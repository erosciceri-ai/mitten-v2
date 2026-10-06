import { useDevice } from '../context/DeviceContext';
import { useToast } from './ToastContainer';

export function ConnectionBanner() {
  const { connectionStatus, deviceInfo, connectionError, clearConnectionError } = useDevice();
  const { showToast } = useToast();

  if (connectionStatus === 'disconnected' && !connectionError) {
    return null;
  }

  const getStatusConfig = () => {
    switch (connectionStatus) {
      case 'connecting':
        return {
          icon: '⏳',
          title: 'Conectando...',
          message: 'Selecciona el puerto MITTEN en el diálogo del navegador',
          className: 'bg-warning-light border-warning text-warning',
        };
      case 'handshake':
        return {
          icon: '🤝',
          title: 'Handshake en progreso...',
          message: 'Validando identidad y versión del protocolo',
          className: 'bg-warning-light border-warning text-warning',
        };
      case 'connected':
        return {
          icon: '✓',
          title: 'MITTEN Conectado',
          message: `Firmware: ${deviceInfo?.firmwareVersion} • Protocolo: v${deviceInfo?.protocolVersion} • Estado: ${deviceInfo?.state}`,
          className: 'bg-success-light border-success text-success',
        };
      case 'error':
        return {
          icon: '✕',
          title: 'Error de conexión',
          message: connectionError || 'Error desconocido',
          className: 'bg-error-light border-error text-error',
        };
      default:
        return null;
    }
  };

  const config = getStatusConfig();
  if (!config) return null;

  return (
    <div className={`w-full border-b ${config.className}`}>
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">{config.icon}</span>
          <div>
            <p className="font-medium">{config.title}</p>
            <p className="text-sm opacity-90">{config.message}</p>
          </div>
        </div>
        {connectionStatus === 'error' && (
          <button
            onClick={() => {
              clearConnectionError();
              showToast({ type: 'info', message: 'Intenta conectar nuevamente', duration: 3000 });
            }}
            className="px-3 py-1.5 text-sm font-medium bg-white/20 hover:bg-white/30 rounded transition-colors"
          >
            Reintentar
          </button>
        )}
      </div>
    </div>
  );
}