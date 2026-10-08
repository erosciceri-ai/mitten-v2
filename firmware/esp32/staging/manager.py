"""Staging manager for transactional gesture sync.

Implements synchronization.md section 4: incremental NDJSON staging.
"""

try:
    import ujson as json
except ImportError:
    import json

import os

from storage.files import write_json_file, safe_remove, file_exists, compact_dumps
from staging.validator import validate_gesture_for_staging


class StagingManager:
    """Manages transactional staging for sync.begin -> sync.gesture* -> sync.commit/abort."""

    STAGING_PATH = "gestures.staging"

    def __init__(self, staging_path=None):
        self._staging_path = staging_path or self.STAGING_PATH
        self._state = {
            "sync_id": None,
            "profile_id": None,
            "profile_revision": None,
            "expected_count": 0,
            "received_count": 0,
            "received_ids": set(),
            "received_tracks": set(),
        }

    def get_state(self):
        """Get current staging state (copy to prevent external mutation)."""
        return {
            "sync_id": self._state["sync_id"],
            "profile_id": self._state["profile_id"],
            "profile_revision": self._state["profile_revision"],
            "expected_count": self._state["expected_count"],
            "received_count": self._state["received_count"],
            "received_ids": set(self._state["received_ids"]),
            "received_tracks": set(self._state["received_tracks"]),
        }

    def is_active(self):
        """Check if a staging transaction is active."""
        return self._state["sync_id"] is not None

    def begin(self, sync_id, profile_id, profile_revision, expected_count):
        """Start a new staging transaction (sync.begin).

        Returns True on success, False if staging already exists.
        """
        # Check for existing staging
        if file_exists(self._staging_path) or self.is_active():
            return False

        # Write header line
        header = {
            "version": 1,
            "profileId": profile_id,
            "profileRevision": profile_revision,
            "expectedGestureCount": expected_count
        }
        try:
            with open(self._staging_path, "w") as f:
                f.write(compact_dumps(header) + "\n")
        except OSError:
            return False

        # Initialize RAM state
        self._state = {
            "sync_id": sync_id,
            "profile_id": profile_id,
            "profile_revision": profile_revision,
            "expected_count": expected_count,
            "received_count": 0,
            "received_ids": set(),
            "received_tracks": set(),
        }
        return True

    def add_gesture(self, sync_id, index, gesture):
        """Add a gesture to staging (sync.gesture).

        Returns dict with ok, receivedCount, nextIndex on success.
        Returns dict with ok=False, error on failure (staging discarded).
        """
        # Verify active transaction
        if not self.is_active():
            return {"ok": False, "error": {"code": "SYNC_NOT_ACTIVE", "message": "No active sync transaction"}}

        # Verify syncId matches
        if sync_id != self._state["sync_id"]:
            return {"ok": False, "error": {"code": "SYNC_ID_MISMATCH", "message": "Sync ID does not match active transaction"}}

        if isinstance(index, bool) or not isinstance(index, int) or index < 0:
            return {"ok": False, "error": {"code": "INVALID_PAYLOAD", "message": "index must be a non-negative integer"}}

        # Verify index matches nextIndex
        if index != self._state["received_count"]:
            self._discard_staging()
            return {"ok": False, "error": {"code": "SYNC_SEQUENCE_INVALID", "message": "Gesture index out of sequence"}}

        # Verify we haven't exceeded expected count
        if self._state["received_count"] >= self._state["expected_count"]:
            self._discard_staging()
            return {"ok": False, "error": {"code": "SYNC_SEQUENCE_INVALID", "message": "Exceeded expected gesture count"}}

        # Validate gesture
        valid, error_msg = validate_gesture_for_staging(gesture)
        if not valid:
            self._discard_staging()
            return {"ok": False, "error": {"code": "GESTURE_INVALID", "message": error_msg}}

        # Check duplicate ID
        gid = gesture["id"]
        if gid in self._state["received_ids"]:
            self._discard_staging()
            return {"ok": False, "error": {"code": "DUPLICATE_GESTURE_ID", "message": f"Duplicate gesture ID: {gid}"}}

        # Check duplicate audioTrack
        track = gesture["audioTrack"]
        if track in self._state["received_tracks"]:
            self._discard_staging()
            return {"ok": False, "error": {"code": "GESTURE_INVALID", "message": f"Duplicate audioTrack: {track}"}}

        # Append gesture to staging file (NDJSON)
        try:
            with open(self._staging_path, "a") as f:
                f.write(compact_dumps(gesture) + "\n")
        except OSError:
            self._discard_staging()
            return {"ok": False, "error": {"code": "STORAGE_ERROR", "message": "Failed to write staging file"}}

        # Update RAM state
        self._state["received_count"] += 1
        self._state["received_ids"].add(gid)
        self._state["received_tracks"].add(track)

        return {
            "ok": True,
            "syncId": sync_id,
            "receivedCount": self._state["received_count"],
            "nextIndex": self._state["received_count"]
        }

    def abort(self, sync_id):
        """Abort staging transaction (sync.abort).

        Returns dict with ok, aborted on success.
        """
        if not self.is_active():
            return {"ok": False, "error": {"code": "SYNC_NOT_ACTIVE", "message": "No active sync transaction"}}

        if sync_id != self._state["sync_id"]:
            return {"ok": False, "error": {"code": "SYNC_ID_MISMATCH", "message": "Sync ID does not match active transaction"}}

        self._discard_staging()
        return {"ok": True, "aborted": True, "syncId": sync_id}

    def commit_validate(self, sync_id):
        """Validate staging for commit (sync.commit).

        Returns (True, profile_dict) on success, (False, error_code) on failure.
        """
        if not self.is_active():
            return False, "SYNC_NOT_ACTIVE"

        if sync_id != self._state["sync_id"]:
            return False, "SYNC_ID_MISMATCH"

        if self._state["received_count"] != self._state["expected_count"]:
            self._discard_staging()
            return False, "SYNC_INCOMPLETE"

        # Stream staging instead of retaining both raw lines and parsed samples.
        try:
            with open(self._staging_path, "r") as stream:
                header = json.loads(stream.readline())
                if not isinstance(header, dict) or header.get("profileId") != self._state["profile_id"] or header.get("profileRevision") != self._state["profile_revision"] or header.get("expectedGestureCount") != self._state["expected_count"]:
                    raise ValueError("Staging header mismatch")
                gestures = [json.loads(line) for line in stream]
            if len(gestures) != self._state["expected_count"]:
                self._discard_staging()
                return False, "SYNC_INCOMPLETE"
            profile = {"version": 1, "profileId": header["profileId"], "profileRevision": header["profileRevision"], "gestureCount": len(gestures), "gestures": gestures}
            from storage.atomic import validate_profile_structure
            if not validate_profile_structure(profile):
                raise ValueError("Invalid staged profile")
        except (OSError, ValueError, TypeError, KeyError):
            self._discard_staging()
            return False, "STORAGE_ERROR"

        return True, profile

    def commit(self, sync_id):
        """Alias for commit_validate for test compatibility - returns dict."""
        ok, result = self.commit_validate(sync_id)
        if ok:
            return {"ok": True, "profile": result}
        else:
            return {"ok": False, "error": {"code": result, "message": f"Commit failed: {result}"}}

    def _discard_staging(self):
        """Discard staging file and reset state."""
        safe_remove(self._staging_path)
        self._state = {
            "sync_id": None,
            "profile_id": None,
            "profile_revision": None,
            "expected_count": 0,
            "received_count": 0,
            "received_ids": set(),
            "received_tracks": set(),
        }

    def cleanup_orphaned(self):
        """Clean up orphaned staging file on boot."""
        if file_exists(self._staging_path):
            safe_remove(self._staging_path)
        self._state = {
            "sync_id": None,
            "profile_id": None,
            "profile_revision": None,
            "expected_count": 0,
            "received_count": 0,
            "received_ids": set(),
            "received_tracks": set(),
        }