import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDevice } from '../context/DeviceContext';
import { useToast } from '../components/ToastContainer';
import { createGesture } from '../services/api';
import { validateGestureData } from '@mitten/contracts';
import type { GestureData, FormErrors } from '../types';

const CAPTURE_PHASES = ['PREPARING', 'RECORDING', 'PROCESSING'] as const;
type CapturePhase = typeof CAPTURE_PHASES[number];

export function CreateGesturePage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { 
    isConnected, 
    firmwareState, 
    isCapturing, 
    capturePhase, 
    captureProgress, 
    captureError, 
    capturedGestureData,
    startCapture,
    clearCaptureState,
    getStatus
  } = useDevice();

  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captureStarted, setCaptureStarted] = useState(false);

  // Validate name
  useEffect(() => {
    if (name.length > 60) {
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
    else if (name.length > 60) newErrors.name = 'El nombre no puede exceder 60 caracteres';
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
      showToast({ type: 'warning', message: `El dispositivo está ${firmwareState}. Espera a que esté IDLE.` });
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

  const getPhaseIcon = (phase: CapturePhase) => {
    switch (phase) {
      case 'PREPARING': return '⚙️';
      case 'RECORDING': return '🔴';
      case 'PROCESSING': return '⚡';
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Crear Nuevo Gesto</h1>
          <p className="text-text-muted mt-1">Captura un gesto con MITTEN y asígnale un nombre</p>
        </div>
      </div>

      {/* Connection Check */}
      {!isConnected && (
        <div className="bg-warning-light border border-warning text-warning p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-medium">MITTEN no está conectado</p>
              <p className="text-sm">Conecta el dispositivo desde el panel de control para capturar gestos</p>
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
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-text mb-2">Iniciar Captura</h3>
            <p className="text-text-muted mb-6">Presiona el botón y realiza el gesto con el guante</p>
            <button
              onClick={handleCapture}
              disabled={!isConnected || firmwareState !== 'IDLE' || isCapturing}
              className="px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
          <div className="text-center py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 text-blue-600 mb-4">
              <span className="text-3xl">{getPhaseIcon(capturePhase)}</span>
            </div>
            <h3 className="text-lg font-medium text-text mb-2">{capturePhase}</h3>
            <p className="text-text-muted mb-6">{getPhaseDescription(capturePhase)}</p>
            
            <div className="w-full max-w-md mx-auto">
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
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
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${
              errors.name ? 'border-error' : 'border-border'
            }`}
            placeholder="Ej: hola, gracias, adiós..."
            disabled={isSubmitting}
          />
          {errors.name && <p className="mt-1 text-sm text-error">{errors.name}</p>}
          <p className="mt-1 text-sm text-text-muted">{name.length}/60 caracteres</p>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3">
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
        <p className="font-medium mb-2">Instrucciones:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Conecta MITTEN y verifica que esté en estado <code className="bg-white px-1 rounded">IDLE</code></li>
          <li>Presiona "Iniciar Captura" y realiza el gesto con el guante</li>
          <li>Mantén el gesto durante la grabación (fase RECORDING)</li>
          <li>Espera a que termine el procesamiento</li>
          <li>Asigna un nombre y guarda</li>
        </ol>
      </div>
    </div>
  );
}