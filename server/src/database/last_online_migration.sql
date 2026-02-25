-- =========================================================
-- DMXGram: Add last_online column to users table
-- Run this in your Supabase SQL editor (once)
-- =========================================================

-- last_online is updated every ~60s by the heartbeat while the user is active.
-- If it's older than 3 minutes the server treats the user as offline,
-- so even a hard-crashed machine shows offline within 3 minutes.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_online TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_users_last_online ON users (last_online)
  WHERE last_online IS NOT NULL;
