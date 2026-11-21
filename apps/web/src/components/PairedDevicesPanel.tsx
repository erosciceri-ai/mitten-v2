import { Wifi } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDevices, revokeDevice, type PairedDevice } from '../services/api';
import { useToast } from './ToastContainer';
import { Button } from './ui/button';
import { Notice, Panel, StatusBadge } from './ui/mitten-ui';

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Sin conexión registrada';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

/** Lists Wi-Fi paired gloves for the signed-in account and lets the owner revoke access. */
export function PairedDevicesPanel() {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const loadDevices = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await getDevices();
      if (!isMounted.current) return;
      setDevices(response.devices);
    } catch (error) {
      if (!isMounted.current) return;
      setLoadError(error instanceof Error ? error.message : 'No se pudo cargar la lista de guantes.');
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const handleConfirmRevoke = async (device: PairedDevice) => {
    setRevokingId(device.id);
    try {
      await revokeDevice(device.id);
      if (!isMounted.current) return;
      setConfirmingId(null);
      showToast({ type: 'success', message: `Acceso de «${device.name}» revocado.` });
      try {
        const refreshed = await getDevices();
        if (isMounted.current) setDevices(refreshed.devices);
      } catch {
        if (isMounted.current) {
          setDevices(current => current.map(item => (
            item.id === device.id ? { ...item, revokedAt: new Date().toISOString(), online: false } : item
          )));
        }
      }
    } catch (error) {
      if (!isMounted.current) return;
      showToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'No se pudo revocar el guante.',
      });
    } finally {
      if (isMounted.current) setRevokingId(null);
    }
  };

  return (
    <Panel className="p-5 sm:p-6" aria-labelledby="paired-devices-title">
      <div className="flex items-center gap-2">
        <Wifi className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <h2 id="paired-devices-title" className="text-lg font-semibold text-text">Guantes vinculados</h2>
      </div>
      <p className="mt-2 max-w-xl text-sm text-text-muted">
        Administrá los guantes conectados por Wi-Fi a tu cuenta. Si cambiás o perdés uno, podés revocar su acceso al instante.
      </p>

      {isLoading ? (
        <p className="mt-4 text-sm text-text-muted" role="status">Consultando guantes vinculados…</p>
      ) : loadError ? (
        <Notice
          tone="error"
          title="No se pudieron cargar los guantes"
          className="mt-4"
          actions={(
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void loadDevices()}>
              Reintentar
            </Button>
          )}
        >
          {loadError}
        </Notice>
      ) : devices.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">
          Todavía no vinculaste ningún guante por Wi-Fi. Cuando cargues un código de vinculación desde el panel, va a aparecer acá.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {devices.map(device => {
            const isRevoked = device.revokedAt !== null;
            const isConfirming = confirmingId === device.id;
            const isRevoking = revokingId === device.id;
            return (
              <li key={device.id} className="flex flex-col gap-3 py-4 first:pt-2 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-text">{device.name}</p>
                    {isRevoked ? (
                      <StatusBadge tone="warning">Revocado</StatusBadge>
                    ) : (
                      <StatusBadge tone={device.online ? 'success' : 'neutral'}>
                        {device.online ? 'En línea' : 'Desconectado'}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Vinculado: {formatTimestamp(device.createdAt)} · Última conexión: {formatTimestamp(device.lastSeenAt)}
                  </p>
                  {isRevoked ? (
                    <p className="mt-0.5 text-xs text-warning">
                      Revocado: {formatTimestamp(device.revokedAt)}
                    </p>
                  ) : null}
                </div>
                {!isRevoked ? (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {isConfirming ? (
                      <>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={isRevoking}
                          onClick={() => void handleConfirmRevoke(device)}
                        >
                          {isRevoking ? 'Revocando…' : 'Confirmar revocación'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isRevoking}
                          onClick={() => setConfirmingId(null)}
                        >
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={revokingId !== null}
                        onClick={() => setConfirmingId(device.id)}
                      >
                        Revocar acceso
                      </Button>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
