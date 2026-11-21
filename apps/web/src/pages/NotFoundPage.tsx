import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useOptionalAuth } from '../context/AuthContext';
import { BrandMark } from '../components/BrandMark';
import { Button } from '../components/ui/button';

export function NotFoundPage() {
  const auth = useOptionalAuth();
  const target = auth?.isAuthenticated ? '/app' : '/';
  const label = auth?.isAuthenticated ? 'Volver al panel' : 'Volver al inicio';

  return (
    <main id="main-content" className="auth-shell flex min-h-screen items-center justify-center px-4 py-10">
      <div className="auth-panel w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <div className="mb-6 flex justify-center">
          <BrandMark to={target} />
        </div>
        <h1 className="text-2xl font-bold text-text">Página no encontrada</h1>
        <p className="mt-3 text-sm leading-6 text-text-muted">
          La dirección que ingresaste no existe o cambió de lugar dentro de MITTEN V2.1.
        </p>
        <div className="mt-6 flex justify-center">
          <Button asChild size="lg">
            <Link to={target}>
              <ArrowLeft aria-hidden="true" />
              {label}
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
