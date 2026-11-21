import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './alert-dialog';
import { FormField } from './field';
import { Notice, PageHeader, ProgressBar, StatusBadge } from './mitten-ui';

describe('MITTEN UI primitives', () => {
  afterEach(cleanup);

  it('exposes a clear page heading and supporting description', () => {
    render(<PageHeader eyebrow="Biblioteca" title="Gestos personales" description="Administrá tu perfil." />);
    expect(screen.getByRole('heading', { level: 1, name: 'Gestos personales' })).toBeTruthy();
    expect(screen.getByText('Administrá tu perfil.')).toBeTruthy();
  });

  it('announces error notices as alerts without disrupting heading levels by default', () => {
    render(<Notice tone="error" title="No se pudo sincronizar">El perfil anterior sigue activo.</Notice>);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No se pudo sincronizar');
    expect(alert.textContent).toContain('El perfil anterior sigue activo');
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('supports the syncing tone on StatusBadge and Notice', () => {
    render(
      <>
        <StatusBadge tone="syncing">Sincronizando</StatusBadge>
        <Notice tone="syncing" title="Transferencia en curso" live />
      </>,
    );
    expect(screen.getByText('Sincronizando')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Transferencia en curso');
  });

  it('reports numeric progress independently from animation', () => {
    render(<ProgressBar value={3} max={5} label="Gestos enviados" />);
    const progress = screen.getByRole('progressbar', { name: 'Gestos enviados' });
    expect(progress.getAttribute('aria-valuenow')).toBe('3');
    expect(progress.getAttribute('aria-valuemax')).toBe('5');
  });

  it('renders ConfirmDialog and triggers onConfirm cleanly', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="¿Eliminar gesto?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        onConfirm={onConfirm}
      />,
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('wires label, error and helpText inside FormField', () => {
    render(
      <FormField id="gesture-name" label="Nombre" required error="Nombre requerido">
        <input id="gesture-name" />
      </FormField>,
    );
    expect(screen.getByLabelText(/Nombre/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Nombre requerido');
  });
});
