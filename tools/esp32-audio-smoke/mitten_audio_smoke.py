"""Manual-only WAV smoke test. Importing this module does not touch hardware."""

import struct

RATE = 16000
BLOCK_BYTES = 2048
I2S_BUFFER_BYTES = 8192
MOUNT = "/mitten_smoke_sd"


def read_wav(src):
    """Validate RIFF and leave the stream at the beginning of the PCM data."""
    src.seek(0, 2)
    file_size = src.tell()
    src.seek(0)
    header = src.read(12)
    if len(header) != 12 or header[:4] != b"RIFF" or header[8:] != b"WAVE":
        raise ValueError("Expected RIFF/WAVE")
    end = struct.unpack("<I", header[4:8])[0] + 8
    if end > file_size:
        raise ValueError("Truncated RIFF")
    valid_format = False
    while src.tell() + 8 <= end:
        chunk = src.read(8)
        if len(chunk) != 8:
            raise ValueError("Truncated chunk header")
        tag = chunk[:4]
        size = struct.unpack("<I", chunk[4:])[0]
        next_chunk = src.tell() + size + (size & 1)
        if next_chunk > end:
            raise ValueError("Chunk exceeds RIFF bounds")
        if tag == b"fmt ":
            if size < 16 or valid_format:
                raise ValueError("Invalid fmt chunk")
            fmt = src.read(16)
            if len(fmt) != 16:
                raise ValueError("Truncated fmt chunk")
            if struct.unpack("<HHIIHH", fmt) != (1, 1, RATE, RATE * 2, 2, 16):
                raise ValueError("Expected signed 16-bit PCM, mono, 16000 Hz")
            valid_format = True
        elif tag == b"data":
            if not valid_format or size == 0 or size % 2:
                raise ValueError("Expected nonempty, aligned PCM after fmt")
            return size
        src.seek(next_chunk)
    raise ValueError("Missing PCM data chunk")


def stream_pcm(src, write, size):
    buffer = memoryview(bytearray(BLOCK_BYTES))
    remaining = size
    while remaining:
        chunk = buffer[:min(remaining, BLOCK_BYTES)]
        read = 0
        while read < len(chunk):
            count = src.readinto(chunk[read:])
            if not count or count > len(chunk) - read:
                raise OSError("PCM read stopped before the declared end")
            read += count
        sent = 0
        while sent < read:
            count = write(chunk[sent:])
            if not count or count < 0 or count % 2 or count > read - sent:
                raise OSError("I2S write made no valid frame progress")
            sent += count
        remaining -= read
    return size


def _release(label, cleanup):
    try:
        cleanup()
    except Exception as error:
        print("Cleanup failed:", label, error)
        return False
    return True


def run(*, pcb_confirmed=False, sd_mode_active_high=False):
    if pcb_confirmed is not True:
        raise ValueError("Verify the physical PCB before enabling the smoke test")
    if sd_mode_active_high is not True:
        raise ValueError("Confirm the module wiring and pass sd_mode_active_high=True")

    import gc
    import sys
    import time
    import vfs
    from machine import I2S, Pin, SDCard

    print("Runtime:", sys.implementation)
    gc.collect()
    print("Free heap before playback:", gc.mem_free())
    card = tx = None
    amp_enable = None
    mounted = False
    clean = True
    stage = "SPI initialization"
    try:
        # Keep the amplifier shut down before configuring clocks or storage.
        amp_enable = Pin(14, Pin.OUT, value=0)
        card = SDCard(slot=2, sck=Pin(18), miso=Pin(19), mosi=Pin(23),
                      cs=Pin(13), freq=4_000_000)
        stage = "read-only FAT mount"
        vfs.mount(vfs.VfsFat(card), MOUNT, readonly=True)
        mounted = True
        stage = "WAV open/validation"
        with open(MOUNT + "/smoke.wav", "rb") as src:
            size = read_wav(src)
            print("WAV: PCM16 mono, 16000 Hz;", size, "bytes")
            stage = "I2S initialization"
            tx = I2S(0, sck=Pin(26), ws=Pin(25), sd=Pin(27), mode=I2S.TX,
                     bits=16, format=I2S.MONO, rate=RATE, ibuf=I2S_BUFFER_BYTES)
            # Mono samples are duplicated to both I2S slots by MicroPython;
            # MAX98357A SD high selects the left slot.
            stage = "MAX98357A enable"
            amp_enable.value(1)
            stage = "PCM read/I2S write"
            start = time.ticks_ms()
            sent = stream_pcm(src, tx.write, size)
            # Allow queued DMA samples to play before deinitializing.
            time.sleep_ms(I2S_BUFFER_BYTES * 1000 // (RATE * 2) + 50)
            print("PCM submitted:", sent, "bytes; elapsed ms:",
                  time.ticks_diff(time.ticks_ms(), start))
    except Exception as error:
        print("Smoke test failed:", stage, error)
        raise
    finally:
        if amp_enable is not None:
            # Mute before stopping I2S clocks, including exception paths.
            clean = _release("MAX98357A disable", lambda: amp_enable.value(0)) and clean
        if tx is not None:
            clean = _release("I2S", tx.deinit) and clean
        if mounted:
            mounted = not _release("FAT", lambda: vfs.umount(MOUNT))
            clean = not mounted and clean
        if card is not None and not mounted:
            clean = _release("SD SPI", card.deinit) and clean
    if not clean:
        raise OSError("Cleanup incomplete; stop and reset before retrying")
    print("Smoke test complete; confirm audible output separately.")
