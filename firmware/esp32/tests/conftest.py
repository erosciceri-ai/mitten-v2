"""Pytest configuration for firmware tests."""
import os
import sys

# Add the firmware/esp32 directory to the path so imports work
firmware_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if firmware_dir not in sys.path:
    sys.path.insert(0, firmware_dir)

import pytest

@pytest.fixture(autouse=True)
def isolated_device_files(tmp_path, monkeypatch):
    # Production profile/staging files must never be read or changed by tests.
    monkeypatch.chdir(tmp_path)
