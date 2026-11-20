"""Diagnóstico en la placa: memoria, Wi-Fi, TLS hacia el relay y microSD.

No se ejecuta solo. Desde Thonny: detené el programa (Ctrl+C) y en el REPL:

    import diag_wifi_audio
    diag_wifi_audio.run()

Imprime un reporte con [OK] / [AVISO] / [FALLA] / [INFO]. Copiá todo el texto.
No imprime contraseñas ni tokens. Escribe solo en /mitten_audio/diag (se borra al terminar).
"""

import binascii
import gc
import os
import struct
import sys
import time

from utils.time import ticks_diff, ticks_ms

LOW_HEAP_BYTES = 24 * 1024          # heurística: por debajo conviene revisar la RAM
BENCH_BYTES = 96 * 1024
BENCH_CHUNK = 3072
MODULES = ("wifi_manager", "relay_transport", "audio_store", "protocol.commands")


def _free():
    gc.collect()
    return gc.mem_free() if hasattr(gc, "mem_free") else None


def _kb(value):
    return "n/d" if value is None else "%.1f KB" % (value / 1024)


def _ms_since(start):
    return ticks_diff(ticks_ms(), start)


class Report:
    def __init__(self, out=print):
        self.out = out
        self.counts = {"OK": 0, "AVISO": 0, "FALLA": 0, "INFO": 0}

    def line(self, level, text):
        self.counts[level] += 1
        self.out("[%s] %s" % (level, text))

    def ok(self, text): self.line("OK", text)
    def warn(self, text): self.line("AVISO", text)
    def fail(self, text): self.line("FALLA", text)
    def info(self, text): self.line("INFO", text)

    def title(self, text):
        self.out("")
        self.out("== %s ==" % text)


def _guard(report, name, function, *args):
    try:
        return function(report, *args)
    except Exception as error:
        report.fail("%s: excepción %s: %s" % (name, type(error).__name__, error))
        if hasattr(sys, "print_exception"):
            sys.print_exception(error)
        return None


# ---- 1. sistema y costo de memoria de los módulos nuevos ------------------
def section_system(report):
    report.title("Sistema")
    if hasattr(os, "uname"):
        report.info("MicroPython: %s" % (os.uname().version,))
    try:
        import machine
        report.info("CPU: %d MHz" % (machine.freq() // 1000000))
    except Exception:
        pass
    try:
        stats = os.statvfs("/")
        report.info("Flash libre: %s" % _kb(stats[0] * stats[3]))
    except Exception:
        pass
    report.info("RAM libre al empezar: %s" % _kb(_free()))


def measure_import(name):
    """Devuelve (bytes de RAM que costó importar, ya_estaba_importado)."""
    if name in sys.modules:
        return 0, True
    before = _free()
    __import__(name)
    after = _free()
    return (None if before is None or after is None else before - after), False


def section_imports(report):
    report.title("Costo de RAM de los módulos")
    for name in MODULES:
        try:
            cost, loaded = measure_import(name)
        except Exception as error:
            report.fail("%s no se pudo importar: %s" % (name, error))
            continue
        report.info("%s: %s" % (name, "ya cargado" if loaded else _kb(cost)))
    report.info("RAM libre con todo cargado: %s" % _kb(_free()))


# ---- 2. Wi-Fi -------------------------------------------------------------
def section_wifi(report, config_path="wifi.json", timeout_ms=20000):
    report.title("Wi-Fi")
    try:
        import json
        with open(config_path) as handle:
            creds = json.load(handle)
    except (OSError, ValueError):
        report.warn("No hay %s: configurá el Wi-Fi desde el portal y repetí." % config_path)
        return False
    import network
    sta = network.WLAN(network.STA_IF)
    sta.active(True)
    if not sta.isconnected():
        started = ticks_ms()
        sta.connect(creds.get("ssid", ""), creds.get("password", ""))
        while not sta.isconnected() and _ms_since(started) < timeout_ms:
            time.sleep_ms(100) if hasattr(time, "sleep_ms") else time.sleep(0.1)
        if not sta.isconnected():
            report.fail("No se pudo conectar a la red guardada en %d s." % (timeout_ms // 1000))
            return False
        report.ok("Conectado en %d ms." % _ms_since(started))
    else:
        report.ok("Ya estaba conectado.")
    report.info("IP: %s" % sta.ifconfig()[0])
    try:
        report.info("Señal (RSSI): %s dBm" % sta.status("rssi"))
    except Exception:
        pass
    return True


# ---- 2b. seguridad de configuración AP ------------------------------------
def section_ap_security(report, board=None):
    report.title("Seguridad AP")
    if board is None:
        try:
            from hardware_config import BOARD as board
        except Exception:
            board = {}
    import wifi_manager as wm
    try:
        effective = wm.resolve_ap_password(board)
    except ValueError:
        report.fail("ap_password en hardware_config.py es inválida (debe tener entre 8 y 63 caracteres).")
        return False
    if effective == wm.AP_PASSWORD:
        report.warn("AP_PASSWORD sigue en valor de fábrica: definí 'ap_password' en hardware_config.py antes de entregar el guante.")
        return False
    report.ok("AP_PASSWORD personalizado configurado en hardware_config.py.")
    return True


# ---- 3. relay: DNS, TLS y handshake WebSocket ------------------------------
async def _relay_probe(url, ca_path):
    import relay_transport as rt
    reader, writer = await rt.ws_open(url, ca_path)
    try:
        writer.close()
    except Exception:
        pass


def section_relay(report, url=None, ca_path=None):
    report.title("Relay (DNS + TLS + WebSocket)")
    import relay_transport as rt
    url = url if url is not None else rt.RELAY_URL
    ca_path = ca_path if ca_path is not None else rt.CA_PATH
    if not url:
        report.warn("RELAY_URL está vacío en relay_transport.py.")
        return False
    secure, host, port, _ = rt.parse_url(url)
    report.info("Servidor: %s:%d (%s)" % (host, port, "wss" if secure else "ws"))
    if secure:
        if rt.file_exists(ca_path):
            report.ok("Hay %s: el certificado del servidor SE verifica." % ca_path)
        else:
            report.warn("Falta %s: el TLS NO verifica al servidor (cifra, pero no autentica)." % ca_path)
    import socket
    started = ticks_ms()
    try:
        socket.getaddrinfo(host, port)
        report.ok("DNS resuelto en %d ms." % _ms_since(started))
    except Exception as error:
        report.fail("DNS falló: %s" % error)
        return False
    try:
        import uasyncio as asyncio
    except ImportError:
        import asyncio
    results = []
    for attempt in (1, 2):
        before = _free()
        started = ticks_ms()
        try:
            asyncio.run(_relay_probe(url, ca_path))
        except Exception as error:
            report.fail("Intento %d: %s: %s" % (attempt, type(error).__name__, error))
            if isinstance(error, MemoryError):
                report.fail("MemoryError: la RAM no alcanza para el TLS.")
            return False
        elapsed = _ms_since(started)
        after = _free()
        results.append(elapsed)
        report.ok("Intento %d: handshake WebSocket en %d ms (RAM libre antes %s, después %s)."
                  % (attempt, elapsed, _kb(before), _kb(after)))
        if after is not None and after < LOW_HEAP_BYTES:
            report.warn("Quedan menos de %s libres después del TLS: margen bajo (heurística)." % _kb(LOW_HEAP_BYTES))
    return True


# ---- 4. microSD: velocidad, integridad y flujo real de AudioStore ----------
def _make_wav(samples):
    data = struct.pack("<%dh" % samples, *[(i * 37) % 2000 - 1000 for i in range(samples)])
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, 1, 16000, 32000, 2, 16)
    return header + b"data" + struct.pack("<I", len(data)) + data


def _rmtree(path):
    try:
        for name in os.listdir(path):
            full = path + "/" + name
            try:
                os.remove(full)
            except OSError:
                _rmtree(full)
        os.rmdir(path)
    except OSError:
        pass


def sd_benchmark(root, remount, is_playing, report):
    """Prueba de escritura/lectura y un ciclo completo de AudioStore bajo `root`."""
    from audio_store import AudioStore
    try:
        os.mkdir(root)
    except OSError:
        pass
    if not remount(True):
        report.fail("No se pudo montar la microSD en escritura (¿hay tarjeta? ¿está reproduciendo?).")
        return False
    good = True
    try:
        if hasattr(os, "statvfs"):
            stats = os.statvfs(root)
            report.info("microSD libre: %s" % _kb(stats[0] * stats[3]))
        block = bytes(range(256)) * (BENCH_CHUNK // 256)
        path = root + "/bench.bin"
        expected = 0
        started = ticks_ms()
        with open(path, "wb") as handle:
            for _ in range(BENCH_BYTES // BENCH_CHUNK):
                handle.write(block)
                expected = binascii.crc32(block, expected) & 0xFFFFFFFF
            handle.flush()
        write_ms = max(1, _ms_since(started))
        report.ok("Escritura: %d KB en %d ms (%.1f KB/s)." % (BENCH_BYTES // 1024, write_ms, BENCH_BYTES / 1.024 / write_ms))
        started = ticks_ms()
        running = 0
        with open(path, "rb") as handle:
            while True:
                chunk = handle.read(BENCH_CHUNK)
                if not chunk:
                    break
                running = binascii.crc32(chunk, running) & 0xFFFFFFFF
        read_ms = max(1, _ms_since(started))
        if running == expected:
            report.ok("Lectura: verificada con CRC en %d ms (%.1f KB/s)." % (read_ms, BENCH_BYTES / 1.024 / read_ms))
        else:
            good = False
            report.fail("Lo leído NO coincide con lo escrito (CRC distinto): tarjeta o cableado dudosos.")
        os.remove(path)

        store = AudioStore(root, remount=lambda writable: True, is_playing=is_playing)
        wav = _make_wav(16000)                       # 1 s de audio
        started = ticks_ms()
        store.begin(1, len(wav), binascii.crc32(wav) & 0xFFFFFFFF)
        for offset in range(0, len(wav), 3072):
            store.chunk(1, offset, wav[offset:offset + 3072])
        store.commit(1)
        cycle_ms = max(1, _ms_since(started))
        info = store.info(1)
        if info is not None and info["size"] == len(wav):
            report.ok("AudioStore: 1 s de audio (%d KB) publicado y verificado en %d ms." % (len(wav) // 1024, cycle_ms))
        else:
            good = False
            report.fail("AudioStore no dejó la pista publicada.")
        report.info("Estimación: un audio de 3 s tardaría ~%d ms en el guante (sin red)." % (cycle_ms * 3))
    except Exception as error:
        good = False
        report.fail("microSD: %s: %s" % (type(error).__name__, error))
    finally:
        _rmtree(root)
        remount(False)
    return good


def section_sd(report, root="/mitten_audio/diag"):
    report.title("microSD")
    try:
        import machine
        from audio import AudioPlayer
        from hardware_config import BOARD
    except Exception as error:
        report.fail("No se pudo preparar la microSD: %s" % error)
        return False
    player = AudioPlayer(machine, BOARD)
    if not player.initialize():
        report.fail("La microSD no se montó (revisá tarjeta, formato FAT y pines de hardware_config.py).")
        return False
    report.ok("microSD montada en solo lectura.")
    try:
        return sd_benchmark(root, player.remount, player.is_playing, report)
    finally:
        player.deinitialize()


# ---- ejecución -------------------------------------------------------------
def run(sections=("system", "imports", "wifi", "security", "relay", "sd"), out=print):
    report = Report(out)
    report.out("MITTEN diagnóstico Wi-Fi + audio")
    table = {
        "system": section_system,
        "imports": section_imports,
        "wifi": section_wifi,
        "security": section_ap_security,
        "relay": section_relay,
        "sd": section_sd,
    }
    wifi_ok = True
    for name in sections:
        if name == "relay" and not wifi_ok:
            report.title("Relay (DNS + TLS + WebSocket)")
            report.warn("Se omite: no hay Wi-Fi.")
            continue
        result = _guard(report, name, table[name])
        if name == "wifi":
            wifi_ok = bool(result)
    report.title("Resumen")
    report.out("OK=%d  AVISO=%d  FALLA=%d" % (report.counts["OK"], report.counts["AVISO"], report.counts["FALLA"]))
    report.out("RAM libre al terminar: %s" % _kb(_free()))
    return report
