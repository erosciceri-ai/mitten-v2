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
    expect(screen.getByRole('heading', { name: 'De la mano al parlante, en tres momentos.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Una arquitectura pequeña, comprensible y mantenible.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir la aplicación' }).getAttribute('href')).toBe('/login');
    expect(screen.getByRole('status').textContent).toContain('navegador compatible');
    expect(screen.getByText('No. MITTEN V2.1 es un prototipo funcional educativo. Su efectividad clínica todavía no fue establecida.')).toBeTruthy();
  });

  it('runs the conceptual sensor-to-audio demonstration', () => {
    vi.useFakeTimers();
    render(<MemoryRouter><PublicHomePage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Simular un gesto' }));
    expect(screen.getByText('Leyendo sensores')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1100));
    expect(screen.getByText('Comparando el gesto')).toBeTruthy();

    act(() => vi.advanceTimersByTime(1100));
    expect(screen.getByText('Frase reconocida')).toBeTruthy();
    expect(screen.getByText('“Necesito ayuda”')).toBeTruthy();
  });
});
