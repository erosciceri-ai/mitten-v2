# MITTEN V2 ESP32 deployment

The ready-to-upload archive is `mitten-esp32.zip`. Extract it first; the archive
contains a `mitten-esp32/` directory with the firmware modules and board
configuration at its root.

## Upload

1. Install the official MicroPython **v1.29.0 ESP32_GENERIC** firmware for the
   ESP32-WROOM-32 board using Thonny's interpreter settings (the firmware image is
   not included).
2. In Thonny, choose **View → Files**, open the extracted `mitten-esp32/` directory
   on the computer, and upload its contents to the ESP32 root (`/`). Preserve the
   `protocol/` and `utils/` directories.
3. Restart the board. The firmware disconnects the MicroPython REPL from UART0 so
   it can be dedicated to the NDJSON protocol. Close Thonny, then connect the
   browser to that USB serial port using the MITTEN web app.

On normal startup the REPL is intentionally unavailable. Do not leave Thonny or
another serial monitor attached while the web app is connected.

## Audio files are separate

Firmware upload alone cannot install audio on the microSD. For playback, copy
compatible mono PCM WAV files (16 kHz, 16-bit) to
`/mitten_audio/audio/0001.wav` through `/mitten_audio/audio/0050.wav` on the card,
matching each gesture's `audioTrack`. The web sync transfers the gesture profile,
not audio files. A missing/unmounted card leaves sensing and protocol available,
but audio playback unavailable.

## Limits of this package

The board settings follow the provided schematic: flex ADC GPIOs 36/34/35/32/33,
MPU6050 I2C GPIO21/22 at address 0x68, microSD SPI GPIO18/19/23/13, and MAX98357A
I2S GPIO25/26/27 with enable GPIO14. The configuration uses zero MPU offsets so
startup does not need measured calibration data; the recognized orientation is
therefore relative to the sensor's physical mounting.

This package has not been run on the physical board. MicroPython version/build,
power supply capacity, actual card format, and speaker output still require
hardware verification. The schematic specifies a +5V_SYS input but not the power
source's current rating. Never connect a supply until its polarity and voltage
have been checked.
