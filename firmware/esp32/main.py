"""MITTEN V2 firmware entry point with a hardware-independent stream loop."""

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

from utils.time import ticks_ms, ticks_diff
from config import FRAME_INCOMPLETE_TIMEOUT_MS, STATE_ERROR, ERR_INTERNAL_ERROR, ERR_SENSOR_ERROR
from error.handler import ErrorHandler
from protocol.commands import FirmwareDispatcher
from protocol.envelopes import build_event, serialize_envelope
from protocol.framing import NdjsonParser


class StreamTransport:
    """Minimal byte-stream contract used by the protocol loop."""

    def read(self):
        raise NotImplementedError

    def write(self, data):
        raise NotImplementedError


class UartStreamTransport(StreamTransport):
    """Adapter around the protocol UART; local audio uses SPI and I2S."""

    def __init__(self, uart):
        self._uart = uart

    def read(self):
        if self._uart.any():
            return self._uart.read()
        return None

    def write(self, data):
        sent = 0
        while sent < len(data):
            count = self._uart.write(data[sent:])
            if not count:
                raise OSError("Protocol UART write failed")
            sent += count
        return sent


async def _yield_ms(milliseconds):
    if hasattr(asyncio, "sleep_ms"):
        await asyncio.sleep_ms(milliseconds)
    else:
        await asyncio.sleep(milliseconds / 1000.0)


async def main_loop(transport, max_iterations=None, sleep_ms=1, sensor_manager=None,
                    audio_player=None, startup_error=None, storage_warning=None,
                    initialize_audio_on_handshake=False):
    """Own the byte transport; dispatcher owns the single runtime service graph."""
    parser = NdjsonParser()
    def emit(envelope):
        transport.write(serialize_envelope(envelope))
    dispatcher = FirmwareDispatcher(emit=emit, sensor_manager=sensor_manager, audio_player=audio_player)
    if startup_error is None:
        dispatcher.startup()
    else:
        dispatcher.enter_error(startup_error[0], startup_error[1])
    storage_warning_reported = False
    audio_initialization_pending = initialize_audio_on_handshake
    pending_since = None
    iterations = 0
    while max_iterations is None or iterations < max_iterations:
        iterations += 1
        chunk = transport.read()
        now = ticks_ms()
        if chunk:
            result = parser.push(chunk)
            pending_since = now if result.remaining else None
            for item_type, item in result.items:
                if item_type == "error":
                    if dispatcher.handshake_compatible:
                        emit(ErrorHandler.from_parse_error(item))
                    continue
                try:
                    response = dispatcher.handle_request(item)
                except Exception as error:
                    response = ErrorHandler.from_exception(error, item.get("id") if isinstance(item, dict) else None)
                if response is not None:
                    uncorrelated = response.get("event") == "protocol.error"
                    if dispatcher.handshake_compatible or not uncorrelated:
                        emit(response)
                if (audio_initialization_pending and dispatcher.handshake_compatible
                        and audio_player is not None):
                    audio_initialization_pending = False
                    if dispatcher.state.current != STATE_ERROR:
                        try:
                            audio_player.initialize(getattr(audio_player, "sd_pin", None))
                        except Exception:
                            try:
                                audio_player.deinitialize()
                            except Exception:
                                pass
                        if not audio_player.mounted:
                            storage_warning = "Audio storage unavailable; local playback is disabled"
                elif audio_initialization_pending and dispatcher.handshake_compatible:
                    audio_initialization_pending = False
                    storage_warning = storage_warning or "Audio playback is not configured"
                if (storage_warning is not None and not storage_warning_reported
                        and isinstance(item, dict)
                        and item.get("command") == "device.handshake"
                        and dispatcher.handshake_compatible):
                    emit(build_event("diagnostic.log", {
                        "level": "INFO",
                        "message": storage_warning,
                    }))
                    storage_warning_reported = True
                # Responses always precede state/progress notifications.
                dispatcher.flush_events()
        elif pending_since is not None and ticks_diff(now, pending_since) >= FRAME_INCOMPLETE_TIMEOUT_MS:
            error = parser.discard_incomplete()
            pending_since = None
            if error is not None and dispatcher.handshake_compatible:
                emit(ErrorHandler.from_parse_error(error))
        dispatcher.update(now)
        if audio_player is not None:
            try:
                audio_player.update(now)
            except Exception:
                # Audio errors must not stop protocol, capture, or recognition processing.
                pass
        await _yield_ms(sleep_ms)
    return dispatcher


def _fallback_transport():
    """Best effort transport used only to announce a startup failure.

    When the board configuration or a firmware module is missing there is no
    way to know the protocol pins, but UART0 with the ESP32 default pins is
    the only channel that can still tell the operator what went wrong.
    """
    try:
        import machine
        return UartStreamTransport(machine.UART(0, baudrate=115200))
    except Exception:
        return None


def _report_boot_failure(transport, error):
    """Announce a failure that happened before the protocol loop started.

    The MITTEN image has no UART REPL and no ESP-IDF console, so an exception
    raised during startup used to leave the board completely silent: the
    operator could not tell a broken installation from a broken cable. The
    device now keeps serving the protocol in ERROR, which lets the frontend
    show the reason and lets device.status report it.
    """
    message = "%s: %s" % (type(error).__name__, error)
    print("MITTEN boot failure: " + message)
    if transport is None:
        transport = _fallback_transport()
    if transport is None:
        return
    try:
        asyncio.run(main_loop(transport, startup_error=(ERR_INTERNAL_ERROR, message)))
    except Exception:
        pass


def main():
    transport = None
    try:
        from hardware import create_hardware, create_protocol_transport
        from hardware_config import BOARD
        transport = create_protocol_transport(BOARD)
    except Exception as error:
        _report_boot_failure(transport, error)
        return
    sensors = player = None
    startup_error = None
    try:
        _, sensors, player = create_hardware(BOARD, transport=transport, initialize_audio=False)
    except Exception as error:
        startup_error = (ERR_SENSOR_ERROR, str(error))
    try:
        asyncio.run(main_loop(transport, sensor_manager=sensors, audio_player=player,
                              startup_error=startup_error,
                              initialize_audio_on_handshake=True))
    finally:
        if player is not None:
            try:
                player.deinitialize()
            except Exception:
                pass


if __name__ == "__main__":
    main()
