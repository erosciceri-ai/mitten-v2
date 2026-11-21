import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

function Session() {
  const { isAuthenticated, isLoading, user } = useAuth();
  return <output>{isLoading ? 'checking' : user?.email ?? (isAuthenticated ? 'waiting for API' : 'signed out')}</output>;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

it.each(['network', '503'])('keeps the token after a %s failure and recovers on reconnect', async failure => {
  localStorage.setItem('auth_token', 'synthetic-session');
  const fetcher = vi.fn();
  if (failure === 'network') fetcher.mockRejectedValueOnce(new TypeError('network unavailable'));
  else fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Service unavailable' }), { status: 503 }));
  fetcher.mockImplementation(async () => new Response(JSON.stringify({ id: 1, email: 'recover@example.com' })));
  vi.stubGlobal('fetch', fetcher);
  render(<AuthProvider><Session /></AuthProvider>);

  await screen.findByText('waiting for API');
  expect(localStorage.getItem('auth_token')).toBe('synthetic-session');
  window.dispatchEvent(new Event('online'));
  await screen.findByText('recover@example.com');
  expect(fetcher).toHaveBeenLastCalledWith('/api/auth/me', expect.objectContaining({
    headers: expect.objectContaining({ Authorization: 'Bearer synthetic-session' }),
  }));
});

it('clears the token when the API rejects the session with 401', async () => {
  localStorage.setItem('auth_token', 'synthetic-expired');
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
  render(<AuthProvider><Session /></AuthProvider>);
  await screen.findByText('signed out');
  await waitFor(() => expect(localStorage.getItem('auth_token')).toBeNull());
});
