import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/ToastContainer';
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Biblioteca de Gestos</h1>
          <p className="text-text-muted mt-1">{total} / 50 gestos</p>
        </div>
        <Link 
          to="/gestures/new" 
          className="px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover transition-colors inline-flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Gesto
        </Link>
      </div>

      {/* Search */}
      {!isLoading && gestures.length > 0 && <div className="bg-surface rounded-lg border border-border p-4">
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar gestos por nombre..."
            aria-label="Buscar gestos por nombre"
            className="w-full pl-10 pr-4 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>}

      {/* Gestures List */}
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent mx-auto mb-4" aria-hidden="true"></div>
            <p className="text-text-muted">Cargando gestos...</p>
          </div>
        ) : filteredGestures.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="w-16 h-16 mx-auto text-text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-text mb-1">{searchQuery ? 'No se encontraron gestos' : 'Biblioteca vacía'}</h3>
            <p className="text-text-muted">
              {searchQuery ? 'Intenta con otro término de búsqueda' : 'Crea tu primer gesto para empezar'}
            </p>
            {!searchQuery && (
              <Link to="/gestures/new" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Crear Gesto
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredGestures.map((gesture) => (
              <div key={gesture.id} className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50 transition-colors">
                <Link to={`/gestures/${gesture.id}`} className="flex items-center gap-4 min-w-0 flex-1 text-text">
                  <div className="p-3 rounded-lg bg-primary-light text-primary flex-shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v5c0 4.4-3.6 8-8 8h-1a7 7 0 0 1-6.2-3.7L2.5 15A1.7 1.7 0 0 1 5 12.8L7 15" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-text truncate">{gesture.name}</h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-text-muted">
                      <span>Pista de audio {gesture.audioTrack}</span>
                      <span className="text-xs">Creado el {new Date(gesture.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDelete(gesture.id, gesture.name);
                    }}
                    disabled={deletingId === gesture.id}
                    className="p-2 rounded-md text-text-muted hover:text-error hover:bg-error-light transition-colors disabled:opacity-50"
                    aria-label={`Eliminar ${gesture.name}`}
                  >
                    {deletingId === gesture.id ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
