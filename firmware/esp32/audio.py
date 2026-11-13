"""Local PCM WAV playback from SPI microSD through MAX98357A I2S."""

import struct

RATE = 16000
BLOCK_BYTES = 512
MOUNT = "/mitten_audio"


def track_path(track):
    if not isinstance(track, int) or isinstance(track, bool) or track < 1 or track > 50:
        return None
    return MOUNT + "/audio/%04d.wav" % track


def read_wav_header(src):
    src.seek(0, 2)
    file_size = src.tell()
    src.seek(0)
    header = src.read(12)
    if len(header) != 12 or header[:4] != b"RIFF" or header[8:] != b"WAVE":
        raise ValueError("Expected RIFF/WAVE")
    end = struct.unpack("<I", header[4:8])[0] + 8
    if end > file_size or end < 12:
        raise ValueError("Truncated RIFF")
    valid_format = False
    while src.tell() + 8 <= end:
        chunk = src.read(8)
        tag, size = chunk[:4], struct.unpack("<I", chunk[4:])[0]
        next_chunk = src.tell() + size + (size & 1)
        if next_chunk > end:
            raise ValueError("Chunk exceeds RIFF bounds")
        if tag == b"fmt ":
            fmt = src.read(16)
            if size < 16 or valid_format or len(fmt) != 16:
                raise ValueError("Invalid WAV format chunk")
            if struct.unpack("<HHIIHH", fmt) != (1, 1, RATE, RATE * 2, 2, 16):
                raise ValueError("Expected PCM16 mono 16000 Hz WAV")
            valid_format = True
        elif tag == b"data":
            if not valid_format or size == 0 or size % 2:
                raise ValueError("Expected aligned PCM data after fmt")
            return size
        src.seek(next_chunk)
    raise ValueError("Missing WAV data")


class AudioPlayer:
    """Cooperatively streams bounded PCM blocks; one block is submitted per update."""

    def __init__(self, machine, board):
        self.machine = machine
        self.board = board
        self.card = None
        self.mounted = False
        self.sd_pin = None
        self.i2s = None
        self.source = None
        self.remaining = 0
        self.pending = None
        self.pending_offset = 0
        self.nonblocking = False
        self.drain_until = None

    def initialize(self, safe_sd_pin=None):
        from machine import Pin, SDCard
        import vfs
        cfg = self.board
        self.sd_pin = safe_sd_pin if safe_sd_pin is not None else Pin(cfg["amp_sd_pin"], Pin.OUT, value=0)
        try:
            self.card = SDCard(slot=2, sck=Pin(cfg["sd_sck"]), miso=Pin(cfg["sd_miso"]),
                               mosi=Pin(cfg["sd_mosi"]), cs=Pin(cfg["sd_cs"]), freq=4000000)
            vfs.mount(vfs.VfsFat(self.card), MOUNT, readonly=True)
            self.mounted = True
        except Exception:
            self.deinitialize()
            return False
        return True

    def request_track(self, track):
        """Open and start a valid track without streaming the entire file inline."""
        path = track_path(track)
        if path is None or not self.mounted or self.source is not None:
            return False
        try:
            src = open(path, "rb")
            try:
                size = read_wav_header(src)
                from machine import I2S, Pin
                cfg = self.board
                self.i2s = I2S(0, sck=Pin(cfg["i2s_bclk"]), ws=Pin(cfg["i2s_lrc"]),
                               sd=Pin(cfg["i2s_din"]), mode=I2S.TX, bits=16,
                               format=I2S.MONO, rate=RATE, ibuf=4096)
                try:
                    self.i2s.irq(lambda *args: None)
                    self.nonblocking = True
                except (AttributeError, NotImplementedError):
                    self.nonblocking = False
                self.source = src
                self.remaining = size
                self.pending = None
                self.pending_offset = 0
                self.drain_until = None
                self.sd_pin.value(1)
                return True
            except Exception:
                src.close()
                raise
        except Exception:
            self._stop()
            return False

    def update(self, now=None):
        if self.source is None:
            return False
        try:
            if self.pending is None and self.remaining:
                amount = min(self.remaining, BLOCK_BYTES)
                self.pending = self.source.read(amount)
                if len(self.pending) != amount:
                    raise OSError("Unexpected end of WAV data")
                self.remaining -= amount
            if self.pending is not None:
                count = self.i2s.write(memoryview(self.pending)[self.pending_offset:])
                if count is None or count < 0 or count % 2 or count > len(self.pending) - self.pending_offset:
                    raise OSError("I2S write failed")
                if count == 0:
                    if self.nonblocking:
                        return True
                    raise OSError("I2S write made no progress")
                self.pending_offset += count
                if self.pending_offset == len(self.pending):
                    self.pending = None
                    self.pending_offset = 0
                return True
            if self.remaining:
                return True
            if self.drain_until is None:
                if now is None:
                    import time
                    now = time.ticks_ms()
                import time
                if hasattr(time, "ticks_add"):
                    self.drain_until = time.ticks_add(now, 310)
                else:
                    self.drain_until = now + 310
                return True
            if now is None:
                import time
                now = time.ticks_ms()
            import time
            elapsed = (time.ticks_diff(now, self.drain_until)
                       if hasattr(time, "ticks_diff") else now - self.drain_until)
            if elapsed >= 0:
                self._stop()
            return True
        except Exception:
            self._stop()
            return False

    def _stop(self):
        if self.sd_pin is not None:
            try:
                self.sd_pin.value(0)
            except Exception:
                pass
        if self.source is not None:
            try:
                self.source.close()
            except Exception:
                pass
            self.source = None
        if self.i2s is not None:
            try:
                self.i2s.deinit()
            except Exception:
                pass
            self.i2s = None
        self.remaining = 0
        self.pending = None
        self.pending_offset = 0
        self.nonblocking = False
        self.drain_until = None

    def deinitialize(self):
        self._stop()
        import vfs
        if self.mounted:
            try:
                vfs.umount(MOUNT)
            finally:
                self.mounted = False
        if self.card is not None:
            try:
                self.card.deinit()
            finally:
                self.card = None
