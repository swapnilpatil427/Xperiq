-- Survey Groups v1.0 — Tag-based cross-survey intelligence
-- Introduces: survey_tags, survey_tag_mappings, group_insight_runs, group_insights
-- Tags are the grouping mechanism; a tag IS the group.
-- Surveys may have at most 5 tags (enforced by trigger below).
-- A tag can optionally be upgraded to a Program by populating program_config.

-- ── Survey Tags ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_tags (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT        NOT NULL,
  name            TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  slug            TEXT        NOT NULL,
  color           TEXT        NOT NULL DEFAULT '#6366f1',
  description     TEXT        CHECK (description IS NULL OR char_length(description) <= 200),
  -- NULL = plain tag; non-NULL = Program with cadence + expected touchpoints
  program_config  JSONB,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_survey_tags_org ON survey_tags (org_id);

-- ── Survey ↔ Tag Mapping ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS survey_tag_mappings (
  survey_id  UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  tag_id     UUID        NOT NULL REFERENCES survey_tags(id) ON DELETE CASCADE,
  org_id     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (survey_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_stm_tag    ON survey_tag_mappings (tag_id, org_id);
CREATE INDEX IF NOT EXISTS idx_stm_survey ON survey_tag_mappings (survey_id);

-- Enforce max 5 tags per survey at the database level
CREATE OR REPLACE FUNCTION enforce_survey_tag_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM survey_tag_mappings WHERE survey_id = NEW.survey_id
  ) >= 5 THEN
    RAISE EXCEPTION 'A survey cannot have more than 5 tags (org_id=%, survey_id=%)',
      NEW.org_id, NEW.survey_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_survey_tag_limit ON survey_tag_mappings;
CREATE TRIGGER trg_survey_tag_limit
  BEFORE INSERT ON survey_tag_mappings
  FOR EACH ROW EXECUTE FUNCTION enforce_survey_tag_limit();

-- ── Group Insight Runs ────────────────────────────────────────────────────────
-- Mirrors agent_runs but scoped to a group (1+ tags → N surveys)
CREATE TABLE IF NOT EXISTS group_insight_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT        NOT NULL,
  tag_ids       UUID[]      NOT NULL,
  survey_ids    UUID[]      NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','running','completed','failed','cancelled')),
  stream_events JSONB       NOT NULL DEFAULT '[]',
  error_log     JSONB       NOT NULL DEFAULT '[]',
  result_json   JSONB,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  heartbeat_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gir_org_created ON group_insight_runs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gir_tag_ids     ON group_insight_runs USING GIN (tag_ids);

-- ── Group Insights ────────────────────────────────────────────────────────────
-- Cross-survey insights; mirrors the insights table structure but group-scoped.
-- category values: group.metric | group.theme | group.gap | group.suggest
CREATE TABLE IF NOT EXISTS group_insights (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 TEXT         NOT NULL,
  run_id                 UUID         REFERENCES group_insight_runs(id) ON DELETE SET NULL,
  tag_ids                UUID[]       NOT NULL,
  survey_ids             UUID[]       NOT NULL,
  layer                  TEXT         NOT NULL
                         CHECK (layer IN ('descriptive','diagnostic','predictive','prescriptive')),
  category               TEXT         NOT NULL,
  headline               TEXT         NOT NULL,
  narrative              TEXT         NOT NULL,
  metric_json            JSONB,
  citations_json         JSONB,
  trust_score            NUMERIC(5,4),
  priority               INT,
  -- Gap intelligence fields
  data_gap_signals       JSONB,        -- [{ type, description, severity, affected_surveys }]
  suggested_survey_types TEXT[],       -- e.g. ['pulse', 'exit_interview']
  suggested_survey_json  JSONB,        -- full proposal: { title, type, questions_hint, tags }
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  superseded_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gi_org_run  ON group_insights (org_id, run_id);
CREATE INDEX IF NOT EXISTS idx_gi_tag_ids  ON group_insights USING GIN (tag_ids);
CREATE INDEX IF NOT EXISTS idx_gi_active   ON group_insights (org_id, created_at DESC)
  WHERE superseded_at IS NULL;

-- ── Helper View: surveys with their tags ─────────────────────────────────────
CREATE OR REPLACE VIEW surveys_with_tags AS
  SELECT
    s.id,
    s.org_id,
    s.title,
    s.status,
    s.survey_type_id,
    s.created_at,
    s.updated_at,
    COALESCE(
      json_agg(
        json_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'color', t.color)
        ORDER BY t.name
      ) FILTER (WHERE t.id IS NOT NULL),
      '[]'
    ) AS tags
  FROM surveys s
  LEFT JOIN survey_tag_mappings m ON m.survey_id = s.id
  LEFT JOIN survey_tags          t ON t.id = m.tag_id
  WHERE s.deleted_at IS NULL
  GROUP BY s.id;
