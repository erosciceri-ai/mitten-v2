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

La evidencia debe actualizarse al cerrar cada etapa mediante los comandos anteriores. La última
validación completa del 8 de octubre de 2026 registró 149 pruebas de contratos, 49 del simulador,
72 de la web, 39 de la API y 316 del firmware: 625 pruebas aprobadas en total. `npm run build`
también finalizó correctamente y la prueba integral quedó incluida en la suite de la API.

## Configuración pendiente de entorno y placa

- API: configurar `JWT_SECRET` (mínimo 32 caracteres) desde `.env.example`.
  `TTS_PROVIDER=mock` responde 503 y nunca fabrica ni marca listo un MP3.
  El provider existente ElevenLabs requiere clave y voice ID; ningún otro proveedor TTS se
  anuncia como implementado. Su solicitud usa el formato MP3 de la
  [API oficial](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
- Audio: archivos separados en `<AUDIO_DIR>/<userId>/mp3/0001.mp3`…`0050.mp3`.
  La descarga requiere autorización del propietario del gesto. Los metadatos de
  archivos globales históricos deben regenerarse. Copiar el MP3 descargado a
  `/mp3/NNNN.mp3` de la microSD sigue siendo un paso físico, no transferencia serie.
- Firmware: completar `hardware_config.example.py` como `hardware_config.py` con
  GPIO, UART, I²C, dirección MPU, atenuación ADC y offsets medidos. No se infiere
  el cableado de V1. Elegir transporte UART/USB según la placa y evitar compartir
  el UART del protocolo con REPL o DFPlayer.
  Para la puesta en marcha sin audio, la plantilla usa `audio_enabled: False`:
  no requiere `dfplayer_uart`, no inicializa un reproductor y conserva captura,
  sincronización y eventos `recognition.detected`. Estos eventos no demuestran
  reproducción. Las configuraciones anteriores que omiten `audio_enabled`
  conservan la ruta DFPlayer; `True` exige su UART. Esta opción no implementa
  MAX98357A, microSD SPI ni transferencia de audio por USB. El transporte USB,
  los pines y los offsets físicos siguen requiriendo validación en placa.
  La plantilla selecciona `protocol_transport: 'stdio'` para ESP32_GENERIC:
  utiliza `sys.stdin.buffer`, `sys.stdout.buffer` y `select.poll(0)`, sin
  reconfigurar UART0. Reserva GPIO1/GPIO3 y no requiere `protocol_uart`.
  El modo anterior sigue siendo el predeterminado si se omite el selector
  (`'uart'`), con su configuración explícita. Cerrar la sesión serie de Thonny
  antes de conectar la web: sólo un programa debe ser propietario del puerto.
  No añadir `print` de diagnóstico al canal NDJSON. Ctrl+C sigue disponible
  para recuperación; las pruebas de escritorio no validan reinicios, banners
  ni el comportamiento del USB físico.
  Referencias: [consola ESP32](https://docs.micropython.org/en/v1.26.0/esp32/quickref.html#general-board-control)
  y [poll](https://docs.micropython.org/en/v1.26.0/library/select.html).
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
