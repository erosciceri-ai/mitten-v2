"""File I/O operations for MITTEN V2 firmware.

Compatible with MicroPython (LittleFS) and CPython.
"""

try:
    import ujson as json
except ImportError:
    import json

import os


def read_json_file(path):
    """Read and parse a JSON file. Returns None if file doesn't exist or is invalid."""
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_json_file(path, data):
    """Write data as compact JSON to a file."""
    try:
        with open(path, "w") as f:
            json.dump(data, f)
            f.flush()
            if hasattr(os, "fsync") and hasattr(f, "fileno"):
                os.fsync(f.fileno())
        sync_filesystem()
        return True
    except OSError:
        return False


def safe_remove(path):
    """Remove a file if it exists. No error if file doesn't exist."""
    try:
        os.remove(path)
    except OSError:
        pass


def file_exists(path):
    """Check if a file exists."""
    try:
        return (os.stat(path)[0] & 0xF000) == 0x8000
    except OSError:
        return False


def list_files(pattern):
    """List files matching a pattern (simple glob)."""
    try:
        import glob
        return glob.glob(pattern)
    except ImportError:
        # MicroPython fallback - list all and filter
        try:
            all_files = os.listdir(".")
            if pattern == "*.json":
                return [f for f in all_files if f.endswith(".json")]
            return [f for f in all_files if pattern.replace("*", "") in f]
        except OSError:
            return []

def sync_filesystem():
    if hasattr(os, "sync"):
        os.sync()


def compact_dumps(value):
    try:
        return json.dumps(value, separators=(",", ":"))
    except TypeError:
        return json.dumps(value)
