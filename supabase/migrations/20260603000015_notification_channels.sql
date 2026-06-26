-- Notifications — multi-channel delivery tracking + org channel configs.
-- Separate migration (not folded into 0014) so an already-applied 0014 isn't re-run.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS delivered_channels TEXT[] NOT NULL DEFAULT '{}';

-- Org-level external channel configuration (Slack webhook, email from-address, …).
-- Config is opaque JSONB; secrets should be encrypted at rest in production.
CREATE TABLE IF NOT EXISTS notification_channels (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT        NOT NULL,
  channel_type  TEXT        NOT NULL CHECK (channel_type IN ('slack','teams','email','webhook')),
  channel_name  TEXT,
  config        JSONB       NOT NULL DEFAULT '{}',
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notification_channels_org ON notification_channels(org_id, is_active)
  WHERE deleted_at IS NULL;
