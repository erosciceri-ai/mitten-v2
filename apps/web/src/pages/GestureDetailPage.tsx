import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useToast } from '../components/ToastContainer';
import { getGestureById, updateGesture, deleteGesture, generateGestureAudio, getGestureAudioInfo, getGestureAudioBlob } from '../services/api';
import { validateGestureData } from '@mitten/contracts';
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
        <Link to="/gestures" className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover transition-colors">
          Volver a la biblioteca
        </Link>
      </div>
    );
  }

  const dataPreview = formatDataPreview(gesture.data);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/gestures" className="p-2 rounded-md text-text-muted hover:bg-gray-100 hover:text-text transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-text">{gesture.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-text-muted">
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-medium">Pista de audio {gesture.audioTrack}</span>
              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">Guardado</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="px-3 py-1.5 border border-border text-text font-medium rounded-md hover:bg-gray-50 transition-colors"
          >
            {isEditing ? 'Cancelar' : 'Editar'}
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-3 py-1.5 bg-error text-white font-medium rounded-md hover:bg-error/90 disabled:opacity-50 transition-colors"
          >
            {isDeleting ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>

      {/* Edit Form */}
      {isEditing && (
        <div className="bg-surface rounded-lg border border-border p-6">
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
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${
                  errors.name ? 'border-error' : 'border-border'
                }`}
              />
              {errors.name && <p id="edit-name-error" className="mt-1 text-sm text-error" role="alert">{errors.name}</p>}
              <p id="edit-name-help" className="mt-1 text-sm text-text-muted tabular-nums">{Array.from(editName).length}/60 caracteres</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpdate}
                disabled={isSaving}
                className="px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gesture Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface rounded-lg border border-border p-6">
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

        <div className="bg-surface rounded-lg border border-border p-6">
          <h3 className="text-lg font-semibold text-text mb-4">Voz del gesto</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-text-muted">Estado</span>
              {audioInfo?.filePath ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-800 text-sm font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                  Generado
                </span>
              ) : (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-sm font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                  Pendiente
                </span>
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
            <button
              onClick={handleGenerateAudio}
              disabled={isGeneratingAudio}
              className="w-full px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {isGeneratingAudio ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generando…
                </>
              ) : audioInfo?.filePath ? (
                'Regenerar audio'
              ) : (
                'Generar audio'
              )}
            </button>
            {audioUrl && (
              <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
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
      <details className="bg-surface rounded-lg border border-border p-6">
        <summary className="cursor-pointer text-lg font-semibold text-text hover:text-primary">Detalles técnicos de la captura</summary>
        <p className="text-text-muted mb-4">
          Versión {gesture.data.version} • {gesture.data.dimensions} dimensiones • {gesture.data.sampleCount} muestras
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(dataPreview).map(([key, value]) => (
            <div key={key} className="bg-gray-50 rounded-lg p-4">
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
