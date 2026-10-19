"""Tests for sensor drivers (flex ADC + MPU6050)."""

import pytest
from sensors import FlexSensorArray, MPU6050, SensorManager
from tests.sensor_fakes import ADC, I2C


class TestFlexSensorArray:
    """5-channel flex sensor ADC readings."""

    def setup_method(self):
        self.flex = FlexSensorArray([ADC(32768)]*5)

    def test_initialization(self):
        """FlexSensorArray initializes with 5 channels."""
        assert self.flex.channel_count == 5
        assert self.flex.channels == [0, 1, 2, 3, 4]

    def test_read_all_returns_5_values(self):
        """read_all returns list of 5 ADC values (0-4095)."""
        values = self.flex.read_all()
        assert isinstance(values, list)
        assert len(values) == 5
        for v in values:
            assert isinstance(v, int)
            assert 0 <= v <= 4095

    def test_read_channel_valid(self):
        """read_channel returns ADC value for valid channel 0-4."""
        for ch in range(5):
            v = self.flex.read_channel(ch)
            assert isinstance(v, int)
            assert 0 <= v <= 4095

    def test_read_channel_invalid_raises(self):
        """read_channel raises for invalid channel."""
        with pytest.raises(ValueError):
            self.flex.read_channel(-1)
        with pytest.raises(ValueError):
            self.flex.read_channel(5)


class TestMPU6050:
    """MPU6050 IMU driver (I²C)."""

    def setup_method(self):
        self.mpu = MPU6050()

    def test_initialization(self):
        """MPU6050 initializes with default address 0x68."""
        assert self.mpu.address == 0x68
        assert self.mpu.is_initialized is False

    def test_initialize(self):
        """initialize configures the sensor."""
        self.mpu.initialize(I2C())
        assert self.mpu.is_initialized is True

    def test_read_acceleration_returns_3_values(self):
        """read_acceleration returns (x, y, z) in degrees."""
        self.mpu.initialize(I2C())
        x, y, z = self.mpu.read_acceleration()
        assert isinstance(x, float)
        assert isinstance(y, float)
        assert isinstance(z, float)
        assert -180 <= x <= 180
        assert -180 <= y <= 180
        assert -180 <= z <= 180

    def test_read_gyro_returns_3_values(self):
        """read_gyro returns (x, y, z) in degrees/sec."""
        self.mpu.initialize(I2C())
        x, y, z = self.mpu.read_gyro()
        assert isinstance(x, float)
        assert isinstance(y, float)
        assert isinstance(z, float)

    def test_read_temperature(self):
        """read_temperature returns temperature in Celsius."""
        self.mpu.initialize(I2C())
        temp = self.mpu.read_temperature()
        assert isinstance(temp, float)
        assert -40 <= temp <= 85

    def test_calibration_offsets(self):
        """calibration offsets are applied to readings."""
        self.mpu.initialize(I2C())
        self.mpu.set_offsets(x_offset=1.5, y_offset=-0.5)
        x, y, z = self.mpu.read_acceleration()
        # Offsets should be applied to the simulated reading
        # Simulated reading returns (0, 0, 0) angles before offset
        assert abs(x - (-1.5)) < 0.1  # 0 - 1.5 = -1.5
        assert abs(y - 0.5) < 0.1     # 0 - (-0.5) = 0.5


class TestSensorManager:
    """Combined sensor manager for capture."""

    def setup_method(self):
        mpu=MPU6050(); mpu.initialize(I2C())
        self.manager = SensorManager(FlexSensorArray([ADC(32768)]*5), mpu)

    def test_initialization(self):
        """SensorManager initializes flex and MPU."""
        assert hasattr(self.manager, 'flex')
        assert hasattr(self.manager, 'mpu')
        assert self.manager.flex.channel_count == 5
        assert self.manager.mpu.address == 0x68

    def test_capture_sample_returns_7_values(self):
        """capture_sample returns 7 values (5 flex + 2 MPU angles)."""
        sample = self.manager.capture_sample()
        assert isinstance(sample, list)
        assert len(sample) == 7
        # First 5: flex ADC (0-4095)
        for v in sample[:5]:
            assert isinstance(v, int)
            assert 0 <= v <= 4095
        # Last 2: MPU angles (-180 to 180)
        for v in sample[5:]:
            assert isinstance(v, float)
            assert -180 <= v <= 180

    def test_capture_multiple_samples(self):
        """capture_multiple returns list of samples."""
        samples = self.manager.capture_multiple(count=3, period_ms=10)
        assert isinstance(samples, list)
        assert len(samples) == 3
        for s in samples:
            assert len(s) == 7


def test_real_register_reads_and_raw_adc_order():
    bus=I2C(); mpu=MPU6050(); mpu.initialize(bus)
    assert bus.writes == [(0x68,0x6B,b'\x00'),(0x68,0x1B,b'\x00'),(0x68,0x1C,b'\x00')]
    bus.registers[0x3B]=b'\x00\x00\x40\x00\x00\x00'
    assert mpu.read_acceleration()[0] == 90.0
    bus.registers[0x43]=b'\xff\x7d\x00\x83\x00\x00'
    assert mpu.read_gyro() == (-1.0,1.0,0.0)
    flex=FlexSensorArray([ADC(v) for v in [0,16000,32768,48000,65535]])
    assert flex.read_all() == [0,1000,2048,2999,4095]


def test_sensor_failure_is_not_a_constant_sample():
    bus=I2C(); bus.registers[0x75]=b'\x00'
    with pytest.raises(OSError): MPU6050().initialize(bus)
    bus=I2C(); mpu=MPU6050(); mpu.initialize(bus)
    bus.registers[0x3B]=b'\x00'
    with pytest.raises(OSError): mpu.read_acceleration()


def test_missing_board_configuration_fails_before_hardware_access():
    from hardware import create_hardware
    with pytest.raises(ValueError, match='configuration|wiring'):
        create_hardware({})


def test_hardware_factory_wires_injected_peripherals(monkeypatch):
    from hardware import create_hardware
    from tests.sensor_fakes import UART
    from sensors import CalibrationData
    monkeypatch.setattr('dfplayer.sleep_ms',lambda ms:None)
    ports=[]
    class BoardADC(ADC):
        def __init__(self,pin): super().__init__(32768)
        def atten(self,value): assert value == 11
    class Machine:
        Pin=staticmethod(lambda pin:pin)
        ADC=BoardADC
        I2C=staticmethod(lambda *args,**kwargs:I2C())
        @staticmethod
        def UART(identifier,**kwargs):
            uart=UART(); ports.append((identifier,kwargs,uart)); return uart
    board={'flex_pins':[1,2,3,4,5],'adc_attenuation':11,'i2c_id':0,
           'scl_pin':6,'sda_pin':7,'mpu_address':0x68,'mpu_offsets':[2,-1],
           'protocol_uart':{'id':0,'tx':8,'rx':9},
           'dfplayer_uart':{'id':1,'tx':10,'rx':11}}
    transport,sensors,player=create_hardware(board,Machine)
    sensors.calibrate()
    assert sensors.capture_sample() == [2048]*5+[-2,1]
    assert [p[1]['baudrate'] for p in ports] == [115200,9600]
    player.play_track(9)
    assert ports[1][2].writes[-1][3:7] == bytes([0x12,0,0,9])
    board['dfplayer_uart']['id']=0
    with pytest.raises(ValueError,match='distinct UARTs'): create_hardware(board,Machine)
