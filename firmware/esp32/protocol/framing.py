"""
NDJSON framing parser for MITTEN Protocol V2.

Handles incremental parsing of NDJSON frames from a byte stream.
Compatible with CPython and MicroPython.

Algorithm (per docs/protocol.md section 4):
1. Accumulate bytes in a buffer.
2. Find the next LF byte.
3. If no LF, save the fragment for the next read.
4. If LF found, extract everything before it as a line.
5. Strip trailing CR if present.
6. Validate the byte length against maxMessageBytes.
7. Decode as UTF-8 (strict).
8. Parse JSON.
9. Continue with remaining bytes.
"""

from config import (
    BOOTSTRAP_MAX_MESSAGE_BYTES,
    CR_BYTE,
    FRAME_DELIMITER,
)
import json


class ParseResult:
    """Result of parsing a chunk of bytes.

    Attributes:
        frames: list of successfully parsed dicts
        errors: list of error dicts with "type" and "message"
        remaining: bytes not yet processed (partial frames)
    """
    def __init__(self, frames=None, errors=None, remaining=None, items=None):
        self.frames = frames if frames is not None else []
        self.errors = errors if errors is not None else []
        self.remaining = remaining if remaining is not None else b""
        self.items = items if items is not None else []


class NdjsonParser:
    """
    Incremental NDJSON parser.

    Usage:
        parser = NdjsonParser()  # uses BOOTSTRAP_MAX_MESSAGE_BYTES
        result = parser.push(chunk)
        for frame in result.frames:
            handle(frame)
        for error in result.errors:
            handle_error(error)
    """

    def __init__(self, max_message_bytes=None):
        """Initialize parser. Defaults to BOOTSTRAP_MAX_MESSAGE_BYTES."""
        if max_message_bytes is None:
            max_message_bytes = BOOTSTRAP_MAX_MESSAGE_BYTES
        if (isinstance(max_message_bytes, bool)
                or not isinstance(max_message_bytes, int)
                or max_message_bytes <= 0):
            raise ValueError("max_message_bytes must be a positive integer")
        self.max_message_bytes = max_message_bytes
        self._pending = bytearray()
        self._discarding_oversized = False

    def push(self, chunk):
        """
        Feed a chunk of bytes to the parser.

        Returns a ParseResult with:
        - frames: list of parsed dicts
        - errors: list of error dicts {"type": str, "message": str}
        - remaining: pending bytes for next iteration
        """
        frames = []
        errors = []
        items = []

        # Convert chunk to bytes if needed
        if isinstance(chunk, bytearray):
            chunk = bytes(chunk)
        elif not isinstance(chunk, bytes):
            chunk = bytes(chunk)

        if self._discarding_oversized:
            delimiter_idx = chunk.find(FRAME_DELIMITER)
            if delimiter_idx == -1:
                # Still discarding; no LF found
                return ParseResult(frames, errors, b"", items)

            self._discarding_oversized = False
            # Skip the discarded bytes up to and including LF
            chunk = chunk[delimiter_idx + 1:]

        # Combine pending buffer with new chunk
        buffer = bytes(self._pending) + chunk
        self._pending = bytearray()

        while len(buffer) > 0:
            delimiter_idx = buffer.find(FRAME_DELIMITER)

            if delimiter_idx == -1:
                # No LF found; check if the pending data is already too large
                possible_split_crlf = (
                    len(buffer) == self.max_message_bytes + 1
                    and buffer[-1] == CR_BYTE
                )
                if len(buffer) > self.max_message_bytes and not possible_split_crlf:
                    error = {
                        "type": "MESSAGE_TOO_LARGE",
                        "message": "Frame exceeds maxMessageBytes (%d > %d)" % (
                            len(buffer), self.max_message_bytes
                        ),
                    }
                    errors.append(error)
                    items.append(("error", error))
                    self._discarding_oversized = True
                else:
                    self._pending.extend(buffer)
                break

            line_end = delimiter_idx
            # Strip trailing CR if present
            if line_end > 0 and buffer[line_end - 1] == CR_BYTE:
                line_end -= 1

            line = buffer[:line_end]
            buffer = buffer[delimiter_idx + 1:]

            # Check size limit
            if len(line) > self.max_message_bytes:
                error = {
                    "type": "MESSAGE_TOO_LARGE",
                    "message": "Frame exceeds maxMessageBytes (%d > %d)" % (
                        len(line), self.max_message_bytes
                    ),
                }
                errors.append(error)
                items.append(("error", error))
                continue

            # Skip empty or whitespace-only lines
            if self._is_blank(line):
                continue

            # Decode UTF-8
            try:
                decoded = line.decode("utf-8")
            except UnicodeDecodeError as e:
                error = {
                    "type": "INVALID_UTF8",
                    "message": "Invalid UTF-8 frame: %s" % str(e),
                }
                errors.append(error)
                items.append(("error", error))
                continue

            # Parse JSON
            try:
                parsed = json.loads(decoded)
            except ValueError as e:
                error = {
                    "type": "INVALID_JSON",
                    "message": "Invalid JSON frame: %s" % str(e),
                }
                errors.append(error)
                items.append(("error", error))
                continue

            # Must be a JSON object (dict)
            if not isinstance(parsed, dict):
                error = {
                    "type": "INVALID_MESSAGE",
                    "message": "Envelope must be a JSON object",
                }
                errors.append(error)
                items.append(("error", error))
                continue

            frames.append(parsed)
            items.append(("frame", parsed))

        return ParseResult(frames, errors, bytes(self._pending), items)

    @staticmethod
    def _is_blank(data):
        """Check if a bytes line is empty or whitespace-only."""
        for b in data:
            if b not in (0x20, 0x09):  # space, tab
                return False
        return True

    def reset(self):
        """Reset the parser state (clears pending buffer and discarding mode)."""
        self._pending = bytearray()
        self._discarding_oversized = False

    def discard_incomplete(self):
        """Discard a pending unterminated frame after its inactivity timeout."""
        if not self._pending:
            return None
        pending_bytes = len(self._pending)
        self.reset()
        return {
            "type": "INCOMPLETE_MESSAGE",
            "message": "Incomplete frame discarded after timeout (%d bytes)" % pending_bytes,
        }
