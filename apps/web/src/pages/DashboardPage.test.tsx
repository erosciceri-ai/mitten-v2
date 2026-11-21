import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

const mocks = vi.hoisted(() => ({
  device: {
    deviceMode: 'hardware' as 'hardware' | 'demo' | 'relay',
    setDeviceMode: vi.fn(),
    isDemoMode: false,
    isRelayMode: false,
    isConnected: false,
    connectionStatus: 'disconnected' as 'disconnected' | 'connecting' | 'handshake' | 'connected' | 'error',
    deviceInfo: null,
    firmwareState: 'IDLE' as const,
    activeProfile: null as { profileId: string; profileRevision: string; gestureCount: number } | null,
    syncIsComplete: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getStatus: vi.fn(),
    restartDemoDevice: vi.fn(),
    simulateRecognition: vi.fn(),
    lastRecognition: null as { gestureId: number; audioTrack: number } | null,
    uploadAudio: vi.fn(),
    getAudioStatus: vi.fn().mockResolvedValue({ tracks: [] }),
  },
  getGestures: vi.fn(),
  getGestureAudioInfo: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, email: 'persona@ejemplo.test', googleLinked: false } }),
}));

vi.mock('../context/DeviceContext', () => ({
  useDevice: () => mocks.device,
}));

vi.mock('../services/api', () => ({
  getGestures: mocks.getGestures,
  getGestureAudioInfo: mocks.getGestureAudioInfo,
  getGestureAudioBlob: vi.fn(),
}));

vi.mock('../components/ToastContainer', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    mocks.device.deviceMode = 'hardware';
    mocks.device.isDemoMode = false;
    mocks.device.isRelayMode = false;
    mocks.device.isConnected = false;
    mocks.device.connectionStatus = 'disconnected';
    mocks.device.activeProfile = null;
    mocks.device.lastRecognition = null;
    mocks.getGestures.mockResolvedValue({ gestures: [], total: 0 });
    mocks.getGestureAudioInfo.mockResolvedValue({ filePath: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('disables connection mode buttons during connecting and shows library error instead of 0 gestures', async () => {
    mocks.device.connectionStatus = 'connecting';
    mocks.getGestures.mockRejectedValueOnce(new Error('API caída'));

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('No pudimos cargar tu biblioteca')).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Modo demostración' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText('Error al consultar')).toHaveLength(2);
  });

  it('shows proactive Web Serial fallback and resolves gesture phrase on demo recognition', async () => {
    mocks.device.deviceMode = 'demo';
    mocks.device.isDemoMode = true;
    mocks.device.isConnected = true;
    mocks.device.connectionStatus = 'connected';
    mocks.device.activeProfile = { profileId: 'p1', profileRevision: 'r1', gestureCount: 1 };
    mocks.device.lastRecognition = { gestureId: 7, audioTrack: 1 };
    mocks.getGestures.mockResolvedValue({
      total: 1,
      gestures: [{ id: 7, name: 'Hola', audioTrack: 1 }],
    });
    mocks.getGestureAudioInfo.mockResolvedValue({ filePath: '/audio/1.mp3' });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/Reconocimiento simulado: «Hola»/)).toBeTruthy());
    expect(screen.getByText('Simulador conectado')).toBeTruthy();
  });
});
