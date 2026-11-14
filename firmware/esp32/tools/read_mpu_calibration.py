"""Read MPU6050 address and neutral-pose offsets using a REPL-enabled image.

Run only as a one-off diagnostic, not from MITTEN's protocol firmware. Keep the
glove still in the project's chosen, repeatable neutral pose while it samples.
"""

import math
import machine
import time


bus = machine.I2C(0, scl=machine.Pin(22), sda=machine.Pin(21), freq=100000)
addresses = [address for address in bus.scan() if address in (0x68, 0x69)]
if len(addresses) != 1:
    raise RuntimeError("Expected exactly one MPU6050 at 0x68 or 0x69; found %s" % addresses)

address = addresses[0]
bus.writeto_mem(address, 0x6B, b"\x00")
time.sleep_ms(100)

angles_x = []
angles_y = []
for _ in range(50):
    raw = bus.readfrom_mem(address, 0x3B, 6)
    values = []
    for offset in (0, 2, 4):
        value = (raw[offset] << 8) | raw[offset + 1]
        values.append(value - 65536 if value >= 32768 else value)
    x, y, z = values
    if x == y == z == 0:
        raise RuntimeError("MPU6050 returned a zero acceleration vector")
    angles_x.append(math.atan2(y, z) * 180 / math.pi)
    angles_y.append(math.atan2(x, z) * 180 / math.pi)
    time.sleep_ms(20)

offset_x = sum(angles_x) / len(angles_x)
offset_y = sum(angles_y) / len(angles_y)
print("mpu_address = 0x%02X" % address)
print("mpu_offsets = [%.4f, %.4f]" % (offset_x, offset_y))
