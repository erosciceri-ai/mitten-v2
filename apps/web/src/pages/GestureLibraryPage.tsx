import { useState, useEffect } from 'react';
import { Hand, LoaderCircle, Plus, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/ToastContainer';
import { Button } from '../components/ui/button';
import { EmptyState, PageHeader, Panel } from '../components/ui/mitten-ui';
import { getGestures, deleteGesture } from '../services/api';
import type { GestureResponse, GestureListResponse } from '../types';

export function GestureLibraryPage() {
  const { showToast } = useToast();
  const [gestures, setGestures] = useState<GestureResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchGestures = async () => {
    setIsLoading(true);
    try {
      const response: GestureListResponse = await getGestures();
      setGestures(response.gestures as GestureResponse[]);
      setTotal(response.total);
    } catch (error) {
      showToast({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Error al cargar gestos' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGestures();
  }, []);

  const filteredGestures = gestures.filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`¿Eliminar el gesto "${name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteGesture(id);
      showToast({ type: 'success', message: 'Gesto eliminado correctamente' });
      fetchGestures();
    } catch (error) {
      showToast({ 
        type: 'error', 
        message: error instanceof Error ? error.message : 'Error al eliminar gesto' 
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader eyebrow="Perfil personal" title="Biblioteca de gestos" description={`${total} de 50 gestos disponibles en tu cuenta.`} actions={<Button asChild><Link to="/gestures/new"><Plus aria-hidden="true" />Nuevo gesto</Link></Button>} />

      {!isLoading && gestures.length > 0 ? <div className="relative max-w-md"><Search className="absolute left-3.5 top-1/2 z-10 size-5 -translate-y-1/2 text-text-muted" aria-hidden="true" /><input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar por nombre…" aria-label="Buscar gestos por nombre" className="app-field app-field-search" /></div> : null}

      <Panel>
        {isLoading ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-text-muted" role="status" aria-live="polite"><LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" /><p>Cargando gestos…</p></div>
        ) : filteredGestures.length === 0 ? (
          <EmptyState icon={<Hand className="size-6" />} title={searchQuery ? 'No encontramos coincidencias' : 'Tu biblioteca está vacía'} description={searchQuery ? 'Probá con otro nombre o borrá la búsqueda.' : 'Enseñá un movimiento para asociarlo con una frase hablada.'} action={!searchQuery ? <Button asChild><Link to="/gestures/new"><Plus aria-hidden="true" />Crear gesto</Link></Button> : undefined} />
        ) : (
          <div className="divide-y divide-border">
            {filteredGestures.map((gesture) => (
              <div key={gesture.id} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-mist/60 sm:px-5">
                <Link to={`/gestures/${gesture.id}`} className="flex min-h-12 min-w-0 flex-1 items-center gap-4 text-text">
                  <div className="grid size-11 flex-shrink-0 place-items-center rounded-lg bg-primary-light text-primary"><Hand className="size-5" aria-hidden="true" /></div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-text">{gesture.name}</h3>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
                      <span>Pista de audio {gesture.audioTrack}</span>
                      <span className="text-xs">Creado el {new Date(gesture.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </Link>
                <Button variant="ghost" size="icon" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(gesture.id, gesture.name); }} disabled={deletingId === gesture.id} aria-label={`Eliminar ${gesture.name}`}>{deletingId === gesture.id ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}</Button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
