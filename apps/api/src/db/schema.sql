-- MITTEN V2 Database Schema
-- SQLite with WAL mode for concurrent access

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Gestures table
CREATE TABLE IF NOT EXISTS gestures (
  id INTEGER PRIMARY KEY AUTOINCREMENT CHECK(id BETWEEN 1 AND 2147483647),
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  audio_track INTEGER NOT NULL CHECK(audio_track BETWEEN 1 AND 50),
  data TEXT NOT NULL,  -- JSON serialized GestureData
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, id),
  UNIQUE(user_id, audio_track),
  UNIQUE(user_id, id, audio_track)
);

-- Index for user's gestures
CREATE INDEX IF NOT EXISTS idx_gestures_user_id ON gestures(user_id);
CREATE INDEX IF NOT EXISTS idx_gestures_audio_track ON gestures(audio_track);

-- Profiles table (for sync metadata)
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,  -- Profile ID (UUID or similar)
  user_id INTEGER NOT NULL,
  revision TEXT NOT NULL,
  gesture_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for user's profiles
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

-- Audio tracks table (tracks 1-50, for MP3 file management)
CREATE TABLE IF NOT EXISTS audio_tracks (
  track_number INTEGER NOT NULL CHECK(track_number BETWEEN 1 AND 50),
  user_id INTEGER NOT NULL,
  gesture_id INTEGER,  -- NULL if available
  file_path TEXT,  -- Path to MP3 file on disk
  generated_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, track_number),
  FOREIGN KEY (user_id, gesture_id, track_number) REFERENCES gestures(user_id, id, audio_track)
);

-- Initialize all 50 audio tracks for each user (done in seed or on user creation)
-- This is a logical table; actual rows created per user

-- Sync sessions table (for tracking active sync transactions)
CREATE TABLE IF NOT EXISTS sync_sessions (
  sync_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  profile_id TEXT NOT NULL,
  profile_revision TEXT NOT NULL,
  expected_gesture_count INTEGER NOT NULL,
  received_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'committed', 'aborted', 'failed'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_sessions_user_id ON sync_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_sessions_status ON sync_sessions(status);

-- Sync gestures staging table (temporary storage during sync transaction)
CREATE TABLE IF NOT EXISTS sync_gestures_staging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_id TEXT NOT NULL,
  gesture_index INTEGER NOT NULL,
  gesture_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  audio_track INTEGER NOT NULL,
  data TEXT NOT NULL,  -- JSON serialized GestureData
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sync_id) REFERENCES sync_sessions(sync_id) ON DELETE CASCADE,
  UNIQUE(sync_id, gesture_index)
);

CREATE INDEX IF NOT EXISTS idx_sync_gestures_staging_sync_id ON sync_gestures_staging(sync_id);

-- Trigger to update updated_at timestamps
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_gestures_timestamp
AFTER UPDATE ON gestures
FOR EACH ROW
BEGIN
  UPDATE gestures SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_profiles_timestamp
AFTER UPDATE ON profiles
FOR EACH ROW
BEGIN
  UPDATE profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_sync_sessions_timestamp
AFTER UPDATE ON sync_sessions
FOR EACH ROW
BEGIN
  UPDATE sync_sessions SET updated_at = CURRENT_TIMESTAMP WHERE sync_id = NEW.sync_id;
END;