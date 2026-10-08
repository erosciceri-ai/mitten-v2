"""Profile loading and management for MITTEN V2 firmware.

Implements boot recovery per synchronization.md section 7.
"""

from storage.files import (
    read_json_file,
    safe_remove,
    file_exists,
)
from storage.atomic import validate_profile_structure


def load_active_profile():
    """Primary wins; otherwise recover the last committed backup before a temp."""
    from storage.files import sync_filesystem
    import os
    safe_remove("gestures.staging")
    primary = read_json_file("gestures.json")
    if validate_profile_structure(primary):
        safe_remove("gestures.json.tmp")
        safe_remove("gestures.json.bak")
        return primary
    for candidate in ("gestures.json.bak", "gestures.json.tmp"):
        profile = read_json_file(candidate)
        if not validate_profile_structure(profile):
            continue
        try:
            if file_exists("gestures.json"):
                os.remove("gestures.json")
            os.rename(candidate, "gestures.json")
            sync_filesystem()
        except OSError:
            # The candidate stays recoverable even if promotion is temporarily unavailable.
            return profile
        safe_remove("gestures.json.tmp")
        safe_remove("gestures.json.bak")
        return profile
    safe_remove("gestures.json.tmp")
    return None


class ProfileManager:
    """Manages the active profile in RAM."""

    def __init__(self):
        self._profile = None

    def load(self):
        """Load profile from storage into RAM."""
        self._profile = load_active_profile()
        return self._profile

    @property
    def current(self):
        """Get current profile (None if not loaded)."""
        return self._profile

    @property
    def gesture_count(self):
        """Get gesture count of current profile."""
        if self._profile:
            return self._profile.get("gestureCount", 0)
        return 0

    @property
    def profile_id(self):
        """Get profile ID of current profile."""
        if self._profile:
            return self._profile.get("profileId")
        return None

    @property
    def profile_revision(self):
        """Get profile revision of current profile."""
        if self._profile:
            return self._profile.get("profileRevision")
        return None

    def get_gesture_by_id(self, gesture_id):
        """Find gesture by ID in current profile."""
        if not self._profile:
            return None
        for g in self._profile.get("gestures", []):
            if g.get("id") == gesture_id:
                return g
        return None

    def get_gesture_by_audio_track(self, audio_track):
        """Find gesture by audioTrack in current profile."""
        if not self._profile:
            return None
        for g in self._profile.get("gestures", []):
            if g.get("audioTrack") == audio_track:
                return g
        return None

    def set_profile(self, profile):
        """Set current profile in RAM (after successful commit)."""
        self._profile = profile