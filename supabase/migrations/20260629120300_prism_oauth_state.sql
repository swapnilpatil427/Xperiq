-- Migration: Prism OAuth state (one-click OAuth CSRF/state store)
-- Created: 2026-06-29
-- Description: Durable fallback for the OAuth `state` parameter used by
--   /api/prism/oauth/:platform/{start,callback}. Redis is the primary store
--   (10-min TTL); this table is the fallback when REDIS_URL is absent. Rows are
--   single-use (deleted on callback) and expiry-swept.

CREATE TABLE IF NOT EXISTS prism_oauth_state (
  state       TEXT        PRIMARY KEY,           -- random 32-byte hex, single-use
  org_id      TEXT        NOT NULL,
  platform    TEXT        NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}',  -- { mode, history_window, returnUrl, userId }
  expires_at  TIMESTAMPTZ NOT NULL,              -- now() + 10 min
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expiry sweep / lookup support.
CREATE INDEX IF NOT EXISTS prism_oauth_state_expiry_idx ON prism_oauth_state (expires_at);
CREATE INDEX IF NOT EXISTS prism_oauth_state_org_idx    ON prism_oauth_state (org_id);
