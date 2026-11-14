# MITTEN UART firmware build

The pictured NodeMCU ESP-32S uses an ESP-WROOM-32 module, which is the classic
ESP32 target. The USB-UART bridge is connected to UART0 (GPIO1/TX0 and GPIO3/RX0)
on the board shown. MITTEN uses this channel for its JSON/LF protocol, so the
MicroPython UART REPL must be disabled in the firmware image.

## Pinned build

Build the upstream MicroPython `v1.26.1` tag for `ESP32_GENERIC` with ESP-IDF
`v5.4.2`:

On Windows, use WSL2 with Ubuntu. In an elevated PowerShell window, install
WSL/Ubuntu with `wsl --install -d Ubuntu`, then restart Windows if requested.
Inside Ubuntu, install the ESP-IDF prerequisites:

```sh
sudo apt-get update
sudo apt-get install -y git wget flex bison gperf python3 python3-pip python3-venv cmake ninja-build ccache libffi-dev libssl-dev dfu-util libusb-1.0-0
```

These are Espressif's listed Ubuntu/Debian prerequisites for ESP-IDF v5.4.2.
The ESP-IDF installer supplies the Xtensa compiler, `idf.py` environment and
Python tools; the MicroPython repository builds `mpy-cross` below.

```sh
mkdir -p ~/esp
cd ~/esp
git clone --branch v1.26.1 --recurse-submodules https://github.com/micropython/micropython.git
git -C micropython rev-parse HEAD
git clone --branch v5.4.2 --recurse-submodules https://github.com/espressif/esp-idf.git
cd esp-idf
./install.sh esp32
. ./export.sh
cd ../micropython
```

The checked-in patch applies three version-specific changes: disable MicroPython's
UART REPL in `mpconfigboard.h`, include a MITTEN `sdkconfig` defaults file from
`mpconfigboard.cmake`, and add these ESP-IDF settings:

```c
#define MICROPY_HW_ENABLE_UART_REPL (0)
```

```ini
CONFIG_ESP_CONSOLE_NONE=y
CONFIG_BOOTLOADER_LOG_LEVEL_NONE=y
CONFIG_LOG_DEFAULT_LEVEL_NONE=y
```

The version-pinned patch is checked in at
`firmware/esp32/patches/micropython-v1.26.1-uart-repl-off.patch`. Apply it from
the MicroPython source root before compiling:

```sh
git apply /mnt/c/Users/roman/Documents/mitten-v2/firmware/esp32/patches/micropython-v1.26.1-uart-repl-off.patch
```

Confirm the override is present and the source tree still identifies as tag
`v1.26.1` before building.

The ESP32 UART header otherwise enables UART REPL when neither USB CDC nor USB
Serial/JTAG is selected. The photographed classic ESP32 board uses an external
USB-UART bridge, so that default would put the REPL and MITTEN protocol on the
same UART. `os.dupterm(None)` at runtime does not disable the port's low-level
UART REPL initialization. The sdkconfig file selects no ESP-IDF console and
disables bootloader/app log output on that UART. ROM startup bytes can still be
emitted before the application starts; they are outside the running protocol
session.

The activated shell must still have ESP-IDF `v5.4.2` selected for target
`esp32`. Build:

```sh
make -C mpy-cross
cd ports/esp32
make submodules
make BOARD=ESP32_GENERIC
```

Expected outputs under `ports/esp32/build-ESP32_GENERIC/` are:

- `firmware.bin`: combined bootloader, partition table and MicroPython image;
- `bootloader/bootloader.bin`;
- `partition_table/partition-table.bin`;
- `micropython.bin`;
- `sdkconfig` and `flasher_args.json` (the effective build and flash map).

The v1.26.1 combined image starts at flash offset `0x1000`. Its bootloader is
placed at `0x1000`, partition table at `0x8000`, and application at `0x10000`.
The stock `ESP32_GENERIC` partition table reserves the first 2 MiB for firmware
and requires at least 4 MiB of flash. The board metadata, partition CSV and
`makeimg.py` define these values. Prefer the generated flash map or `make deploy`
over hand-entered component offsets. Do not run `make erase` or
`idf.py erase-flash`.
Do not commit generated binaries. For every release, record alongside the image:

- MicroPython tag and `git rev-parse HEAD` output;
- ESP-IDF version and target (`esp32`);
- the `mpconfigboard.h` override above and any `sdkconfig` changes;
- the artifact's SHA-256;
- MITTEN firmware and protocol versions packaged into the filesystem/image.

This procedure builds the image only. It does not flash a board. The ROM
bootloader itself remains available for recovery.

## Copy MITTEN files and install without a full erase

Because the custom image has no UART REPL, transfer the Python files while the
currently installed REPL-enabled image is still running. First obtain the MPU
offsets below and update the ignored local `hardware_config.py`. Back up any
existing `/gestures.json` and `/hardware_config.py` you need to retain. Then use
`mpremote fs cp -r` to copy the runtime files and packages from this repository
to the device root. Include the root modules `main.py`, `hardware.py`,
`hardware_config.py`, `config.py`, `sensors.py`, `capture.py`, `audio.py`, and
`recognition.py`, plus directories `commands`, `error`, `protocol`, `profile`,
`staging`, `statemachine`, `storage`, `sync`, `utils`, and `validation`.
Do not copy `tests`, `tools`, or this build guide to the device.

After checking the local backup and that the device flash size/partition layout
matches its current ESP32_GENERIC v1.26.1 installation, flash the combined image
at `0x1000`; this writes the firmware/partition regions and does not request a
whole-chip erase. The filesystem is preserved only if its partition remains
unchanged. `firmware.bin` is not a file to copy into the MicroPython filesystem.

Local audio stays on the microSD card, not the ESP32 internal filesystem. The
player mounts the card read-only at `/mitten_audio` and expects
`/audio/0001.wav` through `/audio/0050.wav` as PCM, mono, 16-bit, 16000 Hz WAVs.

## Mapa de flash de esta placa (medido)

| Región | Offset | Tamaño | Contenido |
| --- | --- | --- | --- |
| Bootloader | `0x1000` | 16 KiB | Second stage de MicroPython |
| Tabla de particiones | `0x8000` | 4 KiB | `nvs`, `phy_init`, `factory` |
| Aplicación | `0x10000` | `0x1F0000` | Imagen de MicroPython (`factory`) |
| Filesystem | `0x200000` | `0x200000` | FAT16 del usuario |

La región `factory` termina en `0x200000`; escribir dentro de `0x10000`–`0x200000`
no toca el filesystem. `erase_flash` sí lo borra: no usarlo.

## Modo de descarga en esta placa

El auto-reset de `esptool` **no** logra entrar en modo ROM en esta placa.
Medido sobre el NodeMCU ESP-32S con CP210x:

| Secuencia | Resultado |
| --- | --- |
| `esptool` con reset por defecto | `Wrong boot mode detected (0x13)`: el chip arranca normal |
| Assertion de DTR (IO0 bajo) + pulso de EN | El chip queda mudo (modo descarga) pero **el ROM no responde al sync**; `esptool` informa `No serial data received` |
| Botón `BOOT` mantenido + `EN` tocado + `BOOT` soltado | Funciona: `esptool` sincroniza y verifica hashes |

Conclusión operativa: entrar en modo ROM requiere el botón. Cuando la placa ya
está en ROM, **no la reinicies**: usá `--before no-reset` y `--after no-reset`
para que `esptool` hable con el bootloader sin sacarlo de ese modo ni tocar el
filesystem.

```sh
esptool --port COM5 --chip esp32 --before no-reset --after no-reset chip-id
esptool --port COM5 --chip esp32 --before no-reset --after no-reset \
    write-flash 0x10000 <imagen.bin>
```

Al terminar, el chip sigue en ROM: hay que soltar `BOOT` y pulsar `EN` para
arrancar normal.

## Ciclo de trabajo con la placa

La imagen MITTEN no tiene REPL, así que los archivos del firmware se transfieren
con la imagen que sí la tiene:

```text
1. BOOT + EN                  ->  la placa queda en modo ROM
2. escribir imagen con REPL   ->  solo en 0x10000, sin erase
3. EN                         ->  arranque normal
4. copiar el firmware         ->  tools/esp32-firmware-sync (o Thonny)
5. verificar el filesystem    ->  tools/esp32-firmware-sync --check
6. BOOT + EN                  ->  volver a modo ROM
7. escribir imagen MITTEN     ->  solo en 0x10000, sin erase
8. EN                         ->  arranque normal
9. verificar el handshake     ->  tools/esp32-handshake-check
```

Herramientas:

| Herramienta | Para qué |
| --- | --- |
| `tools/esp32-firmware-sync` | Calcula el conjunto de runtime del firmware, lo compara con la placa y copia lo que falta |
| `tools/esp32-handshake-check` | Envía el `device.handshake` y valida el bootstrap contra el contrato V2 |

Ambas necesitan una imagen con REPL para lo primero; la segunda habla el
protocolo y funciona con la imagen MITTEN.

## Imágenes de referencia

Construidas en WSL con MicroPython `v1.26.1` y ESP-IDF `v5.4.2`:

| Artefacto | SHA-256 |
| --- | --- |
| `micropython-mitten-uart-off.bin` (aplicación final, sin REPL) | `f7bda723360e7d355d3ca35fd09a6c398f78fdc9c231720213288ab8d71368f0` |
| `micropython-repl-console.bin` (aplicación con REPL para transferir) | `719e2e2bc673f63077741c04f68624e73674efffd7834b873bb9087a60775603` |
| `firmware-mitten-v1.26.1-uart0.bin` (combinada, offset `0x1000`) | `2c128b1ad7363cc409d3e534bd95e339dd82c9c94c19e5379dbe0d56463703c2` |

No instalar la imagen combinada en `0x1000` durante el ciclo: eso reescribe
bootloader y tabla de particiones.

## Bytes del ROM en el canal de protocolo

El ROM de la ESP32 imprime su banner en UART0 antes de que la aplicación
arranque (`ets Jul 29 2019`, `rst:0x1 ... boot:0x13`). Esos bytes llegan al
puerto USB pero no forman parte del protocolo: el parser los descarta y,
antes del handshake, no se emite ningún evento por ellos.

## Recovery path

The board photo shows `BOOT`/`IO0` and `EN` buttons. If the custom image boots
but no REPL is available, put the ESP32 into its ROM download mode with those
buttons and install an official `ESP32_GENERIC` MicroPython image using its
normal USB-UART installation procedure. The official image restores the UART0
REPL. Do not use a full-chip erase when preserving the MicroPython filesystem
matters: erasing flash deletes that filesystem. A firmware write that leaves
the filesystem partition untouched can preserve it, but the exact write
addresses and partition compatibility must be checked for the official image
and this board before flashing.

ROM download mode is a flashing/recovery path, not an interactive MicroPython
REPL. The REPL becomes available after a REPL-enabled application image boots.

The cheapest recovery from a silent board is to install the REPL-enabled
application image (`micropython-repl-console.bin`) at `0x10000` only: the
filesystem is preserved, the REPL comes back, and
`tools/esp32-firmware-sync --check` then tells exactly which runtime files are
missing on the board.

## Board-specific calibration values

The ignored local `hardware_config.py` is configured from the actual board
inspection: MPU6050 address `0x68` on I2C0 (SDA 21, SCL 22), with offsets
`[-177.3251, -166.9727]` degrees measured in the chosen neutral pose. These are
circular means from ten individual readings. The included
`firmware/esp32/tools/read_mpu_calibration.py` takes 50 readings at 20 ms
intervals if a more repeatable measurement is needed; keep the glove still and
copy its printed values into the ignored local configuration. The script does
not write calibration to the device.
