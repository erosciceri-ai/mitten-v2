import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountPage } from './AccountPage';

const mocks = vi.hoisted(() => ({
  exportAccountData: vi.fn(),
  linkGoogleAccount: vi.fn(),
  getDevices: vi.fn(),
  revokeDevice: vi.fn(),
  refreshUser: vi.fn(),
  showToast: vi.fn(),
  user: { id: 7, email: 'persona@example.com', googleLinked: true } as { id: number; email: string; googleLinked: boolean } | null,
}));

vi.mock('../services/api', () => ({
  exportAccountData: mocks.exportAccountData,
  linkGoogleAccount: mocks.linkGoogleAccount,
  getDevices: mocks.getDevices,
  revokeDevice: mocks.revokeDevice,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mocks.user,
    refreshUser: mocks.refreshUser,
  }),
}));
vi.mock('../components/ToastContainer', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));
vi.mock('../components/GoogleSignInButton', () => ({
  GoogleSignInButton: () => null,
  isGoogleSignInConfigured: false,
}));

describe('AccountPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('downloads the authenticated account export as JSON and renders paired devices section', async () => {
    mocks.getDevices.mockResolvedValue({ devices: [] });
    mocks.exportAccountData.mockResolvedValue({
      format: 'mitten-account-export',
      version: 1,
      exportedAt: '2026-10-07T12:00:00.000Z',
      account: { id: 7, email: 'persona@example.com', googleLinked: true, createdAt: '', updatedAt: '' },
      gestures: [],
    });
    const createObjectURL = vi.fn(() => 'blob:account-export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<AccountPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Descargar mis datos' }));

    await waitFor(() => expect(mocks.exportAccountData).toHaveBeenCalledOnce());
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:account-export');
    expect(mocks.showToast).toHaveBeenCalledWith({ type: 'success', message: 'Copia de tus datos descargada' });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Guantes vinculados' })).toBeTruthy());
  });

  it('shows a retry notice instead of blank identity or Google link when user is null', async () => {
    mocks.user = null;
    mocks.getDevices.mockResolvedValue({ devices: [] });

    render(<AccountPage />);

    expect(screen.getByText('No se pudieron cargar los datos de tu cuenta')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Vincular Google' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(mocks.refreshUser).toHaveBeenCalledOnce();
    mocks.user = { id: 7, email: 'persona@example.com', googleLinked: true };
  });
});
