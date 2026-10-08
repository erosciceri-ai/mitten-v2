"""Recoverable profile promotion; no dependency on overwrite-rename semantics."""
import os
from storage.files import read_json_file, write_json_file, safe_remove, file_exists, sync_filesystem
from validation.gesture import validate_gesture, validate_gesture_data
from protocol.envelopes import is_valid_request_id


def validate_profile_structure(profile):
    if not isinstance(profile, dict) or type(profile.get("version")) is not int or profile["version"] != 1:
        return False
    if not is_valid_request_id(profile.get("profileId")):
        return False
    revision = profile.get("profileRevision")
    if not isinstance(revision, str) or not 1 <= len(revision) <= 128 or any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-" for c in revision):
        return False
    count, gestures = profile.get("gestureCount"), profile.get("gestures")
    if type(count) is not int or not 0 <= count <= 50 or not isinstance(gestures, list) or len(gestures) != count:
        return False
    ids, tracks = set(), set()
    for gesture in gestures:
        valid, _ = validate_gesture(gesture)
        if not valid or gesture["id"] in ids or gesture["audioTrack"] in tracks:
            return False
        ids.add(gesture["id"]); tracks.add(gesture["audioTrack"])
    return True


def validate_gesture_data_structure(data):
    return validate_gesture_data(data)[0]


def validate_profile_file(path):
    return validate_profile_structure(read_json_file(path))


def promote_profile(tmp_path, target_path):
    """Keep the old profile in .bak until the promoted file is durable and valid."""
    if not validate_profile_file(tmp_path):
        raise OSError("Invalid temporary profile")
    backup = target_path + ".bak"
    old_valid = validate_profile_file(target_path)
    if old_valid:
        if file_exists(backup):
            os.remove(backup)  # Safe: the valid old primary still exists.
        os.rename(target_path, backup)
        sync_filesystem()
    elif file_exists(target_path):
        os.remove(target_path)  # Invalid primary; tmp (and possibly backup) is valid.
    try:
        os.rename(tmp_path, target_path)
        sync_filesystem()
        if not validate_profile_file(target_path):
            raise OSError("Promoted profile failed validation")
    except OSError:
        if validate_profile_file(backup):
            try:
                if file_exists(target_path):
                    os.remove(target_path)
                os.rename(backup, target_path)
                sync_filesystem()
            except OSError:
                pass  # Keep .bak for recovery; never delete the last valid copy.
        raise
    # Cleanup failure cannot turn a durable successful promotion into a failed commit.
    safe_remove(backup)


def atomic_write_and_promote(target_path, profile_data):
    tmp_path = target_path + ".tmp"
    if not validate_profile_structure(profile_data):
        return False
    if not write_json_file(tmp_path, profile_data) or not validate_profile_file(tmp_path):
        safe_remove(tmp_path)
        return False
    try:
        promote_profile(tmp_path, target_path)
        return True
    except OSError:
        # The old primary or backup remains authoritative on a failed commit.
        if validate_profile_file(target_path) or validate_profile_file(target_path + ".bak"):
            safe_remove(tmp_path)
        return False
