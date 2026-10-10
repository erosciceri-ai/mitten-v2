"""MITTEN local Piper adapter. Runtime and voice files stay outside Git."""
from __future__ import annotations
import argparse
import io
import sys
import wave
from pathlib import Path
import lameenc
from piper import PiperVoice

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    text = sys.stdin.read().strip()
    if not text:
        raise ValueError("text is empty")
    voice = PiperVoice.load(args.model)
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        voice.synthesize_wav(text, wav_file)
    wav_buffer.seek(0)
    with wave.open(wav_buffer, "rb") as wav_file:
        encoder = lameenc.Encoder()
        encoder.set_bit_rate(128)
        encoder.set_in_sample_rate(wav_file.getframerate())
        encoder.set_channels(wav_file.getnchannels())
        encoder.set_quality(2)
        mp3 = encoder.encode(wav_file.readframes(wav_file.getnframes())) + encoder.flush()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(mp3)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
