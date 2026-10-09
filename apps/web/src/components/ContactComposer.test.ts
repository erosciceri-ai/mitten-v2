import { describe, expect, it } from 'vitest';
import { buildContactMailto } from './ContactComposer';

describe('buildContactMailto', () => {
  it('encodes the recipient, subject and body without storing the message', () => {
    const href = buildContactMailto(
      'equipo@example.com',
      'Ada Lovelace',
      'Solicitar una demostración',
      'Quisiera conocer MITTEN.',
    );

    expect(href).toBe(
      'mailto:equipo@example.com?subject=Consulta%20MITTEN%20%C2%B7%20Solicitar%20una%20demostraci%C3%B3n&body=Nombre%3A%20Ada%20Lovelace%0A%0AQuisiera%20conocer%20MITTEN.',
    );
  });
});
