"""Board wiring is explicit local configuration, not a protocol setting."""
from sensors import FlexSensorArray, MPU6050, SensorManager, CalibrationData


def create_protocol_transport(board, machine=None):
    """Open the protocol UART before initializing any other peripheral."""
    protocol = board.get('protocol_uart') or {}
    if any(protocol.get(k) is None for k in ('id', 'tx', 'rx')):
        raise ValueError("Complete hardware_config.BOARD protocol UART wiring first")
    if machine is None:
        import machine
    from main import UartStreamTransport
    uart = machine.UART(protocol['id'], baudrate=115200,
                        tx=machine.Pin(protocol['tx']),
                        rx=machine.Pin(protocol['rx']))
    return UartStreamTransport(uart)


def create_hardware(board, machine=None, transport=None, initialize_audio=True):
    # Open (or accept) the protocol transport before validating or initializing
    # other hardware, so the caller can report subsequent startup failures.
    if transport is None:
        transport = create_protocol_transport(board, machine)

    # Validate all remaining required choices before touching other peripherals.
    keys = ('flex_pins', 'adc_attenuation', 'i2c_id', 'scl_pin', 'sda_pin',
            'mpu_offsets')
    if any(key not in board or board[key] is None for key in keys):
        raise ValueError("Complete hardware_config.BOARD wiring and calibration first")
    if len(board['flex_pins']) != 5 or len(board['mpu_offsets']) != 2:
        raise ValueError("Five flex pins and two measured MPU offsets required")
    # Only sensor and transport wiring is critical to gesture operation.
    pins = list(board['flex_pins']) + [board['scl_pin'], board['sda_pin']]
    protocol = board['protocol_uart']
    pins += [protocol[k] for k in ('tx','rx')]
    if None in pins or len(set(pins)) != len(pins):
        raise ValueError("Sensor and protocol GPIO assignments must be complete and distinct")
    import math
    if any(not isinstance(v, (int, float)) or not math.isfinite(v) for v in board['mpu_offsets']):
        raise ValueError("MPU offsets must be finite degrees")
    if machine is None:
        import machine
    attenuation_name = board['adc_attenuation']
    if not isinstance(attenuation_name, str) or not attenuation_name.startswith('ATTN_'):
        raise ValueError("adc_attenuation must name a machine.ADC attenuation constant")
    try:
        attenuation = getattr(machine.ADC, attenuation_name)
    except AttributeError:
        raise ValueError("Unsupported machine.ADC attenuation: %s" % attenuation_name)
    i2c = None
    try:
        adcs = [machine.ADC(machine.Pin(pin)) for pin in board['flex_pins']]
        for adc in adcs:
            adc.atten(attenuation)
        i2c = machine.I2C(board['i2c_id'], scl=machine.Pin(board['scl_pin']),
                          sda=machine.Pin(board['sda_pin']), freq=100000)
        address = board.get('mpu_address')
        if address is None:
            candidates = [candidate for candidate in i2c.scan()
                          if candidate in (0x68, 0x69)]
            if len(candidates) != 1:
                raise OSError("Expected exactly one MPU6050 at address 0x68 or 0x69")
            address = candidates[0]
        mpu = MPU6050(address); mpu.initialize(i2c)
        calibration = CalibrationData()
        calibration.mpu_x_offset, calibration.mpu_y_offset = board['mpu_offsets']
        calibration.is_valid = True
        sensors = SensorManager(FlexSensorArray(adcs), mpu, calibration)
    except Exception:
        if i2c is not None and hasattr(i2c, 'deinit'):
            try:
                i2c.deinit()
            except Exception:
                pass
        raise
    audio_keys = ('sd_sck', 'sd_miso', 'sd_mosi', 'sd_cs', 'amp_sd_pin',
                  'i2s_lrc', 'i2s_bclk', 'i2s_din')
    audio_pins = [board.get(key) for key in audio_keys]
    audio_ready = all(pin is not None for pin in audio_pins)
    safe_amp_pin = None
    player = None
    if audio_ready:
        # Audio wiring conflicts degrade audio only; they must not suppress
        # the UART or usable sensors.
        audio_pin_set = set(pins + audio_pins)
        audio_ready = len(audio_pin_set) == len(pins) + len(audio_pins)
    if audio_ready:
        try:
            safe_amp_pin = machine.Pin(board['amp_sd_pin'], machine.Pin.OUT, value=0)
            from audio import AudioPlayer
            player = AudioPlayer(machine, board)
        except Exception:
            if safe_amp_pin is not None:
                try:
                    safe_amp_pin.value(0)
                except Exception:
                    pass
            player = None
    if initialize_audio:
        if player is not None:
            try:
                player.initialize(safe_amp_pin)
            except Exception:
                # Audio storage is optional for bringing up the protocol and sensors.
                try:
                    player.deinitialize()
                except Exception:
                    pass
    else:
        # Keep the amplifier disabled until audio initialization is requested.
        if player is not None:
            player.sd_pin = safe_amp_pin
    return transport, sensors, player
