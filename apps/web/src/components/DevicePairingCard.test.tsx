import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevicePairingCard, formatCountdown } from './DevicePairingCard';

const mocks = vi.hoisted(() => ({
  createDevicePairingCode: vi.fn(),
}));

vi.mock('../services/api', () => ({
  createDevicePairingCode: mocks.createDevicePairingCode,
}));

describe('formatCountdown', () => {
  it('formats whole seconds and clamps negative values to 0:00', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(59)).toBe('0:59');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(600)).toBe('10:00');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});

describe('DevicePairingCard', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('requests a pairing code, disables while loading, and displays the active countdown', async () => {
    let resolvePairing: ((value: { code: string; expiresInSeconds: number }) => void) | null = null;
    mocks.createDevicePairingCode.mockImplementation(
      () => new Promise(resolve => { resolvePairing = resolve; }),
    );

    render(<DevicePairingCard />);
    const button = screen.getByRole('button', { name: 'Generar código de vinculación' }) as HTMLButtonElement;
    fireEvent.click(button);

    expect(button.disabled).toBe(true);
    expect(mocks.createDevicePairingCode).toHaveBeenCalledOnce();

    await act(async () => {
      resolvePairing?.({ code: '482910', expiresInSeconds: 600 });
    });

    expect(screen.getByTestId('pairing-code').textContent).toBe('482910');
    expect(screen.getByText(/vence en 10:00/)).toBeTruthy();
    const regeneratedButton = screen.getByRole('button', { name: 'Generar otro código' }) as HTMLButtonElement;
    expect(regeneratedButton.disabled).toBe(false);
  });

  it('marks the code as expired and stops interval ticks once the countdown reaches zero', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
    mocks.createDevicePairingCode.mockResolvedValue({ code: '123456', expiresInSeconds: 3 });

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    render(<DevicePairingCard />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generar código de vinculación' }));
    });

    expect(screen.getByTestId('pairing-code').textContent).toBe('123456');
    expect(screen.getByText(/vence en 0:03/)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByTestId('pairing-code')).toBeNull();
    expect(screen.getByText('El código venció. Generá uno nuevo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Generar código de vinculación' })).toBeTruthy();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('shows an error notice when generating a pairing code fails', async () => {
    mocks.createDevicePairingCode.mockRejectedValue(new Error('Límite alcanzado'));

    render(<DevicePairingCard />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generar código de vinculación' }));
    });

    expect(screen.getByText('No se pudo generar el código')).toBeTruthy();
    expect(screen.getByText('Límite alcanzado')).toBeTruthy();
  });

  it('copies the active pairing code to clipboard and keeps countdown outside aria-live', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    mocks.createDevicePairingCode.mockResolvedValue({ code: '654321', expiresInSeconds: 600 });

    render(<DevicePairingCard />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Generar código de vinculación' }));
    });

    const countdownText = screen.getByText(/vence en 10:00/);
    expect(countdownText.closest('[aria-live]')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar código' }));
    });

    expect(writeText).toHaveBeenCalledWith('654321');
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeTruthy();
  });
});
