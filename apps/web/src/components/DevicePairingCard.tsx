import { Check, Copy, KeyRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createDevicePairingCode } from '../services/api';
import { Button } from './ui/button';
import { Notice, Panel } from './ui/mitten-ui';

export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Pairs the glove with the account: the code is typed into the glove's Wi-Fi setup page. */
export function DevicePairingCard() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (expiresAt === null || expiresAt <= Date.now()) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= expiresAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const remaining = expiresAt === null ? 0 : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const isActive = code !== null && remaining > 0;
  const isExpired = code !== null && remaining === 0;

  const generate = async () => {
    setIsLoading(true);
    setError(null);
    setCopied(false);
    try {
      const pairing = await createDevicePairingCode();
      setCode(pairing.code);
      setNow(Date.now());
      setExpiresAt(Date.now() + pairing.expiresInSeconds * 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo generar el código.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!code || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures cleanly
    }
  };

  return (
    <Panel className="p-5" aria-labelledby="pairing-title">
      <h2 id="pairing-title" className="flex items-center gap-2 text-lg font-bold text-text">
        <KeyRound aria-hidden="true" className="size-5" />
        Vincular el guante a tu cuenta
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Hace falta una sola vez. El guante usa este código para conectarse a tu cuenta a través de Internet.
      </p>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm leading-6 text-text-muted">
        <li>Generá un código (vale 10 minutos y se usa una sola vez).</li>
        <li>Con el guante encendido y sin Wi-Fi guardado, conectá tu teléfono a la red <strong>MITTEN-XXXX</strong>. Para reconfigurarlo, mantené el botón BOOT 3 segundos.</li>
        <li>Abrí <span className="font-mono">http://192.168.4.1</span>, elegí tu red Wi-Fi (2,4 GHz) y escribí la contraseña y este código.</li>
      </ol>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="button" onClick={generate} disabled={isLoading}>
          {isActive ? 'Generar otro código' : 'Generar código de vinculación'}
        </Button>

        {/* Discrete polite announcement that does not spam screen readers on every tick */}
        <span className="sr-only" role="status" aria-live="polite">
          {isActive ? `Código de vinculación ${code} generado.` : ''}
        </span>

        <div className="flex min-h-11 flex-wrap items-center gap-3">
          {isActive ? (
            <>
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-text-muted">
                <span>
                  Código:{' '}
                  <span data-testid="pairing-code" className="font-mono text-2xl font-bold tracking-[0.25em] text-text tabular-nums">
                    {code}
                  </span>
                </span>
                <span className="tabular-nums">vence en {formatCountdown(remaining)}</span>
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? 'Copiado' : 'Copiar código'}
              </Button>
            </>
          ) : isExpired ? (
            <p className="text-sm text-warning" role="status" aria-live="polite">
              El código venció. Generá uno nuevo.
            </p>
          ) : null}
        </div>
      </div>
      {error ? <Notice tone="error" title="No se pudo generar el código" className="mt-4">{error}</Notice> : null}
    </Panel>
  );
}
