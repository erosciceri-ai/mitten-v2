# Validación sin hardware

La API usa SQLite real también en tests, siempre en memoria cuando `NODE_ENV=test`.
Los tests de firmware usan directorios temporales; no leen ni modifican el perfil del guante.

```sh
npm test --workspace=packages/contracts -- --runInBand --no-cache
npm test --workspace=tools/esp32-simulator -- --runInBand --no-cache
npm test --workspace=apps/web -- --no-cache
npm test --workspace=apps/api -- --no-cache
python -B -m pytest firmware/esp32/tests -q -p no:cacheprovider
```

La suite API incluye `softwareE2E.test.ts`: registro HTTP, captura del firmware,
persistencia API, sincronización, reinicio en otro proceso, reconocimiento y solicitud
de la pista WAV correspondiente en el reproductor SPI/I²S (el módulo legacy DFPlayer fue retirado). También se cubren sin hardware la carga `audio.*` (`audio_store.py`, simulador y navegador) y el relay WebSocket (`ws/relay.test.ts`, `RelayTransport.test.ts`, `test_relay_transport.py`). Necesita Python 3; `MITTEN_TEST_PYTHON` permite indicar su ejecutable.
No requiere pytest para esa prueba. Los bytes del provider en pruebas de audio son
dobles de transporte; esas pruebas no certifican voz ni decodificación MP3.

Para cada workspace ejecutar además `tsc --noEmit -p <workspace>/tsconfig.json`
y su script `build`; construir primero `packages/contracts`.

La evidencia debe actualizarse al cerrar cada etapa mediante los comandos anteriores. La última
validación completa del 20 de noviembre de 2026 (`499f8fa7`) registró **414 pruebas aprobadas y 11 omitidas** en `npm test` (`@mitten/contracts`: 156, `@mitten/simulator`: 57, `@mitten/web`: 132, `@mitten/api`: 66 aprobadas y 11 omitidas sin PostgreSQL/S3 de prueba, scripts raíz de build: 3), **4 pruebas aprobadas** en Playwright E2E (`npm run test:e2e`) y **385 pruebas aprobadas** del firmware (`pytest`): **803 pruebas aprobadas** en total. `npm run build`
también finalizó correctamente y la prueba integral quedó incluida en la suite de la API.

## Configuración pendiente de entorno y placa

- API: configurar `JWT_SECRET` (mínimo 32 caracteres) desde `.env.example`.
  `TTS_PROVIDER=mock` responde 503 y nunca fabrica ni marca listo un MP3.
  Piper es el proveedor utilizado en staging. ElevenLabs requiere clave y voice ID y
  usa el formato MP3 de su [API oficial](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
- Audio: la API guarda los MP3 generados en `<AUDIO_DIR>/<userId>/mp3/0001.mp3`…`0050.mp3`
  (o S3 en producción). La descarga requiere autorización del propietario del gesto.
  La aplicación web convierte cada MP3 a WAV PCM (16 kHz mono 16 bits) y lo sube al
  guante mediante `audio.*` hacia `/mitten_audio/audio/NNNN.wav` (`docs/audio-transfer.md`);
  el ZIP `/api/audio/package` conserva un respaldo MP3 manual.
- Firmware: completar `hardware_config.example.py` como `hardware_config.py` con
  GPIO, UART, I²C, dirección MPU, atenuación ADC y offsets medidos. No se infiere
  el cableado de V1. Elegir `TRANSPORT_MODE` (`"serial"` por USB o `"relay"` por Wi-Fi)
  y `RELAY_URL` según la placa.
- Validar en el ESP32 real: compatibilidad de la versión MicroPython, lecturas y
  orientación del MPU, calibración física, captura, memoria con el perfil máximo,
  portal Wi-Fi + TLS del relay, reproducción SPI/I²S según el [plan de migración](firmware-audio-migration.md) y recuperación ante cortes eléctricos.

El baseline local usa el score V1 por centros de rangos, denominadores mínimos
400 ADC/20 grados y umbral inclusivo 2; los tests fijan vectores de aceptación y
rechazo. Los sensores flex se conservan como ADC raw de 12 bits. La reproducción
local entrega WAV PCM mono 16 kHz 16 bits por I²S al MAX98357A.

Las garantías de promoción se verifican con fallos inyectados de escritura,
rename, validación y reinicio; las garantías eléctricas del filesystem requieren
la prueba física descrita en `synchronization.md`.
