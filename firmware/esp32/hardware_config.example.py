"""Copy to hardware_config.py and fill with the actual board wiring.
No GPIO or ADC attenuation is inferred from V1. ESP32_GENERIC uses binary
console streams over its USB-serial connection; do not reconfigure UART0.
Close Thonny's serial session before opening the same port in the web app.
mpu_offsets are measured mounting errors in degrees for the chosen reference
pose; applied during CALIBRATING and on every capture/recognition sample.
"""
BOARD = {
    'flex_pins': None,  # [flex1, flex2, flex3, flex4, flex5]
    'adc_attenuation': None,  # machine.ADC attenuation for the actual circuit
    'i2c_id': None, 'scl_pin': None, 'sda_pin': None,
    'mpu_address': None,  # depends on AD0 wiring (0x68 or 0x69)
    'mpu_offsets': None,  # [mpuX offset, mpuY offset], degrees
    'protocol_transport': 'stdio',  # ESP32_GENERIC: reserves GPIO1 and GPIO3.
    # Existing external-UART configurations can omit protocol_transport or use 'uart'.
    # 'protocol_uart': {'id': None, 'tx': None, 'rx': None},
    # Sensor/protocol bring-up only: no audio peripheral is initialized.
    'audio_enabled': False,
    # Optional legacy path only; not a MAX98357A driver. Required when audio_enabled=True.
    # 'dfplayer_uart': {'id': None, 'tx': None, 'rx': None},
}
