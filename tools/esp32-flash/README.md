# esp32-flash

Escribe la imagen de aplicación de la ESP32 sin borrar el filesystem.

## Por qué existe

Dos cosas hacen que el flasheo normal falle en esta placa:

1. **El enlace USB se cae durante transferencias largas.** El CP210x se
   desenumera del bus USB a los ~12 s de tráfico sostenido, y esptool informa
   `No more data to read from the serial port`. La imagen de aplicación son
   1,6 MB, que a 115200 baud son ~100 s de transferencia: suficiente para que
   se corte.

2. **La placa no entra en modo ROM por auto-reset.** En este NodeMCU ESP-32S el
   reset por DTR/RTS de esptool no alcanza: el chip queda mudo pero el ROM no
   responde al sync (`Wrong boot mode detected (0x13)` o `No serial data
   received`). Hay que entrar con el botón `BOOT` + `EN`.

Esta herramienta resuelve la primera: escribe la imagen **en trozos de
128 KiB**, así cada transferencia dura unos segundos. Entre trozos el chip
sigue en modo ROM (esptool se invoca con `--before/--after no-reset`), así que
**no hay que tocar ningún botón entre trozos**. La segunda hay que resolverla a
mano: el operador pone la placa en ROM una vez y la herramienta hace el resto.

## Uso

```sh
# La placa debe estar en modo ROM (BOOT mantenido, EN tocado, BOOT soltado)
python mitten_flash_app.py imagen.bin

# Por defecto usa 0x10000, 128 KiB por trozo y 921600 baud
```

La herramienta reintenta cada trozo por sí sola. Si el chip se sale de modo
ROM, avisa y espera a que lo vuelvan a poner.

## Qué escribe y qué no

| Región | Offset | ¿Se toca? |
| --- | --- | --- |
| Aplicación | `0x10000` | **Sí**, es lo único que escribe |
| Tabla de particiones | `0x8000` | No |
| Bootloader | `0x1000` | No |
| Filesystem | `0x200000`–`0x400000` | **No** |

Nunca usa `erase_flash`: el filesystem del guante sobrevive al flasheo.

## Imágenes de referencia

Construidas con MicroPython `v1.26.1` + ESP-IDF `v5.4.2` (ver
`firmware/esp32/MICROPYTHON_BUILD.md`):

| Archivo | SHA-256 | Uso |
| --- | --- | --- |
| `micropython-repl-console.bin` | `719e2e2bc673f63077741c04f68624e73674efffd7834b873bb9087a60775603` | Transferir archivos del firmware (tiene REPL) |
| `micropython-mitten-uart-off.bin` | `f7bda723360e7d355d3ca35fd09a6c398f78fdc9c231720213288ab8d71368f0` | Imagen final del firmware (sin REPL) |
| `firmware-mitten-v1.26.1-uart0.bin` | `2c128b1ad7363cc409d3e534bd95e339dd82c9c94c19e5379dbe0d56463703c2` | Imagen combinada, offset `0x1000` (no usar en el ciclo) |

## Nota de alimentación

Si el módulo de carga de la batería está conectado al pin 5V/VIN de la placa,
enchufar el USB alimenta también el cargador y el puerto del PC puede cortar el
dispositivo. Para las sesiones de datos: **módulo de carga desconectado**.
