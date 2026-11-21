import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncPage } from './SyncPage';

const mocks = vi.hoisted(() => ({
  device: {
    deviceMode: 'demo' as const,
    isConnected: true,
    connectionStatus: 'connected' as const,
    deviceInfo: {
      device: 'MITTEN',
      firmwareVersion: '2.0.0',
      protocolVersion: 2,
      state: 'IDLE' as const,
      capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      activeProfile: null,
      activeSync: null,
    },
    firmwareState: 'IDLE' as const,
    activeProfile: null,
    isSyncing: false,
    syncProgress: { sent: 0, total: 0 },
    syncError: null as string | null,
    syncIsComplete: false,
    connect: vi.fn(),
    startSync: vi.fn(),
    abortSync: vi.fn(),
    getStatus: vi.fn(),
    clearSyncState: vi.fn(),
  },
  getGestures: vi.fn(),
  getGestureAudioInfo: vi.fn(),
  downloadAudioPackage: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../context/DeviceContext', () => ({
  useDevice: () => mocks.device,
}));

vi.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    missingTracks?: Array<{ name: string; audioTrack: number }>;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  getGestures: mocks.getGestures,
  getGestureAudioInfo: mocks.getGestureAudioInfo,
  downloadAudioPackage: mocks.downloadAudioPackage,
}));

vi.mock('../components/ToastContainer', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

describe('SyncPage', () => {
  beforeEach(() => {
    mocks.device.isConnected = true;
    mocks.device.syncIsComplete = false;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('blocks empty-profile sync when getGestures fails', async () => {
    mocks.getGestures.mockRejectedValueOnce(new Error('Sin conexión'));

    render(
      <MemoryRouter>
        <SyncPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getAllByText('No se pudo cargar la biblioteca').length).toBeGreaterThan(0));
    const wipeButton = screen.getByRole('button', { name: 'Vaciar perfil de MITTEN' }) as HTMLButtonElement;
    expect(wipeButton.disabled).toBe(true);
  });

  it('shows early missing-audio links and uses ConfirmDialog for empty profile wipe and post-sync Panel link', async () => {
    mocks.getGestures.mockResolvedValue({
      total: 1,
      gestures: [{ id: 5, name: 'Agua', audioTrack: 1 }],
    });
    mocks.getGestureAudioInfo.mockResolvedValue({ filePath: null });
    mocks.device.syncIsComplete = true;

    render(
      <MemoryRouter>
        <SyncPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Faltan MP3 para completar el uso autónomo')).toBeTruthy());
    const missingLink = screen.getByRole('link', { name: 'Agua' });
    expect(missingLink.getAttribute('href')).toBe('/gestures/5');
    expect(screen.getAllByText(/en el Panel/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('link', { name: 'Ir a Audio en el guante' })[0].getAttribute('href')).toBe('/app#audio-guante');

    cleanup();

    // Empty library uses ConfirmDialog instead of window.confirm
    mocks.device.syncIsComplete = false;
    mocks.getGestures.mockResolvedValue({ total: 0, gestures: [] });
    render(
      <MemoryRouter>
        <SyncPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Vaciar perfil de MITTEN' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Vaciar perfil de MITTEN' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });
});
