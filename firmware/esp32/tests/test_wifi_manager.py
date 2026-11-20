import asyncio
import json
import os
import socket
import sys
import tempfile
import types
import unittest


def _install_fake_network():
    net = types.ModuleType("network")
    net.STA_IF, net.AP_IF, net.AUTH_WPA2_PSK, net.STAT_WRONG_PASSWORD = 0, 1, 3, 202
    net.good = {"casa": "clave1234"}
    net.visible = [(b"casa", b"", 1, -40, 3, 0), (b"vecino", b"", 6, -80, 3, 0), (b"casa", b"", 1, -60, 3, 0)]
    net.instances = {}

    class WLAN:
        def __new__(cls, iface):
            if iface not in net.instances:
                obj = super().__new__(cls)
                obj.iface, obj._active, obj._conn, obj._wrong, obj.cfg, obj._target = iface, False, False, False, {}, None
                net.instances[iface] = obj
            return net.instances[iface]

        def active(self, value=None):
            if value is None:
                return self._active
            self._active = value
            if not value:
                self._conn = False

        def scan(self):
            return net.visible

        def connect(self, ssid, password):
            self._target = (ssid, password)
            ok = net.good.get(ssid) == password
            self._conn, self._wrong = ok, (ssid in net.good and not ok)

        def isconnected(self):
            return self._conn

        def status(self):
            return net.STAT_WRONG_PASSWORD if self._wrong else 0

        def disconnect(self):
            self._conn = False

        def ifconfig(self):
            return ("192.168.1.50", "255.255.255.0", "192.168.1.1", "8.8.8.8")

        def config(self, **kw):
            self.cfg.update(kw)

    net.WLAN = WLAN
    sys.modules["network"] = net
    return net


NET = _install_fake_network()
import wifi_manager as wm  # noqa: E402


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


async def http(port, method, path, body=b""):
    reader, writer = await asyncio.open_connection("127.0.0.1", port)
    head = "%s %s HTTP/1.1\r\nHost: x\r\nContent-Length: %d\r\n\r\n" % (method, path, len(body))
    writer.write(head.encode() + body)
    await writer.drain()
    data = await reader.read(-1)
    writer.close()
    status = int(data.split(b" ", 2)[1])
    return status, data.partition(b"\r\n\r\n")[2].decode()


async def until(predicate, timeout=5):
    for _ in range(int(timeout / 0.05)):
        if predicate():
            return
        await asyncio.sleep(0.05)
    raise AssertionError("timeout esperando condición")


def jload(path):
    with open(path) as handle:
        return json.load(handle)


class WifiManagerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = os.getcwd()
        os.chdir(self.tmp.name)
        NET.instances.clear()
        NET.good = {"casa": "clave1234"}
        self.pressed = False
        self.port = free_port()

    def tearDown(self):
        os.chdir(self.old)
        self.tmp.cleanup()

    def make(self, **kw):
        defaults = dict(port=self.port, button=lambda: self.pressed, hold_ms=300,
                        portal_timeout_ms=3000, connect_timeout_ms=1000, retry_delays_ms=(200,))
        defaults.update(kw)
        return wm.WifiManager(**defaults)

    def test_form_parsing(self):
        form = wm.parse_form("ssid=Mi+Red%C3%B1&password=a%26b%3D%25")
        self.assertEqual(form, {"ssid": "Mi Redñ", "password": "a&b=%"})
        self.assertEqual(wm.parse_form("a=%4"), {"a": "%4"})

    def test_validation(self):
        self.assertIsNone(wm.validate_credentials("casa", "clave1234"))
        self.assertIsNone(wm.validate_credentials("abierta", ""))
        self.assertIsNotNone(wm.validate_credentials("", "x"))
        self.assertIsNotNone(wm.validate_credentials("casa", "corta"))
        self.assertIsNotNone(wm.validate_credentials("a" * 33, ""))

    async def test_first_boot_portal_save_and_connect(self):
        mgr = self.make()
        task = asyncio.create_task(mgr.run())
        await until(lambda: mgr.state == wm.PROVISIONING and 1 in NET.instances and NET.instances[1].active())
        ap = NET.instances[1]
        self.assertTrue(ap.cfg["essid"].startswith("MITTEN-"))
        self.assertEqual(ap.cfg["authmode"], 3)
        await asyncio.sleep(0.2)
        status, page = await http(self.port, "GET", "/")
        self.assertEqual(status, 200)
        self.assertEqual(page.count('<option value="casa">'), 1)   # sin duplicados
        self.assertLess(page.index("casa"), page.index("vecino"))  # ordenadas por señal
        status, _ = await http(self.port, "POST", "/save", b"ssid=casa&password=clave1234")
        self.assertEqual(status, 200)
        await until(lambda: mgr.state == wm.CONNECTED)
        self.assertEqual(jload("wifi.json"), {"ssid": "casa", "password": "clave1234"})
        self.assertFalse(NET.instances[1].active())               # el AP se apagó
        self.assertEqual(mgr.ip(), "192.168.1.50")
        task.cancel()

    async def test_saved_credentials_connect_without_portal(self):
        json.dump({"ssid": "casa", "password": "clave1234"}, open("wifi.json", "w"))
        mgr = self.make()
        task = asyncio.create_task(mgr.run())
        await until(lambda: mgr.state == wm.CONNECTED)
        self.assertNotIn(1, NET.instances)                         # nunca se creó el AP
        task.cancel()

    async def test_router_down_retries_without_ap(self):
        json.dump({"ssid": "casa", "password": "clave1234"}, open("wifi.json", "w"))
        NET.good = {}
        mgr = self.make()
        task = asyncio.create_task(mgr.run())
        await until(lambda: mgr.last_error is not None, 4)
        await until(lambda: mgr.state == wm.OFFLINE)
        NET.good = {"casa": "clave1234"}                           # vuelve el router
        await until(lambda: mgr.state == wm.CONNECTED, 6)
        self.assertNotIn(1, NET.instances)
        task.cancel()

    async def test_wrong_password_reopens_portal_with_error(self):
        mgr = self.make()
        task = asyncio.create_task(mgr.run())
        await until(lambda: mgr.state == wm.PROVISIONING)
        await asyncio.sleep(0.2)
        await http(self.port, "POST", "/save", b"ssid=casa&password=equivocada")
        await asyncio.sleep(2.2)                                   # cierre del portal + intento fallido
        await until(lambda: mgr.state == wm.PROVISIONING)
        await asyncio.sleep(0.3)
        _, page = await http(self.port, "GET", "/")
        self.assertIn("Contraseña incorrecta", page)
        task.cancel()

    async def test_invalid_input_rejected_and_not_saved(self):
        mgr = self.make()
        task = asyncio.create_task(mgr.run())
        await until(lambda: mgr.state == wm.PROVISIONING)
        await asyncio.sleep(0.2)
        status, page = await http(self.port, "POST", "/save", b"ssid=casa&password=corta")
        self.assertEqual(status, 400)
        self.assertIn("8 y 63", page)
        self.assertFalse(os.path.exists("wifi.json"))
        task.cancel()

    async def test_long_press_opens_portal_when_connected(self):
        json.dump({"ssid": "casa", "password": "clave1234"}, open("wifi.json", "w"))
        mgr = self.make()
        task = asyncio.create_task(mgr.run())
        await until(lambda: mgr.state == wm.CONNECTED)
        self.pressed = True
        await until(lambda: mgr.state == wm.PROVISIONING, 3)
        self.pressed = False
        task.cancel()

    async def test_portal_timeout_goes_offline_and_button_reopens(self):
        mgr = self.make(portal_timeout_ms=600)
        task = asyncio.create_task(mgr.run())
        await until(lambda: mgr.state == wm.PROVISIONING)
        await until(lambda: mgr.state == wm.OFFLINE, 3)
        self.assertFalse(NET.instances[1].active())
        self.pressed = True
        await until(lambda: mgr.state == wm.PROVISIONING, 3)
        self.pressed = False
        task.cancel()

    async def test_recovers_credentials_from_tmp(self):
        json.dump({"ssid": "casa", "password": "clave1234"}, open("wifi.json.tmp", "w"))
        mgr = self.make()
        task = asyncio.create_task(mgr.run())
        await until(lambda: mgr.state == wm.CONNECTED)
        task.cancel()



class WifiPairingFieldTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = os.getcwd()
        os.chdir(self.tmp.name)
        NET.instances.clear()
        NET.good = {"casa": "clave1234"}
        self.port = free_port()

    def tearDown(self):
        os.chdir(self.old)
        self.tmp.cleanup()

    async def test_code_field_only_with_callback_and_forwarded_on_save(self):
        received = []
        mgr = wm.WifiManager(port=self.port, button=lambda: False, portal_timeout_ms=3000,
                             connect_timeout_ms=1000, on_form=received.append)
        task = asyncio.create_task(mgr.run())
        await until(lambda: mgr.state == wm.PROVISIONING)
        await asyncio.sleep(0.2)
        _, page = await http(self.port, "GET", "/")
        self.assertIn("name=code", page)
        status, body = await http(self.port, "POST", "/save", b"ssid=casa&password=clave1234&code=12ab56")
        self.assertEqual(status, 400)
        self.assertIn("6 dígitos", body)
        self.assertEqual(received, [])
        status, _ = await http(self.port, "POST", "/save", b"ssid=casa&password=clave1234&code=123456")
        self.assertEqual(status, 200)
        self.assertEqual(received[0]["code"], "123456")
        task.cancel()

    async def test_no_code_field_without_callback(self):
        mgr = wm.WifiManager(port=self.port, button=lambda: False, portal_timeout_ms=3000)
        task = asyncio.create_task(mgr.run())
        await until(lambda: mgr.state == wm.PROVISIONING)
        await asyncio.sleep(0.2)
        _, page = await http(self.port, "GET", "/")
        self.assertNotIn("name=code", page)
        task.cancel()


if __name__ == "__main__":
    unittest.main()
