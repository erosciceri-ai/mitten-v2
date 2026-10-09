import { Link } from 'react-router-dom';

interface BrandMarkProps {
  to?: string;
  inverse?: boolean;
}

export function BrandMark({ to = '/', inverse = false }: BrandMarkProps) {
  return (
    <Link
      to={to}
      className={`brand-mark ${inverse ? 'brand-mark--inverse' : ''}`}
      aria-label={to === '/app' ? 'MITTEN, ir al panel' : 'MITTEN, ir al inicio'}
    >
      <span className="brand-mark__symbol" aria-hidden="true">
        <svg viewBox="0 0 32 32" role="img">
          <path d="M9.2 14.7V8.9a2.1 2.1 0 0 1 4.2 0v4.4-7a2.1 2.1 0 0 1 4.2 0v7-5.6a2.1 2.1 0 0 1 4.2 0v7-3.4a2.1 2.1 0 0 1 4.2 0v6.1C26 23.8 21.8 28 16.4 28h-1.2a9.1 9.1 0 0 1-8.1-4.9l-2.4-4.5a2.3 2.3 0 0 1 3.5-2.9l3 2.4" />
          <path d="M11.3 24.5c3.3-1.6 6.5-1.7 9.8-.1" />
        </svg>
      </span>
      <span className="brand-mark__name">MITTEN</span>
      <span className="brand-mark__version">V2.1</span>
    </Link>
  );
}
