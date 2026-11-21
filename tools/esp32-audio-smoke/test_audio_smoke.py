import io
import struct
import unittest
import wave

import mitten_audio_smoke as smoke
from make_test_wav import write_fixture


def fixture(rate=16000, channels=1, width=2, pcm=b"\x01\x00" * 1500):
    out = io.BytesIO()
    with wave.open(out, "wb") as wav:
        wav.setparams((channels, width, rate, 0, "NONE", ""))
        wav.writeframes(pcm)
    return out.getvalue()


class AudioSmokeTests(unittest.TestCase):
    def test_generated_fixture_matches_player(self):
        src = io.BytesIO()
        write_fixture(src)
        size = smoke.read_wav(src)
        self.assertEqual(size, 64000)
        self.assertEqual(smoke.stream_pcm(src, len, size), size)

    def test_streams_pcm_in_bounded_blocks_with_partial_writes(self):
        pcm = bytes(range(250)) * 12
        raw = fixture(pcm=pcm)
        # An odd-sized metadata chunk must be skipped with its pad byte.
        body = raw[8:36] + b"JUNK\x01\x00\x00\x00x\x00" + raw[36:]
        src = io.BytesIO(b"RIFF" + struct.pack("<I", len(body)) + body)
        sink = bytearray()

        def write(block):
            self.assertLessEqual(len(block), smoke.BLOCK_BYTES)
            count = min(128, len(block))
            sink.extend(block[:count])
            return count

        size = smoke.read_wav(src)
        self.assertEqual(size, len(pcm))
        self.assertEqual(smoke.stream_pcm(src, write, size), len(pcm))
        self.assertEqual(sink, pcm)

    def test_rejects_incompatible_or_truncated_wav(self):
        for raw in (fixture(rate=44100), fixture(channels=2), fixture(width=1),
                    fixture()[:-1], b"not a WAV"):
            with self.subTest(header=raw[:44]):
                with self.assertRaises(ValueError):
                    smoke.read_wav(io.BytesIO(raw))

    def test_reports_read_and_write_failures(self):
        with self.assertRaisesRegex(OSError, "read"):
            smoke.stream_pcm(io.BytesIO(b"\x00"), lambda block: len(block), 2)
        with self.assertRaisesRegex(OSError, "write"):
            smoke.stream_pcm(io.BytesIO(b"\x00\x00"), lambda block: 0, 2)

    def test_requires_explicit_wiring_confirmation(self):
        with self.assertRaisesRegex(ValueError, "PCB"):
            smoke.run()

    def test_requires_explicit_sd_mode_polarity(self):
        with self.assertRaisesRegex(ValueError, "sd_mode_active_high"):
            smoke.run(pcb_confirmed=True)
