"""MITTEN V2 firmware entry point with a hardware-independent stream loop."""

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

import gc

from utils.time import ticks_ms, ticks_diff
from config import FRAME_INCOMPLETE_TIMEOUT_MS


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


async def main_loop(transport, max_iterations=None, sleep_ms=1, sensor_manager=None, audio_player=None):
    """Own the byte transport; dispatcher owns the single runtime service graph."""
    gc.collect()
    from error.handler import ErrorHandler
    from protocol.commands import FirmwareDispatcher
    from protocol.envelopes import serialize_envelope
    from protocol.framing import NdjsonParser

    parser = NdjsonParser()
    def emit(envelope):
        if hasattr(gc, "mem_free") and gc.mem_free() < 16384:
            gc.collect()
        transport.write(serialize_envelope(envelope))
    dispatcher = FirmwareDispatcher(emit=emit, sensor_manager=sensor_manager, audio_player=audio_player)
    dispatcher.startup()
    gc.collect()
    idle_sleep = 10 if (sleep_ms == 1 and hasattr(gc, "mem_free")) else sleep_ms
    pending_since = None
    iterations = 0
    while max_iterations is None or iterations < max_iterations:
        iterations += 1
        chunk = transport.read()
        now = ticks_ms()
        if chunk:
            gc.collect()
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
        if audio_player is not None:
            try:
                audio_player.update(now)
            except Exception:
                # Audio errors must not stop protocol, capture, or recognition processing.
                pass
        await _yield_ms(idle_sleep)
    return dispatcher


# "relay": WebSocket vía Wi-Fi (default). "serial": Web Serial por USB (respaldo local).
TRANSPORT_MODE = "relay"


async def _run(transport, sensors, player, board=None):
    """Wi-Fi corre como tarea aparte; sin red el guante sigue reconociendo y reproduciendo."""
    from wifi_manager import WifiManager, CONNECTED, resolve_ap_password
    ap_password = resolve_ap_password(board)
    if TRANSPORT_MODE == "relay":
        from relay_transport import RelayTransport, RELAY_URL
        relay_url = (board.get("relay_url") if isinstance(board, dict) else None) or RELAY_URL
        relay = RelayTransport(lambda: wifi.state == CONNECTED, url=relay_url)
        wifi = WifiManager(ap_password=ap_password, on_form=relay.handle_form)
        asyncio.create_task(wifi.run())
        asyncio.create_task(relay.run())
        # On MicroPython ESP32, let Wi-Fi + TLS complete before importing protocol
        # modules so mbedTLS gets contiguous C heap before GC expands.
        if hasattr(gc, "mem_free"):
            started = ticks_ms()
            while ticks_diff(ticks_ms(), started) < 15000:
                if getattr(relay, "state", None) in ("ONLINE", "UNPAIRED") or getattr(wifi, "state", None) == "PROVISIONING":
                    break
                await _yield_ms(100)
        transport = relay
    else:
        wifi = WifiManager(ap_password=ap_password)
        asyncio.create_task(wifi.run())
    gc.collect()
    await main_loop(transport, sensor_manager=sensors, audio_player=player)


def main():
    import os
    from hardware import create_hardware
    from hardware_config import BOARD
    transport, sensors, player = create_hardware(BOARD)
    gc.collect()
    if hasattr(gc, "threshold"):
        gc.threshold(4096)
    try:
        # UART0 is also the MicroPython REPL on the board's USB serial bridge.
        # Give that port exclusively to the NDJSON protocol before Web Serial connects.
        # En modo relay el REPL queda disponible: el protocolo no usa el UART.
        if TRANSPORT_MODE != "relay":
            os.dupterm(None)
        asyncio.run(_run(transport, sensors, player, board=BOARD))
    finally:
        try:
            if player is not None:
                player.deinitialize()
        except Exception:
            pass


if __name__ == "__main__":
    main()
