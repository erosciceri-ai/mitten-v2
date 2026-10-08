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
persistencia API, sincronización, reinicio en otro proceso, reconocimiento y trama
UART de DFPlayer. Necesita Python 3; `MITTEN_TEST_PYTHON` permite indicar su ejecutable.
No requiere pytest para esa prueba. Los bytes del provider en pruebas de audio son
dobles de transporte; esas pruebas no certifican voz ni decodificación MP3.

Para cada workspace ejecutar además `tsc --noEmit -p <workspace>/tsconfig.json`
y su script `build`; construir primero `packages/contracts`.

Resultado de esta corrección: contratos 149, simulador 49, web 65, API 32 y
firmware 316 pruebas aprobadas (611 en total). Los cuatro `tsc --noEmit` y builds
pasaron. El entrypoint TypeScript y el compilado `dist/index.js` respondieron
HTTP 200; la prueba integral también pasó después de la limpieza final.

## Configuración pendiente de entorno y placa

- API: configurar `JWT_SECRET` (mínimo 32 caracteres) desde `.env.example`.
  `TTS_PROVIDER=mock` responde 503 y nunca fabrica ni marca listo un MP3.
  El provider existente ElevenLabs requiere clave y voice ID; Google/Azure no se
  anuncian como implementados. Su solicitud usa el formato MP3 de la
  [API oficial](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
- Audio: archivos separados en `<AUDIO_DIR>/<userId>/mp3/0001.mp3`…`0050.mp3`.
  La descarga requiere autorización del propietario del gesto. Los metadatos de
  archivos globales históricos deben regenerarse. Copiar el MP3 descargado a
  `/mp3/NNNN.mp3` de la microSD sigue siendo un paso físico, no transferencia serie.
- Firmware: completar `hardware_config.example.py` como `hardware_config.py` con
  GPIO, UART, I²C, dirección MPU, atenuación ADC y offsets medidos. No se infiere
  el cableado de V1. Elegir transporte UART/USB según la placa y evitar compartir
  el UART del protocolo con REPL o DFPlayer.
- Validar en el ESP32 real: compatibilidad de la versión MicroPython, lecturas y
  orientación del MPU, calibración física, captura, memoria con el perfil máximo,
  UART/DFPlayer/microSD y recuperación LittleFS ante cortes eléctricos.

El baseline local usa el score V1 por centros de rangos, denominadores mínimos
400 ADC/20 grados y umbral inclusivo 2; los tests fijan vectores de aceptación y
rechazo. Los sensores flex se conservan como ADC raw de 12 bits. DFPlayer usa el
[comando MP3 0x12 de DFRobot](https://github.com/DFRobot/DFPlayer-Mini-mp3/blob/master/DFPlayer_Mini_Mp3/DFPlayer_Mini_Mp3.cpp).

Las garantías de promoción se verifican con fallos inyectados de escritura,
rename, validación y reinicio; las garantías eléctricas del filesystem requieren
la prueba física descrita en `synchronization.md`.
