import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, LoaderCircle, RotateCcw } from 'lucide-react';
import { useToast } from '../components/ToastContainer';
import { ConfirmDialog } from '../components/ui/alert-dialog';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/field';
import { Notice, StatusBadge } from '../components/ui/mitten-ui';
import {
  ApiError,
  deleteGesture,
  generateGestureAudio,
  getGestureAudioBlob,
  getGestureAudioInfo,
  getGestureById,
  updateGesture,
} from '../services/api';
import type { FormErrors, GestureAudioInfo, GestureData, GestureResponse } from '../types';

export function GestureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [gesture, setGesture] = useState<GestureResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Audio state
  const [audioInfo, setAudioInfo] = useState<GestureAudioInfo | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoadingAudioBlob, setIsLoadingAudioBlob] = useState(false);
  const [audioBlobError, setAudioBlobError] = useState<string | null>(null);
  const [audioRetryToken, setAudioRetryToken] = useState(0);

  // Edit form state
  const [editName, setEditName] = useState('');

  const gestureId = id && /^\d+$/.test(id) ? Number(id) : null;

  const fetchAudioInfo = useCallback(async () => {
    if (!gestureId) return;
    try {
      const info = await getGestureAudioInfo(gestureId);
      setAudioInfo(info);
    } catch {
      setAudioInfo(null);
    }
  }, [gestureId]);

  const fetchGesture = useCallback(async () => {
    if (!gestureId) {
      setGesture(null);
      setLoadError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getGestureById(gestureId);
      setGesture(data);
      setEditName(data.name);
      await fetchAudioInfo();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setGesture(null);
        setLoadError(null);
      } else {
        const message = error instanceof Error ? error.message : 'Error al cargar gesto';
        setLoadError(message);
        showToast({ type: 'error', message });
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchAudioInfo, gestureId, showToast]);

  useEffect(() => {
    void fetchGesture();
  }, [fetchGesture]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setAudioUrl(null);
    setAudioBlobError(null);

    if (gestureId && audioInfo?.filePath) {
      setIsLoadingAudioBlob(true);
      getGestureAudioBlob(gestureId)
        .then((blob) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          setAudioUrl(objectUrl);
        })
        .catch((error) => {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : 'Error al cargar audio';
            setAudioBlobError(message);
            showToast({ type: 'error', message });
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoadingAudioBlob(false);
        });
    } else {
      setIsLoadingAudioBlob(false);
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [gestureId, audioInfo, audioRetryToken, showToast]);

  const handleGenerateAudio = async () => {
    if (!gestureId) return;
    setIsGeneratingAudio(true);
    try {
      await generateGestureAudio(gestureId);
      showToast({ type: 'success', message: 'Audio generado correctamente' });
      await fetchAudioInfo();
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error al generar audio',
      });
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const validateForm = () => {
    const newErrors: FormErrors = {};
    if (!editName.trim()) newErrors.name = 'El nombre es requerido';
    else if (Array.from(editName).length > 60) newErrors.name = 'El nombre no puede exceder 60 caracteres';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleToggleEdit = () => {
    if (!gesture) return;
    setEditName(gesture.name);
    setErrors({});
    setIsEditing((prev) => !prev);
  };

  const handleUpdate = async () => {
    if (!gestureId || !validateForm()) return;
    setIsSaving(true);
    try {
      await updateGesture(gestureId, { name: editName.trim() });
      showToast({ type: 'success', message: 'Gesto actualizado correctamente' });
      await fetchGesture();
      setIsEditing(false);
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error al actualizar',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!gestureId || !gesture) return;
    setIsDeleting(true);
    try {
      await deleteGesture(gestureId);
      setConfirmDeleteOpen(false);
      showToast({ type: 'success', message: 'Gesto eliminado correctamente' });
      navigate('/gestures');
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error al eliminar',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDataPreview = (data: GestureData) => {
    return {
      'Versión': data.version,
      'Dimensiones': data.dimensions,
      'Muestras': data.sampleCount,
      'Duración (ms)': data.captureDurationMs,
      'Período (ms)': data.samplingPeriodMs,
      'Unidades Flex': data.units.flex,
      'Unidades MPU': data.units.mpu,
      'Rango Flex': `${data.summary.min[0]}–${data.summary.max[0]} (media: ${data.summary.mean[0].toFixed(1)})`,
      'Rango MPU X': `${data.summary.min[5].toFixed(1)}–${data.summary.max[5].toFixed(1)} (media: ${data.summary.mean[5].toFixed(1)})`,
      'Rango MPU Y': `${data.summary.min[6].toFixed(1)}–${data.summary.max[6].toFixed(1)} (media: ${data.summary.mean[6].toFixed(1)})`,
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" aria-hidden="true" />
        <span className="sr-only">Cargando gesto…</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 py-8">
        <Notice
          tone="error"
          title="No se pudo cargar el gesto"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void fetchGesture()}>
                <RotateCcw aria-hidden="true" />
                Reintentar
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/gestures">Volver a la biblioteca</Link>
              </Button>
            </div>
          }
        >
          {loadError}
        </Notice>
      </div>
    );
  }

  if (!gesture) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h1 className="text-2xl font-bold text-text mb-2">Gesto no encontrado</h1>
        <p className="text-text-muted">El gesto solicitado no existe o fue eliminado.</p>
        <Button asChild className="mt-5">
          <Link to="/gestures">Volver a la biblioteca</Link>
        </Button>
      </div>
    );
  }

  const dataPreview = formatDataPreview(gesture.data);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Button asChild variant="ghost" size="icon">
            <Link to="/gestures" aria-label="Volver a la biblioteca">
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-text text-balance break-words">
              {gesture.name}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-text-muted">
              <StatusBadge tone="primary">Pista de audio {gesture.audioTrack}</StatusBadge>
              <StatusBadge tone="success">Guardado</StatusBadge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={handleToggleEdit}>
            {isEditing ? 'Cancelar' : 'Editar'}
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDeleteOpen(true)} disabled={isDeleting}>
            {isDeleting ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </div>
      </div>

      {/* Edit Form */}
      {isEditing && (
        <section className="app-panel p-6" aria-labelledby="edit-gesture-title">
          <h2 id="edit-gesture-title" className="text-lg font-semibold text-text mb-4">Editar nombre</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleUpdate();
            }}
            noValidate
            className="flex flex-col sm:flex-row gap-4 items-start sm:items-end"
          >
            <div className="w-full flex-1">
              <FormField
                id="edit-name"
                label="Nombre"
                required
                error={errors.name}
                helpText={<span className="tabular-nums">{Array.from(editName).length}/60 caracteres</span>}
              >
                <input
                  id="edit-name"
                  name="name"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={60}
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'edit-name-error' : 'edit-name-help'}
                  className="app-field"
                />
              </FormField>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={handleToggleEdit} disabled={isSaving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Gesture Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="app-panel p-6" aria-labelledby="gesture-metadata-title">
          <h2 id="gesture-metadata-title" className="text-lg font-semibold text-text mb-4">Información del gesto</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Identificador</dt>
              <dd className="font-mono font-medium tabular-nums">{gesture.id}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Pista de audio</dt>
              <dd className="font-mono font-medium tabular-nums">{gesture.audioTrack}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Archivo en la microSD</dt>
              <dd className="font-mono text-xs sm:text-sm break-all text-right">
                /mitten_audio/audio/{gesture.audioTrack.toString().padStart(4, '0')}.wav
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Creado</dt>
              <dd className="text-right">{new Date(gesture.createdAt).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Actualizado</dt>
              <dd className="text-right">{new Date(gesture.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </section>

        <section className="app-panel p-6" aria-labelledby="gesture-voice-title">
          <h2 id="gesture-voice-title" className="text-lg font-semibold text-text mb-4">Voz del gesto</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Estado</span>
              {audioInfo?.filePath ? (
                <StatusBadge tone="success">Generado</StatusBadge>
              ) : (
                <StatusBadge tone="warning">Pendiente</StatusBadge>
              )}
            </div>
            {audioInfo?.generatedAt && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-text-muted">Generado</span>
                <span className="font-mono text-xs sm:text-sm text-right">{new Date(audioInfo.generatedAt).toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-text-muted">Pista</span>
              <span className="font-mono tabular-nums">#{gesture.audioTrack}</span>
            </div>
            <Button type="button" className="w-full" onClick={handleGenerateAudio} disabled={isGeneratingAudio}>
              {isGeneratingAudio ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Generando…
                </>
              ) : audioInfo?.filePath ? (
                'Regenerar audio'
              ) : (
                'Generar audio'
              )}
            </Button>
            {isLoadingAudioBlob ? (
              <p className="text-xs text-text-muted" role="status">Cargando vista previa de audio…</p>
            ) : audioBlobError ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-error/30 bg-error-light p-2.5 text-xs text-error" role="alert">
                <span>{audioBlobError}</span>
                <Button type="button" variant="outline" size="xs" onClick={() => setAudioRetryToken((t) => t + 1)}>
                  Reintentar
                </Button>
              </div>
            ) : audioUrl ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-mist p-2">
                <audio controls src={audioUrl} className="min-w-0 flex-1" />
                <a
                  href={audioUrl}
                  download={`${gesture.name}.mp3`}
                  className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-primary-text hover:underline"
                >
                  Descargar
                </a>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* Gesture Data Details */}
      <details className="app-panel p-6">
        <summary className="flex min-h-11 cursor-pointer items-center text-lg font-semibold text-text hover:text-primary-text">
          Detalles técnicos de la captura
        </summary>
        <p className="text-text-muted mt-2 mb-4 text-sm">
          Versión {gesture.data.version} • {gesture.data.dimensions} dimensiones • {gesture.data.sampleCount} muestras
        </p>

        <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(dataPreview).map(([key, value]) => (
            <div key={key} className="rounded-lg bg-mist p-4">
              <dt className="text-sm text-text-muted mb-1">{key}</dt>
              <dd className="font-mono text-sm text-text break-all">{String(value)}</dd>
            </div>
          ))}
        </dl>

        {/* Summary Statistics */}
        <div className="mt-6">
          <h3 className="font-medium text-text mb-3">Estadísticas por sensor</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="pb-2 font-medium">Dimensión</th>
                  <th className="pb-2 font-medium text-right">Mín</th>
                  <th className="pb-2 font-medium text-right">Máx</th>
                  <th className="pb-2 font-medium text-right">Media</th>
                </tr>
              </thead>
              <tbody>
                {gesture.data.dimensionOrder.map((dim, i) => (
                  <tr key={dim} className="border-b border-border/50">
                    <td className="py-2 font-medium text-text">{dim}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{gesture.data.summary.min[i].toFixed(i < 5 ? 0 : 1)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{gesture.data.summary.max[i].toFixed(i < 5 ? 0 : 1)}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{gesture.data.summary.mean[i].toFixed(i < 5 ? 0 : 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Raw Samples (first 5) */}
        <details className="mt-6">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium text-text hover:text-primary-text">
            Ver las primeras 5 muestras sin procesar
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="pb-2 pr-3">#</th>
                  {gesture.data.dimensionOrder.map((dim) => (
                    <th key={dim} className="pb-2 pr-3 text-right">{dim}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gesture.data.samples.slice(0, 5).map((sample, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 text-text-muted">{rowIdx + 1}</td>
                    {(sample as number[]).map((val, colIdx) => (
                      <td key={colIdx} className="py-1.5 pr-3 text-right tabular-nums">
                        {colIdx < 5 ? val.toFixed(0) : val.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {gesture.data.samples.length > 5 && (
              <p className="mt-2 text-sm text-text-muted">
                Y {gesture.data.samples.length - 5} muestras más…
              </p>
            )}
          </div>
        </details>
      </details>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setConfirmDeleteOpen(false);
        }}
        title={`¿Eliminar el gesto «${gesture.name}»?`}
        description="Esta acción no se puede deshacer. El gesto y su audio asociado se eliminarán de tu biblioteca."
        confirmLabel={isDeleting ? 'Eliminando…' : 'Eliminar gesto'}
        destructive
        isLoading={isDeleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
