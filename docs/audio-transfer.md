# Carga de audio al guante

**Estado:** implementado en contratos, firmware, simulador y `DeviceService`. La especificación
normativa está en `docs/protocol.md` §12.12; este documento conserva el diseño y sus alternativas.
La interfaz web (modo «Guante por Wi-Fi», código de vinculación y panel «Audio en el guante» con progreso)
está en `DashboardPage`. Pendiente: prueba en hardware real.

## Flujo

1. La web descarga el MP3 de cada gesto desde el API (ya existe).
2. El navegador lo convierte a WAV PCM mono 16 kHz 16 bits (`mp3ToGloveWav`) y calcula su CRC-32.
3. La web envía el WAV por el protocolo V2 en fragmentos de hasta 3072 bytes (base64 en JSON).
4. El firmware escribe en `/mitten_audio/staging/NNNN.part`, verifica tamaño, CRC-32 y cabecera WAV
   con el mismo validador del reproductor y publica con `rename` a `/mitten_audio/audio/NNNN.wav`.
   Si algo falla, la pista anterior queda intacta.

## Comandos (V2, aditivos)

| Comando | Payload | Resultado |
| --- | --- | --- |
| `audio.begin` | `audioTrack` 1–50, `sizeBytes`, `crc32` | `audioTrack`, `offset: 0`, `chunkMaxBytes` |
| `audio.chunk` | `audioTrack`, `offset`, `data` (base64) | `offset` (siguiente esperado) |
| `audio.commit` | `audioTrack` | `audioTrack`, `sizeBytes` |
| `audio.abort` | `{}` | `{}` |
| `audio.status` | `{}` o `{ audioTrack }` | pistas guardadas con `sizeBytes`; con `audioTrack`, también `crc32` |

Los fragmentos son estrictamente secuenciales. Ante `AUDIO_BAD_OFFSET`, `error.details.offset`
indica desde dónde reanudar. Una carga sin actividad durante 30 s se descarta.

## Errores (`error.code`)

`AUDIO_INVALID_TRACK`, `AUDIO_TOO_LARGE`, `AUDIO_BAD_CHUNK`, `AUDIO_BAD_OFFSET`, `AUDIO_NO_UPLOAD`,
`AUDIO_BUSY`, `AUDIO_NO_SPACE`, `AUDIO_INTEGRITY`, `AUDIO_INVALID_WAV`, `AUDIO_UNAVAILABLE`, `AUDIO_IO`.
Ya los produce `AudioStore` (`AudioStoreError.code`).

## Reglas de estado

- `audio.begin` solo en `IDLE` y sin reproducción en curso; pasa el dispositivo a `SYNCING`.
- Una sola carga a la vez; es excluyente con `sync.*` y `capture.start` (reciben `DEVICE_BUSY`).
- La microSD se monta en escritura solo durante la carga (`AudioPlayer.remount`) y vuelve a solo
  lectura al terminar; si el reproductor está ocupado, se reintenta en `AudioStore.tick()`.

## Tamaños y tiempos (estimación aritmética, sin medir)

- Máximo por pista: 524 288 bytes (16 s). Un segundo de audio ocupa 32 000 bytes.
- Fragmento de 3072 bytes → 4096 caracteres base64, dentro del límite de 8192 bytes por mensaje.
- Por Web Serial a 115 200 baudios entran ≈ 11,5 KB/s en el cable; con base64 y sobrecarga del
  envelope, ≈ 8 KB/s útiles, es decir unos 4 s por cada segundo de audio. Por relay depende de la red.

## Capas

`packages/contracts` (tipos, validadores, builders y tests; recompilar `dist`),
`firmware/esp32/protocol/commands.py` + `audio_store.py` + máquina de estados,
`tools/esp32-simulator/src/dispatcher.ts`, `apps/web/src/serial/DeviceService.ts`
(`uploadAudio`, `getAudioStatus`) y `apps/web/src/audio/gloveWav.ts` (conversión MP3→WAV).

## Alternativas descartadas

- **Conversión en el servidor:** Render no trae ffmpeg y el MP3 ya es el formato almacenado.
- **Pedir PCM 16 kHz al proveedor de voz:** cambia el contrato MP3 de todo el API y del paquete de microSD.
- **Canal binario aparte en el relay:** evita tocar el protocolo, pero crea un segundo protocolo sin
  documentar y solo funcionaría por Wi-Fi.
