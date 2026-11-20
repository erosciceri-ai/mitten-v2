import asyncio
import json
import os
import tempfile
import threading
import unittest

import diag_wifi_audio as diag
from tests.test_relay_transport import FakeRelay
from tests.test_wifi_manager import NET


class Collector:
    def __init__(self):
        self.lines = []

    def __call__(self, text=""):
        self.lines.append(text)

    def text(self):
        return "\n".join(self.lines)


class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old = os.getcwd()
        os.chdir(self.tmp.name)
        self.out = Collector()
        self.report = diag.Report(self.out)

    def tearDown(self):
        os.chdir(self.old)
        self.tmp.cleanup()

    def test_report_counts_levels_and_formats_lines(self):
        self.report.ok("a")
        self.report.warn("b")
        self.report.fail("c")
        self.report.info("d")
        self.assertEqual(self.report.counts, {"OK": 1, "AVISO": 1, "FALLA": 1, "INFO": 1})
        self.assertEqual(self.out.lines, ["[OK] a", "[AVISO] b", "[FALLA] c", "[INFO] d"])

    def test_measure_import_distinguishes_loaded_modules(self):
        self.assertEqual(diag.measure_import("os"), (0, True))
        cost, loaded = diag.measure_import("colorsys")
        self.assertFalse(loaded)
        self.assertIsNone(cost)                       # CPython no tiene gc.mem_free

    def test_sd_benchmark_writes_verifies_and_cleans_up(self):
        root = os.path.join(self.tmp.name, "sd", "diag")
        os.makedirs(os.path.dirname(root))
        calls = []
        ok = diag.sd_benchmark(root, lambda writable: calls.append(writable) or True, lambda: False, self.report)
        self.assertTrue(ok)
        self.assertEqual(self.report.counts["FALLA"], 0)
        self.assertIn("Escritura: 96 KB", self.out.text())
        self.assertIn("Lectura: verificada con CRC", self.out.text())
        self.assertIn("AudioStore: 1 s de audio", self.out.text())
        self.assertFalse(os.path.exists(root))
        self.assertEqual(calls, [True, False])

    def test_sd_benchmark_reports_a_card_that_cannot_be_written(self):
        root = os.path.join(self.tmp.name, "diag")
        self.assertFalse(diag.sd_benchmark(root, lambda writable: False, lambda: False, self.report))
        self.assertEqual(self.report.counts["FALLA"], 1)

    def test_wifi_without_saved_credentials_warns_instead_of_failing(self):
        self.assertFalse(diag.section_wifi(self.report))
        self.assertEqual((self.report.counts["AVISO"], self.report.counts["FALLA"]), (1, 0))

    def test_wifi_connects_with_saved_credentials_and_never_prints_the_password(self):
        NET.instances.clear()
        NET.good = {"casa": "clave-secreta"}
        with open("wifi.json", "w") as handle:
            json.dump({"ssid": "casa", "password": "clave-secreta"}, handle)
        self.assertTrue(diag.section_wifi(self.report, timeout_ms=2000))
        self.assertIn("IP: 192.168.1.50", self.out.text())
        self.assertNotIn("clave-secreta", self.out.text())
        self.assertNotIn("casa", self.out.text())

    def test_wifi_failure_is_reported(self):
        NET.instances.clear()
        NET.good = {}
        with open("wifi.json", "w") as handle:
            json.dump({"ssid": "casa", "password": "x" * 8}, handle)
        self.assertFalse(diag.section_wifi(self.report, timeout_ms=300))
        self.assertEqual(self.report.counts["FALLA"], 1)

    def test_relay_probe_measures_two_handshakes_against_a_server(self):
        loop = asyncio.new_event_loop()
        started = threading.Event()
        holder = {}

        async def serve():
            async def script(relay):
                await asyncio.sleep(0.3)
            holder["done"] = asyncio.Event()
            holder["relay"] = FakeRelay(script)
            holder["url"] = await holder["relay"].start()
            started.set()
            await holder["done"].wait()
            await asyncio.sleep(0.4)               # deja terminar a los manejadores
            await holder["relay"].stop()

        thread = threading.Thread(target=lambda: loop.run_until_complete(serve()), daemon=True)
        thread.start()
        self.assertTrue(started.wait(5))
        try:
            self.assertTrue(diag.section_relay(self.report, url=holder["url"], ca_path="no-existe.der"))
        finally:
            loop.call_soon_threadsafe(holder["done"].set)
            thread.join(5)
            loop.close()
        self.assertEqual(self.report.counts["FALLA"], 0)
        self.assertEqual(self.out.text().count("handshake WebSocket en"), 2)

    def test_relay_probe_reports_an_unreachable_server_without_raising(self):
        self.assertFalse(diag.section_relay(self.report, url="ws://127.0.0.1:1/ws/device"))
        self.assertGreaterEqual(self.report.counts["FALLA"], 1)

    def test_relay_probe_warns_when_the_url_is_not_configured(self):
        self.assertFalse(diag.section_relay(self.report, url=""))
        self.assertEqual(self.report.counts["AVISO"], 1)

    def test_run_skips_relay_without_wifi_and_summarizes(self):
        report = diag.run(sections=("wifi", "relay"), out=self.out)
        self.assertEqual(report.counts["FALLA"], 0)
        self.assertIn("Se omite: no hay Wi-Fi.", self.out.text())
        self.assertIn("== Resumen ==", self.out.text())

    def test_run_survives_an_exception_inside_a_section(self):
        original = diag.section_system
        diag.section_system = lambda report: (_ for _ in ()).throw(RuntimeError("boom"))
        try:
            report = diag.run(sections=("system", "imports"), out=self.out)
        finally:
            diag.section_system = original
        self.assertEqual(report.counts["FALLA"], 1)
        self.assertIn("excepción RuntimeError: boom", self.out.text())

    def test_section_ap_security_warns_on_default_and_never_prints_secrets(self):
        self.assertFalse(diag.section_ap_security(self.report, board={}))
        self.assertEqual((self.report.counts["AVISO"], self.report.counts["FALLA"]), (1, 0))
        self.assertNotIn("mitten1234", self.out.text())

    def test_section_ap_security_accepts_custom_password_without_echoing_it(self):
        self.assertTrue(diag.section_ap_security(self.report, board={"ap_password": "mi-clave-unica-99"}))
        self.assertEqual((self.report.counts["OK"], self.report.counts["AVISO"], self.report.counts["FALLA"]), (1, 0, 0))
        self.assertNotIn("mi-clave-unica-99", self.out.text())

    def test_section_ap_security_fails_on_invalid_password_without_echoing_it(self):
        self.assertFalse(diag.section_ap_security(self.report, board={"ap_password": "short1"}))
        self.assertEqual(self.report.counts["FALLA"], 1)
        self.assertNotIn("short1", self.out.text())

    def test_run_security_section_uses_stubbed_board_without_raising(self):
        import sys
        import types
        saved = sys.modules.get("hardware_config")
        sys.modules["hardware_config"] = types.SimpleNamespace(BOARD={})
        try:
            report = diag.run(sections=("security",), out=self.out)
        finally:
            if saved is None:
                sys.modules.pop("hardware_config", None)
            else:
                sys.modules["hardware_config"] = saved
        self.assertEqual((report.counts["AVISO"], report.counts["FALLA"]), (1, 0))
        self.assertIn("== Seguridad AP ==", self.out.text())
        self.assertNotIn("mitten1234", self.out.text())


if __name__ == "__main__":
    unittest.main()
