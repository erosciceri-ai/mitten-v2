"""Copy to hardware_config.py and fill the remaining board-specific values.

Pin assignments below come from the supplied MITTEN PCB schematic and the
photographed ESP-WROOM-32 NodeMCU board. Confirm PCB revision/continuity before
powering the assembled glove. The USB-UART bridge uses UART0 on this board.
MicroPython v1.26.1 must be built with MICROPY_HW_ENABLE_UART_REPL=0; runtime
os.dupterm(None) does not release the ESP32's low-level UART REPL.

mpu_address=None enables strict I2C detection of exactly one MPU6050 at 0x68 or
0x69. mpu_offsets must be measured in the chosen neutral pose with
tools/read_mpu_calibration.py. ADC attenuation uses MicroPython's ATTN_11DB
constant for the 3.3 V flex divider; verify the real sensor range before
final calibration.
"""
BOARD = {
    'flex_pins': [36, 34, 35, 32, 33],  # thumb, index, middle, ring, little
    'adc_attenuation': 'ATTN_11DB',
    'i2c_id': 0, 'scl_pin': 22, 'sda_pin': 21,
    'mpu_address': None,  # depends on AD0 wiring (0x68 or 0x69)
    'mpu_offsets': None,  # [mpuX offset, mpuY offset], degrees
    'protocol_uart': {'id': 0, 'tx': 1, 'rx': 3},
    'sd_sck': 18, 'sd_miso': 19, 'sd_mosi': 23, 'sd_cs': 13,
    'amp_sd_pin': 14, 'i2s_lrc': 25, 'i2s_bclk': 26, 'i2s_din': 27,
}
