"""MITTEN V2 firmware entry point with a hardware-independent stream loop."""

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

from utils.time import ticks_ms, ticks_diff
from config import FRAME_INCOMPLETE_TIMEOUT_MS
from error.handler import ErrorHandler
from protocol.commands import FirmwareDispatcher
from protocol.envelopes import serialize_envelope
from protocol.framing import NdjsonParser


class StreamTransport:
    """Minimal byte-stream contract used by the protocol loop."""

    def read(self):
        raise NotImplementedError

    def write(self, data):
        raise NotImplementedError


class UartStreamTransport(StreamTransport):
    """Adapter around one protocol UART; DFPlayer will use a separate UART."""

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


async def main_loop(transport, max_iterations=None, sleep_ms=1, sensor_manager=None, dfplayer=None):
    """Own the byte transport; dispatcher owns the single runtime service graph."""
    parser = NdjsonParser()
    def emit(envelope):
        transport.write(serialize_envelope(envelope))
    dispatcher = FirmwareDispatcher(emit=emit, sensor_manager=sensor_manager, dfplayer=dfplayer)
    dispatcher.startup()
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
                # Responses always precede state/progress notifications.
                dispatcher.flush_events()
        elif pending_since is not None and ticks_diff(now, pending_since) >= FRAME_INCOMPLETE_TIMEOUT_MS:
            error = parser.discard_incomplete()
            pending_since = None
            if error is not None and dispatcher.handshake_compatible:
                emit(ErrorHandler.from_parse_error(error))
        dispatcher.update(now)
        await _yield_ms(sleep_ms)
    return dispatcher


def main():
    from hardware import create_hardware
    from hardware_config import BOARD
    transport, sensors, player = create_hardware(BOARD)
    asyncio.run(main_loop(transport, sensor_manager=sensors, dfplayer=player))


if __name__ == "__main__":
    main()
