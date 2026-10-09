import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountPage } from './AccountPage';

const mocks = vi.hoisted(() => ({
  exportAccountData: vi.fn(),
  linkGoogleAccount: vi.fn(),
  refreshUser: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../services/api', () => ({
  exportAccountData: mocks.exportAccountData,
  linkGoogleAccount: mocks.linkGoogleAccount,
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 7, email: 'persona@example.com', googleLinked: true },
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

  it('downloads the authenticated account export as JSON', async () => {
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
  });
});
