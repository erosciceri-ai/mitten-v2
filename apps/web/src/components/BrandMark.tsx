import { Link } from 'react-router-dom';

interface BrandMarkProps {
  to?: string;
  surface?: 'dark' | 'light';
  variant?: 'navigation' | 'signature' | 'isotype';
  className?: string;
}

const brandAssets = {
  dark: {
    navigation: '/brand/02_logo_sin_eslogan.svg',
    signature: '/brand/01_logo_principal_oscuro.svg',
    isotype: '/brand/06_isotipo_gradiente.svg',
  },
  light: {
    navigation: '/brand/03_logo_para_fondo_claro.svg',
    signature: '/brand/03_logo_para_fondo_claro.svg',
    isotype: '/brand/06_isotipo_gradiente.svg',
  },
} as const;

export function BrandMark({
  to = '/',
  surface = 'dark',
  variant = 'navigation',
  className = '',
}: BrandMarkProps) {
  const label = to === '/app' ? 'MITTEN, ir al panel' : 'MITTEN, ir al inicio';
  const asset = brandAssets[surface][variant];

  return (
    <Link
      to={to}
      className={`brand-mark brand-mark--${variant} ${className}`.trim()}
      aria-label={label}
    >
      <img className="brand-mark__asset" src={asset} alt="" aria-hidden="true" />
      {variant === 'navigation' ? (
        <img className="brand-mark__mobile-asset" src={brandAssets[surface].isotype} alt="" aria-hidden="true" />
      ) : null}
      {variant !== 'signature' ? <span className="brand-mark__version">V2.1</span> : null}
    </Link>
  );
}
