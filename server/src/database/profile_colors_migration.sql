-- =========================================================
-- DMXGram: Add profile gradient color columns to users table
-- Run this in your Supabase SQL editor (once)
-- =========================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_color_top    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profile_color_bottom TEXT DEFAULT NULL;
