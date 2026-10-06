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
        return self._uart.write(data)


def create_protocol_uart_transport(uart_id=0, baudrate=115200):
    """Create the real ESP32 transport without importing machine on CPython."""
    from machine import UART
    return UartStreamTransport(UART(uart_id, baudrate=baudrate))


async def _yield_ms(milliseconds):
    if hasattr(asyncio, "sleep_ms"):
        await asyncio.sleep_ms(milliseconds)
    else:
        await asyncio.sleep(milliseconds / 1000.0)


async def main_loop(transport, max_iterations=None, sleep_ms=1):
    """Read, parse, dispatch and write Protocol V2 frames without blocking."""
    parser = NdjsonParser()

    def emit(envelope):
        transport.write(serialize_envelope(envelope))

    dispatcher = FirmwareDispatcher(emit=emit)
    dispatcher.startup()
    pending_since = None
    iterations = 0

    while max_iterations is None or iterations < max_iterations:
        iterations += 1
        chunk = transport.read()
        if chunk:
            result = parser.push(chunk)
            if result.remaining:
                pending_since = ticks_ms()
            else:
                pending_since = None

            for item_type, item in result.items:
                if item_type == "error":
                    if dispatcher.handshake_compatible:
                        emit(ErrorHandler.from_parse_error(item))
                    continue

                request = item
                try:
                    response = dispatcher.handle_request(request)
                except Exception as exception:
                    request_id = request.get("id") if isinstance(request, dict) else None
                    response = ErrorHandler.from_exception(exception, request_id)
                if response is not None:
                    is_uncorrelated_error = (
                        response.get("type") == "event"
                        and response.get("event") == "protocol.error"
                    )
                    if dispatcher.handshake_compatible or not is_uncorrelated_error:
                        emit(response)
        elif pending_since is not None:
            elapsed = ticks_diff(ticks_ms(), pending_since)
            if elapsed >= FRAME_INCOMPLETE_TIMEOUT_MS:
                parse_error = parser.discard_incomplete()
                pending_since = None
                if parse_error is not None and dispatcher.handshake_compatible:
                    emit(ErrorHandler.from_parse_error(parse_error))

        await _yield_ms(sleep_ms)

    return dispatcher


def main():
    transport = create_protocol_uart_transport()
    asyncio.run(main_loop(transport))


if __name__ == "__main__":
    main()
