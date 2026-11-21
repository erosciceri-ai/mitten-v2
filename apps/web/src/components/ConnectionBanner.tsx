import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import { useDevice } from '../context/DeviceContext';
import { useToast } from './ToastContainer';

export function ConnectionBanner() {
  const { connectionStatus, connectionError, clearConnectionError, connect, isDemoMode, isRelayMode } = useDevice();
  const { showToast } = useToast();

  if (connectionStatus === 'disconnected' && !connectionError) return null;

  const connectingConfig = isRelayMode
    ? { title: 'Conectando por Wi-Fi…', message: 'Esperando respuesta del guante a través del servidor.', classes: 'bg-warning-light text-warning border-warning/40', icon: LoaderCircle }
    : isDemoMode
      ? { title: 'Iniciando demostración…', message: 'Preparando el simulador local de MITTEN.', classes: 'bg-warning-light text-warning border-warning/40', icon: LoaderCircle }
      : { title: 'Conectando…', message: 'Seleccioná el puerto MITTEN en el diálogo del navegador.', classes: 'bg-warning-light text-warning border-warning/40', icon: LoaderCircle };

  const connectedConfig = isDemoMode
    ? { title: 'Modo demostración · sin hardware real', message: 'El dispositivo, las muestras y los reconocimientos son simulados por software.', classes: 'bg-warning-light text-warning border-warning/40', icon: CheckCircle2 }
    : isRelayMode
      ? { title: 'MITTEN conectado por Wi-Fi', message: 'El guante está en línea para configurar el perfil y enviar audios.', classes: 'bg-success-light text-success border-success/30', icon: CheckCircle2 }
      : { title: 'MITTEN conectado', message: 'El guante está disponible para configurar el perfil.', classes: 'bg-success-light text-success border-success/30', icon: CheckCircle2 };

  const config = connectionStatus === 'connecting'
    ? connectingConfig
    : connectionStatus === 'handshake'
      ? { title: 'Comprobando conexión…', message: 'Verificando que el dispositivo sea MITTEN.', classes: 'bg-warning-light text-warning border-warning/40', icon: LoaderCircle }
      : connectionStatus === 'connected'
        ? connectedConfig
        : connectionStatus === 'error'
          ? { title: 'Error de conexión', message: connectionError || 'Error desconocido', classes: 'bg-error-light text-error border-error/30', icon: CircleAlert }
          : null;

  if (!config) return null;
  const Icon = config.icon;
  const waiting = connectionStatus === 'connecting' || connectionStatus === 'handshake';
  const retryErrorMessage = isRelayMode
    ? 'No se pudo reconectar por Wi-Fi. Verificá que el guante esté encendido y en línea.'
    : 'No se pudo reconectar. Revisá el cable y volvé a intentarlo.';

  return (
    <div className={`w-full border-b ${config.classes}`} role={connectionStatus === 'error' ? 'alert' : 'status'} aria-live="polite">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3"><Icon className={`size-5 shrink-0 ${waiting ? 'animate-spin' : ''}`} aria-hidden="true" /><div className="min-w-0"><p className="font-semibold">{config.title}</p><p className="text-sm opacity-90">{config.message}</p></div></div>
        {connectionStatus === 'error' ? (
          <button onClick={async () => { clearConnectionError(); try { await connect(); } catch { showToast({ type: 'error', message: retryErrorMessage }); } }} className="min-h-11 shrink-0 rounded-lg border border-current/35 px-3 text-sm font-semibold transition-colors hover:bg-white/10">Reintentar</button>
        ) : null}
      </div>
    </div>
  );
}
