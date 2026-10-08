import { useDevice } from '../context/DeviceContext';
import { useToast } from './ToastContainer';

export function ConnectionBanner() {
  const { connectionStatus, connectionError, clearConnectionError, connect } = useDevice();
  const { showToast } = useToast();

  if (connectionStatus === 'disconnected' && !connectionError) {
    return null;
  }

  const getStatusConfig = () => {
    switch (connectionStatus) {
      case 'connecting':
        return {
          icon: 'wait',
          title: 'Conectando...',
          message: 'Selecciona el puerto MITTEN en el diálogo del navegador',
          className: 'bg-warning-light border-warning text-warning',
        };
      case 'handshake':
        return {
          icon: 'wait',
          title: 'Comprobando conexión...',
          message: 'Verificando que el dispositivo sea MITTEN',
          className: 'bg-warning-light border-warning text-warning',
        };
      case 'connected':
        return {
          icon: 'success',
          title: 'MITTEN conectado',
          message: 'El guante está disponible. Puedes continuar con la configuración.',
          className: 'bg-success-light border-success text-success',
        };
      case 'error':
        return {
          icon: 'error',
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
    <div className={`w-full border-b ${config.className}`} role={connectionStatus === 'error' ? 'alert' : 'status'} aria-live="polite">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <svg className={`w-5 h-5 shrink-0 ${config.icon === 'wait' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            {config.icon === 'success' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 12 4 4L19 6" />
            ) : config.icon === 'error' ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8" />
            )}
          </svg>
          <div>
            <p className="font-medium">{config.title}</p>
            <p className="text-sm opacity-90">{config.message}</p>
          </div>
        </div>
        {connectionStatus === 'error' && (
          <button
            onClick={async () => {
              clearConnectionError();
              try {
                await connect();
              } catch {
                showToast({ type: 'error', message: 'No se pudo reconectar. Revisa el cable y vuelve a intentarlo.' });
              }
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
