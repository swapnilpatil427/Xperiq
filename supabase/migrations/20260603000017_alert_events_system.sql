-- Alerts — allow rule-less (Crystal/system-detected) alert events.
-- Crystal AI anomaly alerts (AI-01..06) are not tied to a user-defined rule, so
-- rule_id becomes nullable. `source` distinguishes rule-driven from AI-driven.

ALTER TABLE alert_events ALTER COLUMN rule_id DROP NOT NULL;

ALTER TABLE alert_events
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'rule'
    CHECK (source IN ('rule','crystal','system'));

CREATE INDEX IF NOT EXISTS idx_alert_events_source ON alert_events(org_id, source, triggered_at DESC);
