"""Golden vectors for the documented V1 baseline, not the abandoned Euclidean rule."""
import pytest
from recognition import GestureRecognizer


def gesture(identifier=42, track=7, centre=1000, width=0):
    return {"id": identifier, "audioTrack": track, "data": {"summary": {
        "min": [centre-width/2]*5 + [0, 0],
        "max": [centre+width/2]*5 + [0, 0],
        "mean": [centre]*5 + [0, 0]}}}


@pytest.mark.parametrize('sample, expected', [
    ([1000]*5+[0,0], 42),
    ([1160]*5+[0,0], 42),  # score exactly 2: inclusive boundary
    ([1161]*5+[0,0], None),
    ([1400]*5+[0,0], None),  # Euclidean implementation falsely accepted
    ([1000]*5+[20,20], 42),
    ([1000]*5+[20,21], None),
])
def test_v1_known_vectors(sample, expected):
    recognizer=GestureRecognizer(); recognizer.load_profile([gesture()])
    assert recognizer.recognize(sample).gesture_id == expected


def test_range_width_and_ties():
    recognizer=GestureRecognizer()
    recognizer.load_profile([gesture(width=1000), gesture(99, 8, width=1000)])
    assert recognizer.recognize([1400]*5+[0,0]).gesture_id == 42


def test_uses_ranges_not_mean_and_keeps_track():
    g=gesture(); g['data']['summary']['mean']=[0]*7
    recognizer=GestureRecognizer(); recognizer.load_profile([g])
    result=recognizer.recognize([1000]*5+[0,0])
    assert result.audio_track == 7
    assert recognizer.to_event(result) == {'v':2,'type':'event',
        'event':'recognition.detected','data':{'gestureId':42,'audioTrack':7}}


def test_empty_and_invalid_sample():
    recognizer=GestureRecognizer()
    assert not recognizer.recognize([0]*7).matched
    recognizer.load_profile([gesture()])
    assert not recognizer.recognize([0]*6).matched
    assert not recognizer.recognize([float('nan')]*7).matched
