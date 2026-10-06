"""Pytest configuration for firmware tests."""
import os
import sys

# Add the firmware/esp32 directory to the path so imports work
firmware_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if firmware_dir not in sys.path:
    sys.path.insert(0, firmware_dir)
