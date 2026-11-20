import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirmwareState } from '../types';
import { GloveAudioPanel } from './GloveAudioPanel';

const mocks = vi.hoisted(() => ({
  device: {
    isConnected: true,
    firmwareState: '' as FirmwareState,
    uploadAudio: vi.fn(),
    getAudioStatus: vi.fn(),
  },
  getGestures: vi.fn(),
  getGestureAudioInfo: vi.fn(),
  getGestureAudioBlob: vi.fn(),
  uploadAllGestureAudio: vi.fn(),
}));

vi.mock('../context/DeviceContext', () => ({
  useDevice: () => mocks.device,
}));

vi.mock('../services/api', () => ({
  getGestures: mocks.getGestures,
  getGestureAudioInfo: mocks.getGestureAudioInfo,
  getGestureAudioBlob: mocks.getGestureAudioBlob,
}));

vi.mock('../audio/uploadGestureAudio', () => ({
  uploadAllGestureAudio: mocks.uploadAllGestureAudio,
}));

const sampleGestures = [
  { id: 1, name: 'Hola', audioTrack: 1 },
  { id: 2, name: 'Agua', audioTrack: 2 },
  { id: 3, name: 'Gracias', audioTrack: 3 },
];

function setupDefaultLibrary() {
  mocks.getGestures.mockResolvedValue({ gestures: sampleGestures });
  mocks.getGestureAudioInfo.mockImplementation(async (id: number) => (
    id === 3 ? { filePath: null } : { filePath: `audio/g-${id}.mp3` }
  ));
  mocks.device.getAudioStatus.mockResolvedValue({
    tracks: [{ audioTrack: 2, sizeBytes: 4096 }],
  });
}

describe('GloveAudioPanel', () => {
  beforeEach(() => {
    mocks.device.isConnected = true;
    mocks.device.firmwareState = FirmwareState.IDLE;
    setupDefaultLibrary();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('combines library gestures, MP3 availability, and glove track status', async () => {
    render(<GloveAudioPanel />);

    await waitFor(() => expect(screen.getByText('Hola')).toBeTruthy());

    expect(screen.getByText('Pista 1')).toBeTruthy();
    expect(screen.getByText('Pista 2')).toBeTruthy();
    expect(screen.getByText('Pista 3')).toBeTruthy();
    expect(screen.getAllByText('MP3 listo')).toHaveLength(2);
    expect(screen.getByText('Sin MP3')).toBeTruthy();
    expect(screen.getAllByText('No está en el guante')).toHaveLength(2);
    expect(screen.getByText('En el guante · 4 KB')).toBeTruthy();

    const batchButton = screen.getByRole('button', { name: /Enviar los que faltan \(1\)/ }) as HTMLButtonElement;
    expect(batchButton.disabled).toBe(false);

    const rowButtons = screen.getAllByRole('button', { name: /^(Enviar|Reenviar)$/ }) as HTMLButtonElement[];
    expect(rowButtons).toHaveLength(3);
    expect(rowButtons[0].textContent).toBe('Enviar');
    expect(rowButtons[0].disabled).toBe(false);
    expect(rowButtons[1].textContent).toBe('Reenviar');
    expect(rowButtons[1].disabled).toBe(false);
    expect(rowButtons[2].disabled).toBe(true);
  });

  it('shows a compatibility warning when firmware responds UNKNOWN_COMMAND to audio status', async () => {
    mocks.device.getAudioStatus.mockRejectedValue(Object.assign(new Error('Unknown'), { code: 'UNKNOWN_COMMAND' }));

    render(<GloveAudioPanel />);

    await waitFor(() =>
      expect(
        screen.getByText('Este firmware todavía no admite la carga de audio. Actualizalo para usar esta función.'),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Hola')).toBeTruthy();
  });

  it('uploads missing tracks with phase/progress feedback and refreshes status on success', async () => {
    let resolveUpload: ((value: { uploaded: number[]; failed: null }) => void) | null = null;
    let capturedHooks: {
      onGestureStart?: (g: { id: number; name: string; audioTrack: number }) => void;
      onPhase?: (g: { id: number; name: string; audioTrack: number }, p: 'converting' | 'uploading') => void;
      onProgress?: (g: { id: number; name: string; audioTrack: number }, sent: number, total: number) => void;
      onGestureDone?: (g: { id: number; name: string; audioTrack: number }) => void;
    } | null = null;

    mocks.uploadAllGestureAudio.mockImplementation(async (_targets, _deps, hooks) => {
      capturedHooks = hooks;
      return new Promise(resolve => { resolveUpload = resolve; });
    });

    render(<GloveAudioPanel />);
    await waitFor(() => expect(screen.getByText('Hola')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Enviar los que faltan \(1\)/ }));

    expect(mocks.uploadAllGestureAudio).toHaveBeenCalledOnce();
    const [targets] = mocks.uploadAllGestureAudio.mock.calls[0];
    expect(targets).toEqual([expect.objectContaining({ id: 1, name: 'Hola', audioTrack: 1 })]);

    act(() => {
      capturedHooks?.onGestureStart?.(targets[0]);
    });
    expect(screen.getByText('Convirtiendo…')).toBeTruthy();

    act(() => {
      capturedHooks?.onPhase?.(targets[0], 'uploading');
      capturedHooks?.onProgress?.(targets[0], 2048, 4096);
    });
    expect(screen.getByText('Enviando 2 KB de 4 KB')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Envío de Hola' })).toBeTruthy();

    mocks.device.getAudioStatus.mockResolvedValue({
      tracks: [
        { audioTrack: 1, sizeBytes: 4096 },
        { audioTrack: 2, sizeBytes: 4096 },
      ],
    });

    await act(async () => {
      capturedHooks?.onGestureDone?.(targets[0]);
      resolveUpload?.({ uploaded: [1], failed: null });
    });

    await waitFor(() => expect(screen.getByText('Audio de «Hola» guardado en el guante.')).toBeTruthy());
  });

  it('triggers single-row resend and renders upload errors', async () => {
    mocks.uploadAllGestureAudio.mockResolvedValue({
      uploaded: [],
      failed: {
        gesture: { id: 2, name: 'Agua', audioTrack: 2 },
        error: new Error('Sin espacio en microSD'),
      },
    });

    render(<GloveAudioPanel />);
    await waitFor(() => expect(screen.getByText('Agua')).toBeTruthy());

    // Keep post-upload refresh pending to verify both the alert notice and inline row error.
    mocks.device.getAudioStatus.mockImplementationOnce(() => new Promise(() => undefined));

    const resendButton = screen.getByRole('button', { name: 'Reenviar' });
    await act(async () => {
      fireEvent.click(resendButton);
    });

    expect(mocks.uploadAllGestureAudio).toHaveBeenCalledOnce();
    expect(mocks.uploadAllGestureAudio.mock.calls[0][0]).toEqual([
      expect.objectContaining({ id: 2, name: 'Agua', audioTrack: 2 }),
    ]);
    await waitFor(() => expect(screen.getByText('Sin espacio en microSD')).toBeTruthy());
    expect(screen.getByText('No se pudo completar')).toBeTruthy();
    expect(screen.getByText('«Agua»: Sin espacio en microSD')).toBeTruthy();
  });

  it('uploads multiple missing tracks and shows batch count notice', async () => {
    mocks.device.getAudioStatus.mockResolvedValue({ tracks: [] });
    mocks.uploadAllGestureAudio.mockResolvedValue({ uploaded: [1, 2], failed: null });

    render(<GloveAudioPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Enviar los que faltan \(2\)/ })).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Enviar los que faltan \(2\)/ }));
    });

    expect(mocks.uploadAllGestureAudio).toHaveBeenCalledOnce();
    expect(mocks.uploadAllGestureAudio.mock.calls[0][0]).toHaveLength(2);
    await waitFor(() => expect(screen.getByText('2 audios guardados en el guante.')).toBeTruthy());
  });

  it('aborts the upload signal when Cancelar is clicked and on unmount', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveUpload: ((value: { uploaded: number[]; failed: null }) => void) | null = null;
    mocks.uploadAllGestureAudio.mockImplementation(async (_targets, _deps, hooks) => {
      capturedSignal = hooks.signal;
      return new Promise(resolve => { resolveUpload = resolve; });
    });

    const { unmount } = render(<GloveAudioPanel />);
    await waitFor(() => expect(screen.getByText('Hola')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Enviar los que faltan \(1\)/ }));
    expect(capturedSignal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(capturedSignal?.aborted).toBe(true);

    await act(async () => {
      resolveUpload?.({ uploaded: [], failed: null });
    });
    expect(screen.getByText('Carga cancelada.')).toBeTruthy();

    // Unmount during another in-flight upload
    let unmountSignal: AbortSignal | undefined;
    let resolveSecond: ((value: { uploaded: number[]; failed: null }) => void) | null = null;
    mocks.uploadAllGestureAudio.mockImplementationOnce(async (_targets, _deps, hooks) => {
      unmountSignal = hooks.signal;
      return new Promise(resolve => { resolveSecond = resolve; });
    });

    fireEvent.click(screen.getByRole('button', { name: /Enviar los que faltan \(1\)/ }));
    expect(unmountSignal?.aborted).toBe(false);
    unmount();
    expect(unmountSignal?.aborted).toBe(true);

    await act(async () => {
      resolveSecond?.({ uploaded: [], failed: null });
    });
  });

  it('disables upload actions and warns when firmware is not IDLE', async () => {
    mocks.device.firmwareState = FirmwareState.SYNCING;

    render(<GloveAudioPanel />);
    await waitFor(() => expect(screen.getByText('Hola')).toBeTruthy());

    expect(screen.getByText('El guante está ocupado')).toBeTruthy();
    const batchButton = screen.getByRole('button', { name: /Enviar los que faltan/ }) as HTMLButtonElement;
    expect(batchButton.disabled).toBe(true);
    const rowButtons = screen.getAllByRole('button', { name: /^(Enviar|Reenviar)$/ }) as HTMLButtonElement[];
    for (const button of rowButtons) {
      expect(button.disabled).toBe(true);
    }
  });
});
