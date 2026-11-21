# MITTEN V2 ESP32 Deployment

Deploy the MicroPython runtime files directly from `firmware/esp32/` to the ESP32 root filesystem (`/`). Do not upload `tests/`, `DEPLOY.md`, or `hardware_config.example.py`.

## Files to upload to `/`

- Top-level modules and assets:
  - `main.py`, `config.py`, `hardware.py`, `hardware_config.py`
  - `capture.py`, `sensors.py`, `recognition.py`, `audio.py`, `audio_store.py`
  - `wifi_manager.py`, `relay_transport.py`, `diag_wifi_audio.py`
  - Optional: `relay_ca.der` (DER root CA certificate loaded by `relay_transport.py` via `CA_PATH = "relay_ca.der"` for `wss://` TLS verification; if omitted, TLS encrypts the socket without verifying the server certificate)
- Package directories (preserve directory structure):
  - `commands/`
  - `error/`
  - `profile/`
  - `protocol/`
  - `staging/`
  - `statemachine/`
  - `storage/`
  - `sync/`
  - `utils/`
  - `validation/`

## Transport modes (`main.py` and `hardware_config.py`)

MITTEN V2 supports two transport modes configured via `TRANSPORT_MODE` in `main.py`:

1. **`TRANSPORT_MODE = "relay"` (default — Wi-Fi WebSocket relay)**:
   - Uses `wifi_manager.py`, `relay_transport.py`, and optional `relay_ca.der` to connect outbound over `wss://` to the backend (`/ws/device`), while the web app connects to `/ws/web`.
   - Persists Wi-Fi credentials in `wifi.json` and pairing credentials in `relay.json`.
   - Configure optional defaults in `hardware_config.py` under `BOARD`:
     - `BOARD["relay_url"]`: default backend relay URL (defaults to `RELAY_URL` in `relay_transport.py`, e.g. `wss://<api-host>/ws/device`).
     - `BOARD["ap_password"]`: optional WPA2 password (8+ characters; defaults to `mitten1234`) for the provisioning soft-AP.
   - When no Wi-Fi credentials are stored in `wifi.json`, or when holding the `BOOT` button (`GPIO0`) for 3 s, the ESP32 starts the provisioning soft-AP (`MITTEN-<suffix>`) at `http://192.168.4.1/` so the user can enter Wi-Fi credentials, the 6-digit pairing code from the Dashboard, and the relay URL.
   - Because UART0 is not used for NDJSON in relay mode, the MicroPython serial REPL remains available for diagnostics.
2. **`TRANSPORT_MODE = "serial"` (fallback — USB UART0)**:
   - On startup, the firmware detaches the MicroPython REPL from UART0 (`os.dupterm(None)`) so UART0 is dedicated to the NDJSON protocol at 115200 baud.
   - Close Thonny or any serial monitor before connecting the browser via Web Serial.

## Upload procedure

1. Install the official MicroPython **v1.26+ / v1.29.0 ESP32_GENERIC** firmware for the ESP32-WROOM-32 board using Thonny or `esptool`.
2. Review `hardware_config.py` (copied or adapted from `hardware_config.example.py`) and `TRANSPORT_MODE` in `main.py` (`"relay"` by default for Wi-Fi, or `"serial"` for USB fallback).
3. In Thonny (**View → Files**) or using `mpremote`, copy the runtime files and directories listed above from `firmware/esp32/` to the ESP32 root (`/`).
4. Optional pre-flight check: before enabling full startup, run `import diag_wifi_audio` from the REPL to verify the microSD mount, test WAV playback over I²S, and test Wi-Fi / HTTPS reachability.
5. Restart the board:
   - In `"relay"` mode (default), generate a pairing code in the web Dashboard, connect to the `MITTEN-<suffix>` Wi-Fi network (`http://192.168.4.1/`) if not yet provisioned, and complete pairing.
   - In `"serial"` mode, close Thonny and connect from the MITTEN web app using **Guante por USB** (Web Serial).

## Audio tracks on the microSD

Gesture profile synchronization (`sync.*`) transfers gesture models and metadata, not audio files. Audio tracks must reside on the microSD card as mono PCM WAV files (16 kHz, 16-bit) at `/mitten_audio/audio/0001.wav` through `/mitten_audio/audio/0050.wav`, matching each gesture's `audioTrack`.

You can populate the microSD card in either of two ways:

1. **Browser-to-glove transfer (`audio.*`)**: In the web Dashboard ("Audio en el guante" → **Enviar** / **Enviar los que faltan**), the browser converts each gesture's MP3 to a 16 kHz 16-bit mono PCM WAV and streams it over the active transport (Wi-Fi relay or Web Serial) in base64 chunks with CRC-32 verification and atomic staging (`audio_store.py`). See `docs/audio-transfer.md`.
2. **Direct microSD copy**: Export or convert compatible 16 kHz 16-bit mono PCM WAV files on a computer and copy them directly to `/mitten_audio/audio/0001.wav`..`0050.wav` on a FAT32-formatted microSD card.

If the microSD card is missing or unmounted, sensor capture, recognition events, and protocol communication remain operational, while local speaker playback is unavailable.

## Hardware limits and verification

The board settings follow the project schematic: flex ADC GPIOs 36/34/35/32/33, MPU6050 I²C GPIO21/22 at address `0x68`, microSD SPI GPIO18/19/23/13, and MAX98357A I²S GPIO25/26/27 with enable GPIO14. The default configuration uses zero MPU offsets so startup does not require pre-measured calibration data; recognized orientation is relative to the sensor's physical mounting.

Physical validation on the assembled PCB (power supply current capacity, microSD SPI wiring, and MAX98357A I²S speaker output) must still be completed on hardware. The schematic specifies a `+5V_SYS` input; never connect a power supply until its polarity, voltage, and current rating have been verified.
