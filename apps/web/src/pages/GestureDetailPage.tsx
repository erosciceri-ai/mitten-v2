import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { useToast } from '../components/ToastContainer';
import { Button } from '../components/ui/button';
import { StatusBadge } from '../components/ui/mitten-ui';
import { getGestureById, updateGesture, deleteGesture, generateGestureAudio, getGestureAudioInfo, getGestureAudioBlob } from '../services/api';
import type { Gesture, GestureResponse, GestureData, FormErrors, GestureAudioInfo } from '../types';

export function GestureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [gesture, setGesture] = useState<GestureResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Audio state
  const [audioInfo, setAudioInfo] = useState<GestureAudioInfo | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');

  const gestureId = id ? parseInt(id, 10) : null;

  const fetchGesture = async () => {
    if (!gestureId) return;
    setIsLoading(true);
    try {
      const data = await getGestureById(gestureId);
      setGesture(data);
      setEditName(data.name);
      await fetchAudioInfo();
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error al cargar gesto'
      });
      navigate('/gestures');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAudioInfo = async () => {
    if (!gestureId) return;
    try {
      const info = await getGestureAudioInfo(gestureId);
      setAudioInfo(info);

    } catch (error) {
      setAudioInfo(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setAudioUrl(null);
    if (gestureId && audioInfo?.filePath) {
      getGestureAudioBlob(gestureId).then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl);
      }).catch(error => {
        if (!cancelled) showToast({ type: 'error', message: error instanceof Error ? error.message : 'Error al cargar audio' });
      });
    }
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [gestureId, audioInfo]);

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
        message: error instanceof Error ? error.message : 'Error al generar audio'
      });
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  useEffect(() => {
    fetchGesture();
  }, [gestureId]);

  const validateForm = () => {
    const newErrors: FormErrors = {};
    if (!editName.trim()) newErrors.name = 'El nombre es requerido';
    else if (Array.from(editName).length > 60) newErrors.name = 'El nombre no puede exceder 60 caracteres';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUpdate = async () => {
    if (!gestureId || !validateForm()) return;
    setIsSaving(true);
    try {
      await updateGesture(gestureId, { name: editName.trim() });
      showToast({ type: 'success', message: 'Gesto actualizado correctamente' });
      fetchGesture();
      setIsEditing(false);
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error al actualizar'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!gestureId || !gesture) return;
    if (!confirm(`¿Eliminar el gesto "${gesture.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteGesture(gestureId);
      showToast({ type: 'success', message: 'Gesto eliminado correctamente' });
      navigate('/gestures');
    } catch (error) {
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error al eliminar'
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
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent" aria-hidden="true"></div>
        <span className="sr-only">Cargando gesto…</span>
      </div>
    );
  }

  if (!gesture) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-text-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="text-lg font-medium text-text mb-1">Gesto no encontrado</h3>
        <p className="text-text-muted">El gesto solicitado no existe o fue eliminado</p>
        <Button asChild className="mt-4"><Link to="/gestures">Volver a la biblioteca</Link></Button>
      </div>
    );
  }

  const dataPreview = formatDataPreview(gesture.data);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon"><Link to="/gestures" aria-label="Volver a la biblioteca"><ArrowLeft aria-hidden="true" /></Link></Button>
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-text text-balance">{gesture.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-text-muted">
              <StatusBadge tone="primary">Pista de audio {gesture.audioTrack}</StatusBadge>
              <StatusBadge tone="success">Guardado</StatusBadge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)}>
            {isEditing ? 'Cancelar' : 'Editar'}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>{isDeleting ? 'Eliminando…' : 'Eliminar'}</Button>
        </div>
      </div>

      {/* Edit Form */}
      {isEditing && (
        <div className="app-panel p-6">
          <h2 className="text-lg font-semibold text-text mb-4">Editar Nombre</h2>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label htmlFor="edit-name" className="block text-sm font-medium text-text mb-1">
                Nombre <span className="text-error">*</span>
              </label>
              <input
                id="edit-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={60}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? 'edit-name-error' : 'edit-name-help'}
                className="app-field"
              />
              {errors.name && <p id="edit-name-error" className="mt-1 text-sm text-error" role="alert">{errors.name}</p>}
              <p id="edit-name-help" className="mt-1 text-sm text-text-muted tabular-nums">{Array.from(editName).length}/60 caracteres</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleUpdate} disabled={isSaving}>{isSaving ? 'Guardando…' : 'Guardar'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Gesture Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="app-panel p-6">
          <h3 className="text-lg font-semibold text-text mb-4">Información del gesto</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-text-muted">Identificador</dt>
              <dd className="font-mono font-medium">{gesture.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Pista de audio</dt>
              <dd className="font-mono font-medium">{gesture.audioTrack}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Archivo en la microSD</dt>
              <dd className="font-mono text-sm">/mp3/{gesture.audioTrack.toString().padStart(4, '0')}.mp3</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Creado</dt>
              <dd>{new Date(gesture.createdAt).toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Actualizado</dt>
              <dd>{new Date(gesture.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        <div className="app-panel p-6">
          <h3 className="text-lg font-semibold text-text mb-4">Voz del gesto</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Estado</span>
              {audioInfo?.filePath ? (
                <StatusBadge tone="success">Generado</StatusBadge>
              ) : (
                <StatusBadge tone="warning">Pendiente</StatusBadge>
              )}
            </div>
            {audioInfo?.generatedAt && (
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Generado</span>
                <span className="font-mono text-sm">{new Date(audioInfo.generatedAt).toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-text-muted">Pista</span>
              <span className="font-mono">#{gesture.audioTrack}</span>
            </div>
            <Button className="w-full" onClick={handleGenerateAudio} disabled={isGeneratingAudio}>
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
            {audioUrl && (
              <div className="flex items-center gap-2 rounded-md bg-mist p-2">
                <audio controls src={audioUrl} className="flex-1" />
                <a
                  href={audioUrl}
                  download={`${gesture.name}.mp3`}
                  className="px-2 py-1 text-sm text-primary hover:underline"
                >
                  Descargar
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gesture Data Details */}
      <details className="app-panel p-6">
        <summary className="cursor-pointer text-lg font-semibold text-text hover:text-primary">Detalles técnicos de la captura</summary>
        <p className="text-text-muted mb-4">
          Versión {gesture.data.version} • {gesture.data.dimensions} dimensiones • {gesture.data.sampleCount} muestras
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(dataPreview).map(([key, value]) => (
            <div key={key} className="rounded-lg bg-mist p-4">
              <dt className="text-sm text-text-muted mb-1">{key}</dt>
              <dd className="font-mono text-sm text-text break-all">{String(value)}</dd>
            </div>
          ))}
        </div>

        {/* Summary Statistics */}
        <div className="mt-6">
          <h4 className="font-medium text-text mb-3">Estadísticas por sensor</h4>
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
                    <td className="py-2 text-right font-mono">{gesture.data.summary.min[i].toFixed(i < 5 ? 0 : 1)}</td>
                    <td className="py-2 text-right font-mono">{gesture.data.summary.max[i].toFixed(i < 5 ? 0 : 1)}</td>
                    <td className="py-2 text-right font-mono">{gesture.data.summary.mean[i].toFixed(i < 5 ? 0 : 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Raw Samples (first 5) */}
        <details className="mt-6">
          <summary className="cursor-pointer font-medium text-text hover:text-primary">
            Ver las primeras 5 muestras sin procesar
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="pb-2 pr-3">#</th>
                  {gesture.data.dimensionOrder.map((dim, i) => (
                    <th key={dim} className="pb-2 pr-3 text-right">{dim}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gesture.data.samples.slice(0, 5).map((sample, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 text-text-muted">{rowIdx + 1}</td>
                    {(sample as number[]).map((val, colIdx) => (
                      <td key={colIdx} className="py-1.5 pr-3 text-right">
                        {colIdx < 5 ? val.toFixed(0) : val.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {gesture.data.samples.length > 5 && (
              <p className="mt-2 text-sm text-text-muted">
                Y {gesture.data.samples.length - 5} muestras más...
              </p>
            )}
          </div>
        </details>
      </details>
    </div>
  );
}
