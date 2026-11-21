import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirmwareState } from '../types';
import { Layout } from './Layout';

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: 1, email: 'persona@ejemplo.test', googleLinked: false },
    isAuthenticated: true,
    logout: vi.fn(),
  },
  device: {
    firmwareState: 'IDLE' as FirmwareState,
    isConnected: true,
    connectionStatus: 'connected' as const,
    deviceInfo: {
      device: 'MITTEN',
      firmwareVersion: '2.0.0',
      protocolVersion: 2,
      state: 'IDLE' as FirmwareState,
      capabilities: { maxGestures: 50, maxMessageBytes: 8192 },
      activeProfile: null,
      activeSync: null,
    },
    isDemoMode: true,
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('../context/DeviceContext', () => ({
  useDevice: () => mocks.device,
}));

describe('Layout', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    mocks.device.isConnected = true;
    mocks.device.isDemoMode = true;
  });

  it('renders skip link, distinct nav landmarks, persistent demo header badge, and footer privacy link', () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Layout>
          <div>Contenido</div>
        </Layout>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Saltar al contenido' }).getAttribute('href')).toBe('#main-content');
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Navegación móvil' })).toBeTruthy();
    expect(screen.getByText('Modo demostración')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salir de la cuenta' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Privacidad' }).getAttribute('href')).toBe('/privacidad');
  });
});
