# Prueba aislada de audio en ESP32

**Objetivo:** oír dos tonos desde una microSD SPI mediante el MAX98357A, sin iniciar MITTEN. El firmware integrado ya usa el reproductor local SPI/I²S en software, pero todavía no está validado en la PCB. Esta prueba aislada no valida gestos, batería, protocolo ni la integración completa.

## Compatibilidad y límites

El repositorio no fija una versión de MicroPython. Hay un registro previo de `ESP32_GENERIC 1.26.1`; comprobar el build instalado, no asumirlo. Para ESP32 clásico, la [API de SDCard 1.26](https://docs.micropython.org/en/v1.26.0/library/machine.SDCard.html) permite SPI en `slot=2` con pines explícitos; [VFS](https://docs.micropython.org/en/v1.26.0/library/vfs.html) monta FAT en solo lectura. [I²S](https://docs.micropython.org/en/v1.26.0/library/machine.I2S.html) es una API en vista previa técnica; el [código ESP32 de 1.26.1](https://github.com/micropython/micropython/blob/v1.26.1/ports/esp32/machine_i2s.c) admite el controlador 0 y usa DMA. El [MAX98357A](https://www.analog.com/en/products/max98357a.html) recibe PCM por I²S, no MP3.

No se requiere instalar paquetes: el ESP32 usa `machine`, `vfs`, `struct` y módulos estándar de MicroPython; el generador usa CPython estándar en la PC. Se usa un bloque de 2 KiB y se solicita un búfer I²S de 8 KiB, además de la memoria del controlador. La escritura es bloqueante a propósito: no ejecutar junto con la captura o el protocolo.

## 1. Verificar antes de energizar

Con la batería y USB desconectados, comprueba continuidad entre cada GPIO y su conector, ausencia de corto entre alimentación y GND, y las etiquetas de **tus** módulos. El esquemático es una referencia, no una medición de la PCB:

| Señales | GPIO provisionales |
| --- | --- |
| microSD CLK / MISO / MOSI / CS | 18 / 19 / 23 / 13 |
| MAX98357A BCLK / LRC / DIN | 26 / 25 / 27 |
| MAX98357A SD/EN | 14; inicia LOW (shutdown), pasa a HIGH tras inicializar I²S y vuelve a LOW antes de liberar I²S |
| Flex 1–5 / MPU6050 SDA, SCL | 36, 34, 35, 32, 33 / 21, 22; no se usan en la prueba |

- **GPIO 25** era un flex en un mapeo anterior. Si la PCB todavía lo conecta a un divisor de sensor, no ejecutes el script con ese circuito conectado.
- Verifica que el módulo microSD sea compatible con señales de 3,3 V hacia el ESP32; no supongas que la tensión de alimentación del módulo y su nivel lógico son iguales. Confirma masa común y alimentación admisible en ambos módulos.
- La hoja de datos del MAX98357A indica que SD_MODE LOW apaga el chip y HIGH lo habilita seleccionando la palabra del canal izquierdo. La mezcla mono requiere una resistencia de configuración. La prueba exige `sd_mode_active_high=True` como confirmación del breakout indicado; no la pases hasta haber verificado continuity GPIO14→SD y ausencia de inversor. El parlante debe ser compatible con la etapa de salida; va entre las dos salidas dedicadas, ninguna a GND. Los tonos son de baja amplitud, pero eso no sustituye comprobar el parlante y la ganancia.
- Para el banco usa una sola fuente verificada, preferentemente USB con la batería y el ST6845-C desconectados. Comprueba que esa fuente puede alimentar los módulos; no unas USB y la salida de 5 V del cargador sin verificar el circuito de alimentación de tu placa. Si falta una comprobación o hay calentamiento, reinicios u olor anormal, desconecta y detén la prueba.

## 2. Preparar la tarjeta y el WAV

Usa una tarjeta de prueba FAT32. No formatees una tarjeta con datos sin respaldarla. En la PC, desde una carpeta temporal vacía, ejecuta `python "<ruta al repositorio>/tools/esp32-audio-smoke/make_test_wav.py"`. Escucha el archivo en la PC y copia `smoke.wav` a la raíz de la tarjeta. Expúlsala e insértala con el circuito apagado. El archivo contiene 2 s de PCM mono de 16 bits, 16 kHz; deben oírse dos tonos ascendentes.

## 3. Cargar y ejecutar sin reemplazar el firmware

1. Cierra la web y cualquier monitor que ocupe el puerto serie. En Thonny selecciona el intérprete MicroPython (ESP32) y el puerto de la placa. Si corre el programa principal, interrúmpelo con **Ctrl+C** y verifica que estás en el REPL `>>>`; no uses reinicio suave antes de cada prueba, porque puede volver a lanzar el arranque normal. Si el firmware no deja acceder al REPL o sigue ocupando periféricos, no fuerces la prueba: usa un ESP32 de banco.
2. En el REPL comprueba el build y las APIs, sin iniciar periféricos: `import sys, machine, vfs; print(sys.implementation); print(hasattr(machine, "SDCard"), hasattr(machine, "I2S"), hasattr(vfs, "VfsFat"))`. Guarda la salida. Si alguna capacidad falta, detente; no reflashees la placa de producción como parte de esta prueba.
3. Abre `mitten_audio_smoke.py` en Thonny y guárdalo en el dispositivo con **ese nombre**. No copies el generador o los tests a la placa ni reemplaces `main.py`, `boot.py` o `hardware_config.py`.
4. Solo después de las comprobaciones eléctricas ejecuta manualmente:

   ```python
   import mitten_audio_smoke
   mitten_audio_smoke.run(pcb_confirmed=True, sd_mode_active_high=True)
   ```

   Espera `WAV: PCM16 mono, 16000 Hz; 64000 bytes`, `PCM submitted: 64000 bytes` y `Smoke test complete`, además de los dos tonos. Los mensajes prueban envío al controlador, no sonido audible. Repite una vez sin reiniciar para comprobar que se liberaron los recursos.

## 4. Diagnóstico y evidencia

| Síntoma | Qué comprobar |
| --- | --- |
| Error SPI o de montaje | Alimentación y niveles, tarjeta FAT32, CS/CLK, orientación MISO/MOSI y si otro programa usa el bus. |
| Error WAV | Nombre exacto, raíz de la tarjeta y formato; vuelve a generar el archivo, no cambies solo la extensión. |
| Error I²S | Build, periférico ocupado y GPIO reales. Si falla la limpieza, detén la prueba y reinicia antes de reintentar. |
| Se enviaron bytes pero no suena | Con el equipo apagado revisa parlante, alimentación, `SD_MODE` y asignación BCLK/LRC/DIN. No aumentes tensión para compensar. |
| Ruido, cortes o reinicio | Detén la prueba. Registra fuente, tensión bajo carga si puedes medirla con seguridad, módulo, parlante y momento exacto del fallo. |

Envía el log completo de ambas ejecuciones, revisión de PCB, modelo de módulos y parlante, pinout medido, fuente utilizada y si ambos tonos se oyeron sin cortes. Si falla, incluye el mensaje de etapa y el traceback. No pruebes extracción de tarjeta en caliente.

## Diseño futuro: web → microSD

| Ruta | Ventaja | Límite |
| --- | --- | --- |
| Exportar WAV y copiar la tarjeta | Menor complejidad; buena referencia inicial | Obliga a abrir la carcasa o exponer la tarjeta. |
| Carga por USB/serial desde herramienta local | Mantiene la tarjeta dentro y permite validar el receptor sin tocar la web | Requiere modo de mantenimiento, una herramienta local y exclusividad del puerto. Útil como paso intermedio. |
| Web Serial en modo de mantenimiento | Reutiliza el enlace web y evita retirar la tarjeta | Requiere diseñar una transferencia separada y versionada; no es el sync de gestos V2. El USB de datos no demuestra que el circuito permita carga y mantenimiento por el mismo conector. |

**Recomendación:** validar primero PCM con copia manual. Para el producto, preferir Web Serial con modo explícito de mantenimiento y WAV PCM generado fuera del ESP32 si el tamaño y tiempo de transferencia resultan aceptables. PCM16 mono a 16 kHz ocupa 32 kB/s; a 115200 baud con 8N1 el máximo teórico es 11,52 kB/s antes del framing: un minuto de audio tarda al menos unos 167 s por ese enlace. Medir lotes reales antes de fijar velocidad o formato. MP3 reduce transferencia y espacio, pero traslada la decodificación y su coste al ESP32.

El diseño debería transferir bloques acotados con offset y confirmación, verificar tamaño y SHA-256 en un archivo temporal, y publicar una revisión de pista solo después de verificarla. Un manifiesto debe vincular `audioTrack` con identidad y revisión del gesto y hash; así un cambio de audio o una pista reutilizada no se confunden con el archivo anterior. Ante desconexión o corte, conservar la pista válida, descartar o reanudar el temporal validado y probar la recuperación real en FAT antes de prometer atomicidad. No usar el límite de mensajes V2 para enviar archivos completos. Ninguna de estas funciones de transferencia está implementada aquí.

## Pruebas en PC

`python -B -m unittest discover -s tools/esp32-audio-smoke -v` comprueba el lector WAV, el envío por bloques y los errores sin ESP32.
