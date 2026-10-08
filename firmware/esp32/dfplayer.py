"""DFPlayer Mini MP3 playback via UART."""

import time
from utils.time import time_ms, sleep_ms, ticks_diff


class DFPlayerCommand:
    """DFPlayer command codes."""
    NEXT = 0x01
    PREV = 0x02
    PLAY_TRACK = 0x03
    VOLUME_UP = 0x04
    VOLUME_DOWN = 0x05
    VOLUME = 0x06
    EQ = 0x07
    PLAYBACK_MODE = 0x08
    SOURCE = 0x09
    SLEEP = 0x0A
    WAKE = 0x0B
    RESET = 0x0C
    PLAY = 0x0D
    PAUSE = 0x0E
    PLAY_FOLDER = 0x0F
    STOP = 0x16
    PLAY_FOLDER_TRACK = 0x12
    RESUME = 0x0D  # Same as PLAY


class DFPlayerResponse:
    """DFPlayer response parser."""

    __slots__ = ('event', 'track', 'error_code', 'raw')

    def __init__(self, event=None, track=None, error_code=None, raw=None):
        self.event = event
        self.track = track
        self.error_code = error_code
        self.raw = raw

    @classmethod
    def parse(cls, data):
        """Parse DFPlayer response frame."""
        if len(data) != 10:
            return cls()
        
        if data[0] != 0x7E or data[-1] != 0xEF:
            return cls()
        
        if data[1:3] != b'\xff\x06' or ((data[7] << 8) | data[8]) != (-sum(data[1:7]) & 0xffff):
            return cls()
        cmd = data[3]
        param = (data[5] << 8) | data[6]
        
        if cmd == 0x3D:  # Play finished
            return cls(event="play_finished", track=param, raw=data)
        elif cmd == 0x40:  # Error
            return cls(event="error", error_code=param, raw=data)
        elif cmd == 0x3B:  # USB online
            return cls(event="usb_online", raw=data)
        elif cmd == 0x3C:  # USB inserted
            return cls(event="usb_inserted", raw=data)
        
        return cls(event="unknown", raw=data)


class DFPlayer:
    """DFPlayer Mini UART interface."""

    __slots__ = ('uart_id', 'tx_pin', 'rx_pin', 'is_ready', '_uart', '_rx_buffer', 
                 '_is_playing', '_current_track', '_volume', '_tx_buffer')

    def __init__(self, uart_id=None, tx_pin=None, rx_pin=None):
        self.uart_id = uart_id
        self.tx_pin = tx_pin
        self.rx_pin = rx_pin
        self.is_ready = False
        self._uart = None
        self._rx_buffer = b''
        self._is_playing = False
        self._current_track = 0
        self._volume = 15

    def begin(self, uart=None):
        """Initialize UART and DFPlayer."""
        if uart is None:
            if None in (self.uart_id, self.tx_pin, self.rx_pin):
                raise ValueError("DFPlayer UART and pins must be configured")
            from machine import UART, Pin
            uart = UART(self.uart_id, baudrate=9600, tx=Pin(self.tx_pin), rx=Pin(self.rx_pin))
        self._uart = uart
        self.is_ready = True
        try:
            self._send_command(DFPlayerCommand.RESET)
            sleep_ms(500)
            self.volume(self._volume)
        except Exception:
            self.is_ready = False
            raise
        return True

    def _calculate_checksum(self, data):
        """Calculate DFPlayer checksum."""
        total = sum(data)
        checksum = (0xFFFF - total + 1) & 0xFFFF
        return checksum

    def _build_frame(self, command, params=None):
        """Build DFPlayer command frame."""
        if params is None:
            params = [0x00, 0x00]
        elif len(params) == 1:
            params = [0x00, params[0]]
        
        frame = bytearray([0x7E, 0xFF, 0x06, command, 0x00, params[0], params[1]])
        checksum = self._calculate_checksum(frame[1:7])
        frame.append((checksum >> 8) & 0xFF)
        frame.append(checksum & 0xFF)
        frame.append(0xEF)
        return bytes(frame)

    def _send_command(self, command, params=None):
        """Send command to DFPlayer."""
        if not self.is_ready:
            raise RuntimeError("DFPlayer not initialized")
        
        frame = self._build_frame(command, params)
        sent = 0
        while sent < len(frame):
            count = self._uart.write(frame[sent:])
            if not count:
                raise OSError("DFPlayer UART write failed")
            sent += count
        self._tx_buffer = frame
        return True

    def play_track(self, track):
        """Play specific track (1-50)."""
        if isinstance(track, bool) or not isinstance(track, int) or not 1 <= track <= 50:
            raise ValueError("Track must be 1-50")
        
        self._send_command(DFPlayerCommand.PLAY_FOLDER_TRACK, [0x00, track])
        self._is_playing = True
        self._current_track = track
        return True

    def stop(self):
        """Stop playback."""
        self._send_command(DFPlayerCommand.STOP)
        self._is_playing = False
        self._current_track = 0

    def pause(self):
        """Pause playback."""
        self._send_command(DFPlayerCommand.PAUSE)

    def resume(self):
        """Resume playback."""
        self._send_command(DFPlayerCommand.PLAY)

    def volume(self, level):
        """Set volume (0-30)."""
        if not 0 <= level <= 30:
            raise ValueError("Volume must be 0-30")
        
        self._send_command(DFPlayerCommand.VOLUME, [0x00, level])
        self._volume = level

    def wait_for_response(self, timeout_ms=100):
        """Wait for and parse response."""
        start = time_ms()
        while True:
            if self._uart is not None:
                chunk = self._uart.read(32)
                if chunk:
                    self._rx_buffer += chunk
            while self._rx_buffer and self._rx_buffer[0] != 0x7E:
                self._rx_buffer = self._rx_buffer[1:]
            if len(self._rx_buffer) >= 10:
                response = DFPlayerResponse.parse(self._rx_buffer[:10])
                self._rx_buffer = self._rx_buffer[10:]
                if response.event == "play_finished":
                    self._is_playing = False
                    self._current_track = 0
                if response.event is not None:
                    return response
            if ticks_diff(time_ms(), start) >= timeout_ms:
                return DFPlayerResponse()
            sleep_ms(1)

    def track_path(self, track):
        """Get track file path for track number."""
        return f"/mp3/{track:04d}.mp3"

    @property
    def is_playing(self):
        return self._is_playing

