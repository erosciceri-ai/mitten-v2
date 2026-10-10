import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { BrandMark } from './BrandMark';

describe('BrandMark', () => {
  afterEach(cleanup);

  it('uses the approved compact logo on dark navigation surfaces', () => {
    render(<MemoryRouter><BrandMark to="/app" /></MemoryRouter>);

    const link = screen.getByRole('link', { name: 'MITTEN, ir al panel' });
    expect(link.querySelector('.brand-mark__asset')?.getAttribute('src')).toBe('/brand/02_logo_sin_eslogan.svg');
    expect(link.querySelector('.brand-mark__mobile-asset')?.getAttribute('src')).toBe('/brand/06_isotipo_gradiente.svg');
  });

  it('selects the approved light-surface asset without recreating the wordmark', () => {
    render(<MemoryRouter><BrandMark surface="light" /></MemoryRouter>);

    const link = screen.getByRole('link', { name: 'MITTEN, ir al inicio' });
    expect(link.querySelector('.brand-mark__asset')?.getAttribute('src')).toBe('/brand/03_logo_para_fondo_claro.svg');
    expect(link.querySelector('svg')).toBeNull();
  });

  it('uses the approved principal signature when requested', () => {
    render(<MemoryRouter><BrandMark variant="signature" /></MemoryRouter>);

    const link = screen.getByRole('link', { name: 'MITTEN, ir al inicio' });
    expect(link.querySelector('.brand-mark__asset')?.getAttribute('src')).toBe('/brand/01_logo_principal_oscuro.svg');
    expect(screen.queryByText('V2.1')).toBeNull();
  });
});
