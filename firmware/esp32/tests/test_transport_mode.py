import os
import sys
import types
import unittest

import main as firmware_main


class TransportModeTests(unittest.TestCase):
    def setUp(self):
        self.saved = {name: sys.modules.get(name) for name in ("hardware_config", "hardware")}
        self.old_mode = firmware_main.TRANSPORT_MODE
        self.old_run = firmware_main.asyncio.run
        self.calls = []
        calls = self.calls

        class Player:
            def deinitialize(self):
                calls.append("deinitialize")

        sys.modules["hardware_config"] = types.SimpleNamespace(BOARD={})
        sys.modules["hardware"] = types.SimpleNamespace(
            create_hardware=lambda board: (calls.append("hardware") or (None, None, Player())))
        self.old_dupterm = getattr(os, "dupterm", None)
        os.dupterm = lambda stream: calls.append(("dupterm", stream))

        def run(coroutine):
            calls.append("run")
            coroutine.close()

        firmware_main.asyncio.run = run

    def tearDown(self):
        firmware_main.TRANSPORT_MODE = self.old_mode
        firmware_main.asyncio.run = self.old_run
        for name, module in self.saved.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module
        if self.old_dupterm is None:
            del os.dupterm
        else:
            os.dupterm = self.old_dupterm

    def test_serial_mode_keeps_historic_startup_order(self):
        firmware_main.TRANSPORT_MODE = "serial"
        firmware_main.main()
        self.assertEqual(self.calls, ["hardware", ("dupterm", None), "run", "deinitialize"])

    def test_relay_mode_keeps_the_repl_attached(self):
        firmware_main.TRANSPORT_MODE = "relay"
        firmware_main.main()
        self.assertEqual(self.calls, ["hardware", "run", "deinitialize"])


if __name__ == "__main__":
    unittest.main()
