import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDevice } from '../context/DeviceContext';
import { useToast } from '../components/ToastContainer';
import { createGesture } from '../services/api';
import type { FormErrors } from '../types';

const CAPTURE_PHASES = ['PREPARING', 'RECORDING', 'PROCESSING'] as const;
type CapturePhase = typeof CAPTURE_PHASES[number];

export function CreateGesturePage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { 
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
    getStatus
  } = useDevice();

  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captureStarted, setCaptureStarted] = useState(false);

  // Validate name
  useEffect(() => {
    if (Array.from(name).length > 60) {
      setErrors(prev => ({ ...prev, name: 'El nombre no puede exceder 60 caracteres' }));
    } else if (name.length > 0) {
      setErrors(prev => {
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
    if (!capturedGestureData) newErrors.capture = 'Debes capturar un gesto primero';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCapture = async () => {
    if (!isConnected) {
      showToast({ type: 'error', message: 'MITTEN no está conectado' });
      return;
    }

    if (firmwareState !== 'IDLE') {
      showToast({ type: 'warning', message: 'MITTEN está ocupado. Espera a que vuelva a estar listo.' });
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
        message: error instanceof Error ? error.message : 'Error al iniciar captura' 
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
      case 'PREPARING': return 'Preparando sensores...';
      case 'RECORDING': return 'Grabando gesto... Realiza el gesto ahora';
      case 'PROCESSING': return 'Procesando datos capturados...';
    }
  };

  const getPhaseLabel = (phase: CapturePhase) => {
    switch (phase) {
      case 'PREPARING': return 'Preparando';
      case 'RECORDING': return 'Realiza el gesto';
      case 'PROCESSING': return 'Procesando';
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-text">Enseñar un gesto</h1>
          <p className="text-text-muted mt-2">Registra el movimiento y escribe la frase que MITTEN dirá.</p>
        </div>
      </div>

      {/* Connection Check */}
      {!isConnected && (
        <div className="bg-warning-light border border-warning text-amber-900 p-4 rounded-lg" role="status">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v10m0 4v.01M5 8.5a8 8 0 1 0 14 0" /></svg>
            <div>
              <p className="font-medium">MITTEN no está conectado</p>
              <p className="text-sm mt-1">Conecta el guante para habilitar la captura.</p>
              <button onClick={() => connect().catch(() => undefined)} disabled={connectionStatus === 'connecting' || connectionStatus === 'handshake'} className="mt-3 px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover disabled:opacity-60 transition-colors">
                {connectionStatus === 'connecting' || connectionStatus === 'handshake' ? 'Conectando…' : 'Conectar MITTEN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capture Section */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-text mb-4">Captura de Gesto</h2>

        {!captureStarted && !capturedGestureData ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary-light text-primary mb-4">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-5a1.5 1.5 0 0 1 3 0v6-3a1.5 1.5 0 0 1 3 0v5c0 4.4-3.6 8-8 8h-1a7 7 0 0 1-6.2-3.7L2.5 15A1.7 1.7 0 0 1 5 12.8L7 15" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-text mb-2">Iniciar Captura</h3>
            <p className="text-text-muted mb-6">Presiona el botón y realiza el gesto con el guante</p>
            <button
              onClick={handleCapture}
              disabled={!isConnected || firmwareState !== 'IDLE' || isCapturing}
              className="px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="6" strokeWidth={2} />
              </svg>
              Iniciar Captura
            </button>
            {!isConnected && (
              <p className="text-sm text-text-muted mt-3">Conecta MITTEN primero</p>
            )}
            {isConnected && firmwareState !== 'IDLE' && (
              <p className="text-sm text-warning mt-3">Dispositivo en estado: {firmwareState}</p>
            )}
          </div>
        ) : captureStarted && isCapturing && capturePhase ? (
          <div className="text-center py-8" role="status" aria-live="polite">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 text-blue-600 mb-4">
              <span className="w-4 h-4 rounded-full bg-current animate-pulse" aria-hidden="true" />
            </div>
            <h3 className="text-lg font-medium text-text mb-2">{getPhaseLabel(capturePhase)}</h3>
            <p className="text-text-muted mb-6">{getPhaseDescription(capturePhase)}</p>
            
            <div className="w-full max-w-md mx-auto">
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-2" role="progressbar" aria-label="Progreso de captura" aria-valuemin={0} aria-valuemax={100} aria-valuenow={captureProgress}>
                <div 
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${captureProgress}%` }}
                ></div>
              </div>
              <p className="text-sm text-text-muted">{captureProgress}%</p>
            </div>
          </div>
        ) : capturedGestureData && !isCapturing ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success-light text-success mb-4">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-text mb-2">Captura Completada</h3>
            <p className="text-text-muted mb-6">
              Se capturaron {capturedGestureData.sampleCount} muestras en {capturedGestureData.captureDurationMs}ms
            </p>
            
            <div className="bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto mb-6">
              <p className="text-sm font-medium text-text mb-2">Datos del gesto:</p>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-muted">Muestras:</dt>
                  <dd className="font-mono">{capturedGestureData.sampleCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">Duración:</dt>
                  <dd className="font-mono">{capturedGestureData.captureDurationMs}ms</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">Período:</dt>
                  <dd className="font-mono">{capturedGestureData.samplingPeriodMs}ms</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">Dimensiones:</dt>
                  <dd className="font-mono">{capturedGestureData.dimensions}</dd>
                </div>
              </dl>
            </div>
            
            <div className="flex justify-center gap-3">
              <button
                onClick={handleRetryCapture}
                className="px-4 py-2 border border-border text-text font-medium rounded-md hover:bg-gray-50 transition-colors"
              >
                Repetir Captura
              </button>
            </div>
          </div>
        ) : captureError ? (
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-error-light text-error mb-4">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-text mb-2">Error en la Captura</h3>
            <p className="text-text-muted mb-6">{captureError}</p>
            <button
              onClick={handleRetryCapture}
              className="px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : null}
      </div>

      {/* Name Input */}
      <div className="bg-surface rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-text mb-4">Información del Gesto</h2>
        
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-text mb-1">
            Nombre del Gesto <span className="text-error">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : 'name-help'}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${
              errors.name ? 'border-error' : 'border-border'
            }`}
            placeholder="Ej: hola, gracias, adiós..."
            disabled={isSubmitting}
          />
          {errors.name && <p id="name-error" className="mt-1 text-sm text-error" role="alert">{errors.name}</p>}
          <p id="name-help" className="mt-1 text-sm text-text-muted tabular-nums">{Array.from(name).length}/60 caracteres</p>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        {errors.capture && <p className="self-center text-sm text-error" role="alert">{errors.capture}</p>}
        <button
          onClick={() => navigate('/gestures')}
          className="px-4 py-2 border border-border text-text font-medium rounded-md hover:bg-gray-50 transition-colors"
          disabled={isSubmitting}
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !capturedGestureData || !name.trim()}
          className="px-4 py-2 bg-primary text-white font-medium rounded-md hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Guardando...' : 'Guardar Gesto'}
        </button>
      </div>

      {/* Help Text */}
      <div className="bg-gray-50 rounded-lg p-4 text-sm text-text-muted">
        <p className="font-medium mb-2">Cómo obtener una buena captura</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Conecta MITTEN y espera hasta que aparezca como listo.</li>
          <li>Inicia la captura y adopta el gesto cuando la pantalla te lo indique.</li>
          <li>Mantén la mano estable hasta que termine el registro.</li>
          <li>Escribe la frase que deseas comunicar y guarda el gesto.</li>
        </ol>
      </div>
    </div>
  );
}
