"""Copy to hardware_config.py and fill with the actual board wiring.
No GPIO or ADC attenuation is inferred from V1. If protocol_uart is the REPL
UART, detach the REPL on the selected MicroPython board before starting main.
For native USB instead, inject the board-specific StreamTransport into main_loop.
mpu_offsets are measured mounting errors in degrees for the chosen reference
pose; applied during CALIBRATING and on every capture/recognition sample.
"""
BOARD = {
    'flex_pins': [36, 34, 35, 32, 33],  # provisional; verify against the physical PCB
    'adc_attenuation': None,  # machine.ADC attenuation for the actual circuit
    'i2c_id': 0, 'scl_pin': 22, 'sda_pin': 21,  # provisional; verify against the physical PCB
    'mpu_address': None,  # depends on AD0 wiring (0x68 or 0x69)
    'mpu_offsets': None,  # [mpuX offset, mpuY offset], degrees
    'protocol_uart': {'id': None, 'tx': None, 'rx': None},
    'sd_sck': 18, 'sd_miso': 19, 'sd_mosi': 23, 'sd_cs': 13,
    'amp_sd_pin': 14, 'i2s_lrc': 25, 'i2s_bclk': 26, 'i2s_din': 27,
    # Opcionales para modo Wi-Fi / relay (mantienen defaults si se omiten):
    # 'ap_password': 'cambiar-clave-wifi-8-63',  # 8 a 63 bytes UTF-8; reemplaza 'mitten1234'
    # 'relay_url': 'wss://mitten-api-staging.onrender.com/ws/device',
}
