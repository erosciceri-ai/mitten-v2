CREATE TABLE IF NOT EXISTS audio_objects (
  object_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('local', 's3')),
  user_id BIGINT NOT NULL,
  gesture_id BIGINT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 1048576),
  content_type TEXT NOT NULL CHECK (content_type = 'audio/mpeg'),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  state TEXT NOT NULL CHECK (state IN ('pending', 'active', 'retired', 'deleting', 'archived')),
  cleanup_after BIGINT NOT NULL
);
ALTER TABLE audio_tracks ADD COLUMN object_key TEXT REFERENCES audio_objects(object_key);
ALTER TABLE audio_tracks ADD COLUMN audio_revision INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX audio_tracks_object_key ON audio_tracks(object_key);
CREATE INDEX audio_objects_cleanup ON audio_objects(state, cleanup_after);
CREATE TABLE audio_generation_requests (
  user_id BIGINT NOT NULL,
  gesture_id BIGINT NOT NULL REFERENCES gestures(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY(user_id, gesture_id, request_key)
);
CREATE INDEX audio_generation_expiry ON audio_generation_requests(expires_at);
