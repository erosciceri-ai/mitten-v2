import { useCallback, useState } from 'react';
import { GoogleSignInButton, isGoogleSignInConfigured } from '../components/GoogleSignInButton';
import { useToast } from '../components/ToastContainer';
import { useAuth } from '../context/AuthContext';
import { exportAccountData, linkGoogleAccount } from '../services/api';

export function AccountPage() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleLink = useCallback(async (credential: string) => {
    setError(null);
    await linkGoogleAccount(credential);
    await refreshUser();
    showToast({ type: 'success', message: 'Cuenta de Google vinculada' });
  }, [refreshUser, showToast]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    try {
      const accountExport = await exportAccountData();
      const blob = new Blob([JSON.stringify(accountExport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mitten-cuenta-${accountExport.exportedAt.slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showToast({ type: 'success', message: 'Copia de tus datos descargada' });
    } catch (exportError) {
      showToast({ type: 'error', message: exportError instanceof Error ? exportError.message : 'No se pudo exportar la cuenta' });
    } finally {
      setIsExporting(false);
    }
  }, [showToast]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-text">Tu cuenta</h1>
        <p className="text-text-muted mt-2">Administra cómo ingresas a MITTEN.</p>
      </header>

      <section className="bg-surface rounded-xl border border-border p-5 sm:p-6" aria-labelledby="identity-title">
        <h2 id="identity-title" className="text-lg font-semibold text-text">Identidad</h2>
        <dl className="mt-4 grid gap-3 text-sm">
          <div><dt className="text-text-muted">Correo</dt><dd className="font-medium mt-1">{user?.email}</dd></div>
          <div><dt className="text-text-muted">Google</dt><dd className="font-medium mt-1">{user?.googleLinked ? 'Vinculado' : 'No vinculado'}</dd></div>
        </dl>
      </section>

      <section className="bg-surface rounded-xl border border-border p-5 sm:p-6" aria-labelledby="data-title">
        <h2 id="data-title" className="text-lg font-semibold text-text">Tus datos</h2>
        <p className="text-text-muted mt-2 max-w-xl">Descarga un archivo JSON con los datos públicos de tu cuenta y todos los gestos de tu biblioteca. No incluye credenciales ni archivos MP3.</p>
        <button
          className="mt-5 px-4 py-2.5 rounded-md border border-primary text-primary font-medium hover:bg-primary-light disabled:opacity-50 disabled:cursor-wait transition-colors"
          type="button"
          disabled={isExporting}
          onClick={handleExport}
        >
          {isExporting ? 'Preparando copia…' : 'Descargar mis datos'}
        </button>
      </section>

      {!user?.googleLinked && (
        <section className="bg-surface rounded-xl border border-border p-5 sm:p-6" aria-labelledby="google-link-title">
          <h2 id="google-link-title" className="text-lg font-semibold text-text">Vincular Google</h2>
          <p className="text-text-muted mt-2 max-w-xl">La cuenta de Google debe usar el mismo correo que tu cuenta MITTEN. Después podrás entrar con cualquiera de los dos métodos.</p>
          {error && <p className="mt-4 p-3 rounded-md bg-error-light text-error text-sm" role="alert">{error}</p>}
          <div className="mt-5">
            {isGoogleSignInConfigured ? (
              <GoogleSignInButton onCredential={handleLink} onError={setError} text="continue_with" />
            ) : (
              <p className="text-sm text-text-muted">La integración con Google todavía no está habilitada en este entorno.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
