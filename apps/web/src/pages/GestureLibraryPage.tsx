import { useCallback, useEffect, useState } from 'react';
import { Hand, LoaderCircle, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/ToastContainer';
import { ConfirmDialog } from '../components/ui/alert-dialog';
import { Button } from '../components/ui/button';
import { EmptyState, Notice, PageHeader, Panel, StatusBadge } from '../components/ui/mitten-ui';
import { Skeleton } from '../components/ui/skeleton';
import { deleteGesture, getGestureAudioInfo, getGestures } from '../services/api';
import type { GestureListResponse, GestureResponse } from '../types';

export function GestureLibraryPage() {
  const { showToast } = useToast();
  const [gestures, setGestures] = useState<GestureResponse[]>([]);
  const [audioReadyById, setAudioReadyById] = useState<Record<number, boolean>>({});
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const fetchGestures = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response: GestureListResponse = await getGestures();
      const loaded = response.gestures as GestureResponse[];
      setGestures(loaded);
      setTotal(response.total);

      const audioInfos = await Promise.allSettled(loaded.map((g) => getGestureAudioInfo(g.id)));
      const nextAudioMap: Record<number, boolean> = {};
      loaded.forEach((gesture, index) => {
        const result = audioInfos[index];
        nextAudioMap[gesture.id] = result?.status === 'fulfilled' && Boolean(result.value.filePath);
      });
      setAudioReadyById(nextAudioMap);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al cargar gestos';
      setLoadError(message);
      showToast({ type: 'error', message });
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void fetchGestures();
  }, [fetchGestures]);

  const filteredGestures = gestures.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeletingId(id);
    try {
      await deleteGesture(id);
      setDeleteTarget(null);
      showToast({ type: 'success', message: 'Gesto eliminado correctamente' });
      await fetchGestures();
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error al eliminar gesto',
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Perfil personal"
        title="Biblioteca de gestos"
        description={`${total} de 50 gestos disponibles en tu cuenta.`}
        actions={
          <Button asChild>
            <Link to="/gestures/new">
              <Plus aria-hidden="true" />
              Nuevo gesto
            </Link>
          </Button>
        }
      />

      {!isLoading && !loadError && gestures.length > 0 ? (
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            id="gesture-search"
            name="search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nombre…"
            aria-label="Buscar gestos por nombre"
            className="app-field app-field-search"
          />
        </div>
      ) : null}

      <Panel>
        {isLoading ? (
          <div className="divide-y divide-border p-4 sm:p-5" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">Cargando gestos…</span>
            {[0, 1, 2].map((item) => (
              <div key={item} className="flex items-center justify-between gap-4 py-4 first:pt-1 last:pb-1">
                <div className="flex flex-1 items-center gap-4">
                  <Skeleton className="size-11 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-56" />
                  </div>
                </div>
                <Skeleton className="size-11 shrink-0 rounded-lg" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="p-5">
            <Notice
              tone="error"
              title="No se pudo cargar tu biblioteca"
              actions={
                <Button type="button" variant="outline" onClick={() => void fetchGestures()}>
                  <RotateCcw aria-hidden="true" />
                  Reintentar
                </Button>
              }
            >
              {loadError}
            </Notice>
          </div>
        ) : filteredGestures.length === 0 ? (
          <EmptyState
            icon={<Hand className="size-6" />}
            title={searchQuery ? 'No encontramos coincidencias' : 'Tu biblioteca está vacía'}
            description={searchQuery ? 'Probá con otro nombre o borrá la búsqueda.' : 'Enseñá un movimiento para asociarlo con una frase hablada.'}
            action={
              !searchQuery ? (
                <Button asChild>
                  <Link to="/gestures/new">
                    <Plus aria-hidden="true" />
                    Crear gesto
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y divide-border">
            {filteredGestures.map((gesture) => {
              const hasAudio = Boolean(audioReadyById[gesture.id]);
              return (
                <div key={gesture.id} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-mist/60 sm:px-5">
                  <Link to={`/gestures/${gesture.id}`} className="flex min-h-12 min-w-0 flex-1 items-center gap-4 text-text">
                    <div className="grid size-11 flex-shrink-0 place-items-center rounded-lg bg-primary-light text-primary-text">
                      <Hand className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-text">{gesture.name}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
                        <span className="font-mono text-xs">Pista de audio {gesture.audioTrack}</span>
                        <StatusBadge tone={hasAudio ? 'success' : 'warning'}>
                          {hasAudio ? 'MP3 listo' : 'Sin MP3'}
                        </StatusBadge>
                        <span className="text-xs">Creado el {new Date(gesture.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteTarget({ id: gesture.id, name: gesture.name });
                    }}
                    disabled={deletingId === gesture.id}
                    aria-label={`Eliminar ${gesture.name}`}
                  >
                    {deletingId === gesture.id ? (
                      <LoaderCircle className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 aria-hidden="true" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && deletingId === null) setDeleteTarget(null);
        }}
        title={deleteTarget ? `¿Eliminar el gesto «${deleteTarget.name}»?` : '¿Eliminar gesto?'}
        description="Esta acción no se puede deshacer. El gesto y su audio asociado se eliminarán de tu biblioteca."
        confirmLabel={deletingId !== null ? 'Eliminando…' : 'Eliminar gesto'}
        destructive
        isLoading={deletingId !== null}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
