import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContactComposer } from './ContactComposer';

afterEach(cleanup);

describe('contact composer', () => {
  it('opens a Gmail draft through a native form without requiring a mail application', () => {
    render(<ContactComposer email="equipo@example.com" />);
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'María & José' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Solicitar una demostración' } });
    fireEvent.change(screen.getByLabelText('Mensaje'), { target: { value: 'Hola, ¿podemos probar MITTEN?\nGracias.' } });

    const button = screen.getByRole('button', { name: 'Abrir Gmail' });
    const form = button.closest('form')!;
    expect(form.action).toBe('https://mail.google.com/mail/');
    expect(form.method).toBe('get');
    expect(form.target).toBe('_blank');
    expect(form.getAttribute('rel')).toContain('noopener');
    expect(form.checkValidity()).toBe(true);
    const values = Object.fromEntries(new FormData(form));
    expect(values).toEqual({
      view: 'cm', fs: '1', to: 'equipo@example.com',
      su: 'Consulta MITTEN · Solicitar una demostración',
      body: 'Nombre: María & José\n\nHola, ¿podemos probar MITTEN?\nGracias.',
    });
  });

  it('keeps the mail application available and blocks an empty message', () => {
    render(<ContactComposer email="equipo@example.com" />);
    fireEvent.change(screen.getByLabelText('Abrir con'), { target: { value: 'mailto' } });
    const button = screen.getByRole('button', { name: 'Preparar correo' });
    const form = button.closest('form')!;
    expect(form.checkValidity()).toBe(false);
    expect(form.target).toBe('');
    expect(new FormData(form).has('to')).toBe(false);
  });
});
