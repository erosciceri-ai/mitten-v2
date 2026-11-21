"""Generate a quiet two-second PCM fixture on the PC, not on the ESP32."""

import math
import struct
import wave


def write_fixture(out):
    with wave.open(out, "wb") as wav:
        wav.setparams((1, 2, 16000, 0, "NONE", ""))
        for hz in (440, 660):
            wav.writeframes(b"".join(
                struct.pack("<h", round(1024 * math.sin(2 * math.pi * hz * i / 16000)))
                for i in range(16000)
            ))


if __name__ == "__main__":
    # Exclusive create: never replace an existing file.
    with open("smoke.wav", "xb") as out:
        write_fixture(out)
