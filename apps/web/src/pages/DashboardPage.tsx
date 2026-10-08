import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDevice } from '../context/DeviceContext';
import { getGestureAudioInfo, getGestures } from '../services/api';
import { getConnectionLabel, getFirmwareStateDescription, getFirmwareStateLabel } from '../utils/devicePresentation';

export function DashboardPage() {
  const { user } = useAuth();
  const { isConnected, connectionStatus, deviceInfo, firmwareState, activeProfile, syncIsComplete, connect, disconnect, getStatus } = useDevice();
  const [gestureCount, setGestureCount] = useState(0);
  const [audioReadyCount, setAudioReadyCount] = useState(0);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getGestures()
      .then(async ({ gestures }) => {
        const audioStates = await Promise.allSettled(gestures.map((gesture) => getGestureAudioInfo(gesture.id)));
        if (!cancelled) {
          setGestureCount(gestures.length);
          setAudioReadyCount(audioStates.filter((result) => result.status === 'fulfilled' && Boolean(result.value.filePath)).length);
        }
      })
      .finally(() => { if (!cancelled) setIsLoadingLibrary(false); });
    return () => { cancelled = true; };
  }, []);

  const isConnecting = connectionStatus === 'connecting' || connectionStatus === 'handshake';
  const missingAudioCount = Math.max(gestureCount - audioReadyCount, 0);
  const nextStep = !isConnected
    ? { title: 'Conecta MITTEN', description: 'Usa el cable USB y selecciona su puerto para comenzar.', action: 'Conectar MITTEN', kind: 'connect' as const }
    : gestureCount === 0
      ? { title: 'Crea tu primer gesto', description: 'Registra un movimiento y escribe la frase que MITTEN pronunciará.', action: 'Crear gesto', href: '/gestures/new' }
      : missingAudioCount > 0
        ? { title: 'Prepara las frases de audio', description: `${missingAudioCount} ${missingAudioCount === 1 ? 'gesto necesita' : 'gestos necesitan'} un MP3 antes del uso autónomo.`, action: 'Revisar biblioteca', href: '/gestures' }
        : { title: 'Sincroniza el perfil', description: 'Envía la biblioteca completa al guante y luego verifica la microSD.', action: 'Ir a sincronizar', href: '/sync' };

  const journey = [
    { label: 'Conectar', detail: isConnected ? 'Guante conectado' : 'Pendiente', done: isConnected },
    { label: 'Enseñar gestos', detail: isLoadingLibrary ? 'Consultando…' : `${gestureCount} ${gestureCount === 1 ? 'gesto' : 'gestos'}`, done: gestureCount > 0 },
    { label: 'Preparar audio', detail: isLoadingLibrary ? 'Consultando…' : gestureCount > 0 ? `${audioReadyCount} de ${gestureCount}` : 'Sin gestos', done: gestureCount > 0 && missingAudioCount === 0 },
    { label: 'Sincronizar', detail: syncIsComplete ? 'Perfil actualizado' : activeProfile ? `${activeProfile.gestureCount} en MITTEN` : 'Pendiente', done: syncIsComplete },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-text">Prepara MITTEN para hablar</h1>
        <p className="text-text-muted mt-2 max-w-2xl">Hola, {user?.email}. Completa la configuración y después podrás usar el guante sin mantener esta página abierta.</p>
      </header>

      <section className="bg-primary text-white rounded-xl p-6 sm:p-8 shadow-md" aria-labelledby="next-step-title">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-blue-100 mb-2">Siguiente paso</p>
            <h2 id="next-step-title" className="text-2xl font-bold tracking-[-0.02em]">{nextStep.title}</h2>
            <p className="text-blue-100 mt-2">{nextStep.description}</p>
          </div>
          {'kind' in nextStep ? (
            <button onClick={() => connect().catch(() => undefined)} disabled={isConnecting} className="shrink-0 px-5 py-3 bg-white text-primary font-semibold rounded-lg hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {isConnecting ? 'Conectando…' : nextStep.action}
            </button>
          ) : (
            <Link to={nextStep.href} className="shrink-0 px-5 py-3 bg-white text-primary font-semibold rounded-lg hover:bg-blue-50 transition-colors text-center">{nextStep.action}</Link>
          )}
        </div>
      </section>

      <section className="bg-surface rounded-xl border border-border p-5 sm:p-6" aria-labelledby="journey-title">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
          <div>
            <h2 id="journey-title" className="text-lg font-semibold text-text">Camino al uso autónomo</h2>
            <p className="text-sm text-text-muted mt-1">Un gesto pasa de tu mano a una frase guardada en el guante.</p>
          </div>
          {syncIsComplete && <span className="text-sm font-medium text-success">Perfil actualizado en esta sesión</span>}
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-4 gap-0">
          {journey.map((step, index) => (
            <li key={step.label} className="relative flex md:block gap-3 p-3 md:p-4">
              {index < 3 && <span className="hidden md:block absolute top-7 left-[calc(50%+1rem)] right-[calc(-50%+1rem)] h-px bg-border" aria-hidden="true" />}
              <span className={`relative z-10 grid place-items-center w-8 h-8 rounded-full text-sm font-bold shrink-0 ${step.done ? 'bg-success text-white' : 'bg-gray-100 text-text-muted'}`} aria-hidden="true">{step.done ? '✓' : index + 1}</span>
              <div className="md:mt-3"><p className="font-medium text-text">{step.label}</p><p className="text-sm text-text-muted mt-0.5">{step.detail}</p></div>
            </li>
          ))}
        </ol>
        <div className="mt-4 p-4 rounded-lg bg-warning-light text-amber-900">
          <p className="font-medium">Antes de desconectar la computadora</p>
          <p className="text-sm mt-1">Copia cada MP3 descargado a la carpeta <code>/mp3</code> de la microSD y comprueba que el número de pista coincida. La web no puede verificar ese paso físico.</p>
        </div>
      </section>

      <section className="bg-surface rounded-xl border border-border p-5 sm:p-6" aria-labelledby="device-title">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 id="device-title" className="text-lg font-semibold text-text">Estado de MITTEN</h2>
            <div className="flex flex-wrap items-center gap-2 mt-3" role="status" aria-live="polite">
              <span className={`px-2.5 py-1 rounded-full text-sm font-medium ${isConnected ? 'bg-success-light text-success' : 'bg-gray-100 text-gray-700'}`}>{getConnectionLabel(connectionStatus)}</span>
              {isConnected && <span className="px-2.5 py-1 rounded-full text-sm font-medium bg-primary-light text-primary">{getFirmwareStateLabel(firmwareState)}</span>}
            </div>
            <p className="text-sm text-text-muted mt-3">{isConnected ? getFirmwareStateDescription(firmwareState) : 'Conecta el guante para capturar gestos, consultar su perfil o sincronizar.'}</p>
          </div>
          {isConnected && (
            <div className="flex gap-2">
              <button onClick={() => getStatus().catch(() => undefined)} className="px-3 py-2 border border-border text-text font-medium rounded-md hover:bg-gray-50 transition-colors">Actualizar</button>
              <button onClick={() => disconnect()} className="px-3 py-2 text-error font-medium rounded-md hover:bg-error-light transition-colors">Desconectar</button>
            </div>
          )}
        </div>

        {isConnected && deviceInfo && (
          <details className="mt-5 pt-5 border-t border-border">
            <summary className="cursor-pointer font-medium text-text hover:text-primary">Detalles técnicos del dispositivo</summary>
            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 text-sm">
              <div><dt className="text-text-muted">Firmware</dt><dd className="font-mono mt-1">v{deviceInfo.firmwareVersion}</dd></div>
              <div><dt className="text-text-muted">Protocolo</dt><dd className="font-mono mt-1">v{deviceInfo.protocolVersion}</dd></div>
              <div><dt className="text-text-muted">Capacidad</dt><dd className="tabular-nums mt-1">{deviceInfo.capabilities.maxGestures} gestos</dd></div>
              <div><dt className="text-text-muted">Mensaje máximo</dt><dd className="tabular-nums mt-1">{deviceInfo.capabilities.maxMessageBytes.toLocaleString()} bytes</dd></div>
            </dl>
          </details>
        )}
      </section>
    </div>
  );
}
