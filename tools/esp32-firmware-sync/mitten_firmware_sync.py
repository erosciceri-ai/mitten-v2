#!/usr/bin/env python3
"""Inspect and update the MITTEN V2 firmware files stored on the ESP32.

The board keeps the runtime firmware in its own filesystem. When the firmware
fails to start there is no symptom beyond silence, so the exact contents of
that filesystem are the first thing to check: a module that was never
transferred makes ``main.py`` raise at import time, before the protocol loop
exists.

This tool computes the runtime file set from the repository (the transitive
import closure of ``main.py``), compares it with what the board actually
holds, and can push the missing or outdated files.

It uses ``mpremote`` for the transfer, so the board must be running an image
with a REPL (the MITTEN image disables it; see
``firmware/esp32/MICROPYTHON_BUILD.md`` for the safe cycle between the two).

Usage::

    python mitten_firmware_sync.py --port COM5 --list
    python mitten_firmware_sync.py --port COM5 --check
    python mitten_firmware_sync.py --port COM5 --push
    python mitten_firmware_sync.py --port COM5 --push --verify

This is a deployment/verification helper, not part of the runtime path.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import os
import sys
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
FIRMWARE_DIR = os.path.join(REPO_ROOT, "firmware", "esp32")
ENTRY_POINT = "main.py"

# Files that exist in the repository but must never be pushed to the board.
EXCLUDED_NAMES = {
    "hardware_config.example.py",  # template, the real one is board specific
    "dfplayer.py",  # legacy DFPlayer driver, not imported by the runtime
}
EXCLUDED_DIRS = {"tests", "tools", "patches", "__pycache__", "MICROPYTHON_BUILD.md"}

# The board configuration holds measured values; it is never overwritten
# unless the caller explicitly asks for it.
LOCAL_CONFIG = "hardware_config.py"


class SyncError(Exception):
    """The board could not be inspected or updated."""


# ---------------------------------------------------------------------------
# Runtime file set
# ---------------------------------------------------------------------------


def _local_module_paths(root: str) -> Dict[str, str]:
    """Map top-level module names to their file (module or package)."""
    modules: Dict[str, str] = {}
    for entry in sorted(os.listdir(root)):
        if entry.endswith(".py") and entry not in EXCLUDED_NAMES:
            modules[entry[:-3]] = os.path.join(root, entry)
        elif os.path.isdir(os.path.join(root, entry)) and entry not in EXCLUDED_DIRS:
            if os.path.isfile(os.path.join(root, entry, "__init__.py")):
                modules[entry] = os.path.join(root, entry)
    return modules


def _as_module_file(path: str) -> str:
    """A package resolves to its __init__.py, a module to itself."""
    if os.path.isdir(path):
        return os.path.join(path, "__init__.py")
    return path


def _resolve(base_dir: str, package: Optional[str], module: str,
             modules: Dict[str, str]) -> Optional[str]:
    """Resolve an import to a local file, following MicroPython's rules."""
    if package is not None:
        candidate = os.path.join(package, module + ".py")
        if os.path.isfile(candidate):
            return candidate
        candidate = os.path.join(package, module, "__init__.py")
        if os.path.isfile(candidate):
            return candidate
        return None
    resolved = modules.get(module)
    if resolved is None:
        return None
    return _as_module_file(resolved)


def _imports_of(path: str) -> List[Tuple[bool, str]]:
    """Return the (is_relative, dotted_name) pairs imported by a file.

    ``from a.b import c`` imports the module ``a.b``; ``import a.b`` also
    loads ``a.b``. Relative imports stay inside the current package.
    """
    with open(path, "r", encoding="utf-8") as handle:
        tree = ast.parse(handle.read(), path)
    found: List[Tuple[bool, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                found.append((False, alias.name))
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                if node.module:
                    found.append((True, node.module))
                else:
                    # "from . import sibling" imports the submodule itself.
                    for alias in node.names:
                        found.append((True, alias.name))
            elif node.module:
                found.append((False, node.module))
    return found


def _resolve_dotted(base: str, dotted: str) -> Optional[str]:
    """Resolve a dotted module name to a file inside ``base``."""
    parts = [part for part in dotted.split(".") if part]
    if not parts:
        return None
    current = base
    for index, part in enumerate(parts):
        last = index == len(parts) - 1
        if last:
            candidate = os.path.join(current, part + ".py")
            if os.path.isfile(candidate):
                return candidate
            candidate = os.path.join(current, part, "__init__.py")
            if os.path.isfile(candidate):
                return candidate
            return None
        package = os.path.join(current, part)
        if not os.path.isdir(package):
            return None
        current = package
    return None


def runtime_manifest(root: str = FIRMWARE_DIR) -> List[str]:
    """Return the device-relative paths of every file the firmware needs.

    The set is the transitive import closure of the entry point plus the
    ``__init__.py`` of every package involved and the board configuration.
    """
    entry = os.path.join(root, ENTRY_POINT)
    if not os.path.isfile(entry):
        raise SyncError(f"entry point not found: {entry}")

    closure: Set[str] = set()
    visited: Set[str] = set()
    stack: List[str] = [entry]

    while stack:
        path = stack.pop()
        if path in visited:
            continue
        visited.add(path)
        closure.add(path)
        # The package a file belongs to, for relative imports.
        package_dir = os.path.dirname(path)
        for is_relative, dotted in _imports_of(path):
            if not dotted:
                continue
            if is_relative:
                resolved = _resolve_dotted(package_dir, dotted)
            else:
                resolved = _resolve_dotted(root, dotted)
            if resolved is None:
                continue
            stack.append(resolved)

    # Package markers: a package directory needs its __init__.py to exist in
    # the repository, and it must exist on the board as well.
    for path in list(closure):
        directory = os.path.dirname(path)
        while directory.startswith(root) and directory != root:
            marker = os.path.join(directory, "__init__.py")
            if os.path.isfile(marker):
                closure.add(marker)
            directory = os.path.dirname(directory)

    local_config = os.path.join(root, LOCAL_CONFIG)
    if os.path.isfile(local_config):
        closure.add(local_config)

    relative = []
    for path in closure:
        rel = os.path.relpath(path, root).replace(os.sep, "/")
        if rel in EXCLUDED_NAMES:
            continue
        relative.append(rel)
    return sorted(relative)


# ---------------------------------------------------------------------------
# Board inspection
# ---------------------------------------------------------------------------


class Board:
    """Thin wrapper over the mpremote transport."""

    def __init__(self, port: str):
        try:
            from mpremote.transport_serial import SerialTransport
        except ImportError as error:  # pragma: no cover - environment dependent
            raise SyncError("mpremote is required: pip install mpremote") from error
        self._transport = SerialTransport(port)

    def close(self) -> None:
        try:
            self._transport.close()
        except Exception:
            pass

    def listdir(self, path: str = "/") -> List[str]:
        entries = self._transport.fs_listdir(path)
        names = []
        for entry in entries:
            name = entry[0]
            names.append(name)
        return names

    def exists(self, path: str) -> bool:
        return self._transport.fs_exists(path)

    def isdir(self, path: str) -> bool:
        return self._transport.fs_isdir(path)

    def sha256(self, path: str) -> str:
        digest = self._transport.fs_hashfile(path, "sha256")
        return digest.hex() if isinstance(digest, bytes) else str(digest)

    def write(self, path: str, data: bytes) -> None:
        directory = os.path.dirname(path)
        if directory and not self.exists(directory):
            self._transport.fs_mkdir(directory)
        self._transport.fs_writefile(path, data)

    def remove(self, path: str) -> None:
        if self.isdir(path):
            for name in self.listdir(path):
                self.remove(os.path.join(path, name))
            self._transport.fs_rmdir(path)
        else:
            self._transport.fs_rmfile(path)


def local_sha256(path: str) -> str:
    with open(path, "rb") as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def device_path(relative: str) -> str:
    return "/" + relative.lstrip("/")


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------


class Report:
    def __init__(self) -> None:
        self.missing: List[str] = []
        self.different: List[str] = []
        self.identical: List[str] = []
        self.extra: List[str] = []
        self.unreadable: List[str] = []

    @property
    def ok(self) -> bool:
        return not self.missing and not self.different


def compare(board: Board, manifest: Sequence[str], root: str = FIRMWARE_DIR) -> Report:
    """Compare the board filesystem with the expected runtime file set."""
    report = Report()
    for relative in manifest:
        target = device_path(relative)
        source = os.path.join(root, relative.replace("/", os.sep))
        if not board.exists(target):
            report.missing.append(relative)
            continue
        try:
            remote = board.sha256(target)
        except Exception:
            report.unreadable.append(relative)
            continue
        if remote == local_sha256(source):
            report.identical.append(relative)
        else:
            report.different.append(relative)

    expected = set(manifest)
    for name in board.listdir("/"):
        if name.startswith(".") or name in ("boot.py",):
            continue
        if name in expected:
            continue
        if os.path.isdir(os.path.join(root, name)):
            continue
        if name.endswith(".py") and not board.isdir("/" + name):
            report.extra.append(name)
    return report


def print_report(report: Report, root: str = FIRMWARE_DIR) -> None:
    for relative in report.missing:
        print(f"  FALTA    {relative}")
    for relative in report.different:
        print(f"  DISTINTO {relative}")
    for relative in report.unreadable:
        print(f"  ILEGIBLE {relative}")
    for relative in report.identical:
        print(f"  OK       {relative}")
    for name in report.extra:
        print(f"  EXTRA    {name}  (no forma parte del firmware vigente)")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Inspect or update the MITTEN firmware files on the ESP32."
    )
    parser.add_argument("--port", help="serial port (COM5 on Windows)")
    parser.add_argument("--list", action="store_true",
                        help="show the runtime file set computed from the repository")
    parser.add_argument("--check", action="store_true",
                        help="compare the board against the expected file set")
    parser.add_argument("--push", action="store_true",
                        help="copy the missing or outdated files to the board")
    parser.add_argument("--verify", action="store_true",
                        help="re-check the board after pushing")
    parser.add_argument("--force", action="store_true",
                        help="also overwrite hardware_config.py (board measured values)")
    parser.add_argument("--remove-extra", action="store_true",
                        help="also delete the extra legacy files reported by --check")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    manifest = runtime_manifest()

    if args.list or not (args.check or args.push or args.verify):
        print(f"Conjunto de runtime del firmware ({len(manifest)} archivos):")
        for relative in manifest:
            print(f"  {relative}")
        if not (args.check or args.push or args.verify):
            return 0

    if not args.port:
        print("error: --port is required", file=sys.stderr)
        return 2

    board = Board(args.port)
    try:
        if args.check or args.push:
            report = compare(board, manifest)
            print_report(report)
            if not args.push:
                print()
                print("faltantes: %d | distintos: %d | identicos: %d | extra: %d"
                      % (len(report.missing), len(report.different),
                         len(report.identical), len(report.extra)))
                return 0 if report.ok else 1

        if args.push:
            to_push = list(report.missing) + list(report.different)
            if args.force:
                to_push = [name for name in to_push if name != LOCAL_CONFIG]
            for relative in to_push:
                if relative == LOCAL_CONFIG and not args.force:
                    print(f"  OMITIDO  {relative} (configuracion local de la placa; usar --force)")
                    continue
                source = os.path.join(FIRMWARE_DIR, relative.replace("/", os.sep))
                with open(source, "rb") as handle:
                    data = handle.read()
                board.write(device_path(relative), data)
                print(f"  COPIADO   {relative} ({len(data)} B)")

            if args.remove_extra:
                for name in report.extra:
                    board.remove("/" + name)
                    print(f"  BORRADO   {name}")

        if args.verify:
            report = compare(board, manifest)
            print()
            print_report(report)
            return 0 if report.ok else 1
    except SyncError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    except Exception as error:  # pragma: no cover - environment dependent
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    finally:
        board.close()

    return 0


if __name__ == "__main__":
    sys.exit(main())
