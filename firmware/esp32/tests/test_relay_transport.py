import asyncio
import base64
import hashlib
import json
import os
import tempfile
import unittest

import relay_transport as rt

GUID = rt.GUID


def server_frame(opcode, payload=b"", fin=True):
    n = len(payload)
    head = bytes([(0x80 if fin else 0) | opcode])
    head += bytes([n]) if n < 126 else bytes([126]) + n.to_bytes(2, "big")
    return head + payload


def jload(path):
    with open(path) as handle:
        return json.load(handle)


class FakeRelay:
    """Servidor WebSocket mínimo (RFC 6455) para probar el cliente sin red real."""

    def __init__(self, script):
        self.script = script          # async def script(relay): maneja una conexión
        self.connections = 0
        self.received = []

    async def start(self):
        self.server = await asyncio.start_server(self._on, "127.0.0.1", 0)
        self.port = self.server.sockets[0].getsockname()[1]
        return "ws://127.0.0.1:%d/ws/device" % self.port

    async def stop(self):
        self.server.close()
        await self.server.wait_closed()

    async def _on(self, reader, writer):
        self.connections += 1
        self.reader, self.writer = reader, writer
        headers = {}
        await reader.readline()
        while True:
            line = await reader.readline()
            if line in (b"\r\n", b""):
                break
            key, _, value = line.decode().partition(":")
            headers[key.strip().lower()] = value.strip()
        accept = base64.b64encode(hashlib.sha1((headers["sec-websocket-key"]).encode() + GUID).digest())
        writer.write(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
                     b"Connection: Upgrade\r\nSec-WebSocket-Accept: " + accept + b"\r\n\r\n")
        await writer.drain()
        try:
            await self.script(self)
        except (asyncio.IncompleteReadError, ConnectionError):
            pass
        finally:
            writer.close()

    async def recv(self):
        """Lee una trama del cliente (debe venir enmascarada) y devuelve (opcode, payload)."""
        head = await self.reader.readexactly(2)
        assert head[1] & 0x80, "el cliente debe enmascarar"
        n = head[1] & 0x7F
        if n == 126:
            n = int.from_bytes(await self.reader.readexactly(2), "big")
        key = await self.reader.readexactly(4)
        data = bytes(b ^ key[i & 3] for i, b in enumerate(await self.reader.readexactly(n)))
        return head[0] & 0x0F, data

    async def recv_json(self):
        opcode, data = await self.recv()
        assert opcode == 1
        message = json.loads(data)
        self.received.append(message)
        return message

    async def send_text(self, text):
        self.writer.write(server_frame(1, text.encode()))
        await self.writer.drain()

    async def send_control(self, event, **extra):
        await self.send_text(json.dumps(dict(type="relay", event=event, **extra)))


async def until(predicate, timeout=5):
    for _ in range(int(timeout / 0.02)):
        if predicate():
            return
        await asyncio.sleep(0.02)
    raise AssertionError("timeout esperando condición")


class RelayTransportTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = os.getcwd()
        os.chdir(self.tmp.name)
        self.online = True
        self.tasks = []

    def tearDown(self):
        os.chdir(self.old)
        self.tmp.cleanup()

    async def asyncTearDown(self):
        for task in self.tasks:
            task.cancel()

    def store(self, data):
        with open("relay.json", "w") as handle:
            json.dump(data, handle)

    async def start(self, script, store=None):
        relay = FakeRelay(script)
        url = await relay.start()
        self.addAsyncCleanup(relay.stop)
        if store is not None:
            self.store(store)
        transport = rt.RelayTransport(lambda: self.online, url=url, backoff_s=(0.05,))
        self.tasks.append(asyncio.create_task(transport.run()))
        return relay, transport

    # ---- utilidades ---------------------------------------------------------
    def test_parse_url(self):
        self.assertEqual(rt.parse_url("wss://a.onrender.com/ws/device"), (True, "a.onrender.com", 443, "/ws/device"))
        self.assertEqual(rt.parse_url("ws://127.0.0.1:8080/x"), (False, "127.0.0.1", 8080, "/x"))
        with self.assertRaises(ValueError):
            rt.parse_url("http://x/y")

    async def test_frame_roundtrip_with_masking_and_extended_length(self):
        payload = b"x" * 300
        frame = rt.encode_frame(1, payload)
        self.assertEqual(frame[1] & 0x7F, 126)
        reader = asyncio.StreamReader()
        reader.feed_data(frame)
        fin, opcode, data = await rt.read_frame(reader)
        self.assertEqual((fin, opcode, data), (0x80, 1, payload))

    # ---- flujo de vinculación y datos --------------------------------------
    async def test_pairing_stores_token_and_relays_both_ways(self):
        async def script(relay):
            first = await relay.recv_json()
            self.assertEqual(first, {"type": "pair", "code": "123456"})
            await relay.send_control("paired", deviceToken="TOKEN-1")
            await relay.send_control("ready")
            await relay.send_text('{"v":1,"type":"request","id":"r1"}')
            op, data = await relay.recv()
            self.assertEqual((op, data), (1, b'{"ok":true}'))
            await asyncio.sleep(1)
        relay, transport = await self.start(script, {"pairCode": "123456"})
        await until(lambda: transport.state == rt.ONLINE)
        await until(lambda: transport._inbox)
        self.assertEqual(transport.read(), b'{"v":1,"type":"request","id":"r1"}\n')
        self.assertIsNone(transport.read())
        transport.write(b'{"ok":true}\n')
        await until(lambda: transport._store == {"deviceToken": "TOKEN-1"})
        self.assertEqual(jload("relay.json"), {"deviceToken": "TOKEN-1"})

    async def test_existing_token_authenticates_and_pings_are_answered(self):
        seen = {}
        async def script(relay):
            seen["first"] = await relay.recv_json()
            await relay.send_control("ready")
            relay.writer.write(server_frame(9, b"hola"))
            await relay.writer.drain()
            seen["pong"] = await relay.recv()
            await asyncio.sleep(1)
        relay, transport = await self.start(script, {"deviceToken": "T"})
        await until(lambda: "pong" in seen)
        self.assertEqual(seen["first"], {"type": "auth", "deviceToken": "T"})
        self.assertEqual(seen["pong"], (10, b"hola"))

    async def test_fragmented_message_is_reassembled(self):
        async def script(relay):
            await relay.recv_json()
            await relay.send_control("ready")
            relay.writer.write(server_frame(1, b'{"a":', fin=False) + server_frame(0, b'1}'))
            await relay.writer.drain()
            await asyncio.sleep(1)
        relay, transport = await self.start(script, {"deviceToken": "T"})
        await until(lambda: transport._inbox)
        self.assertEqual(transport.read(), b'{"a":1}\n')

    async def test_rejected_token_is_cleared_and_state_is_unpaired(self):
        async def script(relay):
            await relay.recv_json()
            await relay.send_control("error", code="UNAUTHORIZED")
            relay.writer.write(server_frame(8, (4003).to_bytes(2, "big") + b"unauthorized"))
            await relay.writer.drain()
        relay, transport = await self.start(script, {"deviceToken": "VIEJO"})
        await until(lambda: transport.state == rt.UNPAIRED)
        self.assertFalse(os.path.exists("relay.json"))
        self.assertIn("vincular", transport.last_error)

    async def test_bad_pair_code_is_discarded(self):
        async def script(relay):
            await relay.recv_json()
            relay.writer.write(server_frame(8, (4003).to_bytes(2, "big")))
            await relay.writer.drain()
        relay, transport = await self.start(script, {"pairCode": "000000"})
        await until(lambda: transport.state == rt.UNPAIRED)
        self.assertIn("inválido", transport.last_error)

    # ---- robustez -----------------------------------------------------------
    async def test_write_when_offline_never_raises_and_is_dropped(self):
        transport = rt.RelayTransport(lambda: False, url="ws://127.0.0.1:1/x")
        self.assertEqual(transport.write(b'{"x":1}\n'), 8)
        self.assertEqual(transport._outbox, [])

    async def test_no_connection_without_wifi_or_credentials(self):
        async def script(relay):
            await asyncio.sleep(1)
        self.online = False
        relay, transport = await self.start(script, {"deviceToken": "T"})
        await asyncio.sleep(0.3)
        self.assertEqual((relay.connections, transport.state), (0, rt.IDLE))
        self.online = True
        await until(lambda: relay.connections == 1)

    async def test_reconnects_after_the_server_drops_the_link(self):
        async def script(relay):
            await relay.recv_json()
            await relay.send_control("ready")
            await asyncio.sleep(0.1)       # y cierra
        relay, transport = await self.start(script, {"deviceToken": "T"})
        await until(lambda: relay.connections >= 2, 8)

    async def test_handle_form_replaces_token_with_new_code_and_reconnects(self):
        async def script(relay):
            first = await relay.recv_json()
            if first["type"] == "auth":
                await relay.send_control("ready")
            await asyncio.sleep(2)
        relay, transport = await self.start(script, {"deviceToken": "T"})
        await until(lambda: transport.state == rt.ONLINE)
        transport.handle_form({"code": "abc"})
        self.assertEqual(transport._store, {"deviceToken": "T"})       # inválido: se ignora
        transport.handle_form({"code": " 654321 "})
        self.assertEqual(jload("relay.json"), {"pairCode": "654321"})
        await until(lambda: any(m.get("code") == "654321" for m in relay.received))

    async def test_handshake_with_wrong_accept_is_refused(self):
        async def bad(reader, writer):
            while (await reader.readline()) not in (b"\r\n", b""):
                pass
            writer.write(b"HTTP/1.1 101 Switching Protocols\r\nSec-WebSocket-Accept: nope\r\n\r\n")
            await writer.drain()
            writer.close()
        server = await asyncio.start_server(bad, "127.0.0.1", 0)
        self.addAsyncCleanup(server.wait_closed)
        self.addCleanup(server.close)
        port = server.sockets[0].getsockname()[1]
        with self.assertRaises(OSError):
            await rt.ws_open("ws://127.0.0.1:%d/x" % port)


if __name__ == "__main__":
    unittest.main()
