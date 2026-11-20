"""Wi-Fi de MITTEN V2: credenciales persistentes, conexión STA y AP de configuración.

Corre como tarea de asyncio junto a main_loop. Nunca bloquea el reconocimiento
ni la reproducción local: sin Wi-Fi el guante sigue funcionando.
"""

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

import network

from storage.files import read_json_file, write_json_file, safe_remove, file_exists
from utils.time import ticks_ms, ticks_diff

import os

CONFIG_PATH = "wifi.json"
AP_PASSWORD = "mitten1234"          # 8 a 63 caracteres; cambiar antes de entregar el guante
AP_PREFIX = "MITTEN-"
PORTAL_PORT = 80
BUTTON_PIN = 0                      # BOOT del DevKit V1; libre en BOARD
BUTTON_HOLD_MS = 3000
PORTAL_TIMEOUT_MS = 600000          # el AP se apaga a los 10 min sin configuración
CONNECT_TIMEOUT_MS = 15000
RETRY_DELAYS_MS = (5000, 15000, 60000)
MAX_BODY = 1024

OFFLINE = "OFFLINE"
CONNECTING = "CONNECTING"
CONNECTED = "CONNECTED"
PROVISIONING = "PROVISIONING"


async def _sleep_ms(ms):
    if hasattr(asyncio, "sleep_ms"):
        await asyncio.sleep_ms(ms)
    else:
        await asyncio.sleep(ms / 1000.0)


def _unquote(text):
    raw = text.replace("+", " ").encode()
    out = bytearray()
    i, n = 0, len(raw)
    while i < n:
        if raw[i] == 0x25 and i + 2 < n:
            try:
                out.append(int(raw[i + 1:i + 3].decode(), 16))
                i += 3
                continue
            except ValueError:
                pass
        out.append(raw[i])
        i += 1
    return out.decode("utf-8", "ignore")


def parse_form(body):
    form = {}
    for pair in body.split("&"):
        if "=" in pair:
            key, value = pair.split("=", 1)
            form[_unquote(key)] = _unquote(value)
    return form


def _esc(text):
    return (text.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace('"', "&quot;"))


def validate_credentials(ssid, password):
    """Devuelve un mensaje de error o None si son válidas."""
    if not ssid or len(ssid.encode()) > 32:
        return "El nombre de la red debe tener entre 1 y 32 bytes."
    if password and not 8 <= len(password.encode()) <= 63:
        return "La contraseña debe tener entre 8 y 63 caracteres (o vacía si la red es abierta)."
    return None


def resolve_ap_password(board=None):
    """Devuelve la clave del AP desde BOARD['ap_password'] o el valor de fábrica."""
    if isinstance(board, dict):
        password = board.get("ap_password")
        if password is not None and password != "":
            if not isinstance(password, str) or not 8 <= len(password.encode("utf-8")) <= 63:
                raise ValueError("ap_password must be 8 to 63 UTF-8 bytes")
            return password
    return AP_PASSWORD


class WifiManager:
    def __init__(self, config_path=CONFIG_PATH, ap_password=AP_PASSWORD, port=PORTAL_PORT,
                 button=None, hold_ms=BUTTON_HOLD_MS, portal_timeout_ms=PORTAL_TIMEOUT_MS,
                 connect_timeout_ms=CONNECT_TIMEOUT_MS, retry_delays_ms=RETRY_DELAYS_MS,
                 on_form=None):
        self.config_path = config_path
        self.ap_password = ap_password
        self.port = port
        self.hold_ms = hold_ms
        self.portal_timeout_ms = portal_timeout_ms
        self.connect_timeout_ms = connect_timeout_ms
        self.retry_delays_ms = retry_delays_ms
        self._on_form = on_form          # recibe el formulario guardado (p. ej. código de vinculación)
        self.state = OFFLINE
        self.last_error = None
        self.creds = None
        self._button = button
        self._pressed_since = None
        self._want_portal = False
        self._saved = False
        self._fresh = False
        self._networks = []

    # ---- persistencia -------------------------------------------------------
    def _load(self):
        for path in (self.config_path, self.config_path + ".tmp"):
            data = read_json_file(path)
            if isinstance(data, dict) and isinstance(data.get("ssid"), str) and data["ssid"]:
                return {"ssid": data["ssid"], "password": str(data.get("password", ""))}
        return None

    def _save(self, ssid, password):
        tmp = self.config_path + ".tmp"
        if not write_json_file(tmp, {"ssid": ssid, "password": password}):
            safe_remove(tmp)
            return False
        try:
            if file_exists(self.config_path):
                os.remove(self.config_path)
            os.rename(tmp, self.config_path)
        except OSError:
            return False  # _load() recupera desde .tmp
        return True

    def forget(self):
        safe_remove(self.config_path)
        safe_remove(self.config_path + ".tmp")
        self.creds = None
        sta = network.WLAN(network.STA_IF)
        if sta.active():
            sta.disconnect()

    # ---- API pública --------------------------------------------------------
    def request_portal(self):
        self._want_portal = True

    def ip(self):
        sta = network.WLAN(network.STA_IF)
        return sta.ifconfig()[0] if sta.active() and sta.isconnected() else None

    # ---- botón --------------------------------------------------------------
    def _get_button(self):
        if self._button is None:
            from machine import Pin
            pin = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)
            self._button = lambda: pin.value() == 0
        return self._button

    def _poll_button(self):
        """Pulsación larga en runtime. No se mira al arrancar: GPIO0 en bajo durante el reset entra en modo flasheo."""
        if self._get_button()():
            now = ticks_ms()
            if self._pressed_since is None:
                self._pressed_since = now
            elif ticks_diff(now, self._pressed_since) >= self.hold_ms:
                self._pressed_since = None
                self._want_portal = True
        else:
            self._pressed_since = None

    async def _wait(self, ms):
        """Espera en tramos cortos para reaccionar al botón y a request_portal()."""
        waited = 0
        while waited < ms and not self._want_portal:
            await _sleep_ms(100)
            waited += 100
            self._poll_button()

    # ---- bucle principal ----------------------------------------------------
    async def run(self):
        self.creds = self._load()
        if self.creds is None:
            self._want_portal = True
        retry = 0
        while True:
            try:
                if self._want_portal:
                    await self._portal()
                    self._want_portal = False
                    retry = 0
                if self.creds is None:
                    self._set(OFFLINE)
                    await self._wait(500)
                    continue
                sta = network.WLAN(network.STA_IF)
                if sta.active() and sta.isconnected():
                    self._set(CONNECTED)
                    await self._wait(1000)
                    continue
                self._set(CONNECTING)
                if await self._try_connect():
                    self._fresh = False
                    self.last_error = None
                    retry = 0
                    continue
                if self._fresh:
                    self._fresh = False
                    self._want_portal = True   # credenciales recién cargadas que no funcionan
                    continue
                self._set(OFFLINE)
                await self._wait(self.retry_delays_ms[min(retry, len(self.retry_delays_ms) - 1)])
                retry += 1
            except asyncio.CancelledError:
                raise
            except Exception as error:
                self.last_error = "Wi-Fi: " + repr(error)
                self._set(OFFLINE)
                await _sleep_ms(1000)

    def _set(self, state):
        self.state = state

    async def _try_connect(self):
        sta = network.WLAN(network.STA_IF)
        sta.active(True)
        sta.connect(self.creds["ssid"], self.creds["password"])
        wrong = getattr(network, "STAT_WRONG_PASSWORD", None)
        started = ticks_ms()
        while ticks_diff(ticks_ms(), started) < self.connect_timeout_ms:
            if sta.isconnected():
                return True
            if wrong is not None and sta.status() == wrong:
                self.last_error = "Contraseña incorrecta para %s." % self.creds["ssid"]
                sta.disconnect()
                return False
            await _sleep_ms(200)
        sta.disconnect()
        self.last_error = "No se pudo conectar a %s." % self.creds["ssid"]
        return False

    # ---- portal de configuración -------------------------------------------
    def _scan(self):
        sta = network.WLAN(network.STA_IF)
        sta.active(True)
        try:
            found = sta.scan()
        except OSError:
            return []
        best = {}
        for entry in found:
            name = entry[0].decode("utf-8", "ignore")
            if name and (name not in best or entry[3] > best[name]):
                best[name] = entry[3]
        return sorted(best, key=lambda n: -best[n])

    def _page(self):
        options = "".join('<option value="%s">' % _esc(n) for n in self._networks)
        error = ""
        if self.last_error:
            error = "<p style='color:#b00020'>%s</p>" % _esc(self.last_error)
        return (
            "<!doctype html><meta charset=utf-8>"
            "<meta name=viewport content='width=device-width,initial-scale=1'>"
            "<title>MITTEN - Wi-Fi</title>"
            "<body style='font-family:sans-serif;max-width:420px;margin:2em auto;padding:0 1em'>"
            "<h2>MITTEN: configurar Wi-Fi</h2>" + error +
            "<form method=post action=/save>"
            "<p><label>Red (solo 2,4 GHz)<br>"
            "<input name=ssid list=nets required maxlength=32 style='width:100%'></label>"
            "<datalist id=nets>" + options + "</datalist></p>"
            "<p><label>Contraseña<br>"
            "<input name=password type=password maxlength=63 style='width:100%'></label></p>"
            + self._code_field() +
            "<button style='width:100%;padding:.6em'>Guardar y conectar</button>"
            "</form></body>"
        )

    def _code_field(self):
        if self._on_form is None:
            return ""
        return ("<p><label>Código de vinculación (6 dígitos, opcional si ya está vinculado)<br>"
                "<input name=code inputmode=numeric pattern='[0-9]{6}' maxlength=6 style='width:100%'>"
                "</label></p>")

    async def _respond(self, writer, body, status="200 OK"):
        data = body.encode()
        head = ("HTTP/1.1 %s\r\nContent-Type: text/html; charset=utf-8\r\n"
                "Content-Length: %d\r\nConnection: close\r\n\r\n" % (status, len(data)))
        writer.write(head.encode() + data)
        await writer.drain()

    async def _handle(self, reader, writer):
        try:
            line = await asyncio.wait_for(reader.readline(), 5)
            parts = line.split()
            if len(parts) < 2:
                return
            method, path = parts[0].decode(), parts[1].decode()
            length = 0
            while True:
                header = await asyncio.wait_for(reader.readline(), 5)
                if header in (b"\r\n", b"\n", b""):
                    break
                if header.lower().startswith(b"content-length:"):
                    length = min(int(header.split(b":", 1)[1]), MAX_BODY)
            body = b""
            if length:
                body = await asyncio.wait_for(reader.readexactly(length), 5)
            if method == "POST" and path == "/save":
                form = parse_form(body.decode("utf-8", "ignore"))
                ssid, password = form.get("ssid", "").strip(), form.get("password", "")
                problem = validate_credentials(ssid, password)
                code = form.get("code", "").strip()
                if not problem and code and not (len(code) == 6 and code.isdigit()):
                    problem = "El código de vinculación debe tener 6 dígitos."
                if problem:
                    self.last_error = problem
                    await self._respond(writer, self._page(), "400 Bad Request")
                elif not self._save(ssid, password):
                    self.last_error = "No se pudo guardar la configuración."
                    await self._respond(writer, self._page(), "500 Internal Server Error")
                else:
                    if self._on_form is not None:
                        try:
                            self._on_form(form)
                        except Exception:
                            pass
                    self.creds = {"ssid": ssid, "password": password}
                    self.last_error = None
                    self._fresh = True
                    self._saved = True
                    await self._respond(writer, "<meta charset=utf-8><body style='font-family:sans-serif'>"
                                                "<h3>Guardado. MITTEN se conecta a la red; "
                                                "si falla, vuelve a abrir esta página.</h3>")
            else:
                await self._respond(writer, self._page())
        except Exception:
            pass
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def _portal(self):
        self._set(PROVISIONING)
        self._saved = False
        self._networks = self._scan()    # bloquea ~2 s una sola vez, antes de abrir el AP
        ap = network.WLAN(network.AP_IF)
        ap.active(True)
        essid = AP_PREFIX + self._suffix()
        ap.config(essid=essid, password=self.ap_password,
                  authmode=network.AUTH_WPA2_PSK, max_clients=2)
        server = await asyncio.start_server(self._handle, "0.0.0.0", self.port)
        started = ticks_ms()
        try:
            while not self._saved and ticks_diff(ticks_ms(), started) < self.portal_timeout_ms:
                await _sleep_ms(200)
            if self._saved:
                await _sleep_ms(1500)    # deja que el navegador reciba la respuesta
        finally:
            server.close()
            await server.wait_closed()
            ap.active(False)
            if self.creds is None:
                network.WLAN(network.STA_IF).active(False)

    @staticmethod
    def _suffix():
        try:
            import machine
            return "".join("%02X" % b for b in machine.unique_id()[-2:])
        except ImportError:
            return "0000"
