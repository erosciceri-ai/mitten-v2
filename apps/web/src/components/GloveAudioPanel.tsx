import { Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadAllGestureAudio, type GestureAudioTarget, type GloveAudioDeps, type GloveAudioPhase } from '../audio/uploadGestureAudio';
import { useDevice } from '../context/DeviceContext';
import { getGestureAudioBlob, getGestureAudioInfo, getGestures } from '../services/api';
import { FirmwareState } from '../types';
import { Button } from './ui/button';
import { Notice, Panel, ProgressBar, StatusBadge } from './ui/mitten-ui';

export interface PreloadedAudioLibrary {
  gestures: Array<{ id: number; name: string; audioTrack: number }>;
  audioByGestureId: Map<number, boolean>;
}

interface GloveAudioPanelProps {
  id?: string;
  preloadedLibrary?: PreloadedAudioLibrary | null;
  isLoadingLibrary?: boolean;
  libraryError?: string | null;
  onLibraryRefresh?: () => Promise<void> | void;
}

interface Row extends GestureAudioTarget {
  hasMp3: boolean;
  gloveBytes: number | null;
  phase: GloveAudioPhase | null;
  sent: number;
  total: number;
  error: string | null;
}

type Message = { tone: 'success' | 'error' | 'warning'; text: string };

const kib = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Sends the MP3 of every gesture to the glove microSD (converted to WAV in the browser). */
export function GloveAudioPanel({
  id,
  preloadedLibrary,
  isLoadingLibrary = false,
  libraryError = null,
  onLibraryRefresh,
}: GloveAudioPanelProps = {}) {
  const { isConnected, firmwareState, uploadAudio, getAudioStatus } = useDevice();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const controller = useRef<AbortController | null>(null);
  const isMounted = useRef(true);
  const isIdle = firmwareState === FirmwareState.IDLE;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      controller.current?.abort();
    };
  }, []);

  const patch = useCallback((gestureId: number, changes: Partial<Row>) => {
    if (isMounted.current) {
      setRows((current) => current.map((row) => (row.id === gestureId ? { ...row, ...changes } : row)));
    }
  }, []);

  const refresh = useCallback(async () => {
    if (preloadedLibrary !== undefined) {
      if (!preloadedLibrary) {
        if (isMounted.current) setRows([]);
        return;
      }
      let onGlove = new Map<number, number>();
      let statusError: string | null = null;
      try {
        const status = await getAudioStatus();
        onGlove = new Map(status.tracks.map((track) => [track.audioTrack, track.sizeBytes]));
      } catch (error) {
        statusError = (error as { code?: string }).code === 'UNKNOWN_COMMAND'
          ? 'Este firmware todavía no admite la carga de audio. Actualizalo para usar esta función.'
          : error instanceof Error ? error.message : 'No se pudo consultar la microSD del guante.';
      }
      if (!isMounted.current) return;
      setRows(
        preloadedLibrary.gestures.map((gesture) => ({
          id: gesture.id,
          name: gesture.name,
          audioTrack: gesture.audioTrack,
          hasMp3: Boolean(preloadedLibrary.audioByGestureId.get(gesture.id)),
          gloveBytes: onGlove.get(gesture.audioTrack) ?? null,
          phase: null,
          sent: 0,
          total: 0,
          error: null,
        })),
      );
      if (statusError) setMessage({ tone: 'warning', text: statusError });
      return;
    }

    const { gestures } = await getGestures();
    const infos = await Promise.allSettled(gestures.map((gesture) => getGestureAudioInfo(gesture.id)));
    let onGlove = new Map<number, number>();
    let statusError: string | null = null;
    try {
      const status = await getAudioStatus();
      onGlove = new Map(status.tracks.map((track) => [track.audioTrack, track.sizeBytes]));
    } catch (error) {
      statusError = (error as { code?: string }).code === 'UNKNOWN_COMMAND'
        ? 'Este firmware todavía no admite la carga de audio. Actualizalo para usar esta función.'
        : error instanceof Error ? error.message : 'No se pudo consultar la microSD del guante.';
    }
    if (!isMounted.current) return;
    setRows(
      gestures.map((gesture, index) => {
        const info = infos[index];
        return {
          id: gesture.id,
          name: gesture.name,
          audioTrack: gesture.audioTrack,
          hasMp3: info.status === 'fulfilled' && Boolean(info.value.filePath),
          gloveBytes: onGlove.get(gesture.audioTrack) ?? null,
          phase: null,
          sent: 0,
          total: 0,
          error: null,
        };
      }),
    );
    if (statusError) setMessage({ tone: 'warning', text: statusError });
  }, [getAudioStatus, preloadedLibrary]);

  useEffect(() => {
    if (!isConnected) return;
    if (preloadedLibrary !== undefined && isLoadingLibrary) {
      setIsLoading(true);
      return;
    }
    if (preloadedLibrary !== undefined && libraryError) {
      setIsLoading(false);
      setMessage({ tone: 'error', text: libraryError });
      return;
    }
    setIsLoading(true);
    refresh()
      .catch((error) => {
        if (isMounted.current) {
          setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo cargar la biblioteca.' });
        }
      })
      .finally(() => {
        if (isMounted.current) setIsLoading(false);
      });
  }, [isConnected, isLoadingLibrary, libraryError, preloadedLibrary, refresh]);

  const deps: GloveAudioDeps = { fetchMp3: getGestureAudioBlob, upload: uploadAudio };

  const run = async (targets: Row[]) => {
    if (targets.length === 0) return;
    const abort = new AbortController();
    controller.current = abort;
    setIsBusy(true);
    setMessage(null);
    try {
      const result = await uploadAllGestureAudio(targets, deps, {
        signal: abort.signal,
        onGestureStart: (gesture) => patch(gesture.id, { phase: 'converting', sent: 0, total: 0, error: null }),
        onPhase: (gesture, phase) => patch(gesture.id, { phase }),
        onProgress: (gesture, sent, total) => patch(gesture.id, { sent, total }),
        onGestureDone: (gesture) => patch(gesture.id, { phase: null }),
      });
      if (result.failed) {
        patch(result.failed.gesture.id, { phase: null, error: result.failed.error.message });
        setMessage({
          tone: abort.signal.aborted ? 'warning' : 'error',
          text: `«${result.failed.gesture.name}»: ${result.failed.error.message}`,
        });
      } else if (abort.signal.aborted) {
        setMessage({ tone: 'warning', text: 'Carga cancelada.' });
      } else {
        setMessage({
          tone: 'success',
          text: targets.length === 1
            ? `Audio de «${targets[0].name}» guardado en el guante.`
            : `${result.uploaded.length} audios guardados en el guante.`,
        });
      }
    } finally {
      for (const row of targets) patch(row.id, { phase: null });
      controller.current = null;
      if (isMounted.current) setIsBusy(false);
      if (onLibraryRefresh) {
        Promise.resolve(onLibraryRefresh()).catch(() => undefined);
      } else {
        refresh().catch(() => undefined);
      }
    }
  };

  const missing = rows.filter((row) => row.hasMp3 && row.gloveBytes === null);

  return (
    <Panel id={id} className="p-5" aria-labelledby="glove-audio-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="glove-audio-title" className="text-lg font-bold text-text">Audio en el guante</h2>
          <p className="mt-1 text-sm text-text-muted">
            Cada frase se convierte a WAV en tu navegador y se guarda en la microSD de MITTEN. Mientras se envía, el guante no reconoce gestos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isBusy ? (
            <Button type="button" variant="outline" onClick={() => controller.current?.abort()}>
              <X aria-hidden="true" />
              Cancelar
            </Button>
          ) : null}
          <Button type="button" onClick={() => run(missing)} disabled={isBusy || !isIdle || missing.length === 0}>
            <Send aria-hidden="true" />
            Enviar los que faltan{missing.length ? ` (${missing.length})` : ''}
          </Button>
        </div>
      </div>
      {!isIdle && !isBusy ? (
        <Notice tone="warning" title="El guante está ocupado" className="mt-4" live>
          Esperá a que termine la operación actual para enviar audio.
        </Notice>
      ) : null}
      {message ? (
        <Notice
          tone={message.tone}
          title={message.tone === 'success' ? 'Listo' : message.tone === 'warning' ? 'Atención' : 'No se pudo completar'}
          className="mt-4"
          live
        >
          {message.text}
        </Notice>
      ) : null}
      {isLoading ? (
        <p className="mt-4 text-sm text-text-muted" role="status">Consultando biblioteca y microSD…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">Todavía no hay gestos en tu biblioteca.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold text-text">{row.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge tone="neutral">Pista {row.audioTrack}</StatusBadge>
                  <StatusBadge tone={row.hasMp3 ? 'primary' : 'warning'}>{row.hasMp3 ? 'MP3 listo' : 'Sin MP3'}</StatusBadge>
                  <StatusBadge tone={row.gloveBytes === null ? 'neutral' : 'success'}>
                    {row.gloveBytes === null ? 'No está en el guante' : `En el guante · ${kib(row.gloveBytes)}`}
                  </StatusBadge>
                </div>
                {row.phase ? (
                  <div className="mt-2">
                    <p className="text-xs text-text-muted" role="status">
                      {row.phase === 'converting' ? 'Convirtiendo…' : `Enviando ${kib(row.sent)} de ${kib(row.total || 1)}`}
                    </p>
                    {row.phase === 'uploading' ? (
                      <ProgressBar value={row.sent} max={row.total || 1} label={`Envío de ${row.name}`} />
                    ) : null}
                  </div>
                ) : null}
                {row.error ? <p className="mt-2 text-sm text-error" role="alert">{row.error}</p> : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto shrink-0"
                onClick={() => run([row])}
                disabled={isBusy || !isIdle || !row.hasMp3}
              >
                {row.gloveBytes === null ? 'Enviar' : 'Reenviar'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
