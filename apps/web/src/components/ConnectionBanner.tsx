import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import { useDevice } from '../context/DeviceContext';
import { useToast } from './ToastContainer';

export function ConnectionBanner() {
  const { connectionStatus, connectionError, clearConnectionError, connect, isDemoMode } = useDevice();
  const { showToast } = useToast();

  if (connectionStatus === 'disconnected' && !connectionError) return null;

  const config = connectionStatus === 'connecting'
    ? { title: 'Conectando…', message: 'Seleccioná el puerto MITTEN en el diálogo del navegador.', classes: 'bg-warning-light text-warning border-warning/40', icon: LoaderCircle }
    : connectionStatus === 'handshake'
      ? { title: 'Comprobando conexión…', message: 'Verificando que el dispositivo sea MITTEN.', classes: 'bg-warning-light text-warning border-warning/40', icon: LoaderCircle }
      : connectionStatus === 'connected'
        ? { title: isDemoMode ? 'Modo demostración · sin hardware real' : 'MITTEN conectado', message: isDemoMode ? 'El dispositivo, las muestras y los reconocimientos son simulados por software.' : 'El guante está disponible para configurar el perfil.', classes: isDemoMode ? 'bg-warning-light text-warning border-warning/40' : 'bg-success-light text-success border-success/30', icon: CheckCircle2 }
        : connectionStatus === 'error'
          ? { title: 'Error de conexión', message: connectionError || 'Error desconocido', classes: 'bg-error-light text-error border-error/30', icon: CircleAlert }
          : null;

  if (!config) return null;
  const Icon = config.icon;
  const waiting = connectionStatus === 'connecting' || connectionStatus === 'handshake';

  return (
    <div className={`w-full border-b ${config.classes}`} role={connectionStatus === 'error' ? 'alert' : 'status'} aria-live="polite">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex items-center gap-3"><Icon className={`size-5 shrink-0 ${waiting ? 'animate-spin' : ''}`} aria-hidden="true" /><div><p className="font-semibold">{config.title}</p><p className="text-sm opacity-90">{config.message}</p></div></div>
        {connectionStatus === 'error' ? (
          <button onClick={async () => { clearConnectionError(); try { await connect(); } catch { showToast({ type: 'error', message: 'No se pudo reconectar. Revisá el cable y volvé a intentarlo.' }); } }} className="min-h-11 rounded-lg border border-current/35 px-3 text-sm font-semibold transition-colors hover:bg-white/10">Reintentar</button>
        ) : null}
      </div>
    </div>
  );
}
