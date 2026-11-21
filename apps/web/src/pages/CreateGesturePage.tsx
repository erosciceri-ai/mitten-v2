import { useEffect, useRef, useState } from 'react';
import { Check, CircleDot, Hand, LoaderCircle, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useDevice } from '../context/DeviceContext';
import { useToast } from '../components/ToastContainer';
import { Button } from '../components/ui/button';
import { FormField } from '../components/ui/field';
import { Notice, PageHeader, ProgressBar } from '../components/ui/mitten-ui';
import { createGesture } from '../services/api';
import { isWebSerialSupported } from '../utils/devicePresentation';
import type { FormErrors } from '../types';

const CAPTURE_PHASES = ['PREPARING', 'RECORDING', 'PROCESSING'] as const;
type CapturePhase = typeof CAPTURE_PHASES[number];

export function CreateGesturePage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const {
    deviceMode,
    isConnected,
    connectionStatus,
    firmwareState,
    isCapturing,
    capturePhase,
    captureProgress,
    captureError,
    capturedGestureData,
    startCapture,
    connect,
    clearCaptureState,
  } = useDevice();

  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captureStarted, setCaptureStarted] = useState(false);

  const isCapturingRef = useRef(isCapturing);
  isCapturingRef.current = isCapturing;
  const clearCaptureStateRef = useRef(clearCaptureState);
  clearCaptureStateRef.current = clearCaptureState;

  // Ensure entering or leaving /gestures/new never preserves stale capture data from another gesture.
  useEffect(() => {
    if (!isCapturingRef.current) {
      clearCaptureStateRef.current();
    }
    return () => {
      if (!isCapturingRef.current) {
        clearCaptureStateRef.current();
      }
    };
  }, []);

  // Reset local capture flag if connection drops before capture completes.
  useEffect(() => {
    if (!isConnected && !isCapturing && !capturedGestureData && captureStarted) {
      setCaptureStarted(false);
    }
  }, [isConnected, isCapturing, capturedGestureData, captureStarted]);

  // Validate name length inline
  useEffect(() => {
    if (Array.from(name).length > 60) {
      setErrors((prev) => ({ ...prev, name: 'El nombre no puede exceder 60 caracteres' }));
    } else if (name.length > 0) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.name;
        return next;
      });
    }
  }, [name]);

  const validateForm = () => {
    const newErrors: FormErrors = {};
    if (!name.trim()) newErrors.name = 'El nombre es requerido';
    else if (Array.from(name).length > 60) newErrors.name = 'El nombre no puede exceder 60 caracteres';
    if (!capturedGestureData) newErrors.capture = 'Debés capturar un gesto primero';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCapture = async () => {
    if (!isConnected) {
      showToast({ type: 'error', message: 'MITTEN no está conectado' });
      return;
    }

    if (firmwareState !== 'IDLE') {
      showToast({ type: 'warning', message: 'MITTEN está ocupado. Esperá a que vuelva a estar listo.' });
      return;
    }

    clearCaptureState();
    setCaptureStarted(true);

    try {
      await startCapture();
    } catch (error) {
      setCaptureStarted(false);
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Error al iniciar captura',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const response = await createGesture({
        name: name.trim(),
        data: capturedGestureData!,
      });

      clearCaptureState();
      setCaptureStarted(false);
      showToast({ type: 'success', message: 'Gesto creado correctamente' });
      navigate(`/gestures/${response.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al crear gesto';
      if (message.includes('Validation')) {
        showToast({ type: 'error', message: 'Datos de gesto inválidos' });
      } else {
        showToast({ type: 'error', message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetryCapture = () => {
    clearCaptureState();
    setCaptureStarted(false);
  };

  const getPhaseDescription = (phase: CapturePhase) => {
    switch (phase) {
      case 'PREPARING': return 'Preparando sensores…';
      case 'RECORDING': return 'Grabando gesto… Realizá el gesto ahora';
      case 'PROCESSING': return 'Procesando datos capturados…';
    }
  };

  const getPhaseLabel = (phase: CapturePhase) => {
    switch (phase) {
      case 'PREPARING': return 'Preparando';
      case 'RECORDING': return 'Realizá el gesto';
      case 'PROCESSING': return 'Procesando';
    }
  };

  const showUsbFallback = !isConnected && deviceMode === 'hardware' && !isWebSerialSupported();
  const isWaitingCapture = (captureStarted || isCapturing) && !capturedGestureData && !captureError;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader
        eyebrow="Aprendizaje"
        title="Enseñar un gesto"
        description="Registrá el movimiento y escribí la frase que MITTEN dirá."
      />

      {showUsbFallback ? (
        <Notice
          tone="warning"
          title="Este navegador no admite Web Serial por USB"
          actions={
            <Button asChild variant="outline" size="sm">
              <Link to="/app">Cambiar a Wi-Fi o Demostración</Link>
            </Button>
          }
        >
          Para conectar por cable USB necesitás Chrome o Edge en HTTPS. También podés usar Guante por Wi-Fi o probar el flujo en Modo demostración desde el Panel.
        </Notice>
      ) : !isConnected ? (
        <Notice
          tone="warning"
          title="MITTEN no está conectado"
          live
          actions={
            <Button
              size="sm"
              onClick={() => connect().catch(() => undefined)}
              disabled={connectionStatus === 'connecting' || connectionStatus === 'handshake'}
            >
              {connectionStatus === 'connecting' || connectionStatus === 'handshake' ? 'Conectando…' : 'Conectar MITTEN'}
            </Button>
          }
        >
          Conectá el guante para habilitar la captura.
        </Notice>
      ) : null}

      {/* Step 1: Capture Section */}
      <section className="app-panel p-6" aria-labelledby="capture-title">
        <p className="app-eyebrow">Paso 1 de 2</p>
        <h2 id="capture-title" className="mb-4 text-lg font-bold text-text">Captura del movimiento</h2>

        {isWaitingCapture ? (
          <div className="text-center py-8" role="status" aria-live="polite">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-light text-signal mb-4">
              {capturePhase ? (
                <span className="w-4 h-4 rounded-full bg-current animate-pulse" aria-hidden="true" />
              ) : (
                <LoaderCircle className="size-9 animate-spin" aria-hidden="true" />
              )}
            </div>
            <h3 className="text-lg font-medium text-text mb-2">
              {capturePhase ? getPhaseLabel(capturePhase) : 'Iniciando captura en MITTEN…'}
            </h3>
            <p className="text-text-muted mb-6">
              {capturePhase ? getPhaseDescription(capturePhase) : 'Esperando confirmación de los sensores del guante.'}
            </p>
            <div className="w-full max-w-md mx-auto">
              <ProgressBar value={captureProgress} label="Progreso de captura" />
              <p className="mt-2 text-sm text-text-muted tabular-nums">{captureProgress}%</p>
            </div>
          </div>
        ) : capturedGestureData && !isCapturing ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success-light text-success mb-4">
              <Check className="size-10" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-medium text-text mb-2">Captura completada</h3>
            <p className="text-text-muted mb-6">
              Se capturaron {capturedGestureData.sampleCount} muestras en {capturedGestureData.captureDurationMs}ms
            </p>

            <div className="rounded-lg bg-mist p-4 text-left max-w-md mx-auto mb-6">
              <p className="text-sm font-medium text-text mb-2">Datos del gesto:</p>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-muted">Muestras:</dt>
                  <dd className="font-mono tabular-nums">{capturedGestureData.sampleCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">Duración:</dt>
                  <dd className="font-mono tabular-nums">{capturedGestureData.captureDurationMs}ms</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">Período:</dt>
                  <dd className="font-mono tabular-nums">{capturedGestureData.samplingPeriodMs}ms</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">Dimensiones:</dt>
                  <dd className="font-mono tabular-nums">{capturedGestureData.dimensions}</dd>
                </div>
              </dl>
            </div>

            <div className="flex justify-center gap-3">
              <Button type="button" variant="outline" onClick={handleRetryCapture}>Repetir captura</Button>
            </div>
          </div>
        ) : captureError ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-error-light text-error mb-4">
              <X className="size-10" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-medium text-text mb-2">Error en la captura</h3>
            <p className="text-text-muted mb-6">{captureError}</p>
            <Button type="button" onClick={handleRetryCapture}>Reintentar</Button>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-light text-primary-text mb-4">
              <Hand className="size-10" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-medium text-text mb-2">Iniciar captura</h3>
            <p className="text-text-muted mb-6">Presioná el botón y realizá el gesto con el guante.</p>
            <Button type="button" size="lg" onClick={handleCapture} disabled={!isConnected || firmwareState !== 'IDLE' || isCapturing}>
              <CircleDot aria-hidden="true" />
              Iniciar captura
            </Button>
            {!isConnected && (
              <p className="text-sm text-text-muted mt-3">Conectá MITTEN primero.</p>
            )}
            {isConnected && firmwareState !== 'IDLE' && (
              <p className="text-sm text-warning mt-3">Dispositivo en estado: {firmwareState}</p>
            )}
          </div>
        )}
      </section>

      {/* Step 2: Name Input & Submit */}
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <section className="app-panel p-6" aria-labelledby="gesture-info-title">
          <p className="app-eyebrow">Paso 2 de 2</p>
          <h2 id="gesture-info-title" className="text-lg font-bold text-text mb-4">Información del gesto</h2>

          <FormField
            id="gesture-name"
            label="Nombre del gesto"
            required
            error={errors.name}
            helpText={<span className="tabular-nums">{Array.from(name).length}/60 caracteres</span>}
          >
            <input
              id="gesture-name"
              name="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'gesture-name-error' : 'gesture-name-help'}
              className="app-field"
              placeholder="Ej: hola, gracias, adiós..."
              disabled={isSubmitting}
            />
          </FormField>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {errors.capture && <p className="text-sm text-error" role="alert">{errors.capture}</p>}
          <Button type="button" variant="outline" onClick={() => navigate('/gestures')} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || !capturedGestureData || !name.trim()}>
            {isSubmitting ? 'Guardando…' : 'Guardar gesto'}
          </Button>
        </div>
      </form>

      {/* Help Text */}
      <div className="rounded-lg border border-border bg-mist p-4 text-sm text-text-muted">
        <p className="font-medium text-text mb-2">Cómo obtener una buena captura</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Conectá MITTEN y esperá hasta que aparezca como listo.</li>
          <li>Iniciá la captura y adoptá el gesto cuando la pantalla te lo indique.</li>
          <li>Mantené la mano estable hasta que termine el registro.</li>
          <li>Escribí la frase que querés comunicar y guardá el gesto.</li>
        </ol>
      </div>
    </div>
  );
}
