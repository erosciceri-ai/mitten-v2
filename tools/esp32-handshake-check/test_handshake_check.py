#!/usr/bin/env python3
"""Unit tests for the MITTEN handshake checker.

They run without hardware and without pyserial: the transport is faked.

    python -m unittest discover -s tools/esp32-handshake-check -v
"""
import json
import unittest

from mitten_handshake_check import (
    HandshakeError,
    build_handshake_request,
    encode_request,
    parse_ndjson_lines,
    perform_handshake,
    validate_handshake_result,
)


class FakeClock:
    """Monotonic clock that advances on every call, so waits end fast."""

    def __init__(self, step=0.01):
        self.now = 0.0
        self.step = step

    def __call__(self):
        self.now += self.step
        return self.now


class FakeTransport:
    """Transport that replays a fixed byte stream and records writes."""

    def __init__(self, response=b""):
        self.response = response
        self.written = b""

    def read(self, size=4096):
        data, self.response = self.response, b""
        return data

    def write(self, data):
        self.written += data
        return len(data)

    def close(self):
        pass


VALID_RESULT = {
    "device": "MITTEN",
    "firmwareVersion": "2.0.0",
    "protocolVersion": 2,
    "state": "IDLE",
    "capabilities": {"maxGestures": 50, "maxMessageBytes": 8192},
}


def response_envelope(result=None, ok=True, request_id="req-1"):
    envelope = {"v": 2, "type": "response", "id": request_id, "ok": ok}
    if ok:
        envelope["result"] = result if result is not None else VALID_RESULT
    else:
        envelope["error"] = {"code": "HANDSHAKE_REQUIRED", "message": "handshake first"}
    return envelope


class HandshakeRequestTests(unittest.TestCase):
    def test_request_matches_protocol_section_8_1(self):
        request = build_handshake_request("req-1")
        self.assertEqual(request["v"], 2)
        self.assertEqual(request["type"], "request")
        self.assertEqual(request["id"], "req-1")
        self.assertEqual(request["command"], "device.handshake")
        self.assertEqual(request["payload"]["client"], "MITTEN_WEB")
        self.assertEqual(request["payload"]["supportedProtocolVersions"], [2])

    def test_request_is_serialized_as_one_ndjson_line(self):
        transport = FakeTransport()
        transport.write(encode_request(build_handshake_request("req-1")))
        self.assertEqual(transport.written.count(b"\n"), 1)
        self.assertTrue(transport.written.endswith(b"\n"))
        json.loads(transport.written.decode("utf-8"))


class HandshakeValidationTests(unittest.TestCase):
    def test_valid_result_passes(self):
        self.assertEqual(validate_handshake_result(VALID_RESULT), [])

    def test_wrong_device_is_rejected(self):
        result = dict(VALID_RESULT, device="OTHER")
        self.assertIn('device must be "MITTEN"', validate_handshake_result(result))

    def test_empty_firmware_version_is_rejected(self):
        result = dict(VALID_RESULT, firmwareVersion="")
        self.assertIn("firmwareVersion must be a non-empty string",
                      validate_handshake_result(result))

    def test_non_integer_protocol_version_is_rejected(self):
        result = dict(VALID_RESULT, protocolVersion="2")
        self.assertIn("protocolVersion must be a positive integer",
                      validate_handshake_result(result))

    def test_unknown_state_is_rejected(self):
        result = dict(VALID_RESULT, state="RECOGNIZING")
        self.assertIn("state must be a valid firmware state",
                      validate_handshake_result(result))

    def test_missing_capabilities_are_rejected(self):
        result = dict(VALID_RESULT)
        del result["capabilities"]
        self.assertIn("capabilities must be an object", validate_handshake_result(result))

    def test_wrong_max_message_bytes_is_rejected(self):
        result = dict(VALID_RESULT, capabilities={"maxGestures": 50, "maxMessageBytes": 4096})
        self.assertTrue(any("maxMessageBytes" in error
                            for error in validate_handshake_result(result)))

    def test_non_object_result_is_rejected(self):
        self.assertEqual(validate_handshake_result("MITTEN"),
                         ["handshake result must be an object"])


class NdjsonParsingTests(unittest.TestCase):
    def test_splits_complete_lines_and_keeps_the_remainder(self):
        messages, remainder = parse_ndjson_lines('{"a":1}\n{"b":2}\n{"c":')
        self.assertEqual(messages, [{"a": 1}, {"b": 2}])
        self.assertEqual(remainder, '{"c":')

    def test_invalid_json_is_reported(self):
        messages, _ = parse_ndjson_lines("not json\n")
        self.assertIn("__parse_error__", messages[0])

    def test_empty_lines_are_ignored(self):
        messages, _ = parse_ndjson_lines("\n\n")
        self.assertEqual(messages, [])


class PerformHandshakeTests(unittest.TestCase):
    def test_valid_bootstrap_is_returned(self):
        transport = FakeTransport((json.dumps(response_envelope()) + "\n").encode())
        result = perform_handshake(transport, timeout_ms=1000, clock=FakeClock())
        self.assertEqual(result["device"], "MITTEN")
        self.assertEqual(result["state"], "IDLE")

    def test_silent_device_raises(self):
        transport = FakeTransport(b"")
        with self.assertRaises(HandshakeError) as context:
            perform_handshake(transport, timeout_ms=50, clock=FakeClock())
        self.assertIn("no handshake response", str(context.exception))

    def test_invalid_json_line_raises(self):
        transport = FakeTransport(b"garbage line\n")
        with self.assertRaises(HandshakeError) as context:
            perform_handshake(transport, timeout_ms=50, clock=FakeClock())
        self.assertIn("not valid JSON", str(context.exception))

    def test_rejected_handshake_raises_with_the_code(self):
        transport = FakeTransport((json.dumps(response_envelope(ok=False)) + "\n").encode())
        with self.assertRaises(HandshakeError) as context:
            perform_handshake(transport, timeout_ms=1000, clock=FakeClock())
        self.assertIn("HANDSHAKE_REQUIRED", str(context.exception))

    def test_invalid_result_raises(self):
        broken = dict(VALID_RESULT, device="OTHER")
        transport = FakeTransport((json.dumps(response_envelope(broken)) + "\n").encode())
        with self.assertRaises(HandshakeError) as context:
            perform_handshake(transport, timeout_ms=1000, clock=FakeClock())
        self.assertIn("device must be", str(context.exception))

    def test_response_for_another_request_is_ignored(self):
        other = response_envelope(request_id="other-id")
        transport = FakeTransport((json.dumps(other) + "\n").encode())
        with self.assertRaises(HandshakeError):
            perform_handshake(transport, timeout_ms=50, clock=FakeClock())


if __name__ == "__main__":
    unittest.main()
