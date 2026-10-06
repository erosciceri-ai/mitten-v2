"""
Tests for the NDJSON framing parser.

Tests are written for CPython 3.11+ and should also pass under MicroPython.
The parser must handle:
- Single and multiple frames in one chunk
- Fragmented frames across reads
- CRLF tolerance
- Oversize detection
- Invalid UTF-8
- Invalid JSON
- Empty lines
"""

import pytest

from protocol.framing import NdjsonParser


def encode(s):
    """Helper to encode string to bytes."""
    return s.encode("utf-8")


class TestFramingBasic:
    def test_parse_single_frame(self):
        parser = NdjsonParser()
        result = parser.push(encode('{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n'))
        assert len(result.frames) == 1
        assert result.frames[0]["type"] == "request"
        assert result.frames[0]["id"] == "req-1"
        assert len(result.errors) == 0

    def test_parse_multiple_frames(self):
        parser = NdjsonParser()
        data = (
            encode('{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n')
            + encode('{"v":2,"type":"response","id":"req-1","ok":true,"result":{}}\n')
        )
        result = parser.push(data)
        assert len(result.frames) == 2
        assert result.frames[0]["type"] == "request"
        assert result.frames[1]["type"] == "response"

    def test_parse_no_frames_incomplete(self):
        parser = NdjsonParser()
        result = parser.push(encode('{"v":2,"type":"request","id":"req-1",'))
        assert len(result.frames) == 0

    def test_skip_empty_lines(self):
        parser = NdjsonParser()
        data = encode('\n\n{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n\n')
        result = parser.push(data)
        assert len(result.frames) == 1
        assert len(result.errors) == 0


class TestFramingChunked:
    def test_parse_chunked_frame_two_parts(self):
        parser = NdjsonParser()
        r1 = parser.push(encode('{"v":2,"type":"request","id":"req-1",'))
        assert len(r1.frames) == 0
        assert len(r1.errors) == 0
        r2 = parser.push(encode('"command":"device.status","payload":{}}\n'))
        assert len(r2.frames) == 1
        assert r2.frames[0]["command"] == "device.status"

    def test_parse_chunked_frame_multibyte_split(self):
        """UTF-8 multibyte character split across chunks should be handled."""
        parser = NdjsonParser()
        text = '{"v":2,"type":"event","event":"device.state","data":{"state":"IDLE","msg":"caf\u00e9"}}\n'
        data = encode(text)
        mid = data.index(b"\xc3")  # find start of multi-byte 'é'

        r1 = parser.push(data[:mid + 1])
        assert len(r1.frames) == 0

        r2 = parser.push(data[mid + 1:])
        assert len(r2.frames) == 1
        assert r2.frames[0]["data"]["msg"] == "caf\u00e9"

    def test_retain_bytes_after_delimiter(self):
        parser = NdjsonParser()
        first = encode('{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n')
        residual = encode('{"v":2,"type":"request"')
        result = parser.push(first + residual)
        assert len(result.frames) == 1
        assert result.frames[0]["id"] == "req-1"
        assert result.remaining == residual


class TestFramingCRLF:
    def test_crlf_tolerance(self):
        parser = NdjsonParser()
        result = parser.push(encode('{"v":2,"type":"request","id":"req-1","command":"a","payload":{}}\r\n'))
        assert len(result.frames) == 1
        assert result.frames[0]["id"] == "req-1"

    def test_mixed_lf_and_crlf(self):
        parser = NdjsonParser()
        data = (
            encode('{"v":2,"type":"request","id":"req-1","command":"a","payload":{}}\n')
            + encode('{"v":2,"type":"response","id":"req-1","ok":true,"result":{}}\r\n')
        )
        result = parser.push(data)
        assert len(result.frames) == 2


class TestFramingOversize:
    def test_exact_limit_with_crlf_split_across_chunks_is_accepted(self):
        prefix = b'{"value":"'
        suffix = b'"}'
        payload = b"x" * (8192 - len(prefix) - len(suffix))
        parser = NdjsonParser(max_message_bytes=8192)

        first = parser.push(prefix + payload + suffix + b"\r")
        second = parser.push(b"\n")

        assert first.errors == []
        assert second.errors == []
        assert len(second.frames) == 1

    @pytest.mark.parametrize("limit", [0, -1, 1.5, True])
    def test_invalid_max_message_bytes_is_rejected(self, limit):
        with pytest.raises(ValueError):
            NdjsonParser(max_message_bytes=limit)

    def test_reject_oversize_with_explicit_limit(self):
        parser = NdjsonParser(max_message_bytes=100)
        payload = "x" * 200
        line = '{"v":2,"type":"request","id":"req-1","command":"a","payload":{"data":"' + payload + '"}}\n'
        result = parser.push(encode(line))
        assert len(result.errors) == 1
        assert result.errors[0]["type"] == "MESSAGE_TOO_LARGE"

    def test_oversize_discard_and_resync(self):
        """After an oversize frame, the parser should discard to next LF and resume."""
        parser = NdjsonParser(max_message_bytes=100)
        # First an oversize line
        oversized = encode("x" * 200 + "\n")
        result = parser.push(oversized)
        assert len(result.errors) == 1
        assert result.errors[0]["type"] == "MESSAGE_TOO_LARGE"

        # Then a valid frame should parse
        valid = encode('{"v":2,"type":"request","id":"req-1","command":"device.status","payload":{}}\n')
        result2 = parser.push(valid)
        assert len(result2.frames) == 1

    def test_oversize_no_newline_discards(self):
        """An oversize line without LF starts discarding mode; next chunk is skipped until LF."""
        parser = NdjsonParser(max_message_bytes=100)
        # Oversize without LF
        result = parser.push(encode("x" * 101))
        assert len(result.errors) == 1
        assert result.errors[0]["type"] == "MESSAGE_TOO_LARGE"

        # Now a partial line that completes and has more data
        result2 = parser.push(encode("xxx\n" + '{"v":2,"type":"request","id":"r","command":"x","payload":{}}\n'))
        # The "xxx\n" is the rest of the oversize; should be discarded, no error
        assert len(result2.frames) == 1
        assert result2.frames[0]["id"] == "r"
        assert len(result2.errors) == 0


class TestFramingInvalid:
    def test_invalid_utf8(self):
        # b'{"x":"\xc3(' is invalid UTF-8 sequence
        invalid = b'{"v":2,"type":"request","id":"req-1","command":"a","payload":{"x":"' + b"\xc3(" + b'"}}\n'
        parser = NdjsonParser()
        result = parser.push(invalid)
        assert len(result.frames) == 0
        assert len(result.errors) == 1
        assert result.errors[0]["type"] == "INVALID_UTF8"

    def test_invalid_json(self):
        parser = NdjsonParser()
        result = parser.push(encode('not valid json\n'))
        assert len(result.frames) == 0
        assert len(result.errors) == 1
        assert result.errors[0]["type"] == "INVALID_JSON"

    def test_invalid_json_unclosed(self):
        parser = NdjsonParser()
        result = parser.push(encode('{"v":2,"type":"request"\n'))
        assert len(result.frames) == 0
        assert len(result.errors) == 1
        assert result.errors[0]["type"] == "INVALID_JSON"

    def test_discard_incomplete_reports_error_and_resets_parser(self):
        parser = NdjsonParser()
        parser.push(encode('{"v":2,"type":"request"'))

        error = parser.discard_incomplete()

        assert error["type"] == "INCOMPLETE_MESSAGE"
        assert parser.push(encode(
            '{"v":2,"type":"request","id":"r","command":"x","payload":{}}\n'
        )).frames[0]["id"] == "r"

    def test_discard_incomplete_is_noop_without_pending_bytes(self):
        assert NdjsonParser().discard_incomplete() is None
