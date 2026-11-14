#!/usr/bin/env python3
"""Verify the MITTEN V2 handshake on a physical ESP32.

The web application owns the serial port through Web Serial, so this tool is
**not** part of the runtime path: it is a one-shot diagnostic that opens the
port, sends the same ``device.handshake`` request the frontend sends, and
validates the bootstrap against the Protocol Version 2 contract.

It exists because a firmware change can be installed on the board without any
observable symptom: an image built without a UART REPL and without an ESP-IDF
console stays completely silent when the firmware fails to start. This check
turns "the glove is quiet" into a pass/fail result in a few seconds.

Usage::

    python mitten_handshake_check.py --port COM5
    python mitten_handshake_check.py --port COM5 --expect-state IDLE
    python mitten_handshake_check.py --list-ports

Exit codes: 0 handshake valid, 1 handshake invalid or missing, 2 port/setup
error, 3 unexpected internal error.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

PROTOCOL_VERSION = 2
CLIENT = "MITTEN_WEB"
MAX_MESSAGE_BYTES = 8192
DEFAULT_BAUD = 115200
DEFAULT_TIMEOUT_MS = 5000

# docs/protocol.md section 9: the official firmware states.
FIRMWARE_STATES = frozenset(
    {"INITIALIZING", "CALIBRATING", "IDLE", "CAPTURING", "SYNCING", "ERROR"}
)


class HandshakeError(Exception):
    """The handshake did not produce a usable bootstrap."""


# ---------------------------------------------------------------------------
# Protocol helpers
# ---------------------------------------------------------------------------


def build_request(command: str, payload: Dict[str, Any], request_id: str) -> Dict[str, Any]:
    """Build a V2 request envelope."""
    return {
        "v": PROTOCOL_VERSION,
        "type": "request",
        "id": request_id,
        "command": command,
        "payload": payload,
    }


def build_handshake_request(request_id: str = "req-1") -> Dict[str, Any]:
    """Build the minimal bootstrap request defined in docs/protocol.md 8.1."""
    return build_request(
        "device.handshake",
        {"client": CLIENT, "supportedProtocolVersions": [PROTOCOL_VERSION]},
        request_id,
    )


def encode_request(request: Dict[str, Any]) -> bytes:
    """Serialize a request as a single NDJSON frame (UTF-8, LF delimited)."""
    return (json.dumps(request, separators=(",", ":")) + "\n").encode("utf-8")


def _is_integer(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_handshake_result(result: Any) -> List[str]:
    """Validate a handshake result the same way packages/contracts does."""
    if not isinstance(result, dict):
        return ["handshake result must be an object"]

    errors: List[str] = []

    if result.get("device") != "MITTEN":
        errors.append('device must be "MITTEN"')

    firmware_version = result.get("firmwareVersion")
    if not isinstance(firmware_version, str) or not firmware_version:
        errors.append("firmwareVersion must be a non-empty string")

    protocol_version = result.get("protocolVersion")
    if not _is_integer(protocol_version) or protocol_version <= 0:
        errors.append("protocolVersion must be a positive integer")

    state = result.get("state")
    if not isinstance(state, str) or not state:
        errors.append("state must be a non-empty string")
    elif state not in FIRMWARE_STATES:
        errors.append("state must be a valid firmware state")

    capabilities = result.get("capabilities")
    if not isinstance(capabilities, dict):
        errors.append("capabilities must be an object")
    else:
        max_gestures = capabilities.get("maxGestures")
        if not _is_integer(max_gestures) or max_gestures < 0:
            errors.append("capabilities.maxGestures must be a non-negative integer")
        max_message_bytes = capabilities.get("maxMessageBytes")
        if not _is_integer(max_message_bytes) or max_message_bytes <= 0:
            errors.append("capabilities.maxMessageBytes must be a positive integer")
        elif max_message_bytes != MAX_MESSAGE_BYTES:
            errors.append(
                f"capabilities.maxMessageBytes must be {MAX_MESSAGE_BYTES} in Protocol Version 2"
            )

    return errors


def parse_ndjson_lines(buffer: str) -> Tuple[List[Dict[str, Any]], str]:
    """Split NDJSON text into parsed objects, returning the unparsed remainder."""
    messages: List[Dict[str, Any]] = []
    remainder = buffer
    while "\n" in remainder:
        line, remainder = remainder.split("\n", 1)
        line = line.strip()
        if not line:
            continue
        try:
            messages.append(json.loads(line))
        except json.JSONDecodeError:
            # The frontend rejects the device on an invalid frame; report it
            # the same way instead of silently skipping it.
            messages.append({"__parse_error__": line})
    return messages, remainder


# ---------------------------------------------------------------------------
# Transport
# ---------------------------------------------------------------------------


class Transport:
    """Byte-stream contract used by the checker."""

    def read(self, size: int = 4096) -> bytes:
        raise NotImplementedError

    def write(self, data: bytes) -> int:
        raise NotImplementedError

    def close(self) -> None:
        pass


class SerialTransport(Transport):
    """Transport backed by pyserial."""

    def __init__(self, port: str, baud: int = DEFAULT_BAUD, timeout: float = 0.1):
        try:
            import serial  # noqa: WPS433 (optional dependency)
        except ImportError as error:  # pragma: no cover - environment dependent
            raise HandshakeError(
                "pyserial is required to talk to the board: pip install pyserial"
            ) from error
        self._serial = serial.Serial(port, baud, timeout=timeout, write_timeout=2)

    def read(self, size: int = 4096) -> bytes:
        waiting = getattr(self._serial, "in_waiting", 0)
        return self._serial.read(waiting or 1)

    def write(self, data: bytes) -> int:
        return self._serial.write(data)

    def close(self) -> None:
        try:
            self._serial.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Handshake
# ---------------------------------------------------------------------------


def perform_handshake(
    transport: Transport,
    timeout_ms: int = DEFAULT_TIMEOUT_MS,
    request_id: str = "req-1",
    clock: Callable[[], float] = time.monotonic,
) -> Dict[str, Any]:
    """Send the handshake and return the validated bootstrap result.

    Raises HandshakeError when the device does not answer in time or answers
    with something that violates the V2 contract.
    """
    request = build_handshake_request(request_id)
    transport.write(encode_request(request))
    if hasattr(transport, "flush"):
        transport.flush()

    deadline = clock() + timeout_ms / 1000.0
    buffer = ""
    while clock() < deadline:
        chunk = transport.read()
        if chunk:
            buffer += chunk.decode("utf-8", "replace")
        messages, buffer = parse_ndjson_lines(buffer)
        for message in messages:
            if "__parse_error__" in message:
                raise HandshakeError(
                    "device sent a line that is not valid JSON: "
                    f"{message['__parse_error__'][:120]}"
                )
            if message.get("id") != request_id:
                continue
            if message.get("type") != "response":
                continue
            if not message.get("ok", False):
                error = message.get("error") or {}
                code = error.get("code") if isinstance(error, dict) else None
                raise HandshakeError(f"device rejected the handshake: {code or error}")
            result = message.get("result")
            errors = validate_handshake_result(result)
            if errors:
                raise HandshakeError("; ".join(errors))
            return result
        if not chunk:
            time.sleep(0.01)

    raise HandshakeError(
        f"no handshake response within {timeout_ms} ms "
        "(the device is silent: check the image, the UART wiring and the filesystem)"
    )


def request_status(transport: Transport, timeout_ms: int = DEFAULT_TIMEOUT_MS,
                   request_id: str = "req-2") -> Optional[Dict[str, Any]]:
    """Ask for device.status; allowed even while the device is in ERROR."""
    request = build_request("device.status", {}, request_id)
    transport.write(encode_request(request))
    deadline = time.monotonic() + timeout_ms / 1000.0
    buffer = ""
    while time.monotonic() < deadline:
        chunk = transport.read()
        if chunk:
            buffer += chunk.decode("utf-8", "replace")
        messages, buffer = parse_ndjson_lines(buffer)
        for message in messages:
            if message.get("id") == request_id and message.get("type") == "response":
                return message
        if not chunk:
            time.sleep(0.01)
    return None


def drain(transport: Transport, seconds: float = 0.5) -> bytes:
    """Discard bytes already buffered (ROM boot log, previous session)."""
    collected = b""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        chunk = transport.read()
        if chunk:
            collected += chunk
    return collected


def list_ports() -> List[str]:
    try:
        import serial.tools.list_ports as list_ports_module
    except ImportError:
        return []
    return [port.device for port in list_ports_module.comports()]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Check the MITTEN V2 handshake on a physical ESP32."
    )
    parser.add_argument("--port", help="serial port (COM5 on Windows, /dev/ttyUSB0 on Linux)")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT_MS,
                        help="handshake timeout in ms (default: %(default)s)")
    parser.add_argument("--expect-state", choices=sorted(FIRMWARE_STATES),
                        help="fail unless the device reports this state")
    parser.add_argument("--status", action="store_true",
                        help="also request device.status after the handshake")
    parser.add_argument("--json", action="store_true", help="print the raw result as JSON")
    parser.add_argument("--list-ports", action="store_true",
                        help="list the serial ports available on this machine")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)

    if args.list_ports:
        for port in list_ports():
            print(port)
        return 0

    if not args.port:
        print("error: --port is required (use --list-ports to discover it)", file=sys.stderr)
        return 2

    transport: Optional[Transport] = None
    try:
        transport = SerialTransport(args.port, args.baud)
        drain(transport, 0.3)
        result = perform_handshake(transport, args.timeout)
    except HandshakeError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    except Exception as error:  # pragma: no cover - environment dependent
        print(f"ERROR: cannot use {args.port}: {error}", file=sys.stderr)
        return 2
    finally:
        if transport is not None:
            transport.close()

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        capabilities = result["capabilities"]
        print("OK: MITTEN handshake valid")
        print(f"  firmwareVersion : {result['firmwareVersion']}")
        print(f"  protocolVersion : {result['protocolVersion']}")
        print(f"  state           : {result['state']}")
        print(f"  maxGestures     : {capabilities['maxGestures']}")
        print(f"  maxMessageBytes : {capabilities['maxMessageBytes']}")

    if args.expect_state and result["state"] != args.expect_state:
        print(f"FAIL: expected state {args.expect_state}, got {result['state']}", file=sys.stderr)
        return 1

    if args.status:
        transport = SerialTransport(args.port, args.baud)
        try:
            status = request_status(transport, args.timeout)
        finally:
            transport.close()
        if status is None:
            print("FAIL: no device.status response", file=sys.stderr)
            return 1
        print("  status          : " + json.dumps(status.get("result", status), ensure_ascii=False))

    return 0


if __name__ == "__main__":
    sys.exit(main())
