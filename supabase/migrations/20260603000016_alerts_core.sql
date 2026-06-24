-- Alerts & Intelligence System — core schema.
-- IDs are TEXT (Clerk) per the platform convention; the design doc's
-- organizations(id)/users(id) FKs are dropped (those tables don't exist).

-- Alert rule configurations (user-defined + Crystal/system-managed).
CREATE TABLE IF NOT EXISTS alert_rules (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT         NOT NULL,
  survey_id        UUID         REFERENCES surveys(id) ON DELETE CASCADE,  -- NULL = org-wide
  alert_type       VARCHAR(32)  NOT NULL,   -- e.g. 'S-01', 'V-03'
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  is_system        BOOLEAN      NOT NULL DEFAULT FALSE,
  threshold_config JSONB        NOT NULL DEFAULT '{}',
  severity         VARCHAR(16)  NOT NULL DEFAULT 'warning'
                   CHECK (severity IN ('critical','warning','info','success')),
  created_by       TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_org_active ON alert_rules(org_id, is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_alert_rules_survey ON alert_rules(survey_id) WHERE survey_id IS NOT NULL;

-- Triggered alert instances.
CREATE TABLE IF NOT EXISTS alert_events (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT         NOT NULL,
  rule_id           UUID         NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  survey_id         UUID         REFERENCES surveys(id) ON DELETE SET NULL,
  alert_type        VARCHAR(32)  NOT NULL,
  severity          VARCHAR(16)  NOT NULL CHECK (severity IN ('critical','warning','info','success')),
  title             TEXT         NOT NULL,
  description       TEXT         NOT NULL,
  crystal_narration TEXT,
  crystal_action    TEXT,
  metric_value      DECIMAL(12,4),
  metric_baseline   DECIMAL(12,4),
  metric_change     DECIMAL(12,4),
  evidence          JSONB        DEFAULT '{}',
  status            VARCHAR(16)  NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','acknowledged','snoozed','resolved')),
  triggered_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   TEXT,
  resolved_at       TIMESTAMPTZ,
  resolved_by       TEXT,
  snoozed_until     TIMESTAMPTZ,
  snoozed_by        TEXT,
  metadata          JSONB        DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_alert_events_org_active ON alert_events(org_id, triggered_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_alert_events_rule ON alert_events(rule_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_survey ON alert_events(survey_id, triggered_at DESC);

-- Who receives which alert types / rules and on which channels.
CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  user_id         TEXT,                   -- NULL = role-based
  role            VARCHAR(32),
  rule_id         UUID        REFERENCES alert_rules(id) ON DELETE CASCADE,
  alert_type      VARCHAR(32),
  in_app_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
  email_enabled   BOOLEAN     NOT NULL DEFAULT FALSE,
  slack_enabled   BOOLEAN     NOT NULL DEFAULT FALSE,
  CONSTRAINT uq_alert_subscription UNIQUE (org_id, user_id, rule_id)
);
CREATE INDEX IF NOT EXISTS idx_alert_subs_org ON alert_subscriptions(org_id);

-- Org-level threshold overrides.
CREATE TABLE IF NOT EXISTS alert_thresholds (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  alert_type      VARCHAR(32) NOT NULL,
  threshold_key   VARCHAR(64) NOT NULL,
  threshold_value JSONB       NOT NULL,
  CONSTRAINT uq_alert_threshold UNIQUE (org_id, alert_type, threshold_key)
);

-- Immutable audit trail of state transitions.
CREATE TABLE IF NOT EXISTS alert_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_event_id  UUID        NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
  user_id         TEXT,                   -- NULL = system action
  action          VARCHAR(32) NOT NULL,
  from_status     VARCHAR(16),
  to_status       VARCHAR(16),
  metadata        JSONB       DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_history_event ON alert_history(alert_event_id, created_at);
