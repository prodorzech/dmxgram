-- =========================================================
-- DMXGram: Payments table for tracking all payment attempts
-- Run this in your Supabase SQL editor (once)
-- =========================================================

CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  plan            TEXT NOT NULL,          -- '1month', '3months', '12months'
  amount_usd      NUMERIC(10,2) NOT NULL,
  method          TEXT NOT NULL,          -- 'btc', 'ltc', 'eth', 'usdt', 'card', 'paypal'
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'confirming', 'confirmed', 'expired', 'failed'
  
  -- Crypto fields
  crypto_address  TEXT,
  crypto_amount   TEXT,                   -- expected amount in crypto units
  crypto_tx_hash  TEXT,                   -- transaction hash once detected
  
  -- Stripe fields
  stripe_session_id  TEXT,
  stripe_payment_intent TEXT,
  
  -- Boost tracking
  boost_days      INTEGER NOT NULL,       -- how many days to grant
  
  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,            -- payment window expiry (e.g. 30 min for crypto)
  confirmed_at    TIMESTAMPTZ             -- when payment was confirmed
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_crypto_address ON payments(crypto_address);
