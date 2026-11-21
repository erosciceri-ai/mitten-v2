"""Transporte NDJSON por WebSocket hacia el relay del backend (Render).

Cumple el mismo contrato que UartStreamTransport (read/write no bloqueantes), así que
main_loop y el dispatcher no cambian. Cada mensaje de texto WebSocket es una línea NDJSON.
El ESP32 siempre abre la conexión (saliente); el backend la empareja con la sesión web.
"""

try:
    import uasyncio as asyncio
except ImportError:
    import asyncio

import binascii
import gc
import hashlib
import json
import os

from storage.files import file_exists, read_json_file, write_json_file, safe_remove

RELAY_URL = "wss://mitten-api-staging.onrender.com/ws/device"
STORE_PATH = "relay.json"           # {"deviceToken": ..., "pairCode": ...}
CA_PATH = "relay_ca.der"            # CA raíz en DER; si falta, el TLS NO verifica el servidor
GUID = b"258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_MESSAGE = 16384
INBOX_MAX = 32
OUTBOX_MAX = 64
CONNECT_TIMEOUT_S = 15
READ_TIMEOUT_S = 60                 # el servidor envía ping cada 25 s
BACKOFF_S = (2, 5, 10, 30, 60)

IDLE = "IDLE"                       # sin Wi-Fi o esperando reintento
UNPAIRED = "UNPAIRED"               # falta el código de vinculación
CONNECTING = "CONNECTING"
ONLINE = "ONLINE"


class RelayClosed(Exception):
    def __init__(self, code):
        Exception.__init__(self, "relay cerrado (%s)" % code)
        self.code = code


async def _sleep(seconds):
    await asyncio.sleep(seconds)


def parse_url(url):
    if url.startswith("wss://"):
        secure, rest, port = True, url[6:], 443
    elif url.startswith("ws://"):
        secure, rest, port = False, url[5:], 80
    else:
        raise ValueError("la URL debe empezar con ws:// o wss://")
    hostport, _, path = rest.partition("/")
    host = hostport
    if ":" in hostport:
        host, text = hostport.rsplit(":", 1)
        port = int(text)
    if not host:
        raise ValueError("URL sin host")
    return secure, host, port, "/" + path


def _mask(data, key):
    return bytes(b ^ key[i & 3] for i, b in enumerate(data))


def encode_frame(opcode, payload):
    """Trama cliente->servidor (siempre enmascarada, RFC 6455)."""
    n = len(payload)
    head = bytearray([0x80 | opcode])
    if n < 126:
        head.append(0x80 | n)
    elif n < 65536:
        head.append(0x80 | 126)
        head.extend(n.to_bytes(2, "big"))
    else:
        raise ValueError("payload demasiado grande")
    key = os.urandom(4)
    return bytes(head) + key + _mask(payload, key)


async def read_frame(reader):
    head = await reader.readexactly(2)
    fin, opcode, masked, n = head[0] & 0x80, head[0] & 0x0F, head[1] & 0x80, head[1] & 0x7F
    if n == 126:
        n = int.from_bytes(await reader.readexactly(2), "big")
    elif n == 127:
        n = int.from_bytes(await reader.readexactly(8), "big")
    if n > MAX_MESSAGE:
        raise OSError("trama demasiado grande")
    key = await reader.readexactly(4) if masked else None
    data = await reader.readexactly(n) if n else b""
    if key:
        data = _mask(data, key)
    return fin, opcode, data


async def read_message(reader, writer):
    """Devuelve (opcode, bytes) de un mensaje completo; atiende ping y close."""
    parts, opcode, size = [], None, 0
    while True:
        fin, op, data = await read_frame(reader)
        if op == 9:
            writer.write(encode_frame(10, data))
            await writer.drain()
            continue
        if op == 10:
            continue
        if op == 8:
            raise RelayClosed(int.from_bytes(data[:2], "big") if len(data) >= 2 else None)
        if op in (1, 2):
            opcode, parts, size = op, [data], len(data)
        elif op == 0 and opcode is not None:
            parts.append(data)
            size += len(data)
        else:
            continue
        if size > MAX_MESSAGE:
            raise OSError("mensaje demasiado grande")
        if fin:
            return opcode, b"".join(parts)


def _tls_context(ca_path):
    import ssl
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    if file_exists(ca_path):
        with open(ca_path, "rb") as handle:
            cadata = handle.read()
        context.verify_mode = ssl.CERT_REQUIRED
        context.load_verify_locations(cadata=cadata)
    else:
        context.verify_mode = ssl.CERT_NONE
    return context


async def _open(host, port, context):
    if context is None:
        return await asyncio.open_connection(host, port)
    try:
        return await asyncio.open_connection(host, port, ssl=context, server_hostname=host)
    except TypeError:
        return await asyncio.open_connection(host, port, ssl=context)


async def ws_open(url, ca_path=CA_PATH):
    secure, host, port, path = parse_url(url)
    context = _tls_context(ca_path) if secure else None
    gc.collect()
    reader, writer = await asyncio.wait_for(_open(host, port, context), CONNECT_TIMEOUT_S)
    try:
        key = binascii.b2a_base64(os.urandom(16)).strip().decode()
        default = 443 if secure else 80
        hostname = host if port == default else "%s:%d" % (host, port)
        writer.write(("GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\n"
                      "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
                      "Sec-WebSocket-Version: 13\r\n\r\n" % (path, hostname, key)).encode())
        await writer.drain()
        status = await asyncio.wait_for(reader.readline(), CONNECT_TIMEOUT_S)
        if b" 101 " not in status:
            raise OSError("handshake rechazado: " + status.decode("utf-8", "ignore").strip())
        accept = None
        while True:
            line = await asyncio.wait_for(reader.readline(), CONNECT_TIMEOUT_S)
            if line in (b"\r\n", b"\n", b""):
                break
            if line.lower().startswith(b"sec-websocket-accept:"):
                accept = line.split(b":", 1)[1].strip()
        expected = binascii.b2a_base64(hashlib.sha1(key.encode() + GUID).digest()).strip()
        if accept != expected:
            raise OSError("Sec-WebSocket-Accept inválido")
    except BaseException:
        try:
            writer.close()
        except Exception:
            pass
        raise
    return reader, writer


class RelayTransport:
    """read()/write() sin bloqueo para main_loop; run() mantiene la conexión."""

    def __init__(self, is_online, url=RELAY_URL, store_path=STORE_PATH, ca_path=CA_PATH,
                 backoff_s=BACKOFF_S):
        self.is_online = is_online
        self.url = url
        self.store_path = store_path
        self.ca_path = ca_path
        self.backoff_s = backoff_s
        self.state = IDLE
        self.last_error = None
        self._inbox = []
        self._outbox = []
        self._writer = None
        self._was_online = False
        self._store = self._load()

    # ---- contrato de transporte --------------------------------------------
    def read(self):
        if not self._inbox:
            return None
        data = b"".join(self._inbox)
        self._inbox = []
        return data

    def write(self, data):
        # Nunca lanza: sin conexión el mensaje se descarta y el guante sigue funcionando.
        if self.state == ONLINE:
            for line in bytes(data).split(b"\n"):
                if line:
                    if len(self._outbox) >= OUTBOX_MAX:
                        self._outbox.pop(0)
                    self._outbox.append(line)
        return len(data)

    # ---- vinculación --------------------------------------------------------
    def _load(self):
        data = read_json_file(self.store_path)
        return data if isinstance(data, dict) else {}

    def _persist(self):
        if self._store:
            write_json_file(self.store_path, self._store)
        else:
            safe_remove(self.store_path)

    def handle_form(self, form):
        """Recibe el código de vinculación desde el portal Wi-Fi."""
        code = str(form.get("code", "")).strip()
        if len(code) != 6 or not code.isdigit():
            return
        self._store = {"pairCode": code}     # un código nuevo reemplaza el token anterior
        self._persist()
        self.last_error = None
        self._kick()

    def _kick(self):
        writer = self._writer
        if writer is not None:
            try:
                writer.close()
            except Exception:
                pass

    # ---- bucle de conexión --------------------------------------------------
    async def run(self):
        attempt = 0
        while True:
            try:
                if not self.url:
                    self.last_error = "RELAY_URL sin configurar"
                    self.state = IDLE
                    await _sleep(5)
                    continue
                if not self.is_online():
                    self.state = IDLE
                    await _sleep(1)
                    continue
                if not (self._store.get("pairCode") or self._store.get("deviceToken")):
                    self.state = UNPAIRED
                    await _sleep(1)
                    continue
                self.state = CONNECTING
                await self._session()
            except asyncio.CancelledError:
                raise
            except RelayClosed as closed:
                self._on_closed(closed.code)
            except Exception as error:
                self.last_error = "relay: " + repr(error)
            if self._was_online:
                self._was_online = False
                attempt = 0
            self.state = IDLE
            await _sleep(self.backoff_s[min(attempt, len(self.backoff_s) - 1)])
            attempt += 1

    def _on_closed(self, code):
        if code == 4003:
            if self._store.get("pairCode"):
                self.last_error = "Código de vinculación inválido o vencido."
            else:
                self.last_error = "El servidor rechazó el token del guante; hay que vincular de nuevo."
            self._store = {}
            self._persist()
        elif code == 4029:
            self.last_error = "Demasiados intentos de vinculación."

    async def _session(self):
        """Una conexión completa; termina siempre por excepción (cierre, error o timeout)."""
        reader, writer = await ws_open(self.url, self.ca_path)
        self._writer = writer
        sender = None
        online = False
        try:
            pairing = bool(self._store.get("pairCode"))
            first = {"type": "pair", "code": self._store["pairCode"]} if pairing else \
                    {"type": "auth", "deviceToken": self._store["deviceToken"]}
            writer.write(encode_frame(1, json.dumps(first).encode()))
            await writer.drain()
            while True:
                opcode, data = await asyncio.wait_for(read_message(reader, writer), READ_TIMEOUT_S)
                if opcode != 1:
                    continue
                message = self._control(data)
                if message:
                    event = message.get("event")
                    if event == "error":
                        code = message.get("code")
                        if code in ("UNAUTHORIZED", "REVOKED"):
                            raise RelayClosed(4003)
                        if code == "RATE_LIMITED":
                            raise RelayClosed(4029)
                    elif not online:
                        if event == "paired" and isinstance(message.get("deviceToken"), str):
                            self._store = {"deviceToken": message["deviceToken"]}
                            self._persist()
                        elif event == "ready":
                            online = True
                            self._was_online = True
                            self.last_error = None
                            self.state = ONLINE
                            sender = asyncio.create_task(self._sender(writer))
                    continue
                if not online:
                    continue
                if len(self._inbox) < INBOX_MAX:
                    self._inbox.append(data + b"\n")
        finally:
            self._writer = None
            if sender is not None:
                sender.cancel()
            self._outbox = []
            try:
                writer.close()
            except Exception:
                pass

    @staticmethod
    def _control(data):
        if not data.startswith(b"{") or b'"relay"' not in data:
            return {}
        try:
            message = json.loads(data.decode())
        except Exception:
            return {}
        return message if isinstance(message, dict) and message.get("type") == "relay" else {}

    async def _sender(self, writer):
        while True:
            if self._outbox:
                line = self._outbox.pop(0)
                writer.write(encode_frame(1, line))
                await writer.drain()
            else:
                await asyncio.sleep(0.005)
