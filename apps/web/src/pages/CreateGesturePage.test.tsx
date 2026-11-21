import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GestureData } from '../types';
import { CreateGesturePage } from './CreateGesturePage';

const sampleGestureData: GestureData = {
  version: 1,
  dimensions: 7,
  dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'],
  units: { flex: 'adc12', mpu: 'degrees' },
  samples: [[100, 110, 120, 130, 140, 1.5, -2.5]] as const,
  summary: {
    min: [100, 110, 120, 130, 140, 1.5, -2.5],
    max: [100, 110, 120, 130, 140, 1.5, -2.5],
    mean: [100, 110, 120, 130, 140, 1.5, -2.5],
  },
  sampleCount: 1,
  captureDurationMs: 1500,
  samplingPeriodMs: 100,
};

const mocks = vi.hoisted(() => ({
  device: {
    deviceMode: 'demo' as const,
    isConnected: true,
    connectionStatus: 'connected' as const,
    firmwareState: 'IDLE' as const,
    isCapturing: false,
    capturePhase: null as 'PREPARING' | 'RECORDING' | 'PROCESSING' | null,
    captureProgress: 0,
    captureError: null as string | null,
    capturedGestureData: null as GestureData | null,
    startCapture: vi.fn(),
    connect: vi.fn(),
    clearCaptureState: vi.fn(),
  },
  createGesture: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../context/DeviceContext', () => ({
  useDevice: () => mocks.device,
}));

vi.mock('../services/api', () => ({
  createGesture: mocks.createGesture,
}));

vi.mock('../components/ToastContainer', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

describe('CreateGesturePage', () => {
  beforeEach(() => {
    mocks.device.isCapturing = false;
    mocks.device.capturePhase = null;
    mocks.device.captureError = null;
    mocks.device.capturedGestureData = null;
    mocks.device.startCapture.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('clears stale capture state on mount, renders starting state without blank gap, and resets capture after submit', async () => {
    mocks.device.capturedGestureData = sampleGestureData;
    mocks.createGesture.mockResolvedValue({ id: 9 });

    render(
      <MemoryRouter initialEntries={['/gestures/new']}>
        <Routes>
          <Route path="/gestures/new" element={<CreateGesturePage />} />
          <Route path="/gestures/9" element={<div>Created 9</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // Mount cleanup cleared stale data
    expect(mocks.device.clearCaptureState).toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Nombre del gesto/), { target: { value: 'Gracias' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar gesto' }));
    });

    await waitFor(() => expect(mocks.createGesture).toHaveBeenCalledWith({ name: 'Gracias', data: sampleGestureData }));
    expect(mocks.device.clearCaptureState.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Created 9')).toBeTruthy();
  });

  it('shows waiting message instead of blank panel before capturePhase arrives', async () => {
    render(
      <MemoryRouter initialEntries={['/gestures/new']}>
        <CreateGesturePage />
      </MemoryRouter>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Iniciar captura' }));
    });

    expect(screen.getByText('Iniciando captura en MITTEN…')).toBeTruthy();
  });
});
