class ADC:
    def __init__(self, value): self.value = value
    def read_u16(self): return self.value

class I2C:
    def __init__(self): self.writes=[]; self.registers={0x75:b'\x68',0x3B:b'\x00\x00\x00\x00\x40\x00',0x43:b'\x00'*6,0x41:b'\x00'*2}
    def readfrom_mem(self, address, register, count): return self.registers[register][:count]
    def writeto_mem(self, address, register, value): self.writes.append((address,register,value))

class UART:
    def __init__(self): self.writes=[]; self.incoming=b''
    def write(self, data): self.writes.append(bytes(data)); return len(data)
    def read(self, count=32):
        chunk=self.incoming[:count]; self.incoming=self.incoming[count:]; return chunk
