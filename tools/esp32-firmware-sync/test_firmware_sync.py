#!/usr/bin/env python3
"""Unit tests for the MITTEN firmware sync tool.

They do not need hardware: they exercise the runtime file set computation
against the real repository and against a synthetic tree.

    python -B -m unittest discover -s tools/esp32-firmware-sync -v
"""
import os
import shutil
import tempfile
import unittest

from mitten_firmware_sync import FIRMWARE_DIR, runtime_manifest


class RepositoryManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = runtime_manifest()
        cls.names = set(cls.manifest)

    def test_entry_point_and_its_direct_dependencies_are_present(self):
        for relative in ("main.py", "hardware.py", "hardware_config.py",
                          "config.py", "sensors.py", "audio.py"):
            self.assertIn(relative, self.names)

    def test_transitive_dependencies_are_present(self):
        for relative in ("protocol/commands.py", "protocol/envelopes.py",
                          "protocol/framing.py", "error/handler.py",
                          "utils/time.py", "statemachine/machine.py",
                          "statemachine/states.py", "storage/atomic.py",
                          "storage/files.py", "staging/manager.py",
                          "staging/validator.py", "sync/transaction.py",
                          "profile/loader.py", "validation/gesture.py",
                          "capture.py", "recognition.py"):
            self.assertIn(relative, self.names)

    def test_packages_keep_their_init_markers(self):
        for relative in ("protocol/__init__.py", "error/__init__.py",
                          "statemachine/__init__.py", "storage/__init__.py",
                          "staging/__init__.py", "sync/__init__.py",
                          "profile/__init__.py", "validation/__init__.py"):
            self.assertIn(relative, self.names)

    def test_tests_tools_and_patches_are_not_pushed(self):
        for relative in self.manifest:
            self.assertFalse(relative.startswith("tests/"))
            self.assertFalse(relative.startswith("tools/"))
            self.assertFalse(relative.startswith("patches/"))
            self.assertNotIn("__pycache__", relative)

    def test_legacy_dfplayer_and_the_template_are_excluded(self):
        self.assertNotIn("dfplayer.py", self.names)
        self.assertNotIn("hardware_config.example.py", self.names)

    def test_manifest_is_sorted_and_has_no_duplicates(self):
        self.assertEqual(self.manifest, sorted(self.manifest))
        self.assertEqual(len(self.manifest), len(set(self.manifest)))

    def test_every_manifest_entry_exists_in_the_repository(self):
        for relative in self.manifest:
            source = os.path.join(FIRMWARE_DIR, relative.replace("/", os.sep))
            self.assertTrue(os.path.isfile(source), relative)


class SyntheticTreeTests(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root)
        self.write("main.py", "import pkg\nfrom pkg.deep import thing\nimport solo\n")
        self.write("solo.py", "x = 1\n")
        self.write("pkg/__init__.py", "")
        self.write("pkg/deep.py", "from . import sibling\nthing = 1\n")
        self.write("pkg/sibling.py", "y = 2\n")

    def write(self, relative, content):
        path = os.path.join(self.root, relative.replace("/", os.sep))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(content)

    def test_closure_follows_packages_and_relative_imports(self):
        manifest = runtime_manifest(self.root)
        self.assertEqual(
            manifest,
            [
                "main.py",
                "pkg/__init__.py",
                "pkg/deep.py",
                "pkg/sibling.py",
                "solo.py",
            ],
        )

    def test_missing_entry_point_is_reported(self):
        from mitten_firmware_sync import SyncError

        empty = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, empty)
        with self.assertRaises(SyncError):
            runtime_manifest(empty)


if __name__ == "__main__":
    unittest.main()
