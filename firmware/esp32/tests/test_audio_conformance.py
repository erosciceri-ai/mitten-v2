import base64
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from audio_store import AudioStore, CHUNK_MAX_BYTES
from protocol.commands import FirmwareDispatcher
from tests.test_audio_commands import Clock, crc, make_wav

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = (
    "const c=require('./packages/contracts/dist'); const fs=require('fs');"
    "for (const item of JSON.parse(fs.readFileSync(0,'utf8'))) {"
    " const v = item.kind==='response' ? c.validateResponseForCommand(item.command, item.frame) : c.validateProtocolV2Message(item.frame);"
    " if (!v.valid) throw Error(item.command+': '+v.errors.join(';')); }"
)


@unittest.skipUnless(shutil.which("node") and (ROOT / "packages/contracts/dist/index.js").exists(),
                     "requiere node y packages/contracts/dist (npm run build)")
class AudioConformanceTests(unittest.TestCase):
    def test_audio_wire_traffic_validates_with_the_shared_contracts(self):
        old = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            try:
                store = AudioStore(os.path.join(tmp, "sd"), now=Clock())
                os.makedirs(os.path.join(tmp, "sd"))
                device = FirmwareDispatcher(emit=lambda event: None, audio_store=store)
                device.startup()
                traffic, counter = [], [0]

                def call(command, payload):
                    counter[0] += 1
                    request = {"v": 2, "type": "request", "id": "c%d" % counter[0], "command": command, "payload": payload}
                    response = device.handle_request(request)
                    traffic.append({"kind": "request", "command": command, "frame": request})
                    traffic.append({"kind": "response", "command": command, "frame": response})
                    return response

                call("device.handshake", {"client": "MITTEN_WEB", "clientVersion": "1.0.0", "supportedProtocolVersions": [2]})
                wav = make_wav()
                call("audio.status", {})
                call("audio.chunk", {"audioTrack": 1, "offset": 0, "data": "QQ=="})        # AUDIO_NO_UPLOAD
                call("audio.begin", {"audioTrack": 6, "sizeBytes": len(wav), "crc32": crc(wav)})
                call("audio.chunk", {"audioTrack": 6, "offset": 77, "data": "QQ=="})       # AUDIO_BAD_OFFSET
                for offset in range(0, len(wav), CHUNK_MAX_BYTES):
                    data = base64.b64encode(wav[offset:offset + CHUNK_MAX_BYTES]).decode()
                    call("audio.chunk", {"audioTrack": 6, "offset": offset, "data": data})
                call("audio.commit", {"audioTrack": 6})
                call("audio.status", {})
                call("audio.status", {"audioTrack": 6})
                call("audio.begin", {"audioTrack": 7, "sizeBytes": len(wav), "crc32": crc(wav)})
                call("audio.abort", {})
                result = subprocess.run(["node", "-e", SCRIPT], cwd=str(ROOT), input=json.dumps(traffic),
                                        text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr[-600:])
            finally:
                os.chdir(old)


if __name__ == "__main__":
    unittest.main()
