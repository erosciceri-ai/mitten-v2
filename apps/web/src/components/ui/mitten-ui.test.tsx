import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notice, PageHeader, ProgressBar } from './mitten-ui';

describe('MITTEN UI primitives', () => {
  it('exposes a clear page heading and supporting description', () => {
    render(<PageHeader eyebrow="Biblioteca" title="Gestos personales" description="Administrá tu perfil." />);
    expect(screen.getByRole('heading', { level: 1, name: 'Gestos personales' })).toBeTruthy();
    expect(screen.getByText('Administrá tu perfil.')).toBeTruthy();
  });

  it('announces error notices as alerts', () => {
    render(<Notice tone="error" title="No se pudo sincronizar">El perfil anterior sigue activo.</Notice>);
    expect(screen.getByRole('alert').textContent).toContain('No se pudo sincronizar');
    expect(screen.getByRole('alert').textContent).toContain('El perfil anterior sigue activo');
  });

  it('reports numeric progress independently from animation', () => {
    render(<ProgressBar value={3} max={5} label="Gestos enviados" />);
    const progress = screen.getByRole('progressbar', { name: 'Gestos enviados' });
    expect(progress.getAttribute('aria-valuenow')).toBe('3');
    expect(progress.getAttribute('aria-valuemax')).toBe('5');
  });
});
