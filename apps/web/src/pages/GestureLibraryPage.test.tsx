import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GestureLibraryPage } from './GestureLibraryPage';

const mocks = vi.hoisted(() => ({
  getGestures: vi.fn(),
  getGestureAudioInfo: vi.fn(),
  deleteGesture: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../services/api', () => ({
  getGestures: mocks.getGestures,
  getGestureAudioInfo: mocks.getGestureAudioInfo,
  deleteGesture: mocks.deleteGesture,
}));

vi.mock('../components/ToastContainer', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

describe('GestureLibraryPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows a recoverable error notice instead of empty state when API fails', async () => {
    mocks.getGestures.mockRejectedValueOnce(new Error('Fallo de red'));

    render(
      <MemoryRouter>
        <GestureLibraryPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('No se pudo cargar tu biblioteca')).toBeTruthy());
    expect(screen.queryByText('Tu biblioteca está vacía')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('displays per-gesture audio badges, h2 headings, and ConfirmDialog delete', async () => {
    mocks.getGestures.mockResolvedValue({
      total: 2,
      gestures: [
        { id: 1, name: 'Hola', audioTrack: 1, createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' },
        { id: 2, name: 'Gracias', audioTrack: 2, createdAt: '2026-11-20T00:00:00Z', updatedAt: '2026-11-20T00:00:00Z' },
      ],
    });
    mocks.getGestureAudioInfo.mockImplementation(async (id: number) =>
      id === 1 ? { filePath: '/audio/1.mp3' } : { filePath: null },
    );
    mocks.deleteGesture.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <GestureLibraryPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Hola' })).toBeTruthy());
    expect(screen.getByText('MP3 listo')).toBeTruthy();
    expect(screen.getByText('Sin MP3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Hola' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar gesto' }));
    await waitFor(() => expect(mocks.deleteGesture).toHaveBeenCalledWith(1));
  });
});
