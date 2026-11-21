import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GestureDetailPage } from './GestureDetailPage';

const mocks = vi.hoisted(() => ({
  getGestureById: vi.fn(),
  updateGesture: vi.fn(),
  deleteGesture: vi.fn(),
  generateGestureAudio: vi.fn(),
  getGestureAudioInfo: vi.fn(),
  getGestureAudioBlob: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../services/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  getGestureById: mocks.getGestureById,
  updateGesture: mocks.updateGesture,
  deleteGesture: mocks.deleteGesture,
  generateGestureAudio: mocks.generateGestureAudio,
  getGestureAudioInfo: mocks.getGestureAudioInfo,
  getGestureAudioBlob: mocks.getGestureAudioBlob,
}));

vi.mock('../components/ToastContainer', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

const sampleGesture = {
  id: 1,
  name: 'Hola',
  audioTrack: 1,
  createdAt: '2026-11-20T00:00:00Z',
  updatedAt: '2026-11-20T00:00:00Z',
  data: {
    version: 1 as const,
    dimensions: 7 as const,
    dimensionOrder: ['flex1', 'flex2', 'flex3', 'flex4', 'flex5', 'mpuX', 'mpuY'] as const,
    units: { flex: 'adc12' as const, mpu: 'degrees' as const },
    samples: [[100, 110, 120, 130, 140, 1.5, -2.5]] as const,
    summary: {
      min: [100, 110, 120, 130, 140, 1.5, -2.5],
      max: [100, 110, 120, 130, 140, 1.5, -2.5],
      mean: [100, 110, 120, 130, 140, 1.5, -2.5],
    },
    sampleCount: 1,
    captureDurationMs: 1500,
    samplingPeriodMs: 100,
  },
};

describe('GestureDetailPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows not found immediately for non-numeric IDs without spinning indefinitely', async () => {
    render(
      <MemoryRouter initialEntries={['/gestures/abc']}>
        <Routes>
          <Route path="/gestures/:id" element={<GestureDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Gesto no encontrado' })).toBeTruthy());
    expect(mocks.getGestureById).not.toHaveBeenCalled();
  });

  it('resets edit input on cancel, uses ConfirmDialog for delete, and fixes headings + <dl>', async () => {
    mocks.getGestureById.mockResolvedValue(sampleGesture);
    mocks.getGestureAudioInfo.mockResolvedValue({ filePath: null });

    const { container } = render(
      <MemoryRouter initialEntries={['/gestures/1']}>
        <Routes>
          <Route path="/gestures/:id" element={<GestureDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Hola' })).toBeTruthy());

    // h2 directly below h1 (no skip to h3)
    expect(screen.getByRole('heading', { level: 2, name: 'Información del gesto' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Voz del gesto' })).toBeTruthy();

    // Every <dt> is inside a <dl>
    for (const dt of Array.from(container.querySelectorAll('dt'))) {
      expect(dt.closest('dl')).not.toBeNull();
    }

    // Cancel edit resets unsaved input
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    const input = screen.getByLabelText(/Nombre/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Texto descartado' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect((screen.getByLabelText(/Nombre/) as HTMLInputElement).value).toBe('Hola');

    // Delete uses ConfirmDialog instead of window.confirm
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });
});
