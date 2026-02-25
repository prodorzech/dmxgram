-- =========================================================
-- DMXGram: Boost Codes tables
-- Run this in your Supabase SQL editor (once)
-- =========================================================

-- Main codes table
CREATE TABLE IF NOT EXISTS boost_codes (
  code          TEXT        PRIMARY KEY,
  duration_days INTEGER     NOT NULL,
  max_uses      INTEGER     NOT NULL DEFAULT 1,
  uses_left     INTEGER     NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note          TEXT
);

-- Redemption log (one row per user per code)
CREATE TABLE IF NOT EXISTS boost_code_uses (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL REFERENCES boost_codes(code) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL,
  username   TEXT        NOT NULL,
  used_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code, user_id)
);

-- Index for fast lookup by code
CREATE INDEX IF NOT EXISTS idx_boost_code_uses_code ON boost_code_uses(code);
