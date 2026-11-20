import binascii
import os
import struct
import sys
import tempfile
import types
import unittest

import audio
import audio_store as store_module
from audio_store import AudioStore, AudioStoreError


def make_wav(samples=800):
    data = struct.pack("<%dh" % samples, *[(i * 37) % 2000 - 1000 for i in range(samples)])
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16)
    return header + b"data" + struct.pack("<I", len(data)) + data


def crc(data):
    return binascii.crc32(data) & 0xFFFFFFFF


class Clock:
    def __init__(self):
        self.ms = 1000

    def __call__(self):
        return self.ms


class AudioStoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        self.clock = Clock()
        self.mounts = []
        self.playing = False
        self.store = AudioStore(self.root, remount=lambda w: self.mounts.append(w) or True,
                                is_playing=lambda: self.playing, now=self.clock)

    def tearDown(self):
        self.store.abort()
        self.tmp.cleanup()

    def upload(self, track, wav, step=1000):
        self.store.begin(track, len(wav), crc(wav))
        for offset in range(0, len(wav), step):
            self.store.chunk(track, offset, wav[offset:offset + step])
        return self.store.commit(track)

    def read(self, track):
        with open(self.store.final_path(track), "rb") as handle:
            return handle.read()

    def error(self, call):
        with self.assertRaises(AudioStoreError) as caught:
            call()
        return caught.exception

    def test_chunked_upload_is_published_and_playable(self):
        wav = make_wav()
        self.assertEqual(self.upload(3, wav), {"track": 3, "size": len(wav)})
        self.assertEqual(self.read(3), wav)
        with open(self.store.final_path(3), "rb") as handle:
            self.assertEqual(audio.read_wav_header(handle), len(wav) - 44)
        self.assertEqual(self.store.list_tracks(), [3])
        self.assertEqual(self.store.info(3), {"track": 3, "size": len(wav), "crc32": crc(wav)})
        self.assertEqual(os.listdir(self.root + "/staging"), [])
        self.assertEqual(self.mounts, [True, False])      # escritura solo durante la carga

    def test_bad_offset_reports_the_expected_one_and_allows_resuming(self):
        wav = make_wav()
        self.store.begin(1, len(wav), crc(wav))
        self.store.chunk(1, 0, wav[:500])
        error = self.error(lambda: self.store.chunk(1, 600, wav[600:900]))
        self.assertEqual((error.code, error.details), ("AUDIO_BAD_OFFSET", {"offset": 500}))
        self.store.chunk(1, 500, wav[500:])
        self.assertEqual(self.store.commit(1)["size"], len(wav))

    def test_crc_mismatch_discards_the_upload_and_keeps_the_previous_track(self):
        old = make_wav(400)
        self.upload(2, old)
        new = make_wav(900)
        self.store.begin(2, len(new), crc(new) ^ 1)
        self.store.chunk(2, 0, new[:1000])
        self.store.chunk(2, 1000, new[1000:])
        self.assertEqual(self.error(lambda: self.store.commit(2)).code, "AUDIO_INTEGRITY")
        self.assertEqual(self.read(2), old)
        self.assertEqual(os.listdir(self.root + "/staging"), [])
        self.assertEqual(self.mounts[-1], False)

    def test_incomplete_upload_cannot_be_committed(self):
        wav = make_wav()
        self.store.begin(4, len(wav), crc(wav))
        self.store.chunk(4, 0, wav[:100])
        self.assertEqual(self.error(lambda: self.store.commit(4)).code, "AUDIO_INTEGRITY")
        self.assertEqual(self.error(lambda: self.store.chunk(4, 100, wav[100:200])).code, "AUDIO_NO_UPLOAD")

    def test_valid_crc_but_wrong_format_is_rejected(self):
        junk = b"not a wav file " * 20
        self.store.begin(5, len(junk), crc(junk))
        self.store.chunk(5, 0, junk)
        self.assertEqual(self.error(lambda: self.store.commit(5)).code, "AUDIO_INVALID_WAV")
        self.assertEqual(self.store.list_tracks(), [])

    def test_wrong_sample_rate_is_rejected(self):
        wav = bytearray(make_wav())
        wav[24:28] = struct.pack("<I", 44100)
        wav = bytes(wav)
        self.store.begin(6, len(wav), crc(wav))
        self.store.chunk(6, 0, wav[:1000])
        self.store.chunk(6, 1000, wav[1000:])
        self.assertEqual(self.error(lambda: self.store.commit(6)).code, "AUDIO_INVALID_WAV")

    def test_input_validation(self):
        for track in (0, 51, True, "1", None, 1.0):
            self.assertEqual(self.error(lambda t=track: self.store.begin(t, 1000, 0)).code, "AUDIO_INVALID_TRACK")
        for size in (0, 44, store_module.MAX_TRACK_BYTES + 1, True):
            self.assertEqual(self.error(lambda s=size: self.store.begin(1, s, 0)).code, "AUDIO_TOO_LARGE")
        self.assertEqual(self.error(lambda: self.store.begin(1, 1000, -1)).code, "AUDIO_INVALID_TRACK")
        self.store.begin(1, 1000, 0)
        self.assertEqual(self.error(lambda: self.store.chunk(1, 0, b"")).code, "AUDIO_BAD_CHUNK")
        self.assertEqual(self.error(lambda: self.store.chunk(1, 0, b"x" * 4000)).code, "AUDIO_BAD_CHUNK")
        self.assertEqual(self.error(lambda: self.store.chunk(2, 0, b"x")).code, "AUDIO_NO_UPLOAD")
        self.store.chunk(1, 0, b"x" * 1000)
        self.assertEqual(self.error(lambda: self.store.chunk(1, 1000, b"x")).code, "AUDIO_TOO_LARGE")

    def test_only_one_upload_and_never_while_playing(self):
        self.store.begin(1, 1000, 0)
        self.assertEqual(self.error(lambda: self.store.begin(2, 1000, 0)).code, "AUDIO_BUSY")
        self.store.abort()
        self.playing = True
        self.assertEqual(self.error(lambda: self.store.begin(2, 1000, 0)).code, "AUDIO_BUSY")

    def test_abandoned_upload_expires_and_restores_readonly(self):
        self.store.begin(1, 1000, 0)
        self.clock.ms += store_module.UPLOAD_TIMEOUT_MS + 1
        self.store.tick()
        self.assertEqual(self.error(lambda: self.store.chunk(1, 0, b"x")).code, "AUDIO_NO_UPLOAD")
        self.assertEqual(os.listdir(self.root + "/staging"), [])
        self.assertEqual(self.mounts[-1], False)

    def test_activity_keeps_the_upload_alive(self):
        self.store.begin(1, 1000, 0)
        self.clock.ms += store_module.UPLOAD_TIMEOUT_MS - 1
        self.store.chunk(1, 0, b"x" * 10)
        self.clock.ms += store_module.UPLOAD_TIMEOUT_MS - 1
        self.store.tick()
        self.assertEqual(self.store.chunk(1, 10, b"x"), 11)

    def test_no_space_and_unavailable_card(self):
        has_statvfs = hasattr(os, "statvfs")
        original = getattr(os, "statvfs", None)
        os.statvfs = lambda path: (512, 512, 100, 100, 100, 0, 0, 0, 0, 255)
        try:
            self.assertEqual(self.error(lambda: self.store.begin(1, 1000, 0)).code, "AUDIO_NO_SPACE")
        finally:
            if has_statvfs:
                os.statvfs = original
            else:
                delattr(os, "statvfs")
        self.assertEqual(self.mounts[-1], False)
        refused = AudioStore(self.root, remount=lambda w: False, now=self.clock)
        self.assertEqual(self.error(lambda: refused.begin(1, 1000, 0)).code, "AUDIO_UNAVAILABLE")

    def test_readonly_restore_is_retried_when_the_player_was_busy(self):
        results = iter([True, False, True])
        calls = []
        store = AudioStore(self.root, remount=lambda w: calls.append(w) or next(results), now=self.clock)
        wav = make_wav()
        store.begin(1, len(wav), crc(wav))
        store.chunk(1, 0, wav[:1000])
        store.chunk(1, 1000, wav[1000:])
        store.commit(1)                      # el remontaje a solo lectura falla (reproduciendo)
        store.tick()                         # se reintenta y funciona
        self.assertEqual(calls, [True, False, False])

    def test_recover_removes_leftovers_from_power_loss(self):
        os.makedirs(self.root + "/staging")
        for name in ("0001.part", "0002.part"):
            open(self.root + "/staging/" + name, "wb").close()
        self.assertEqual(self.store.recover(), 2)
        self.assertEqual(os.listdir(self.root + "/staging"), [])

    def test_info_for_missing_or_invalid_tracks(self):
        self.assertIsNone(self.store.info(7))
        self.assertIsNone(self.store.info(0))


class PlayerRemountTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        calls = self.calls
        fake = types.ModuleType("vfs")
        fake.VfsFat = lambda card: ("fat", card)
        fake.umount = lambda path: calls.append(("umount", path))
        fake.mount = lambda fs, path, readonly=False: calls.append(("mount", path, readonly))
        self.fake = fake
        self.saved = sys.modules.get("vfs")
        sys.modules["vfs"] = fake

    def tearDown(self):
        if self.saved is None:
            sys.modules.pop("vfs", None)
        else:
            sys.modules["vfs"] = self.saved

    def player(self):
        player = audio.AudioPlayer(None, {})
        player.card, player.mounted = object(), True
        return player

    def test_toggles_between_read_write_and_read_only(self):
        player = self.player()
        self.assertTrue(player.remount(True))
        self.assertTrue(player.remount(False))
        self.assertEqual(self.calls, [("umount", audio.MOUNT), ("mount", audio.MOUNT, False),
                                      ("umount", audio.MOUNT), ("mount", audio.MOUNT, True)])

    def test_refuses_while_playing_or_unmounted(self):
        player = self.player()
        player.source = object()
        self.assertFalse(player.remount(True))
        self.assertTrue(player.is_playing())
        player.source, player.mounted = None, False
        self.assertFalse(player.remount(True))
        self.assertEqual(self.calls, [])

    def test_failed_remount_falls_back_to_read_only(self):
        player = self.player()
        attempts = []

        def mount(fs, path, readonly=False):
            attempts.append(readonly)
            if not readonly:
                raise OSError("boom")
        self.fake.mount = mount
        self.assertFalse(player.remount(True))
        self.assertEqual(attempts, [False, True])
        self.assertTrue(player.mounted)


if __name__ == "__main__":
    unittest.main()
