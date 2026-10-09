import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { PrivacyPage } from './PrivacyPage';

describe('PrivacyPage', () => {
  afterEach(cleanup);

  it('discloses the implemented account, Google, gesture and Web Serial data flows', () => {
    render(<MemoryRouter><PrivacyPage /></MemoryRouter>);

    expect(screen.getByRole('heading', { level: 1, name: 'Política de privacidad de MITTEN V2.1' })).toBeTruthy();
    expect(screen.getByText(/MITTEN no recibe la contraseña de Google/)).toBeTruthy();
    expect(screen.getByText(/Web Serial conecta el navegador directamente con el ESP32/)).toBeTruthy();
    expect(screen.getByText(/no utiliza cookies publicitarias ni herramientas de analítica/)).toBeTruthy();
    const contactLink = screen.queryByRole('link', { name: /@/ });
    const pendingNotice = screen.queryByRole('note');
    expect(contactLink?.getAttribute('href') ?? pendingNotice?.textContent).toBeTruthy();
  });
});
