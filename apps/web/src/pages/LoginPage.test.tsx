import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  loginWithGoogle: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    login: mocks.login,
    loginWithGoogle: mocks.loginWithGoogle,
    isLoading: false,
  }),
}));

vi.mock('../components/ToastContainer', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

describe('LoginPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a <main> landmark, uses custom React validation via noValidate, and redirects to returnTo', async () => {
    mocks.login.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { returnTo: '/sync' } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/sync" element={<div>Sync Target</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('main')).toBeTruthy();

    // Submit invalid email without native HTML5 blocking
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByText('Ingresá un correo electrónico válido')).toBeTruthy();
    expect(mocks.login).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    });

    expect(mocks.login).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret123' });
    expect(screen.getByText('Sync Target')).toBeTruthy();
  });
});
