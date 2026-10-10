import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDevice } from '../context/DeviceContext';
import { useToast } from '../components/ToastContainer';
import { Button } from '../components/ui/button';
import { Notice, PageHeader, ProgressBar } from '../components/ui/mitten-ui';
import { ApiError, downloadAudioPackage, getGestures } from '../services/api';
import { getFirmwareStateLabel } from '../utils/devicePresentation';
import type { Gesture } from '../types';

export function SyncPage() {
  const { showToast } = useToast();
  const {
    isConnected, connectionStatus, deviceInfo, firmwareState, activeProfile, isSyncing,
    syncProgress, syncError, syncIsComplete, connect, startSync, abortSync, getStatus, clearSyncState,
  } = useDevice();
  const [gestures, setGestures] = useState<Gesture[]>([]);
  const [isLoadingGestures, setIsLoadingGestures] = useState(true);
  const [isPreparingPackage, setIsPreparingPackage] = useState(false);
  const [missingAudio, setMissingAudio] = useState<Array<{ name: string; audioTrack: number }>>([]);

  const fetchGestures = useCallback(async () => {
    setIsLoadingGestures(true);
    try {
      const response = await getGestures();
      setGestures(response.gestures);
    } catch (error) {
      showToast({ type: 'error', message: error instanceof Error ? error.message : 'No se pudo cargar la biblioteca' });
    } finally {
      setIsLoadingGestures(false);
    }
  }, [showToast]);

  useEffect(() => { fetchGestures(); }, [fetchGestures]);

  const overCapacity = Boolean(deviceInfo && gestures.length > deviceInfo.capabilities.maxGestures);
  const canSync = isConnected && firmwareState === 'IDLE' && !isLoadingGestures && !overCapacity && !isSyncing;
  const isConnecting = connectionStatus === 'connecting' || connectionStatus === 'handshake';

  const readiness = (() => {
    if (syncError) return { title: 'La sincronización no terminó', detail: 'Revisá el error y volvé a intentarlo. El perfil anterior sigue conservado.', tone: 'error' as const };
    if (isSyncing) return { title: 'Enviando biblioteca', detail: `${syncProgress.sent} de ${syncProgress.total} gestos enviados`, tone: 'primary' as const };
    if (syncIsComplete) return { title: 'Perfil actualizado en MITTEN', detail: 'La biblioteca quedó guardada. Verificá por separado que los MP3 estén en la microSD.', tone: 'success' as const };
    if (!isConnected) return { title: 'Falta conectar MITTEN', detail: 'Conectá el guante para consultar su estado y transferir la biblioteca.', tone: 'warning' as const };
    if (firmwareState !== 'IDLE') return { title: 'MITTEN está ocupado', detail: `Estado actual: ${getFirmwareStateLabel(firmwareState)}. Esperá antes de sincronizar.`, tone: 'warning' as const };
    if (overCapacity) return { title: 'La biblioteca supera la capacidad', detail: `MITTEN admite ${deviceInfo?.capabilities.maxGestures} gestos y la biblioteca tiene ${gestures.length}.`, tone: 'error' as const };
    if (gestures.length === 0) return { title: 'La biblioteca está vacía', detail: 'Puedes crear un gesto o sincronizarla vacía para borrar el perfil del guante.', tone: 'neutral' as const };
    return { title: 'Biblioteca lista para transferir', detail: `${gestures.length} ${gestures.length === 1 ? 'gesto será enviado' : 'gestos serán enviados'} como un perfil completo.`, tone: 'primary' as const };
  })();

  const handleSync = async () => {
    if (!canSync) return;
    if (gestures.length === 0 && !confirm('La biblioteca está vacía. Sincronizarla eliminará todos los gestos del dispositivo. ¿Continuar?')) return;
    clearSyncState();
    try {
      const stamp = Date.now();
      await startSync(`profile-${stamp}`, `rev-${stamp}-${Math.random().toString(36).slice(2, 9)}`, gestures);
      showToast({ type: 'success', message: 'Perfil sincronizado con MITTEN' });
    } catch (error) {
      showToast({ type: 'error', message: error instanceof Error ? error.message : 'No se pudo sincronizar el perfil' });
    }
  };

  const handleAbort = async () => {
    if (!confirm('¿Cancelar la sincronización en curso? El perfil anterior se conservará.')) return;
    try {
      await abortSync();
      showToast({ type: 'info', message: 'Sincronización cancelada; el perfil anterior sigue activo' });
    } catch {
      showToast({ type: 'error', message: 'No se pudo cancelar la sincronización' });
    }
  };

  const handleRefresh = async () => {
    if (!isConnected) return;
    try {
      await Promise.all([getStatus(), fetchGestures()]);
    } catch {
      showToast({ type: 'error', message: 'No se pudo actualizar el estado de MITTEN' });
    }
  };

  const handlePrepareMicroSd = async () => {
    setIsPreparingPackage(true);
    setMissingAudio([]);
    try {
      const blob = await downloadAudioPackage();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mitten-microsd.zip';
      link.click();
      URL.revokeObjectURL(url);
      showToast({ type: 'success', message: 'Paquete para microSD preparado' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && error.missingTracks) {
        setMissingAudio(error.missingTracks);
        showToast({ type: 'error', message: 'Genera los MP3 pendientes antes de preparar la microSD' });
      } else showToast({ type: 'error', message: error instanceof Error ? error.message : 'No se pudo preparar la microSD' });
    } finally { setIsPreparingPackage(false); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader eyebrow="Transferencia de perfil" title="Sincronizar con MITTEN" description="Reemplazá de forma segura el perfil del guante con tu biblioteca actual." actions={<Button variant="outline" onClick={handleRefresh} disabled={!isConnected || isSyncing}>Actualizar estado</Button>} />

      <Notice tone={readiness.tone} title={readiness.title} live actions={isSyncing ? <Button variant="outline" size="sm" onClick={handleAbort}>Cancelar</Button> : !isConnected ? <Button size="sm" onClick={() => connect().catch(() => undefined)} disabled={isConnecting}>{isConnecting ? 'Conectando…' : 'Conectar MITTEN'}</Button> : undefined}>
        <p>{readiness.detail}</p>{isSyncing && syncProgress.total > 0 ? <div className="mt-3"><ProgressBar value={syncProgress.sent} max={syncProgress.total} label="Progreso de sincronización" /></div> : null}
      </Notice>

      {isConnected && activeProfile && (
        <section className="app-panel p-5" aria-labelledby="current-profile-title">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div><h2 id="current-profile-title" className="font-semibold text-text">Perfil guardado en MITTEN</h2><p className="text-sm text-text-muted mt-1">{activeProfile.gestureCount} {activeProfile.gestureCount === 1 ? 'gesto almacenado' : 'gestos almacenados'}</p></div>
            <details className="text-sm"><summary className="cursor-pointer font-medium text-primary">Detalles técnicos</summary><p className="mt-2 font-mono text-text-muted break-all">Perfil {activeProfile.profileId} · revisión {activeProfile.profileRevision}</p></details>
          </div>
        </section>
      )}

      <section className="app-panel" aria-labelledby="library-title">
        <div className="p-5 border-b border-border flex items-center justify-between gap-3">
          <div><h2 id="library-title" className="text-lg font-semibold text-text">Biblioteca que se enviará</h2><p className="text-sm text-text-muted mt-1">{gestures.length} / {deviceInfo?.capabilities.maxGestures || 50} gestos</p></div>
          {isLoadingGestures && <span className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" role="status" aria-label="Cargando biblioteca" />}
        </div>
        {!isLoadingGestures && gestures.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-medium text-text">Todavía no hay gestos</h3>
            <p className="text-text-muted mt-1 mb-4">Creá uno para que MITTEN pueda asociar un movimiento con una frase.</p>
            <Button asChild><Link to="/gestures/new">Crear gesto</Link></Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {gestures.map((gesture) => <li key={gesture.id} className="flex items-center justify-between gap-4 px-5 py-4"><span className="font-medium text-text">{gesture.name}</span><span className="text-sm text-text-muted">Pista {gesture.audioTrack}</span></li>)}
          </ul>
        )}
      </section>

      <section className="app-panel p-5">
        <h2 className="font-semibold text-text">Audio para el uso autónomo</h2>
        <p className="text-sm text-text-muted mt-2">La sincronización transfiere gestos y números de pista. Los archivos MP3 se copian por separado a <code>/mp3</code> en la microSD del DFPlayer.</p>
        {missingAudio.length > 0 ? <Notice tone="error" title="Faltan MP3 para completar el paquete"><ul className="mt-2 list-disc pl-5">{missingAudio.map(track => <li key={track.audioTrack}><Link className="font-semibold underline" to={`/gestures/${gestures.find(gesture => gesture.audioTrack === track.audioTrack)?.id}`}>{track.name}</Link> · pista {String(track.audioTrack).padStart(4, '0')}</li>)}</ul></Notice> : null}
        <Button className="mt-4" variant="outline" onClick={handlePrepareMicroSd} disabled={isPreparingPackage || gestures.length === 0}>{isPreparingPackage ? 'Preparando…' : 'Preparar microSD'}</Button>
      </section>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <Button asChild variant="outline" size="lg"><Link to="/gestures">Revisar biblioteca</Link></Button>
        <Button onClick={handleSync} disabled={!canSync} size="lg">
          {isSyncing ? 'Sincronizando…' : gestures.length === 0 ? 'Vaciar perfil de MITTEN' : `Sincronizar ${gestures.length} ${gestures.length === 1 ? 'gesto' : 'gestos'}`}
        </Button>
      </div>
    </div>
  );
}
