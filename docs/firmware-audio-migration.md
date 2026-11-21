# Migración del audio autónomo del guante

**Decisión aprobada:** el ESP32 lee pistas WAV PCM desde microSD por SPI y entrega PCM por I²S al MAX98357A y al parlante. La reproducción (`firmware/esp32/audio.py`), la recepción transaccional (`audio_store.py`, comandos `audio.*`) y la conversión MP3→WAV en el navegador (`docs/audio-transfer.md`) ya están integradas en software; **la validación física en placa sigue pendiente**.

## Punto de partida

- El firmware arranca en `firmware/esp32/main.py`; `hardware.py` inicializa sensores, transporte serie y el reproductor SPI/I²S. DFPlayer por UART queda como antecedente histórico, no como dependencia activa. El modo de diagnóstico USB pertenece a una etapa anterior.
- El reconocimiento pasa `audioTrack` al reproductor desde `firmware/esp32/protocol/commands.py`. El rango lógico 1–50 se mantiene y se resuelve a `/mitten_audio/audio/{audioTrack:04d}.wav`. El protocolo V2 no cambia.
- Se aceptan WAV RIFF PCM mono, 16 kHz, 16 bits. La reproducción entrega bloques de 512 bytes desde el ciclo de actualización; errores de audio no deben interrumpir protocolo, captura ni reconocimiento.
- Si no se monta la tarjeta, el amplificador permanece deshabilitado y el firmware conserva los demás servicios; la reproducción queda no disponible hasta reiniciar.
- La API genera MP3 y la web permite descargar un respaldo ZIP o convertir cada pista a WAV en el navegador para subirla al guante vía `audio.*` (`docs/audio-transfer.md`). El paquete MP3 por sí solo no acredita que los archivos estén en el guante; `sync.*` sigue transmitiendo únicamente el perfil y sus identificadores de pista.

## Pinout provisional

Referencia: último esquemático informado. Antes de programar la configuración definitiva, contrastar orden y continuidad de señales con la PCB fabricada; verificar alimentación, masa, niveles lógicos y el parlante instalado. No conectar la alimentación portátil a la PCB hasta comprobar la salida y polaridad del módulo real.

| Circuito | Señal | GPIO |
| --- | --- | --- |
| Flex | Flex 1–5, en orden | 36, 34, 35, 32, 33 |
| MPU6050 | SDA / SCL | 21 / 22 |
| microSD SPI | MISO / MOSI / CLK / CS | 19 / 23 / 18 / 13 |
| MAX98357A | LRC / BCLK / DIN | 25 / 26 / 27 |
| MAX98357A | SD/EN | 14 |

**Conflicto conocido:** el mapeo antiguo utilizaba GPIO 25 para un flex; el esquema nuevo lo asigna a LRC. No reutilizar esa configuración antigua.

## Decisiones técnicas registradas

| Decisión | Alternativas y criterio |
| --- | --- |
| Formato y ruta | WAV PCM mono, 16 kHz, 16 bits; `/mitten_audio/audio/NNNN.wav`. No se incluye decodificación MP3. |
| Reproducción | I²S TX por GPIO25/26/27 y lectura en bloques de 512 bytes distribuida entre ciclos de actualización. La latencia real depende del driver I²S y requiere medición física. |
| Provisión | El navegador convierte los MP3 a WAV y los transfiere al guante mediante `audio.*` (`docs/audio-transfer.md`); la copia manual a `/mitten_audio/audio/NNNN.wav` o el ZIP MP3 de respaldo siguen disponibles. |
| Asignación | `audioTrack` debe ser entero 1–50 y corresponde al archivo `audio/{audioTrack:04d}.wav`; ausencia o error no altera el identificador del gesto. |

## Resultados de verificación (2026-11-13)

### Pruebas

El firmware se probó con un entorno virtual CPython 3.12.14 aislado que contiene `pytest 9.1.1`; no se añadió pytest a dependencias de producción ni a los manifiestos del proyecto.

| Suite | Resultado |
| --- | --- |
| `python -B -m pytest firmware/esp32/tests -q -p no:cacheprovider` | **324 passed** |
| `npm test` — root/dev ports | **3 passed** |
| `@mitten/contracts` | **149 passed** |
| `@mitten/api` | **55 passed, 11 skipped** |
| `@mitten/web` | **84 passed** |
| `@mitten/esp32-simulator` | **49 passed** |

El total del repositorio fue **340 passed, 11 skipped** en las suites JavaScript y TypeScript, además de las 324 del firmware. Para que la suite web cargara, se restauró localmente `@vitejs/plugin-react`, que ya figura como `devDependency` fijada en el lockfile pero faltaba en `node_modules`; no se modificaron manifiestos ni lockfile. En el sandbox de Windows, asyncio y Vitest encontraron restricciones al crear sockets temporales/renombrar temporales; los comandos completos se repitieron fuera del sandbox y pasaron.

Una prueba E2E todavía esperaba bytes de comandos DFPlayer por UART, pese a que el fixture de firmware ya solicita WAV. Se corrigió la expectativa para comprobar que el gesto reconocido solicita exactamente su `audioTrack`; esa prueba y la suite completa de API pasan.

### MicroPython y compatibilidad

El repositorio **no fija una versión exacta** del runtime MicroPython. La única versión anotada como registro previo en `tools/esp32-audio-smoke/README.md` es `ESP32_GENERIC 1.26.1`; no hay evidencia de que sea la imagen instalada en la placa. Por ello se tomó MicroPython `ESP32_GENERIC v1.26.1` como versión de referencia para esta comprobación, no como confirmación del entorno físico.

La documentación oficial [v1.26.0 de `SDCard`](https://docs.micropython.org/en/v1.26.0/library/machine.SDCard.html), [VFS](https://docs.micropython.org/en/v1.26.0/library/vfs.html) e [I²S](https://docs.micropython.org/en/v1.26.0/library/machine.I2S.html) cubre las llamadas usadas. MicroPython identifica [v1.26.1 como patch release](https://github.com/micropython/micropython/releases/tag/v1.26.1) de v1.26.0:

- `machine.SDCard(slot=2, sck, cs, miso, mosi, freq=...)` selecciona SPI y permite pines explícitos.
- `vfs.VfsFat` y `vfs.mount(..., readonly=True)` soportan el montaje FAT de solo lectura.
- `machine.I2S(id=0, mode=TX, bits=16, format=MONO, rate=16000, ibuf=...)` y `I2S.irq(handler)` son APIs documentadas; `irq()` convierte `write()` en no bloqueante.
- `I2S` sigue marcado como **Technical Preview**. La disponibilidad y comportamiento deben verificarse con `sys.implementation` y `hasattr(machine, "I2S")` en el ESP32 objetivo, cuyo modelo/familia todavía no se confirmó.

### Loop, sensores y GPIO14

El flujo de reconocimiento solicita la pista sin transmitir todo el archivo dentro de `dispatcher.update`. `main_loop` sigue atendiendo el transporte y actualizando sensores; después bombea como máximo un bloque PCM de 512 bytes por iteración. Con `I2S.irq()` disponible, la escritura I²S es no bloqueante. La lectura FAT/SPI de 512 bytes y la apertura/validación del WAV sí son síncronas; si el driver no ofrece `irq()`, la escritura cae al modo bloqueante. A 16 kHz mono de 16 bits, 512 bytes representan 16 ms de audio, pero eso **no limita el tiempo real** de una lectura SD ni el costo de inicialización. No se midió latencia física: no se puede afirmar que el reconocimiento/captura esté libre de retrasos.

`hardware.py` lleva GPIO14 a LOW antes de inicializar sensores y periféricos, y entrega ese mismo pin al reproductor. El reproductor solo lo pone HIGH después de validar el WAV e inicializar I²S; ante error o liberación, lo devuelve a LOW antes de desmontar/liberar recursos. La prueba automatizada valida LOW durante montaje fallido y errores de reproducción. Esto verifica el comportamiento del código, no el nivel eléctrico real en la PCB.

## Siguientes pruebas físicas

1. Confirmar el modelo ESP32 y ejecutar en REPL `print(sys.implementation)` y `hasattr(machine, "SDCard"), hasattr(machine, "I2S"), hasattr(vfs, "VfsFat")`; registrar el build exacto antes de cargar el firmware.
2. Con la alimentación desconectada, medir continuidad y ausencia de cortos; confirmar GPIO14→SD/EN, alimentación, masa, microSD CLK/MISO/MOSI/CS y señales I²S según el pinout provisional.
3. Probar arranque con tarjeta ausente, montaje, archivo WAV compatible, pista inexistente, archivo truncado y fallo durante reproducción; medir GPIO14 con multímetro/osciloscopio.
4. Medir duración de `capture_sample`, intervalo entre reconocimientos, latencia de `request_track` y tiempo máximo de lectura SD durante reproducción; verificar que captura y NDJSON mantienen sus plazos.
5. Reproducir manualmente un WAV conocido mientras se observa la salida I²S y el parlante. La reproducción física continúa pendiente.

La provisión desde la web (`audio.*`) y la conversión MP3→WAV ya están integradas en software (`docs/audio-transfer.md`); continúa pendiente la validación física de placa, microSD y parlante.

**Riesgos principales:** GPIO incompatibles, alimentación insuficiente, buffers I²S sin datos, latencia del driver que afecte el loop, y desalineación entre el perfil y los archivos de tarjeta. El hito mínimo sigue siendo **un gesto y una pista reproducibles sin la computadora** y aún requiere prueba en la PCB.
