import { ArrowRight, Cable, Check, RotateCcw, Unplug } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DevicePairingCard } from '../components/DevicePairingCard';
import { GloveAudioPanel } from '../components/GloveAudioPanel';
import { useToast } from '../components/ToastContainer';
import { Button } from '../components/ui/button';
import { Notice, PageHeader, Panel, StatusBadge } from '../components/ui/mitten-ui';
import { useAuth } from '../context/AuthContext';
import { useDevice, type DeviceMode } from '../context/DeviceContext';
import { getGestureAudioInfo, getGestures } from '../services/api';
import type { Gesture } from '../types';
import {
  getConnectionLabel,
  getFirmwareStateDescription,
  getFirmwareStateLabel,
  isWebSerialSupported,
} from '../utils/devicePresentation';

export function DashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const {
    isConnected,
    connectionStatus,
    deviceInfo,
    firmwareState,
    activeProfile,
    syncIsComplete,
    connect,
    disconnect,
    getStatus,
    deviceMode,
    setDeviceMode,
    isDemoMode,
    isRelayMode,
    restartDemoDevice,
    simulateRecognition,
    lastRecognition,
  } = useDevice();

  const [gestures, setGestures] = useState<Gesture[]>([]);
  const [audioByGestureId, setAudioByGestureId] = useState<Map<number, boolean>>(() => new Map());
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setIsLoadingLibrary(true);
    setLibraryError(null);
    try {
      const { gestures: fetched } = await getGestures();
      const audioStates = await Promise.allSettled(fetched.map((gesture) => getGestureAudioInfo(gesture.id)));
      const nextAudio = new Map<number, boolean>();
      fetched.forEach((gesture, index) => {
        const result = audioStates[index];
        nextAudio.set(gesture.id, result?.status === 'fulfilled' && Boolean(result.value.filePath));
      });
      setGestures(fetched);
      setAudioByGestureId(nextAudio);
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'No se pudo consultar tu biblioteca.');
    } finally {
      setIsLoadingLibrary(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (location.hash === '#audio-guante' && isConnected) {
      document.getElementById('audio-guante')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isConnected, location.hash]);

  const preloadedLibrary = useMemo(
    () => ({ gestures, audioByGestureId }),
    [gestures, audioByGestureId],
  );

  const gestureCount = gestures.length;
  const audioReadyCount = useMemo(
    () => gestures.filter((gesture) => audioByGestureId.get(gesture.id)).length,
    [gestures, audioByGestureId],
  );

  const isConnecting = connectionStatus === 'connecting' || connectionStatus === 'handshake';
  const modeLocked = isConnected || isConnecting;
  const usbSupported = isWebSerialSupported();
  const missingAudioCount = Math.max(gestureCount - audioReadyCount, 0);

  const handleModeChange = (mode: DeviceMode) => {
    try {
      setDeviceMode(mode);
    } catch (error) {
      showToast({
        type: 'warning',
        message: error instanceof Error ? error.message : 'Desconectá el guante antes de cambiar de modo.',
      });
    }
  };

  const handleConnect = async () => {
    try {
      await connect();
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo conectar con MITTEN.',
      });
    }
  };

  const handleRestartDemo = async () => {
    try {
      await restartDemoDevice();
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo reiniciar el dispositivo simulado.',
      });
    }
  };

  const handleSimulateRecognition = async () => {
    try {
      await simulateRecognition();
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo simular el reconocimiento.',
      });
    }
  };

  const nextStep = !isConnected
    ? {
        title: isDemoMode ? 'Iniciá el MITTEN simulado' : isRelayMode ? 'Conectá MITTEN por Wi-Fi' : 'Conectá MITTEN por USB',
        description: isDemoMode
          ? 'La demo usa el mismo protocolo, sin comunicarse con hardware real.'
          : isRelayMode
            ? 'El guante debe estar encendido, vinculado a tu cuenta y con acceso a Internet.'
            : 'Usá el cable USB en Chrome o Edge de escritorio y seleccioná su puerto para comenzar.',
        action: isDemoMode ? 'Iniciar simulador' : isRelayMode ? 'Conectar por Wi-Fi' : 'Conectar por USB',
        kind: 'connect' as const,
      }
    : gestureCount === 0
      ? { title: 'Creá tu primer gesto', description: 'Registrá un movimiento y escribí la frase que MITTEN pronunciará.', action: 'Crear gesto', href: '/gestures/new' }
      : missingAudioCount > 0
        ? {
            title: 'Prepará las frases de audio',
            description: `${missingAudioCount} ${missingAudioCount === 1 ? 'gesto necesita' : 'gestos necesitan'} un MP3 antes del uso autónomo.`,
            action: 'Revisar biblioteca',
            href: '/gestures',
          }
        : { title: 'Sincronizá el perfil', description: 'Enviá la biblioteca completa al guante y después verificá la microSD.', action: 'Ir a sincronizar', href: '/sync' };

  const journey = [
    {
      label: 'Conectar',
      detail: isConnected ? (isDemoMode ? 'Simulador conectado' : isRelayMode ? 'Conectado por Wi-Fi' : 'Conectado por USB') : 'Pendiente',
      done: isConnected,
    },
    {
      label: 'Enseñar gestos',
      detail: isLoadingLibrary ? 'Consultando…' : libraryError ? 'Error al consultar' : `${gestureCount} ${gestureCount === 1 ? 'gesto' : 'gestos'}`,
      done: !libraryError && gestureCount > 0,
    },
    {
      label: 'Preparar audio',
      detail: isLoadingLibrary ? 'Consultando…' : libraryError ? 'Error al consultar' : gestureCount > 0 ? `${audioReadyCount} de ${gestureCount}` : 'Sin gestos',
      done: !libraryError && gestureCount > 0 && missingAudioCount === 0,
    },
    {
      label: 'Sincronizar',
      detail: syncIsComplete ? 'Perfil actualizado' : activeProfile ? `${activeProfile.gestureCount} en MITTEN` : 'Pendiente',
      done: syncIsComplete,
    },
  ];

  const matchedRecognition = lastRecognition
    ? gestures.find((g) => g.id === lastRecognition.gestureId || g.audioTrack === lastRecognition.audioTrack)
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Panel de preparación"
        title="Prepará MITTEN para hablar"
        description={<>Hola, {user?.email}. Completá el recorrido una vez y después vas a poder usar el guante sin mantener esta página abierta.</>}
      />

      <section className="app-panel p-5" aria-labelledby="device-mode-title">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="device-mode-title" className="text-lg font-bold text-text">Tipo de conexión</h2>
            <p className="mt-1 text-sm text-text-muted">Conectá MITTEN por Wi-Fi desde cualquier dispositivo, usá USB como respaldo local con cable o ensayá el recorrido en Modo demostración.</p>
            {modeLocked ? (
              <p className="mt-1.5 text-xs text-text-muted">Desconectá el guante para cambiar el tipo de conexión.</p>
            ) : null}
          </div>
          <div className="grid shrink-0 grid-cols-1 gap-1 rounded-xl border border-border bg-mist p-1 sm:inline-flex sm:flex-nowrap" role="group" aria-label="Tipo de conexión">
            <button
              type="button"
              aria-pressed={deviceMode === 'relay'}
              disabled={modeLocked}
              onClick={() => handleModeChange('relay')}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold whitespace-nowrap transition-colors ${deviceMode === 'relay' ? 'bg-surface-elevated text-signal shadow-sm' : 'text-text-muted hover:text-text'} disabled:opacity-50`}
            >
              Guante por Wi-Fi
            </button>
            <button
              type="button"
              aria-pressed={deviceMode === 'hardware'}
              disabled={modeLocked}
              onClick={() => handleModeChange('hardware')}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold whitespace-nowrap transition-colors ${deviceMode === 'hardware' ? 'bg-surface-elevated text-signal shadow-sm' : 'text-text-muted hover:text-text'} disabled:opacity-50`}
            >
              Guante por USB
            </button>
            <button
              type="button"
              aria-pressed={deviceMode === 'demo'}
              disabled={modeLocked}
              onClick={() => handleModeChange('demo')}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold whitespace-nowrap transition-colors ${deviceMode === 'demo' ? 'bg-surface-elevated text-signal shadow-sm' : 'text-text-muted hover:text-text'} disabled:opacity-50`}
            >
              Modo demostración
            </button>
          </div>
        </div>
        {isDemoMode ? (
          <Notice tone="warning" title="Simulación activa" className="mt-4">
            <strong>No hay un guante físico conectado.</strong> Las muestras, el reinicio y el reconocimiento son generados por software para ensayar el recorrido.
          </Notice>
        ) : null}
        {deviceMode === 'hardware' && !isConnected && !usbSupported ? (
          <Notice
            tone="warning"
            title="Este navegador no admite Web Serial por USB"
            className="mt-4"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => handleModeChange('relay')}>
                  Usar Guante por Wi-Fi
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => handleModeChange('demo')}>
                  Probar Modo demostración
                </Button>
              </div>
            }
          >
            Para conectar por USB necesitás Chrome o Edge en HTTPS o localhost. Podés conectarte por Wi-Fi o ensayar en Modo demostración.
          </Notice>
        ) : null}
      </section>

      {libraryError ? (
        <Notice
          tone="error"
          title="No pudimos cargar tu biblioteca"
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => void loadLibrary()}>
              <RotateCcw aria-hidden="true" />
              Reintentar
            </Button>
          }
        >
          {libraryError}
        </Notice>
      ) : null}

      <section className="app-next-step relative overflow-hidden rounded-2xl px-6 py-7 sm:px-8" aria-labelledby="next-step-title">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_center,rgb(0_211_221_/_0.2),transparent_66%)]" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 id="next-step-title" className="text-xl font-bold tracking-[-0.02em] text-text">Siguiente paso: {nextStep.title}</h2>
            <p className="mt-2 text-text-muted">{nextStep.description}</p>
          </div>
          {'kind' in nextStep ? (
            <Button type="button" onClick={() => void handleConnect()} disabled={isConnecting} className="shrink-0">
              <Cable aria-hidden="true" />
              {isConnecting ? 'Conectando…' : nextStep.action}
            </Button>
          ) : (
            <Button asChild className="shrink-0">
              <Link to={nextStep.href}>
                {nextStep.action}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </section>

      <Panel className="p-5 sm:p-6" aria-labelledby="journey-title">
        <div className="flex flex-col gap-2 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="journey-title" className="text-lg font-bold text-text">Camino al uso autónomo</h2>
            <p className="mt-1 text-sm text-text-muted">Un gesto pasa de tu mano a una frase guardada en el guante.</p>
          </div>
          {syncIsComplete ? (
            <StatusBadge tone="success">
              <Check aria-hidden="true" />
              Perfil actualizado
            </StatusBadge>
          ) : null}
        </div>
        <ol className="grid grid-cols-1 divide-y divide-border md:grid-cols-4 md:divide-x md:divide-y-0">
          {journey.map((step, index) => (
            <li key={step.label} className="flex gap-3 px-2 py-5 md:block md:px-5">
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${step.done ? 'bg-success text-background' : 'border border-border bg-mist text-text-muted'}`}
                aria-hidden="true"
              >
                {step.done ? <Check className="size-4" /> : index + 1}
              </span>
              <div className="md:mt-3">
                <p className="font-semibold text-text">{step.label}</p>
                <p className="mt-0.5 text-sm text-text-muted">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <Notice tone="warning" title="Antes de usar MITTEN de forma autónoma">
          Después de sincronizar el perfil, usá el panel «Audio en el guante» para enviar las pistas WAV a <code className="font-mono">/mitten_audio/audio/NNNN.wav</code> en la microSD.
        </Notice>
      </Panel>

      <Panel className="p-5 sm:p-6" aria-labelledby="device-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h2 id="device-title" className="text-lg font-bold text-text">Estado de MITTEN</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2" role="status" aria-live="polite">
              <StatusBadge tone={isConnected ? 'success' : 'neutral'}>{getConnectionLabel(connectionStatus)}</StatusBadge>
              {isConnected ? <StatusBadge tone="primary">{getFirmwareStateLabel(firmwareState)}</StatusBadge> : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-text-muted">
              {isConnected ? getFirmwareStateDescription(firmwareState) : 'Conectá el guante para capturar gestos, consultar su perfil o sincronizar.'}
            </p>
          </div>
          {isConnected ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => getStatus().catch(() => undefined)}>
                <RotateCcw aria-hidden="true" />
                Actualizar
              </Button>
              <Button type="button" variant="destructive" size="sm" onClick={() => disconnect()}>
                <Unplug aria-hidden="true" />
                Desconectar
              </Button>
            </div>
          ) : null}
        </div>
        {isConnected && deviceInfo ? (
          <details className="mt-5 border-t border-border pt-5">
            <summary className="flex min-h-11 cursor-pointer items-center py-2 font-semibold text-text hover:text-primary-text">
              Detalles técnicos del dispositivo
            </summary>
            <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-text-muted">Firmware</dt>
                <dd className="mt-1 font-mono">v{deviceInfo.firmwareVersion}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Protocolo</dt>
                <dd className="mt-1 font-mono">v{deviceInfo.protocolVersion}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Capacidad</dt>
                <dd className="mt-1 tabular-nums">{deviceInfo.capabilities.maxGestures} gestos</dd>
              </div>
              <div>
                <dt className="text-text-muted">Mensaje máximo</dt>
                <dd className="mt-1 tabular-nums">{deviceInfo.capabilities.maxMessageBytes.toLocaleString()} bytes</dd>
              </div>
            </dl>
          </details>
        ) : null}
        {isConnected && isDemoMode ? (
          <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:flex-wrap sm:items-center">
            <Button type="button" variant="outline" onClick={() => void handleRestartDemo()}>
              Reiniciar dispositivo simulado
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleSimulateRecognition()} disabled={!activeProfile?.gestureCount}>
              Simular reconocimiento
            </Button>
            {lastRecognition ? (
              <p className="text-sm text-success" role="status">
                Reconocimiento simulado: «{matchedRecognition ? matchedRecognition.name : `gesto ${lastRecognition.gestureId}`}» (pista {lastRecognition.audioTrack}).
              </p>
            ) : !activeProfile?.gestureCount ? (
              <p className="text-sm text-text-muted">Sincronizá al menos un gesto antes de simular el reconocimiento.</p>
            ) : (
              <p className="text-sm text-text-muted">Probá cómo responde la interfaz al reconocer un gesto sincronizado.</p>
            )}
          </div>
        ) : null}
      </Panel>

      {isRelayMode && !isConnected ? <DevicePairingCard /> : null}
      {isConnected ? (
        <GloveAudioPanel
          id="audio-guante"
          preloadedLibrary={preloadedLibrary}
          isLoadingLibrary={isLoadingLibrary}
          libraryError={libraryError}
          onLibraryRefresh={loadLibrary}
        />
      ) : null}
    </div>
  );
}
