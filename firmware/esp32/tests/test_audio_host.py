"""Host-only tests for the audio module's public seams."""

import io
import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from audio import AudioPlayer, MOUNT, RATE, track_path


def wav_bytes(payload=b"\x01\x00" * 8, rate=RATE, channels=1, bits=16):
    fmt = struct.pack("<HHIIHH", 1, channels, rate, rate * channels * bits // 8,
                      channels * bits // 8, bits)
    body = b"fmt " + struct.pack("<I", len(fmt)) + fmt
    body += b"data" + struct.pack("<I", len(payload)) + payload
    return b"RIFF" + struct.pack("<I", len(body) + 4) + b"WAVE" + body


class Pin:
    OUT = 1
    def __init__(self, pin, mode=None, value=0): self.pin, self.state = pin, value
    def value(self, state=None):
        if state is not None: self.state = state
        return self.state


class I2S:
    TX, MONO = 1, 2
    def __init__(self, *args, **kwargs): self.blocks, self.closed = [], False
    def irq(self, callback): self.callback = callback
    def write(self, data): self.blocks.append(bytes(data)); return len(data)
    def deinit(self): self.closed = True


class AudioHostTests(unittest.TestCase):
    def setUp(self):
        self.board = {"amp_sd_pin":14,"sd_sck":18,"sd_miso":19,"sd_mosi":23,
                      "sd_cs":13,"i2s_lrc":25,"i2s_bclk":26,"i2s_din":27}
        self.player = AudioPlayer(None, self.board)
        self.player.sd_pin = Pin(14, Pin.OUT, 0)
        self.player.mounted = True
        self.machine = type("Machine", (), {"Pin":Pin,"I2S":I2S})
        self.modules = patch.dict(sys.modules, {"machine":self.machine})
        self.modules.start()
        self.addCleanup(self.modules.stop)

    def test_track_range_is_1_to_50(self):
        self.assertEqual(track_path(1), MOUNT + "/audio/0001.wav")
        self.assertEqual(track_path(50), MOUNT + "/audio/0050.wav")
        for invalid in (0, 51, True, "1", None): self.assertIsNone(track_path(invalid))

    def test_valid_wav_streams_in_bounded_blocks_and_disables_amp(self):
        data = wav_bytes(b"\x01\x00" * 600)
        with patch("builtins.open", return_value=io.BytesIO(data)):
            self.assertTrue(self.player.request_track(7))
        self.assertEqual(self.player.remaining, 1200)
        self.assertEqual(self.player.sd_pin.state, 1)
        self.player.update(0)
        self.assertEqual(len(self.player.i2s.blocks[0]), 512)
        self.player.update(1)
        self.player.update(2)
        self.player.update(3)
        self.assertEqual(sum(map(len, self.player.i2s.blocks)), 1200)
        self.player.update(400)
        self.assertIsNone(self.player.source)
        self.assertEqual(self.player.sd_pin.state, 0)

    def test_missing_file_and_invalid_wav_fail_safely(self):
        with patch("builtins.open", side_effect=OSError("missing")):
            self.assertFalse(self.player.request_track(1))
        with patch("builtins.open", return_value=io.BytesIO(b"not a wav")):
            self.assertFalse(self.player.request_track(1))
        self.assertEqual(self.player.sd_pin.state, 0)
        self.assertIsNone(self.player.i2s)

    def test_incompatible_wav_is_rejected_before_i2s_start(self):
        with patch("builtins.open", return_value=io.BytesIO(wav_bytes(rate=22050))):
            self.assertFalse(self.player.request_track(1))
        self.assertIsNone(self.player.i2s)
        self.assertEqual(self.player.sd_pin.state, 0)

    def test_i2s_write_error_releases_source_i2s_and_amp(self):
        class BrokenI2S(I2S):
            def write(self, data): raise OSError("device error")
        self.machine.I2S = BrokenI2S
        with patch("builtins.open", return_value=io.BytesIO(wav_bytes())):
            self.assertTrue(self.player.request_track(1))
        self.assertFalse(self.player.update(0))
        self.assertIsNone(self.player.source)
        self.assertIsNone(self.player.i2s)
        self.assertEqual(self.player.sd_pin.state, 0)

    def test_nonblocking_i2s_retries_when_driver_has_no_buffer_space(self):
        class BusyOnceI2S(I2S):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.busy = True
            def write(self, data):
                if self.busy:
                    self.busy = False
                    return 0
                return super().write(data)
        self.machine.I2S = BusyOnceI2S
        with patch("builtins.open", return_value=io.BytesIO(wav_bytes())):
            self.assertTrue(self.player.request_track(1))
        self.assertTrue(self.player.nonblocking)
        self.assertTrue(self.player.update(0))
        self.assertIsNotNone(self.player.source)
        self.assertEqual(self.player.sd_pin.state, 1)
        self.assertTrue(self.player.update(1))
        self.assertEqual(sum(map(len, self.player.i2s.blocks)), 16)

    def test_sd_mount_failure_deinitializes_card_and_leaves_amp_low(self):
        class Card:
            deinitialized = False
            def __init__(self, **kwargs): pass
            def deinit(self): self.deinitialized = True
        class Vfs:
            class VfsFat:
                def __init__(self, card): pass
            @staticmethod
            def mount(*args, **kwargs): raise OSError("mount failed")
        machine = type("Machine", (), {"Pin":Pin,"SDCard":Card})
        with patch.dict(sys.modules, {"machine":machine,"vfs":Vfs}):
            player = AudioPlayer(None, self.board)
            self.assertFalse(player.initialize())
        self.assertEqual(player.sd_pin.state, 0)
        self.assertIsNone(player.card)

    def test_recognition_requests_the_gesture_audio_track(self):
        from protocol.commands import FirmwareDispatcher
        class Sensors:
            def capture_sample(self): return [3000,3000,3000,3000,3000,0,0]
        class Player:
            def __init__(self): self.requested = []
            def request_track(self, track): self.requested.append(track); return True
        player = Player()
        dispatcher = FirmwareDispatcher(sensor_manager=Sensors(), audio_player=player)
        dispatcher.startup()
        gesture = {"id":42,"name":"hello","audioTrack":7,"data":{
            "version":1,"dimensions":7,
            "dimensionOrder":["flex1","flex2","flex3","flex4","flex5","mpuX","mpuY"],
            "units":{"flex":"adc12","mpu":"degrees"},
            "samples":[[3000.0,3000.0,3000.0,3000.0,3000.0,0.0,0.0]],
            "summary":{"min":[3000,3000,3000,3000,3000,-10,-10],
                       "max":[3000,3000,3000,3000,3000,10,10],
                       "mean":[3000,3000,3000,3000,3000,0,0]},
            "sampleCount":1,"captureDurationMs":100,"samplingPeriodMs":100}}
        dispatcher.recognizer.load_profile([gesture])
        dispatcher.update(100)
        self.assertEqual(player.requested, [7])


if __name__ == "__main__":
    unittest.main()
