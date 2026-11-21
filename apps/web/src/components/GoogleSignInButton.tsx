import { useEffect, useRef, useState } from 'react';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccountsId {
  initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }) => void;
  renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
  cancel: () => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
const scriptId = 'google-identity-services';

export const isGoogleSignInConfigured = Boolean(clientId);

interface GoogleSignInButtonProps {
  onCredential: (credential: string) => Promise<void> | void;
  onError?: (message: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
}

export function GoogleSignInButton({ onCredential, onError, text = 'continue_with' }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let settled = false;

    const render = () => {
      if (!window.google || !containerRef.current) return;
      settled = true;
      setLoadFailed(false);
      containerRef.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: response => {
          if (!response.credential) {
            onError?.('Google no devolvió una credencial válida');
            return;
          }
          Promise.resolve(onCredential(response.credential)).catch(error => {
            onError?.(error instanceof Error ? error.message : 'No se pudo iniciar sesión con Google');
          });
        },
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        shape: 'rectangular',
        text,
        width: Math.min(containerRef.current.clientWidth || 360, 400),
        locale: 'es',
      });
      setIsReady(true);
    };

    if (window.google) {
      render();
      return () => window.google?.accounts.id.cancel();
    }

    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const handleError = () => {
      settled = true;
      setLoadFailed(true);
      onError?.('No se pudo cargar el inicio de sesión con Google');
    };

    const timeout = window.setTimeout(() => {
      if (!settled && !window.google) {
        setLoadFailed(true);
      }
    }, 10_000);

    script.addEventListener('load', render);
    script.addEventListener('error', handleError);
    return () => {
      window.clearTimeout(timeout);
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', handleError);
      window.google?.accounts.id.cancel();
    };
  }, [onCredential, onError, text]);

  if (!clientId) return null;

  return (
    <div className="google-sign-in">
      <div ref={containerRef} className="google-sign-in__button" />
      {!isReady && !loadFailed ? (
        <span className="google-sign-in__loading" role="status">Preparando Google…</span>
      ) : null}
      {loadFailed ? (
        <p className="text-center text-xs text-text-muted" role="status">
          El acceso con Google no está disponible en este momento. Usá tu correo y contraseña.
        </p>
      ) : null}
    </div>
  );
}
