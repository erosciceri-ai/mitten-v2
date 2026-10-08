"""Board wiring is explicit local configuration, not a protocol setting."""
from sensors import FlexSensorArray, MPU6050, SensorManager, CalibrationData
from dfplayer import DFPlayer


def create_hardware(board, machine=None):
    # Validate all required choices before touching a peripheral.
    keys = ('flex_pins', 'adc_attenuation', 'i2c_id', 'scl_pin', 'sda_pin',
            'mpu_address', 'mpu_offsets', 'protocol_uart', 'dfplayer_uart')
    if any(key not in board or board[key] is None for key in keys):
        raise ValueError("Complete hardware_config.BOARD wiring and calibration first")
    if len(board['flex_pins']) != 5 or len(board['mpu_offsets']) != 2:
        raise ValueError("Five flex pins and two measured MPU offsets required")
    ports = [board['protocol_uart'], board['dfplayer_uart']]
    if any(any(p.get(k) is None for k in ('id', 'tx', 'rx')) for p in ports):
        raise ValueError("Both UARTs require explicit id, tx and rx")
    if ports[0]['id'] == ports[1]['id']:
        raise ValueError("Protocol and DFPlayer must use distinct UARTs")
    pins = list(board['flex_pins']) + [board['scl_pin'], board['sda_pin']]
    pins += [p[k] for p in ports for k in ('tx','rx')]
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
    protocol, audio = ports
    from main import UartStreamTransport
    transport = UartStreamTransport(machine.UART(protocol['id'], baudrate=115200,
        tx=machine.Pin(protocol['tx']), rx=machine.Pin(protocol['rx'])))
    player = DFPlayer()
    player.begin(machine.UART(audio['id'], baudrate=9600,
        tx=machine.Pin(audio['tx']), rx=machine.Pin(audio['rx'])))
    return transport, sensors, player
