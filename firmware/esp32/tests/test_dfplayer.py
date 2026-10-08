"""Tests for DFPlayer Mini MP3 playback."""

import pytest
from dfplayer import DFPlayer, DFPlayerCommand, DFPlayerResponse
from tests.sensor_fakes import UART

@pytest.fixture(autouse=True)
def no_boot_delay(monkeypatch):
    monkeypatch.setattr("dfplayer.sleep_ms", lambda ms: None)


class TestDFPlayerCommand:
    """DFPlayer command constants."""

    def test_command_values(self):
        """Commands match DFPlayer protocol."""
        assert DFPlayerCommand.PLAY_TRACK == 0x03
        assert DFPlayerCommand.VOLUME == 0x06
        assert DFPlayerCommand.STOP == 0x16
        assert DFPlayerCommand.PAUSE == 0x0E
        assert DFPlayerCommand.RESUME == 0x0D


class TestDFPlayerResponse:
    """DFPlayer response parsing."""

    def test_parse_play_finished(self):
        """Parse play finished notification (0x3D)."""
        data = DFPlayer()._build_frame(0x3D, [0,1])
        resp = DFPlayerResponse.parse(data)
        assert resp.event == "play_finished"
        assert resp.track == 1

    def test_parse_error(self):
        """Parse error notification."""
        data = DFPlayer()._build_frame(0x40, [0,5])
        resp = DFPlayerResponse.parse(data)
        assert resp.event == "error"
        assert resp.error_code == 5


class TestDFPlayer:
    """DFPlayer Mini UART interface."""

    def setup_method(self):
        self.player = DFPlayer(uart_id=1, tx_pin=17, rx_pin=16)

    def test_initialization(self):
        """DFPlayer initializes with correct pins."""
        assert self.player.uart_id == 1
        assert self.player.tx_pin == 17
        assert self.player.rx_pin == 16
        assert self.player.is_ready is False

    def test_begin_initializes_uart(self):
        """begin() sets up UART and sends init sequence."""
        self.player.begin(UART())
        assert self.player.is_ready is True

    def test_play_track_sends_command(self):
        """play_track(track) sends PLAY_TRACK command."""
        self.player.begin(UART())
        self.player.play_track(1)
        
        # Verify command was sent (would check UART buffer in real test)
        # For now, verify method exists and accepts valid range
        self.player.play_track(1)
        self.player.play_track(50)
        
    def test_play_track_validates_range(self):
        """play_track validates track 1-50."""
        self.player.begin(UART())
        with pytest.raises(ValueError):
            self.player.play_track(0)
        with pytest.raises(ValueError):
            self.player.play_track(51)

    def test_volume_sets_level(self):
        """volume() sends VOLUME command 0-30."""
        self.player.begin(UART())
        self.player.volume(15)
        self.player.volume(0)
        self.player.volume(30)
        
        with pytest.raises(ValueError):
            self.player.volume(-1)
        with pytest.raises(ValueError):
            self.player.volume(31)

    def test_stop_pause_resume(self):
        """stop(), pause(), resume() send respective commands."""
        self.player.begin(UART())
        self.player.stop()
        self.player.pause()
        self.player.resume()

    def test_build_command_frame(self):
        """_build_frame creates valid DFPlayer frame."""
        frame = self.player._build_frame(DFPlayerCommand.PLAY_TRACK, [0x00, 0x01])
        
        assert frame[0] == 0x7E  # Start
        assert frame[1] == 0xFF  # Version
        assert frame[2] == 0x06  # Length
        assert frame[3] == 0x03  # Command
        assert frame[4] == 0x00  # Feedback
        assert frame[5] == 0x00  # Param high
        assert frame[6] == 0x01  # Param low
        # frame[7] = checksum high, frame[8] = checksum low
        assert frame[9] == 0xEF  # End
        assert len(frame) == 10

    def test_checksum_calculation(self):
        """Checksum = 0xFFFF - sum(bytes[1:6]) + 1."""
        data = bytes([0xFF, 0x06, 0x03, 0x00, 0x00, 0x01])
        checksum = self.player._calculate_checksum(data)
        expected = (0xFFFF - sum(data)) + 1
        expected = expected & 0xFFFF
        assert checksum == expected

    def test_wait_for_response(self):
        """wait_for_response() parses incoming data."""
        self.player.begin(UART())
        # Simulate response in buffer
        self.player._uart.incoming = self.player._build_frame(0x3D, [0,5])
        resp = self.player.wait_for_response(timeout_ms=100)
        assert resp.event == "play_finished"
        assert resp.track == 5

    def test_track_path_format(self):
        """track_path() returns /mp3/{track:04d}.mp3 format."""
        assert self.player.track_path(1) == "/mp3/0001.mp3"
        assert self.player.track_path(9) == "/mp3/0009.mp3"
        assert self.player.track_path(50) == "/mp3/0050.mp3"

    def test_is_playing_state(self):
        """is_playing tracks playback state."""
        self.player.begin(UART())
        assert self.player.is_playing is False
        
        self.player.play_track(1)
        self.player._uart.incoming = self.player._build_frame(0x3D, [0,1])
        self.player.wait_for_response(0)
        # After play_finished, should not be playing
        assert self.player.is_playing is False

def test_uart_mp3_folder_command_and_failures():
    uart=UART(); player=DFPlayer(); player.begin(uart)
    assert [f[3] for f in uart.writes] == [0x0C,0x06]
    player.play_track(7)
    assert uart.writes[-1] == bytes.fromhex('7eff0612000007fee2ef')
    assert player.track_path(7) == '/mp3/0007.mp3'
    broken=bytearray(player._build_frame(0x3D,[0,7])); broken[8]^=1
    assert DFPlayerResponse.parse(broken).event is None
    with pytest.raises(RuntimeError): DFPlayer().play_track(7)
    uart.write=lambda data: None
    with pytest.raises(OSError): player.play_track(8)
    assert player._current_track == 7
