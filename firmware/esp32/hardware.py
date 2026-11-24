"""Board wiring is explicit local configuration, not a protocol setting."""
from sensors import FlexSensorArray, MPU6050, SensorManager, CalibrationData


class _IdleTransport:
    """Fallback no-op UART transport when protocol runs over Wi-Fi relay."""

    def read(self):
        return None

    def write(self, data):
        return len(data)


class _DummyMPU:
    """Bench-testing MPU6050 placeholder used only when board['allow_dummy_mpu'] is True."""

    def __init__(self):
        self.is_initialized = True

    def read_acceleration(self):
        return (0.0, 0.0, 1.0)


def create_hardware(board, machine=None):
    # Validate all required choices before touching a peripheral.
    keys = ('flex_pins', 'adc_attenuation', 'i2c_id', 'scl_pin', 'sda_pin',
            'mpu_address', 'mpu_offsets', 'protocol_uart', 'sd_sck', 'sd_miso',
            'sd_mosi', 'sd_cs', 'amp_sd_pin', 'i2s_lrc', 'i2s_bclk', 'i2s_din')
    if any(key not in board or board[key] is None for key in keys):
        raise ValueError("Complete hardware_config.BOARD wiring and calibration first")
    if len(board['flex_pins']) != 5 or len(board['mpu_offsets']) != 2:
        raise ValueError("Five flex pins and two measured MPU offsets required")
    protocol = board['protocol_uart']
    if any(protocol.get(k) is None for k in ('id', 'tx', 'rx')):
        raise ValueError("Protocol UART requires explicit id, tx and rx")
    pins = list(board['flex_pins']) + [board['scl_pin'], board['sda_pin']]
    pins += [protocol[k] for k in ('tx','rx')]
    pins += [board[k] for k in ('sd_sck','sd_miso','sd_mosi','sd_cs',
                                'amp_sd_pin','i2s_lrc','i2s_bclk','i2s_din')]
    if None in pins or len(set(pins)) != len(pins):
        raise ValueError("GPIO assignments must be complete and distinct")
    import math
    if any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in board['mpu_offsets']):
        raise ValueError("MPU offsets must be finite degrees")
    if machine is None:
        import machine
    safe_amp_pin = machine.Pin(board['amp_sd_pin'], machine.Pin.OUT, value=0)
    adcs = [machine.ADC(machine.Pin(pin)) for pin in board['flex_pins']]
    for adc in adcs:
        adc.atten(board['adc_attenuation'])
    i2c = machine.I2C(board['i2c_id'], scl=machine.Pin(board['scl_pin']),
                      sda=machine.Pin(board['sda_pin']), freq=100000)
    mpu = MPU6050(board['mpu_address'])
    try:
        mpu.initialize(i2c)
    except Exception:
        if board.get('allow_dummy_mpu'):
            mpu = _DummyMPU()
        else:
            raise
    calibration = CalibrationData()
    calibration.mpu_x_offset, calibration.mpu_y_offset = board['mpu_offsets']
    calibration.is_valid = True
    sensors = SensorManager(FlexSensorArray(adcs), mpu, calibration)
    import sys
    _main = sys.modules.get('main_app') or sys.modules.get('main') or __import__('main')
    UartStreamTransport = _main.UartStreamTransport
    TRANSPORT_MODE = getattr(_main, 'TRANSPORT_MODE', 'relay')
    if board.get('skip_uart') or (TRANSPORT_MODE == 'relay' and protocol['id'] == 0 and machine.__name__ == 'machine'):
        transport = _IdleTransport()
    else:
        try:
            transport = UartStreamTransport(machine.UART(protocol['id'], baudrate=115200,
                tx=machine.Pin(protocol['tx']), rx=machine.Pin(protocol['rx'])))
        except ValueError:
            if TRANSPORT_MODE == 'relay':
                transport = _IdleTransport()
            else:
                raise
    if board.get('skip_sd'):
        player = None
    else:
        from audio import AudioPlayer
        player = AudioPlayer(machine, board)
        player.initialize(safe_amp_pin)
    return transport, sensors, player
