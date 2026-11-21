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
    expect(screen.getByRole('status').textContent).toContain('Wi-Fi');
    expect(screen.getByRole('heading', { name: 'Tres formas de conectar el guante' })).toBeTruthy();
    expect(screen.getByText('Guante por Wi-Fi')).toBeTruthy();
    expect(screen.getByText('Guante por USB')).toBeTruthy();
    expect(screen.getByText('Modo demostración')).toBeTruthy();
    expect(screen.getByText('Voces directas a la microSD')).toBeTruthy();
    expect(screen.getByText('¿Cómo se cargan las voces en la microSD del guante?')).toBeTruthy();
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

  it('toggles mobile project navigation and avoids prohibited ARIA on SVG <g>', () => {
    const { container } = render(<MemoryRouter><PublicHomePage /></MemoryRouter>);

    expect(container.querySelector('.hero-system__brand')?.getAttribute('aria-label')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Abrir menú' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('navigation', { name: 'Menú móvil del proyecto' })).toBeTruthy();
  });
});
