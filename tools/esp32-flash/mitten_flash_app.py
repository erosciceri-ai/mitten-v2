"""Flash the ESP32 application in small chunks over a flaky USB link.

The link on this board drops during long transfers, so the application image
is written in pieces: each piece takes a couple of seconds instead of a
minute, and a piece that fails is retried without touching the rest.

Between pieces the chip stays in ROM download mode (esptool is called with
--before/--after no-reset), so the operator does not have to press anything
between chunks. The filesystem is never touched and the flash is never erased.
"""
import os
import subprocess
import sys
import time

PORT = "COM5"
BAUD = "921600"
IMAGE = sys.argv[1] if len(sys.argv) > 1 else (
    r"C:\Users\roman\AppData\Local\Temp\opencode\images\micropython-repl-console.bin")
OFFSET = 0x10000
CHUNK = 0x20000  # 128 KiB
CHUNK_RETRIES = 15
TMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chunks")


def esptool(args, timeout=600):
    cmd = [sys.executable, "-m", "esptool", "--port", PORT, "--chip", "esp32",
           "--baud", BAUD, "--before", "no-reset", "--after", "no-reset"] + args
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return "", "timeout"
    return (result.stdout or "") + (result.stderr or ""), ""


def port_present():
    try:
        out = subprocess.run(
            [sys.executable, "-c",
             "import serial.tools.list_ports as p;"
             "print(','.join(x.device for x in p.comports()))"],
            capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception:
        return False
    return PORT in out.split(",")


def in_rom():
    out, _ = esptool(["chip-id"], timeout=90)
    return "MAC:" in out


def wait_for_rom(seconds=900):
    deadline = time.time() + seconds
    attempt = 0
    while time.time() < deadline:
        attempt += 1
        if port_present() and in_rom():
            print(f"[+] placa en ROM (intento {attempt})", flush=True)
            return True
        time.sleep(2)
    return False


def write_chunk(path, address, retries=CHUNK_RETRIES):
    for attempt in range(1, retries + 1):
        out, _ = esptool(["write-flash", hex(address), path], timeout=600)
        if "Hash of data verified" in out:
            return True
        print(f"    fallo en 0x{address:X} (intento {attempt})", flush=True)
        for line in out.splitlines()[-4:]:
            if line.strip() and "WARNING" not in line:
                print("      " + line.strip()[:150], flush=True)
        if not port_present():
            print("    el puerto USB se perdio; reconectalo", flush=True)
            time.sleep(5)
        elif not in_rom():
            print("    la placa salio de ROM: mantené BOOT, tocá EN, soltá BOOT", flush=True)
            wait_for_rom(180)
    return False


def main():
    os.makedirs(TMP_DIR, exist_ok=True)
    with open(IMAGE, "rb") as handle:
        data = handle.read()
    total = len(data)
    pieces = [(offset, data[offset:offset + CHUNK])
              for offset in range(0, total, CHUNK)]
    print(f"[*] {os.path.basename(IMAGE)}: {total} bytes en {len(pieces)} trozos de {CHUNK // 1024} KiB",
          flush=True)

    if not wait_for_rom():
        print("[!] la placa no está en ROM", flush=True)
        return 1

    for index, (offset, piece) in enumerate(pieces, start=1):
        path = os.path.join(TMP_DIR, f"part{index:03d}.bin")
        with open(path, "wb") as handle:
            handle.write(piece)
        address = OFFSET + offset
        print(f"[{index}/{len(pieces)}] escribiendo 0x{address:X} ({len(piece)} bytes)", flush=True)
        if not write_chunk(path, address):
            print(f"[!] no se pudo escribir el trozo en 0x{address:X}", flush=True)
            return 1
        os.remove(path)
        print(f"    ok ({index * 100 // len(pieces)}%)", flush=True)

    print("[+] imagen completa escrita y verificada por hash", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
