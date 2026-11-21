"""Recepción de pistas WAV en la microSD (carga desde la web).

Escribe en un archivo temporal (staging), verifica tamaño, CRC32 y formato WAV, y recién
entonces lo renombra a /mitten_audio/audio/NNNN.wav. Una pista válida nunca queda a medias:
si la carga falla o se corta, la pista anterior sigue intacta.
"""

import binascii
import os

from audio import MOUNT, read_wav_header
from utils.time import ticks_ms, ticks_diff

MAX_TRACK_BYTES = 524288        # 16 s a 16 kHz mono 16 bits
MIN_TRACK_BYTES = 45            # cabecera de 44 bytes + al menos una muestra
CHUNK_MAX_BYTES = 3072
UPLOAD_TIMEOUT_MS = 30000
SPACE_MARGIN_BYTES = 65536
TRACKS = 50


class AudioStoreError(Exception):
    def __init__(self, code, message, details=None):
        Exception.__init__(self, message)
        self.code = code
        self.message = message
        self.details = details


def _is_track(track):
    return isinstance(track, int) and not isinstance(track, bool) and 1 <= track <= TRACKS


def _is_uint(value, maximum):
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= maximum


def _exists(path):
    try:
        os.stat(path)
        return True
    except OSError:
        return False


def _remove(path):
    try:
        os.remove(path)
    except OSError:
        pass


def _mkdir(path):
    try:
        os.mkdir(path)
    except OSError:
        pass                    # ya existe


class AudioStore:
    def __init__(self, root=MOUNT, remount=None, is_playing=None, now=None):
        self.root = root
        self._remount = remount             # remount(writable) -> bool
        self._is_playing = is_playing
        self._now = now or ticks_ms
        self._active = None
        self._restore_readonly = False

    # ---- rutas -------------------------------------------------------------
    def final_path(self, track):
        return "%s/audio/%04d.wav" % (self.root, track)

    def _staging_path(self, track):
        return "%s/staging/%04d.part" % (self.root, track)

    # ---- ciclo de carga ----------------------------------------------------
    def begin(self, track, size, crc32):
        self.tick()
        if not _is_track(track):
            raise AudioStoreError("AUDIO_INVALID_TRACK", "audioTrack debe ser un entero entre 1 y 50")
        if not isinstance(size, int) or isinstance(size, bool) or not MIN_TRACK_BYTES <= size <= MAX_TRACK_BYTES:
            raise AudioStoreError("AUDIO_TOO_LARGE", "Tamaño de pista fuera de rango", {"maxBytes": MAX_TRACK_BYTES})
        if not _is_uint(crc32, 0xFFFFFFFF):
            raise AudioStoreError("AUDIO_INVALID_TRACK", "crc32 inválido")
        if self._active is not None or (self._is_playing is not None and self._is_playing()):
            raise AudioStoreError("AUDIO_BUSY", "Hay una carga en curso o el guante está reproduciendo")
        self._set_writable(True)
        try:
            _mkdir(self.root + "/audio")
            _mkdir(self.root + "/staging")
            self.recover()                  # restos de cargas cortadas por falta de energía
            if self._free_bytes() < size + SPACE_MARGIN_BYTES:
                raise AudioStoreError("AUDIO_NO_SPACE", "No hay espacio suficiente en la microSD")
            handle = open(self._staging_path(track), "wb")
        except AudioStoreError:
            self._restore()
            raise
        except OSError:
            self._restore()
            raise AudioStoreError("AUDIO_IO", "No se pudo preparar la carga en la microSD")
        self._active = {"track": track, "size": size, "crc": crc32, "running": 0, "written": 0,
                        "file": handle, "touched": self._now()}
        return {"track": track, "offset": 0}

    def chunk(self, track, offset, data):
        active = self._require(track)
        if not isinstance(data, (bytes, bytearray)) or not 0 < len(data) <= CHUNK_MAX_BYTES:
            raise AudioStoreError("AUDIO_BAD_CHUNK", "Fragmento vacío o demasiado grande",
                                  {"maxBytes": CHUNK_MAX_BYTES})
        if offset != active["written"]:
            raise AudioStoreError("AUDIO_BAD_OFFSET", "Desplazamiento inesperado", {"offset": active["written"]})
        if active["written"] + len(data) > active["size"]:
            raise AudioStoreError("AUDIO_TOO_LARGE", "El fragmento excede el tamaño declarado")
        try:
            active["file"].write(data)
        except OSError:
            self._discard()
            raise AudioStoreError("AUDIO_IO", "Falló la escritura en la microSD")
        active["running"] = binascii.crc32(data, active["running"]) & 0xFFFFFFFF
        active["written"] += len(data)
        active["touched"] = self._now()
        return active["written"]

    def commit(self, track):
        active = self._require(track)
        if active["written"] != active["size"] or active["running"] != active["crc"]:
            self._discard()
            raise AudioStoreError("AUDIO_INTEGRITY", "El tamaño o el CRC32 no coinciden")
        staging = self._staging_path(track)
        try:
            active["file"].flush()
            active["file"].close()
            with open(staging, "rb") as source:
                read_wav_header(source)
        except ValueError as error:
            self._discard()
            raise AudioStoreError("AUDIO_INVALID_WAV", str(error))
        except OSError:
            self._discard()
            raise AudioStoreError("AUDIO_IO", "Falló la verificación en la microSD")
        final = self.final_path(track)
        try:
            _remove(final)
            os.rename(staging, final)
        except OSError:
            self._discard()
            raise AudioStoreError("AUDIO_IO", "No se pudo publicar la pista")
        self._active = None
        self._restore()
        return {"track": track, "size": active["size"]}

    def abort(self):
        if self._active is not None:
            self._discard()
        return True

    # ---- mantenimiento -----------------------------------------------------
    def tick(self):
        """Llamar periódicamente: vence cargas abandonadas y restaura el modo solo lectura."""
        active = self._active
        if active is not None and ticks_diff(self._now(), active["touched"]) > UPLOAD_TIMEOUT_MS:
            self._discard()
        if self._active is None and self._restore_readonly:
            self._restore()

    def recover(self):
        """Al arrancar: borra restos de cargas interrumpidas por un corte de energía."""
        try:
            names = os.listdir(self.root + "/staging")
        except OSError:
            return 0
        for name in names:
            _remove("%s/staging/%s" % (self.root, name))
        return len(names)

    def info(self, track):
        """Tamaño y CRC32 de una pista guardada, o None si no existe."""
        if not _is_track(track):
            return None
        path = self.final_path(track)
        try:
            size = os.stat(path)[6]
            crc = 0
            with open(path, "rb") as source:
                while True:
                    block = source.read(1024)
                    if not block:
                        break
                    crc = binascii.crc32(block, crc) & 0xFFFFFFFF
            return {"track": track, "size": size, "crc32": crc}
        except OSError:
            return None

    def is_uploading(self):
        return self._active is not None

    def summary(self, track=None):
        """Pistas guardadas con su tamaño; con `track`, solo esa pista y con CRC32."""
        if track is not None:
            info = self.info(track)
            return [] if info is None else [{"audioTrack": track, "sizeBytes": info["size"], "crc32": info["crc32"]}]
        tracks = []
        for number in range(1, TRACKS + 1):
            try:
                tracks.append({"audioTrack": number, "sizeBytes": os.stat(self.final_path(number))[6]})
            except OSError:
                pass
        return tracks

    def list_tracks(self):
        return [track for track in range(1, TRACKS + 1) if _exists(self.final_path(track))]

    # ---- internos ----------------------------------------------------------
    def _require(self, track):
        active = self._active
        if active is None or active["track"] != track:
            raise AudioStoreError("AUDIO_NO_UPLOAD", "No hay una carga activa para esa pista")
        active["touched"] = self._now()
        return active

    def _discard(self):
        active, self._active = self._active, None
        if active is not None:
            try:
                active["file"].close()
            except Exception:
                pass
            _remove(self._staging_path(active["track"]))
        self._restore()

    def _set_writable(self, writable):
        if self._remount is None:
            return
        if not self._remount(writable):
            if writable:
                raise AudioStoreError("AUDIO_UNAVAILABLE", "No se pudo habilitar la escritura en la microSD")
            self._restore_readonly = True
        elif not writable:
            self._restore_readonly = False

    def _restore(self):
        try:
            self._set_writable(False)
        except AudioStoreError:
            pass

    def _free_bytes(self):
        try:
            stats = os.statvfs(self.root)
            return stats[0] * stats[3]      # f_frsize * f_bavail
        except (OSError, AttributeError):
            return 1 << 62
