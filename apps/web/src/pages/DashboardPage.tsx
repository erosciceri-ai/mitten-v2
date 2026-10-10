import { ArrowRight, Cable, Check, RotateCcw, Unplug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Notice, PageHeader, Panel, StatusBadge } from '../components/ui/mitten-ui';
import { useAuth } from '../context/AuthContext';
import { useDevice } from '../context/DeviceContext';
import { getGestureAudioInfo, getGestures } from '../services/api';
import { getConnectionLabel, getFirmwareStateDescription, getFirmwareStateLabel } from '../utils/devicePresentation';

export function DashboardPage() {
  const { user } = useAuth();
  const { isConnected, connectionStatus, deviceInfo, firmwareState, activeProfile, syncIsComplete, connect, disconnect, getStatus,
    deviceMode, setDeviceMode, isDemoMode, restartDemoDevice, simulateRecognition, lastRecognition } = useDevice();
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
    ? { title: isDemoMode ? 'Iniciá el MITTEN simulado' : 'Conectá MITTEN', description: isDemoMode ? 'La demo usa el mismo protocolo, sin comunicarse con hardware real.' : 'Usá el cable USB y seleccioná su puerto para comenzar.', action: isDemoMode ? 'Iniciar simulador' : 'Conectar MITTEN', kind: 'connect' as const }
    : gestureCount === 0
      ? { title: 'Creá tu primer gesto', description: 'Registrá un movimiento y escribí la frase que MITTEN pronunciará.', action: 'Crear gesto', href: '/gestures/new' }
      : missingAudioCount > 0
        ? { title: 'Prepará las frases de audio', description: `${missingAudioCount} ${missingAudioCount === 1 ? 'gesto necesita' : 'gestos necesitan'} un MP3 antes del uso autónomo.`, action: 'Revisar biblioteca', href: '/gestures' }
        : { title: 'Sincronizá el perfil', description: 'Enviá la biblioteca completa al guante y después verificá la microSD.', action: 'Ir a sincronizar', href: '/sync' };

  const journey = [
    { label: 'Conectar', detail: isConnected ? 'Guante conectado' : 'Pendiente', done: isConnected },
    { label: 'Enseñar gestos', detail: isLoadingLibrary ? 'Consultando…' : `${gestureCount} ${gestureCount === 1 ? 'gesto' : 'gestos'}`, done: gestureCount > 0 },
    { label: 'Preparar audio', detail: isLoadingLibrary ? 'Consultando…' : gestureCount > 0 ? `${audioReadyCount} de ${gestureCount}` : 'Sin gestos', done: gestureCount > 0 && missingAudioCount === 0 },
    { label: 'Sincronizar', detail: syncIsComplete ? 'Perfil actualizado' : activeProfile ? `${activeProfile.gestureCount} en MITTEN` : 'Pendiente', done: syncIsComplete },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader eyebrow="Panel de preparación" title="Prepará MITTEN para hablar" description={<>Hola, {user?.email}. Completá el recorrido una vez y después vas a poder usar el guante sin mantener esta página abierta.</>} />

      <section className="app-panel p-5" aria-labelledby="device-mode-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="device-mode-title" className="font-bold text-text">Tipo de conexión</h2><p className="mt-1 text-sm text-text-muted">Elegí explícitamente hardware o una demostración local. Nunca se presentan como equivalentes.</p></div>
          <div className="inline-flex rounded-xl border border-border bg-mist p-1" role="group" aria-label="Tipo de conexión">
            <button type="button" aria-pressed={deviceMode === 'hardware'} disabled={isConnected} onClick={() => setDeviceMode('hardware')} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${deviceMode === 'hardware' ? 'bg-surface-elevated text-signal shadow-sm' : 'text-text-muted'} disabled:opacity-50`}>Guante real</button>
            <button type="button" aria-pressed={deviceMode === 'demo'} disabled={isConnected} onClick={() => setDeviceMode('demo')} className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${deviceMode === 'demo' ? 'bg-surface-elevated text-signal shadow-sm' : 'text-text-muted'} disabled:opacity-50`}>Modo demostración</button>
          </div>
        </div>
        {isDemoMode ? <Notice tone="warning" title="Simulación activa"><strong>No hay un guante físico conectado.</strong> Las muestras, el reinicio y el reconocimiento son generados por software para ensayar el recorrido.</Notice> : null}
      </section>

      <section className="app-next-step relative overflow-hidden rounded-2xl px-6 py-7 sm:px-8" aria-labelledby="next-step-title">
        <div className="absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_center,rgb(26_163_154_/_0.32),transparent_66%)]" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl"><h2 id="next-step-title" className="text-2xl font-bold tracking-[-.025em]">Siguiente paso: {nextStep.title}</h2><p className="mt-2 text-[#c5d9df]">{nextStep.description}</p></div>
          {'kind' in nextStep ? (
            <Button onClick={() => connect().catch(() => undefined)} disabled={isConnecting} className="shrink-0"><Cable aria-hidden="true" />{isConnecting ? 'Conectando…' : nextStep.action}</Button>
          ) : (
            <Button asChild className="shrink-0"><Link to={nextStep.href}>{nextStep.action}<ArrowRight aria-hidden="true" /></Link></Button>
          )}
        </div>
      </section>

      <Panel className="p-5 sm:p-6" aria-labelledby="journey-title">
        <div className="flex flex-col gap-2 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 id="journey-title" className="text-lg font-bold text-text">Camino al uso autónomo</h2><p className="mt-1 text-sm text-text-muted">Un gesto pasa de tu mano a una frase guardada en el guante.</p></div>
          {syncIsComplete ? <StatusBadge tone="success"><Check aria-hidden="true" />Perfil actualizado</StatusBadge> : null}
        </div>
        <ol className="grid grid-cols-1 divide-y divide-border md:grid-cols-4 md:divide-x md:divide-y-0">
          {journey.map((step, index) => (
            <li key={step.label} className="flex gap-3 px-2 py-5 md:block md:px-5">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${step.done ? 'bg-success text-background' : 'border border-border bg-mist text-text-muted'}`} aria-hidden="true">{step.done ? <Check className="size-4" /> : index + 1}</span>
              <div className="md:mt-3"><p className="font-semibold text-text">{step.label}</p><p className="mt-0.5 text-sm text-text-muted">{step.detail}</p></div>
            </li>
          ))}
        </ol>
        <Notice tone="warning" title="Antes de desconectar la computadora">
          Copia cada MP3 descargado a <code>/mp3</code> en la microSD y comprueba que el número de pista coincida. La web no puede verificar ese paso físico.
        </Notice>
      </Panel>

      <Panel className="p-5 sm:p-6" aria-labelledby="device-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl"><h2 id="device-title" className="text-xl font-bold text-text">Estado de MITTEN</h2><div className="mt-3 flex flex-wrap items-center gap-2" role="status" aria-live="polite"><StatusBadge tone={isConnected ? 'success' : 'neutral'}>{getConnectionLabel(connectionStatus)}</StatusBadge>{isConnected ? <StatusBadge tone="primary">{getFirmwareStateLabel(firmwareState)}</StatusBadge> : null}</div><p className="mt-3 text-sm leading-6 text-text-muted">{isConnected ? getFirmwareStateDescription(firmwareState) : 'Conectá el guante para capturar gestos, consultar su perfil o sincronizar.'}</p></div>
          {isConnected ? <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => getStatus().catch(() => undefined)}><RotateCcw aria-hidden="true" />Actualizar</Button><Button variant="destructive" size="sm" onClick={() => disconnect()}><Unplug aria-hidden="true" />Desconectar</Button></div> : null}
        </div>
        {isConnected && deviceInfo ? (
          <details className="mt-5 border-t border-border pt-5"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-text hover:text-primary">Detalles técnicos del dispositivo</summary><dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-text-muted">Firmware</dt><dd className="mt-1 font-mono">v{deviceInfo.firmwareVersion}</dd></div><div><dt className="text-text-muted">Protocolo</dt><dd className="mt-1 font-mono">v{deviceInfo.protocolVersion}</dd></div><div><dt className="text-text-muted">Capacidad</dt><dd className="mt-1 tabular-nums">{deviceInfo.capabilities.maxGestures} gestos</dd></div><div><dt className="text-text-muted">Mensaje máximo</dt><dd className="mt-1 tabular-nums">{deviceInfo.capabilities.maxMessageBytes.toLocaleString()} bytes</dd></div></dl></details>
        ) : null}
        {isConnected && isDemoMode ? <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center"><Button variant="outline" onClick={() => restartDemoDevice().catch(() => undefined)}>Reiniciar dispositivo simulado</Button><Button variant="outline" onClick={() => simulateRecognition().catch(() => undefined)} disabled={!activeProfile?.gestureCount}>Simular reconocimiento</Button>{lastRecognition ? <p className="text-sm text-success" role="status">Reconocimiento simulado: gesto {lastRecognition.gestureId}, pista {lastRecognition.audioTrack}.</p> : <p className="text-sm text-text-muted">Sincroniza al menos un gesto antes de simular el reconocimiento.</p>}</div> : null}
      </Panel>
    </div>
  );
}
