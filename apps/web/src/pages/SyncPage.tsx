import { useState, useEffect, useCallback } from 'react';
import { useDevice } from '../context/DeviceContext';
import { useToast } from '../components/ToastContainer';
import { getGestures } from '../services/api';
import type { Gesture, ActiveProfileInfo, SyncBeginPayload } from '../types';

export function SyncPage() {
  const { showToast } = useToast();
  const { 
    isConnected, 
    deviceInfo, 
    firmwareState, 
    activeProfile, 
    activeSync,
    isSyncing, 
    syncProgress, 
    syncError, 
    syncIsComplete,
    startSync,
    abortSync,
    getStatus,
    clearSyncState,
  } = useDevice();

  const [gestures, setGestures] = useState<Gesture[]>([]);
  const [isLoadingGestures, setIsLoadingGestures] = useState(true);
  const [selectedGestures, setSelectedGestures] = useState<Set<number>>(new Set());
  const [syncInitiated, setSyncInitiated] = useState(false);

  const fetchGestures = useCallback(async () => {
    setIsLoadingGestures(true);
    try {
      const response = await getGestures();
      setGestures(response.gestures);
    } catch (error) {
      showToast({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Error al cargar gestos' 
      });
    } finally {
      setIsLoadingGestures(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchGestures();
  }, [fetchGestures]);

  // Check if gestures have changed since last sync
  const hasUnsyncedChanges = () => {
    if (!activeProfile) return gestures.length > 0;
    return gestures.length !== activeProfile.gestureCount;
  };

  const handleSync = async () => {
    if (!isConnected) {
      showToast({ type: 'error', message: 'MITTEN no está conectado' });
      return;
    }

    if (firmwareState !== 'IDLE') {
      showToast({ type: 'warning', message: `El dispositivo está en estado ${firmwareState}. Debe estar IDLE.` });
      return;
    }

    const gesturesToSync = gestures;
    
    if (gesturesToSync.length === 0) {
      if (!confirm('La biblioteca está vacía. ¿Quieres sincronizar una biblioteca vacía (esto eliminará todos los gestos del dispositivo)?')) {
        return;
      }
    }

    if (deviceInfo && gesturesToSync.length > deviceInfo.capabilities.maxGestures) {
      showToast({ 
        type: 'error', 
        message: `Demasiados gestos (${gesturesToSync.length}). Máximo permitido: ${deviceInfo.capabilities.maxGestures}` 
      });
      return;
    }

    clearSyncState();
    setSyncInitiated(true);

    try {
      const profileId = `profile-${Date.now()}`;
      const profileRevision = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      
      await startSync(profileId, profileRevision, gesturesToSync);
      
      showToast({ type: 'success', message: 'Sincronización completada correctamente' });
      setSyncInitiated(false);
    } catch (error) {
      showToast({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Error en la sincronización' 
      });
      setSyncInitiated(false);
    }
  };

  const handleAbort = async () => {
    if (!confirm('¿Cancelar la sincronización en curso?')) return;
    
    try {
      await abortSync();
      showToast({ type: 'info', message: 'Sincronización cancelada' });
    } catch (error) {
      showToast({ type: 'error', message: 'Error al cancelar sincronización' });
    }
  };

  const handleRefresh = async () => {
    try {
      await getStatus();
      fetchGestures();
    } catch (error) {
      showToast({ type: 'error', message: 'Error al actualizar estado' });
    }
  };

  const toggleGesture = (id: number) => {
    setSelectedGestures(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getSyncStatusText = () => {
    if (syncIsComplete) return 'Sincronización completada';
    if (isSyncing) return `Sincronizando... ${syncProgress.sent}/${syncProgress.total}`;
    if (syncError) return `Error: ${syncError}`;
    return 'Listo para sincronizar';
  };

  const getSyncStatusColor = () => {
    if (syncIsComplete) return 'bg-success-light text-success border-success';
    if (isSyncing) return 'bg-primary-light text-primary border-primary';
    if (syncError) return 'bg-error-light text-error border-error';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Sincronizar con MITTEN</h1>
          <p className="text-text-muted mt-1">Transfiere tu biblioteca de gestos al dispositivo</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isSyncing}
          className="px-4 py-2 border border-border text-text font-medium rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Actualizar
        </button>
      </div>

      {/* Connection Status */}
      {!isConnected && (
        <div className="bg-warning-light border border-warning text-warning p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-medium">MITTEN no está conectado</p>
              <p className="text-sm">Conecta el dispositivo desde el panel de control para poder sincronizar</p>
            </div>
          </div>
        </div>
      )}

      {isConnected && firmwareState !== 'IDLE' && (
        <div className="bg-warning-light border border-warning text-warning p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-xl">⏳</span>
            <div>
              <p className="font-medium">Dispositivo no disponible</p>
              <p className="text-sm">Estado actual: <strong>{firmwareState}</strong>. Debe estar en IDLE para sincronizar.</p>
            </div>
          </div>
        </div>
      )}

      {/* Active Profile Info */}
      {isConnected && activeProfile && (
        <div className="bg-primary-light border border-primary/20 p-4 rounded-lg">
          <h3 className="font-medium text-primary mb-2">Perfil Activo en MITTEN</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-primary/70">ID del Perfil</p>
              <p className="font-mono text-text">{activeProfile.profileId}</p>
            </div>
            <div>
              <p className="text-primary/70">Revisión</p>
              <p className="font-mono text-text">{activeProfile.profileRevision}</p>
            </div>
            <div>
              <p className="text-primary/70">Gestos Sincronizados</p>
              <p className="font-mono text-text">{activeProfile.gestureCount} / {deviceInfo?.capabilities.maxGestures || 50}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sync Status Banner */}
      <div className={`p-4 rounded-lg border ${getSyncStatusColor()}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {syncIsComplete && <span className="text-xl">✓</span>}
            {isSyncing && <span className="text-xl animate-spin">⟳</span>}
            {syncError && <span className="text-xl">✕</span>}
            {!syncIsComplete && !isSyncing && !syncError && <span className="text-xl">🔄</span>}
            <div>
              <p className="font-medium">{getSyncStatusText()}</p>
              {isSyncing && syncProgress.total > 0 && (
                <p className="text-sm opacity-80">
                  Enviando gesto {syncProgress.sent} de {syncProgress.total}
                </p>
              )}
            </div>
          </div>
          {isSyncing && (
            <button
              onClick={handleAbort}
              className="px-3 py-1.5 border border-current text-current font-medium rounded-md hover:bg-black/10 transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
        
        {isSyncing && syncProgress.total > 0 && (
          <div className="mt-3 h-2 bg-white/30 rounded-full overflow-hidden">
            <div 
              className="h-full bg-current rounded-full transition-all duration-300"
              style={{ width: `${(syncProgress.sent / syncProgress.total) * 100}%` }}
            ></div>
          </div>
        )}
      </div>

      {/* Gestures to Sync */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-text">
            Gestos a Sincronizar ({gestures.length} / {deviceInfo?.capabilities.maxGestures || 50})
          </h2>
          {isLoadingGestures && (
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
          )}
        </div>

        {gestures.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-16 h-16 mx-auto text-text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-text mb-1">Biblioteca vacía</h3>
            <p className="text-text-muted mb-4">No hay gestos para sincronizar. Crea algunos gestos primero.</p>
            <a href="/gestures/new" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Crear Gesto
            </a>
          </div>
        ) : (
          <div className="divide-y divide-border max-h-96 overflow-y-auto">
            {gestures.map((gesture) => (
              <div 
                key={gesture.id} 
                className="p-4 hover:bg-gray-50 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="p-2 rounded-lg bg-primary-light text-primary flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-text truncate">{gesture.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-sm text-text-muted">
                      <span className="font-mono">ID: {gesture.id}</span>
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">Pista: {gesture.audioTrack}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Capacity Warning */}
        {deviceInfo && gestures.length > deviceInfo.capabilities.maxGestures && (
          <div className="p-4 bg-error-light border-t border-error/20">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="font-medium text-error">Capacidad excedida</p>
                <p className="text-sm text-error/80">
                  Tienes {gestures.length} gestos pero el dispositivo solo soporta {deviceInfo.capabilities.maxGestures}.
                  Elimina algunos gestos antes de sincronizar.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sync Action */}
      {isConnected && firmwareState === 'IDLE' && gestures.length > 0 && !isSyncing && !syncIsComplete && (
        <div className="bg-surface rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold text-text mb-4">Iniciar Sincronización</h3>
          
          <div className="space-y-3 text-sm text-text-muted">
            <p>Esta operación realizará un <strong>reemplazo completo</strong> de la biblioteca en MITTEN:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Los gestos nuevos se agregarán</li>
              <li>Los gestos modificados se actualizarán</li>
              <li>Los gestos eliminados se quitarán del dispositivo</li>
              <li>La biblioteca anterior se conservará hasta confirmar la nueva</li>
            </ul>
            
            {hasUnsyncedChanges() && (
              <p className="text-warning font-medium">
                ⚠ Hay cambios sin sincronizar desde la última sincronización.
              </p>
            )}
          </div>

          <button
            onClick={handleSync}
            disabled={deviceInfo ? gestures.length > deviceInfo.capabilities.maxGestures : false}
            className="mt-4 w-full sm:w-auto px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {syncInitiated ? 'Sincronizando...' : 'Sincronizar Ahora'}
          </button>
        </div>
      )}

      {/* Sync Complete */}
      {syncIsComplete && (
        <div className="bg-success-light border border-success p-6 rounded-lg text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success text-white mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-success mb-2">¡Sincronización Exitosa!</h3>
          <p className="text-success/80 mb-4">
            Tu biblioteca ha sido transferida correctamente a MITTEN.
            El dispositivo ahora tiene {activeProfile?.gestureCount || gestures.length} gestos activos.
          </p>
          <p className="text-sm text-success/70">
            Recuerda: los archivos de audio (MP3) deben prepararse por separado en la microSD del DFPlayer Mini.
          </p>
        </div>
      )}

      {/* Error State */}
      {syncError && !isSyncing && (
        <div className="bg-error-light border border-error p-6 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-xl">✕</span>
            <div className="flex-1">
              <h3 className="font-semibold text-error mb-1">Error en la Sincronización</h3>
              <p className="text-error/80 mb-4">{syncError}</p>
              <div className="flex gap-2">
                <button
                  onClick={handleSync}
                  className="px-4 py-2 bg-error text-white font-medium rounded-md hover:bg-error/90 transition-colors"
                >
                  Reintentar
                </button>
                <button
                  onClick={clearSyncState}
                  className="px-4 py-2 border border-error text-error font-medium rounded-md hover:bg-error-light transition-colors"
                >
                  Limpiar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Section */}
      <details className="bg-gray-50 rounded-lg p-4">
        <summary className="cursor-pointer font-medium text-text hover:text-primary">
          Información sobre la sincronización
        </summary>
        <div className="mt-3 space-y-2 text-sm text-text-muted">
          <p><strong>Protocolo:</strong> MITTEN V2 usa sincronización transaccional (sync.begin → sync.gesture × N → sync.commit)</p>
          <p><strong>Reemplazo completo:</strong> La sincronización siempre reemplaza toda la biblioteca en el dispositivo</p>
          <p><strong>Perfil anterior:</strong> Se conserva hasta que el commit sea exitoso</p>
          <p><strong>Audio:</strong> Los archivos MP3 se preparan por separado en la microSD (carpeta /mp3/)</p>
          <p><strong>audioTrack:</strong> Asignado automáticamente (1-50, first-fit) al crear el gesto en el backend</p>
        </div>
      </details>
    </div>
  );
}