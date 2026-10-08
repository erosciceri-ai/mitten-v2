import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDevice } from '../context/DeviceContext';
import { useToast } from '../components/ToastContainer';
import { getGestures } from '../services/api';
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
    if (syncError) return { title: 'La sincronización no terminó', detail: 'Revisa el error y vuelve a intentarlo. El perfil anterior sigue conservado.', classes: 'bg-error-light text-error border-error', icon: 'error' };
    if (isSyncing) return { title: 'Enviando biblioteca', detail: `${syncProgress.sent} de ${syncProgress.total} gestos enviados`, classes: 'bg-primary-light text-primary border-primary', icon: 'sync' };
    if (syncIsComplete) return { title: 'Perfil actualizado en MITTEN', detail: 'La biblioteca quedó guardada. Verifica por separado que los MP3 estén en la microSD.', classes: 'bg-success-light text-success border-success', icon: 'success' };
    if (!isConnected) return { title: 'Falta conectar MITTEN', detail: 'Conecta el guante para consultar su estado y transferir la biblioteca.', classes: 'bg-warning-light text-amber-900 border-warning', icon: 'device' };
    if (firmwareState !== 'IDLE') return { title: 'MITTEN está ocupado', detail: `Estado actual: ${getFirmwareStateLabel(firmwareState)}. Espera antes de sincronizar.`, classes: 'bg-warning-light text-amber-900 border-warning', icon: 'wait' };
    if (overCapacity) return { title: 'La biblioteca supera la capacidad', detail: `MITTEN admite ${deviceInfo?.capabilities.maxGestures} gestos y la biblioteca tiene ${gestures.length}.`, classes: 'bg-error-light text-error border-error', icon: 'error' };
    if (gestures.length === 0) return { title: 'La biblioteca está vacía', detail: 'Puedes crear un gesto o sincronizarla vacía para borrar el perfil del guante.', classes: 'bg-gray-100 text-gray-800 border-gray-200', icon: 'empty' };
    return { title: 'Biblioteca lista para transferir', detail: `${gestures.length} ${gestures.length === 1 ? 'gesto será enviado' : 'gestos serán enviados'} como un perfil completo.`, classes: 'bg-primary-light text-primary border-primary', icon: 'ready' };
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

  const statusIcon = readiness.icon === 'success'
    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 12 4 4L19 6" />
    : readiness.icon === 'sync'
      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h11l-3-3m8 13H9l3 3M20 7l-2-2m2 2-2 2M4 17l2-2m-2 2 2 2" />
      : readiness.icon === 'error'
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v5m0 3h.01M10.3 3.8 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v10m0 4v.01M5 8.5a8 8 0 1 0 14 0" />;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-text">Sincronizar con MITTEN</h1>
          <p className="text-text-muted mt-2 max-w-2xl">Reemplaza el perfil del guante con tu biblioteca actual.</p>
        </div>
        <button onClick={handleRefresh} disabled={!isConnected || isSyncing} className="px-4 py-2 border border-border text-text font-medium rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Actualizar estado</button>
      </header>

      <section className={`p-5 rounded-xl border ${readiness.classes}`} role="status" aria-live="polite" aria-atomic="true">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <svg className={`w-6 h-6 shrink-0 mt-0.5 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">{statusIcon}</svg>
            <div><h2 className="font-semibold">{readiness.title}</h2><p className="text-sm mt-1 opacity-90">{readiness.detail}</p></div>
          </div>
          {isSyncing && <button onClick={handleAbort} className="px-3 py-2 border border-current font-medium rounded-md hover:bg-black/10 transition-colors">Cancelar</button>}
        </div>
        {isSyncing && syncProgress.total > 0 && (
          <div className="mt-4">
            <div className="h-2 bg-white/50 rounded-full overflow-hidden" role="progressbar" aria-label="Progreso de sincronización" aria-valuemin={0} aria-valuemax={syncProgress.total} aria-valuenow={syncProgress.sent}>
              <div className="h-full bg-current rounded-full transition-all duration-300" style={{ width: `${(syncProgress.sent / syncProgress.total) * 100}%` }} />
            </div>
          </div>
        )}
        {!isConnected && (
          <button onClick={() => connect().catch(() => undefined)} disabled={isConnecting} className="mt-4 px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover disabled:opacity-60 transition-colors">
            {isConnecting ? 'Conectando…' : 'Conectar MITTEN'}
          </button>
        )}
      </section>

      {isConnected && activeProfile && (
        <section className="bg-surface rounded-xl border border-border p-5" aria-labelledby="current-profile-title">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div><h2 id="current-profile-title" className="font-semibold text-text">Perfil guardado en MITTEN</h2><p className="text-sm text-text-muted mt-1">{activeProfile.gestureCount} {activeProfile.gestureCount === 1 ? 'gesto almacenado' : 'gestos almacenados'}</p></div>
            <details className="text-sm"><summary className="cursor-pointer font-medium text-primary">Detalles técnicos</summary><p className="mt-2 font-mono text-text-muted break-all">Perfil {activeProfile.profileId} · revisión {activeProfile.profileRevision}</p></details>
          </div>
        </section>
      )}

      <section className="bg-surface rounded-xl border border-border overflow-hidden" aria-labelledby="library-title">
        <div className="p-5 border-b border-border flex items-center justify-between gap-3">
          <div><h2 id="library-title" className="text-lg font-semibold text-text">Biblioteca que se enviará</h2><p className="text-sm text-text-muted mt-1">{gestures.length} / {deviceInfo?.capabilities.maxGestures || 50} gestos</p></div>
          {isLoadingGestures && <span className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent" role="status" aria-label="Cargando biblioteca" />}
        </div>
        {!isLoadingGestures && gestures.length === 0 ? (
          <div className="p-8 text-center">
            <h3 className="text-lg font-medium text-text">Todavía no hay gestos</h3>
            <p className="text-text-muted mt-1 mb-4">Crea uno para que MITTEN pueda asociar un movimiento con una frase.</p>
            <Link to="/gestures/new" className="inline-flex px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover transition-colors">Crear gesto</Link>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {gestures.map((gesture) => <li key={gesture.id} className="flex items-center justify-between gap-4 px-5 py-4"><span className="font-medium text-text">{gesture.name}</span><span className="text-sm text-text-muted">Pista {gesture.audioTrack}</span></li>)}
          </ul>
        )}
      </section>

      <section className="bg-surface rounded-xl border border-border p-5">
        <h2 className="font-semibold text-text">Audio para el uso autónomo</h2>
        <p className="text-sm text-text-muted mt-2">La sincronización transfiere gestos y números de pista. Los archivos MP3 se copian por separado a <code>/mp3</code> en la microSD del DFPlayer.</p>
      </section>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
        <Link to="/gestures" className="px-4 py-3 border border-border text-text font-medium rounded-md hover:bg-gray-50 transition-colors text-center">Revisar biblioteca</Link>
        <button onClick={handleSync} disabled={!canSync} className="px-5 py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {isSyncing ? 'Sincronizando…' : gestures.length === 0 ? 'Vaciar perfil de MITTEN' : `Sincronizar ${gestures.length} ${gestures.length === 1 ? 'gesto' : 'gestos'}`}
        </button>
      </div>
    </div>
  );
}
