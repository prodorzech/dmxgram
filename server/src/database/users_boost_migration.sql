-- =========================================================
-- DMXGram: Add DMX Boost columns to users table
-- Run this in your Supabase SQL editor (once)
-- =========================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_dmx_boost       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dmx_boost_expires_at TIMESTAMPTZ          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS accent_color         TEXT                 DEFAULT NULL;

-- Indexes for efficient boost-expiry revocation
CREATE INDEX IF NOT EXISTS idx_users_has_dmx_boost ON users (has_dmx_boost)
  WHERE has_dmx_boost = TRUE;
