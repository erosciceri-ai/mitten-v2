import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PairedDevice } from '../services/api';
import { PairedDevicesPanel } from './PairedDevicesPanel';

const mocks = vi.hoisted(() => ({
  getDevices: vi.fn(),
  revokeDevice: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../services/api', () => ({
  getDevices: mocks.getDevices,
  revokeDevice: mocks.revokeDevice,
}));

vi.mock('./ToastContainer', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

const sampleDevices: PairedDevice[] = [
  {
    id: 'dev-1',
    name: 'Guante derecho',
    createdAt: '2026-11-20T12:00:00.000Z',
    lastSeenAt: '2026-11-20T14:30:00.000Z',
    revokedAt: null,
    online: true,
  },
  {
    id: 'dev-2',
    name: 'Guante backup',
    createdAt: '2026-11-18T10:00:00.000Z',
    lastSeenAt: null,
    revokedAt: null,
    online: false,
  },
  {
    id: 'dev-3',
    name: 'Guante viejo',
    createdAt: '2026-11-10T09:00:00.000Z',
    lastSeenAt: '2026-11-11T09:00:00.000Z',
    revokedAt: '2026-11-12T08:00:00.000Z',
    online: false,
  },
];

describe('PairedDevicesPanel', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders online, offline, and revoked devices with status badges', async () => {
    mocks.getDevices.mockResolvedValue({ devices: sampleDevices });

    render(<PairedDevicesPanel />);
    await waitFor(() => expect(screen.getByText('Guante derecho')).toBeTruthy());

    expect(screen.getByText('En línea')).toBeTruthy();
    expect(screen.getByText('Desconectado')).toBeTruthy();
    expect(screen.getByText('Revocado')).toBeTruthy();
    expect(screen.getByText(/Sin conexión registrada/)).toBeTruthy();
    // Only the 2 active devices render a Revocar acceso button.
    expect(screen.getAllByRole('button', { name: 'Revocar acceso' })).toHaveLength(2);
  });

  it('shows empty state when no devices are paired', async () => {
    mocks.getDevices.mockResolvedValue({ devices: [] });

    render(<PairedDevicesPanel />);
    await waitFor(() =>
      expect(screen.getByText(/Todavía no vinculaste ningún guante por Wi-Fi/)).toBeTruthy(),
    );
  });

  it('shows load error notice and allows retrying', async () => {
    mocks.getDevices
      .mockRejectedValueOnce(new Error('Servidor no disponible'))
      .mockResolvedValueOnce({ devices: [sampleDevices[0]] });

    render(<PairedDevicesPanel />);
    await waitFor(() => expect(screen.getByText('No se pudieron cargar los guantes')).toBeTruthy());
    expect(screen.getByText('Servidor no disponible')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    });
    await waitFor(() => expect(screen.getByText('Guante derecho')).toBeTruthy());
  });

  it('handles inline two-step revocation, cancelation, refresh, and failure toast', async () => {
    mocks.getDevices
      .mockResolvedValueOnce({ devices: [sampleDevices[0]] })
      .mockResolvedValueOnce({
        devices: [{ ...sampleDevices[0], online: false, revokedAt: '2026-11-20T18:00:00.000Z' }],
      });
    mocks.revokeDevice
      .mockRejectedValueOnce(new Error('Fallo temporal'))
      .mockResolvedValueOnce(undefined);

    render(<PairedDevicesPanel />);
    await waitFor(() => expect(screen.getByText('Guante derecho')).toBeTruthy());

    // Step 1 -> Cancel restores button without calling API
    fireEvent.click(screen.getByRole('button', { name: 'Revocar acceso' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mocks.revokeDevice).not.toHaveBeenCalled();

    // Confirm fails -> shows error toast and keeps controls
    fireEvent.click(screen.getByRole('button', { name: 'Revocar acceso' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar revocación' }));
    });
    expect(mocks.revokeDevice).toHaveBeenCalledWith('dev-1');
    expect(mocks.showToast).toHaveBeenCalledWith({ type: 'error', message: 'Fallo temporal' });

    // Confirm succeeds -> revokes, refreshes list, shows success toast
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar revocación' }));
    });
    await waitFor(() => expect(screen.getByText('Revocado')).toBeTruthy());
    expect(mocks.showToast).toHaveBeenCalledWith({
      type: 'success',
      message: 'Acceso de «Guante derecho» revocado.',
    });
    expect(screen.queryByRole('button', { name: 'Revocar acceso' })).toBeNull();
  });
});
