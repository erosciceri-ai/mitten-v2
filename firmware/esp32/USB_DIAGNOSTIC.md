# Bare-board USB diagnostic

This entry point tests Protocol V2 on an ESP32_GENERIC with no peripherals.
It does not initialize sensors, audio, profile storage or staging recovery.
It neither generates gesture samples nor reads or writes saved gesture files.

## Temporary startup with a backup

1. Back up the board's existing files to the PC. Do not erase or reflash the ESP32.
2. Stop the old program with Ctrl+C in Thonny. Preserve the board's original
   `main.py` as `main_legacy.py.bak` as well as keeping the PC backup. Do not
   overwrite an existing backup. Leave `boot.py` and all gesture files untouched.
3. Copy the supplied `mitten_diag` directory to `/mitten_diag` on the ESP32,
   preserving its structure. Copy the package's root `main.py` to the board root
   only after preserving the original. This small launcher starts the diagnostic
   after each reset, including USB reconnects. It is not the normal glove startup.
4. Binary `sys.stdin.buffer` and `sys.stdout.buffer` are required. The user's
   ESP32_GENERIC MicroPython 1.26.1 build reports both as available. Release
   Thonny's serial connection, reset the board and connect the web app to that
   port. Verify the response below rather than assuming a reconnect succeeded.

To restore the previous program, stop the diagnostic with Ctrl+C in Thonny,
restore the backed-up original as root `main.py`, then reset. Keep the backups.

## Expected results

- `device.handshake` succeeds and reports `state: "ERROR"`.
- `device.status` succeeds with `SENSOR_ERROR` and the message
  `USB-only diagnostic: sensors intentionally disabled`.
- `ERROR` is intentional here, not evidence that the ESP32 is broken.
- Before handshake, functional commands return `HANDSHAKE_REQUIRED`.
- After handshake, capture and all synchronization commands return `INVALID_STATE`.
- No capture-completed or recognition events are produced. A successful USB test
  does not validate sensors, calibration, audio or physical gesture recognition.

Existing production source remains unchanged by this launcher. Do not use this diagnostic as the
final glove firmware. Keep the microSD and audio module disconnected in this test.
