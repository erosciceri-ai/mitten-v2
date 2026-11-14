import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicHomePage } from './PublicHomePage';

describe('PublicHomePage', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('explains the project and provides a path into the private application', () => {
    render(
      <MemoryRouter>
        <PublicHomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Cada gesto tiene algo que decir');
    expect(screen.getByRole('heading', { name: 'Del gesto a la voz, paso a paso.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Una arquitectura pequeña, comprensible y mantenible.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir la aplicación' }).getAttribute('href')).toBe('/login');
    expect(screen.getByRole('status').textContent).toContain('navegador compatible');
    expect(screen.getByText('No. MITTEN V2.1 es un prototipo funcional educativo. Su efectividad clínica todavía no fue establecida.')).toBeTruthy();
    expect(screen.getByText(/WAV PCM mono de 16 kHz y 16 bits/)).toBeTruthy();
    expect(screen.queryByText(/DFPlayer/)).toBeNull();
  });

  it('runs the conceptual sensor-to-audio demonstration', () => {
    vi.useFakeTimers();
    render(<MemoryRouter><PublicHomePage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Ver recorrido conceptual' }));
    expect(screen.getByText('Muestra conceptual')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1100));
    expect(screen.getByText('Paso de reconocimiento')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1100));
    expect(screen.getByText('Salida de ejemplo')).toBeTruthy();
    expect(screen.getByText('“Necesito ayuda”')).toBeTruthy();
  });
});
