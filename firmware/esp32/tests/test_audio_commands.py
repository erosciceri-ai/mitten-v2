import base64
import binascii
import os
import struct
import tempfile
import unittest

from audio_store import AudioStore, CHUNK_MAX_BYTES, UPLOAD_TIMEOUT_MS
from protocol.commands import FirmwareDispatcher


def make_wav(samples=1800):
    data = struct.pack("<%dh" % samples, *[(i * 53) % 3000 - 1500 for i in range(samples)])
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16)
    return header + b"data" + struct.pack("<I", len(data)) + data


def crc(data):
    return binascii.crc32(data) & 0xFFFFFFFF


class Clock:
    def __init__(self):
        self.ms = 5000

    def __call__(self):
        return self.ms


class AudioCommandTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = os.getcwd()
        os.chdir(self.tmp.name)
        self.sd = os.path.join(self.tmp.name, "sd")
        os.makedirs(self.sd)
        self.clock = Clock()
        self.events = []
        self.counter = 0
        self.store = AudioStore(self.sd, now=self.clock)
        self.device = FirmwareDispatcher(emit=self.events.append, audio_store=self.store)
        self.device.startup()
        self.call("device.handshake", {"client": "MITTEN_WEB", "clientVersion": "1.0.0",
                                       "supportedProtocolVersions": [2]})
        self.events.clear()

    def tearDown(self):
        self.store.abort()
        os.chdir(self.old)
        self.tmp.cleanup()

    def call(self, command, payload=None):
        self.counter += 1
        response = self.device.handle_request({"v": 2, "type": "request", "id": "t%d" % self.counter,
                                               "command": command, "payload": payload or {}})
        self.device.flush_events()
        return response

    def states(self):
        return [e["data"]["state"] for e in self.events if e.get("event") == "device.state"]

    def begin(self, track, wav):
        return self.call("audio.begin", {"audioTrack": track, "sizeBytes": len(wav), "crc32": crc(wav)})

    def chunk(self, track, offset, raw):
        return self.call("audio.chunk", {"audioTrack": track, "offset": offset,
                                         "data": base64.b64encode(raw).decode()})

    def upload(self, track, wav):
        self.assertTrue(self.begin(track, wav)["ok"])
        for offset in range(0, len(wav), CHUNK_MAX_BYTES):
            response = self.chunk(track, offset, wav[offset:offset + CHUNK_MAX_BYTES])
            self.assertTrue(response["ok"], response)
        return self.call("audio.commit", {"audioTrack": track})

    def test_full_upload_over_the_dispatcher(self):
        wav = make_wav()
        begin = self.begin(4, wav)
        self.assertEqual(begin["result"], {"audioTrack": 4, "offset": 0, "chunkMaxBytes": CHUNK_MAX_BYTES,
                                           "idleTimeoutMs": UPLOAD_TIMEOUT_MS})
        self.assertEqual(self.device.state.current, "SYNCING")
        first = self.chunk(4, 0, wav[:CHUNK_MAX_BYTES])
        self.assertEqual(first["result"], {"audioTrack": 4, "offset": CHUNK_MAX_BYTES})
        for offset in range(CHUNK_MAX_BYTES, len(wav), CHUNK_MAX_BYTES):
            self.chunk(4, offset, wav[offset:offset + CHUNK_MAX_BYTES])
        commit = self.call("audio.commit", {"audioTrack": 4})
        self.assertEqual(commit["result"], {"audioTrack": 4, "sizeBytes": len(wav)})
        self.assertEqual(self.device.state.current, "IDLE")
        self.assertEqual(self.states(), ["SYNCING", "IDLE"])
        with open(self.store.final_path(4), "rb") as handle:
            self.assertEqual(handle.read(), wav)

    def test_status_lists_tracks_and_reports_crc_for_one(self):
        wav = make_wav()
        self.upload(2, wav)
        self.upload(9, make_wav(900))
        listing = self.call("audio.status")["result"]["tracks"]
        self.assertEqual([(t["audioTrack"], "crc32" in t) for t in listing], [(2, False), (9, False)])
        self.assertEqual(listing[0]["sizeBytes"], len(wav))
        one = self.call("audio.status", {"audioTrack": 2})["result"]["tracks"]
        self.assertEqual(one, [{"audioTrack": 2, "sizeBytes": len(wav), "crc32": crc(wav)}])
        self.assertEqual(self.call("audio.status", {"audioTrack": 30})["result"], {"tracks": []})

    def test_invalid_payloads_are_rejected_without_changing_state(self):
        wav = make_wav()
        for payload in ({}, {"audioTrack": 0, "sizeBytes": 100, "crc32": 0},
                        {"audioTrack": 1, "sizeBytes": 44, "crc32": 0},
                        {"audioTrack": 1, "sizeBytes": 100, "crc32": -1},
                        {"audioTrack": True, "sizeBytes": 100, "crc32": 0}):
            response = self.call("audio.begin", payload)
            self.assertEqual((response["ok"], response["error"]["code"]), (False, "INVALID_PAYLOAD"))
        self.assertEqual(self.device.state.current, "IDLE")
        self.begin(1, wav)
        for data in ("", "abc", "a b=", base64.b64encode(b"x" * (CHUNK_MAX_BYTES + 1)).decode(), "QQ=", 5):
            response = self.call("audio.chunk", {"audioTrack": 1, "offset": 0, "data": data})
            self.assertEqual(response["error"]["code"], "INVALID_PAYLOAD", data)
        self.assertEqual(self.call("audio.commit", {"audioTrack": 99})["error"]["code"], "INVALID_PAYLOAD")

    def test_bad_offset_reports_where_to_resume(self):
        wav = make_wav()
        self.begin(1, wav)
        self.chunk(1, 0, wav[:1000])
        error = self.chunk(1, 1500, wav[1500:2000])["error"]
        self.assertEqual((error["code"], error["details"]), ("AUDIO_BAD_OFFSET", {"offset": 1000}))
        self.assertEqual(self.chunk(1, 1000, wav[1000:2000])["result"]["offset"], 2000)

    def test_integrity_failure_returns_to_idle_and_keeps_the_old_track(self):
        old = make_wav(500)
        self.upload(3, old)
        self.events.clear()
        new = make_wav(1700)
        self.call("audio.begin", {"audioTrack": 3, "sizeBytes": len(new), "crc32": crc(new) ^ 1})
        for offset in range(0, len(new), CHUNK_MAX_BYTES):
            self.chunk(3, offset, new[offset:offset + CHUNK_MAX_BYTES])
        self.assertEqual(self.call("audio.commit", {"audioTrack": 3})["error"]["code"], "AUDIO_INTEGRITY")
        self.assertEqual(self.device.state.current, "IDLE")
        with open(self.store.final_path(3), "rb") as handle:
            self.assertEqual(handle.read(), old)

    def test_without_an_active_upload(self):
        self.assertEqual(self.chunk(1, 0, b"x")["error"]["code"], "AUDIO_NO_UPLOAD")
        self.assertEqual(self.call("audio.commit", {"audioTrack": 1})["error"]["code"], "AUDIO_NO_UPLOAD")
        self.assertEqual(self.call("audio.abort")["error"]["code"], "AUDIO_NO_UPLOAD")

    def test_abort_discards_the_upload(self):
        wav = make_wav()
        self.begin(5, wav)
        self.chunk(5, 0, wav[:500])
        self.assertEqual(self.call("audio.abort")["result"], {"aborted": True})
        self.assertEqual(self.device.state.current, "IDLE")
        self.assertEqual(self.store.list_tracks(), [])
        self.assertEqual(self.states(), ["SYNCING", "IDLE"])

    def test_exclusive_with_capture_and_sync(self):
        wav = make_wav()
        self.begin(1, wav)
        self.assertEqual(self.begin(2, wav)["error"]["code"], "DEVICE_BUSY")
        self.assertEqual(self.call("capture.start")["error"]["code"], "DEVICE_BUSY")
        self.assertEqual(self.call("sync.begin", {})["error"]["code"], "DEVICE_BUSY")
        self.call("audio.abort")
        self.assertTrue(self.call("capture.start")["ok"])
        self.assertEqual(self.begin(1, wav)["error"]["code"], "DEVICE_BUSY")
        self.assertEqual(self.chunk(1, 0, b"x")["error"]["code"], "DEVICE_BUSY")

    def test_abandoned_upload_times_out_back_to_idle(self):
        wav = make_wav()
        self.begin(1, wav)
        self.chunk(1, 0, wav[:100])
        self.clock.ms += UPLOAD_TIMEOUT_MS + 1
        self.device.update(self.clock.ms)
        self.device.flush_events()
        self.assertEqual(self.device.state.current, "IDLE")
        self.assertEqual(self.states(), ["SYNCING", "IDLE"])
        self.assertEqual(self.chunk(1, 100, b"x")["error"]["code"], "AUDIO_NO_UPLOAD")

    def test_handshake_is_required_and_missing_store_means_unknown_command(self):
        fresh = FirmwareDispatcher(emit=lambda e: None, audio_store=self.store)
        fresh.startup()
        response = fresh.handle_request({"v": 2, "type": "request", "id": "x1", "command": "audio.status", "payload": {}})
        self.assertEqual(response["error"]["code"], "HANDSHAKE_REQUIRED")
        bare = FirmwareDispatcher(emit=lambda e: None)
        bare.startup()
        bare.handle_request({"v": 2, "type": "request", "id": "h1", "command": "device.handshake",
                             "payload": {"client": "MITTEN_WEB", "clientVersion": "1.0.0", "supportedProtocolVersions": [2]}})
        response = bare.handle_request({"v": 2, "type": "request", "id": "x2", "command": "audio.status", "payload": {}})
        self.assertEqual(response["error"]["code"], "UNKNOWN_COMMAND")


if __name__ == "__main__":
    unittest.main()
