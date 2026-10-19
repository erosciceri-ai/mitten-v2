"""Board wiring is explicit local configuration, not a protocol setting."""
from sensors import FlexSensorArray, MPU6050, SensorManager, CalibrationData


def create_hardware(board, machine=None):
    # Validate all required choices before touching a peripheral.
    protocol_transport = board.get('protocol_transport', 'uart')
    if protocol_transport not in ('uart', 'stdio'):
        raise ValueError("protocol_transport must be uart or stdio")
    audio_enabled = board.get('audio_enabled', True)
    if not isinstance(audio_enabled, bool):
        raise ValueError("audio_enabled must be a boolean")
    keys = ('flex_pins', 'adc_attenuation', 'i2c_id', 'scl_pin', 'sda_pin',
            'mpu_address', 'mpu_offsets')
    if protocol_transport == 'uart':
        keys += ('protocol_uart',)
    if audio_enabled:
        keys += ('dfplayer_uart',)
    if any(key not in board or board[key] is None for key in keys):
        raise ValueError("Complete hardware_config.BOARD wiring and calibration first")
    if len(board['flex_pins']) != 5 or len(board['mpu_offsets']) != 2:
        raise ValueError("Five flex pins and two measured MPU offsets required")
    ports = [board['protocol_uart']] if protocol_transport == 'uart' else []
    if audio_enabled:
        ports.append(board['dfplayer_uart'])
    if any(any(p.get(k) is None for k in ('id', 'tx', 'rx')) for p in ports):
        raise ValueError("Both UARTs require explicit id, tx and rx")
    if len(ports) == 2 and ports[0]['id'] == ports[1]['id']:
        raise ValueError("Protocol and DFPlayer must use distinct UARTs")
    if protocol_transport == 'stdio' and audio_enabled and ports[-1]['id'] == 0:
        raise ValueError("DFPlayer must not use the ESP32 console UART")
    pins = list(board['flex_pins']) + [board['scl_pin'], board['sda_pin']]
    pins += [p[k] for p in ports for k in ('tx','rx')]
    if protocol_transport == 'stdio':
        pins += [1, 3]  # ESP32_GENERIC console TX/RX; never repurpose these pins.
    if None in pins or len(set(pins)) != len(pins):
        raise ValueError("GPIO assignments must be complete and distinct")
    import math
    if any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in board['mpu_offsets']):
        raise ValueError("MPU offsets must be finite degrees")
    if machine is None:
        import machine
    adcs = [machine.ADC(machine.Pin(pin)) for pin in board['flex_pins']]
    for adc in adcs:
        adc.atten(board['adc_attenuation'])
    i2c = machine.I2C(board['i2c_id'], scl=machine.Pin(board['scl_pin']),
                      sda=machine.Pin(board['sda_pin']), freq=100000)
    mpu = MPU6050(board['mpu_address']); mpu.initialize(i2c)
    calibration = CalibrationData()
    calibration.mpu_x_offset, calibration.mpu_y_offset = board['mpu_offsets']
    calibration.is_valid = True
    sensors = SensorManager(FlexSensorArray(adcs), mpu, calibration)
    if protocol_transport == 'stdio':
        from main import StdioStreamTransport
        transport = StdioStreamTransport()
    else:
        protocol = ports[0]
        from main import UartStreamTransport
        transport = UartStreamTransport(machine.UART(protocol['id'], baudrate=115200,
            tx=machine.Pin(protocol['tx']), rx=machine.Pin(protocol['rx'])))
    player = None
    if audio_enabled:
        from dfplayer import DFPlayer
        audio = ports[-1]
        player = DFPlayer()
        player.begin(machine.UART(audio['id'], baudrate=9600,
            tx=machine.Pin(audio['tx']), rx=machine.Pin(audio['rx'])))
    return transport, sensors, player
