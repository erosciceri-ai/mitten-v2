import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionStatus } from '../types';
import { ConnectionBanner } from './ConnectionBanner';

const mocks = vi.hoisted(() => ({
  device: {
    connectionStatus: 'disconnected' as ConnectionStatus,
    connectionError: null as string | null,
    clearConnectionError: vi.fn(),
    connect: vi.fn(),
    isDemoMode: false,
    isRelayMode: false,
  },
  showToast: vi.fn(),
}));

vi.mock('../context/DeviceContext', () => ({
  useDevice: () => mocks.device,
}));

vi.mock('./ToastContainer', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

describe('ConnectionBanner', () => {
  beforeEach(() => {
    mocks.device.connectionStatus = 'disconnected';
    mocks.device.connectionError = null;
    mocks.device.isDemoMode = false;
    mocks.device.isRelayMode = false;
    mocks.device.connect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders nothing when disconnected without an error', () => {
    const { container } = render(<ConnectionBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows USB serial copy in hardware mode', () => {
    mocks.device.connectionStatus = 'connecting';
    const { rerender } = render(<ConnectionBanner />);
    expect(screen.getByText('Conectando…')).toBeTruthy();
    expect(screen.getByText('Seleccioná el puerto MITTEN en el diálogo del navegador.')).toBeTruthy();

    mocks.device.connectionStatus = 'connected';
    rerender(<ConnectionBanner />);
    expect(screen.getByText('MITTEN conectado')).toBeTruthy();
    expect(screen.getByText('El guante está disponible para configurar el perfil.')).toBeTruthy();
  });

  it('shows Wi-Fi relay copy in relay mode', () => {
    mocks.device.isRelayMode = true;
    mocks.device.connectionStatus = 'connecting';
    const { rerender } = render(<ConnectionBanner />);
    expect(screen.getByText('Conectando por Wi-Fi…')).toBeTruthy();
    expect(screen.getByText('Esperando respuesta del guante a través del servidor.')).toBeTruthy();

    mocks.device.connectionStatus = 'connected';
    rerender(<ConnectionBanner />);
    expect(screen.getByText('MITTEN conectado por Wi-Fi')).toBeTruthy();
    expect(screen.getByText('El guante está en línea para configurar el perfil y enviar audios.')).toBeTruthy();
  });

  it('shows demo mode copy when connecting and connected', () => {
    mocks.device.isDemoMode = true;
    mocks.device.connectionStatus = 'connecting';
    const { rerender } = render(<ConnectionBanner />);
    expect(screen.getByText('Iniciando demostración…')).toBeTruthy();
    expect(screen.getByText('Preparando el simulador local de MITTEN.')).toBeTruthy();

    mocks.device.connectionStatus = 'connected';
    rerender(<ConnectionBanner />);
    expect(screen.getByText('Modo demostración · sin hardware real')).toBeTruthy();
  });

  it('shows handshake status and mode-specific retry toast on reconnect failure', async () => {
    mocks.device.connectionStatus = 'handshake';
    const { rerender } = render(<ConnectionBanner />);
    expect(screen.getByText('Comprobando conexión…')).toBeTruthy();

    mocks.device.connectionStatus = 'error';
    mocks.device.connectionError = 'Fallo de red';
    mocks.device.connect.mockRejectedValue(new Error('Offline'));

    // Hardware retry failure toast
    rerender(<ConnectionBanner />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    });
    expect(mocks.device.clearConnectionError).toHaveBeenCalledOnce();
    expect(mocks.showToast).toHaveBeenLastCalledWith({
      type: 'error',
      message: 'No se pudo reconectar. Revisá el cable y volvé a intentarlo.',
    });

    // Relay retry failure toast
    mocks.device.isRelayMode = true;
    rerender(<ConnectionBanner />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    });
    expect(mocks.showToast).toHaveBeenLastCalledWith({
      type: 'error',
      message: 'No se pudo reconectar por Wi-Fi. Verificá que el guante esté encendido y en línea.',
    });
  });
});
