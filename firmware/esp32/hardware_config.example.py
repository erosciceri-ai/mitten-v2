"""Copy to hardware_config.py and fill with the actual board wiring.
No GPIO or ADC attenuation is inferred from V1. If protocol_uart is the REPL
UART, detach the REPL on the selected MicroPython board before starting main.
For native USB instead, inject the board-specific StreamTransport into main_loop.
mpu_offsets are measured mounting errors in degrees for the chosen reference
pose; applied during CALIBRATING and on every capture/recognition sample.
"""
BOARD = {
    'flex_pins': None,  # [flex1, flex2, flex3, flex4, flex5]
    'adc_attenuation': None,  # machine.ADC attenuation for the actual circuit
    'i2c_id': None, 'scl_pin': None, 'sda_pin': None,
    'mpu_address': None,  # depends on AD0 wiring (0x68 or 0x69)
    'mpu_offsets': None,  # [mpuX offset, mpuY offset], degrees
    'protocol_uart': {'id': None, 'tx': None, 'rx': None},
    'dfplayer_uart': {'id': None, 'tx': None, 'rx': None},
}
