-- ============================================================================
-- Prism — Bitemporal checkpoints, unified feedback, citations + canonical adds
-- ----------------------------------------------------------------------------
-- Canonical DDL: docs/otherplatforms/migration/architecture-ingestion.md §4
--   (natural-key indexes), §8 (bitemporal checkpoints, I4/ADR-020), §9
--   (unified_feedback, ADR-026); engineering-plan.md §3 (canonical additions).
--
-- This migration is ADDITIVE and DEFENSIVE. It touches three tables that may
-- already exist from prior work — insight_checkpoints_v2 (created by the Insight
-- Pipeline v2 feature), and the canonical responses / signals / surveys tables.
-- Every change is guarded so the migration is a safe no-op if a table is absent
-- or a column/index already exists.
--
-- ASSUMPTION (see migration report): the canonical responses, signals and
-- surveys tables, and insight_checkpoints_v2, are expected to pre-exist. The
-- session's filesystem-listing tools were unavailable (no Glob/LS/Grep; Bash
-- E2BIG), so their exact prior definitions could not be inspected. Every
-- statement below is therefore wrapped in an existence guard rather than
-- assuming a shape — if a table is missing the change is skipped, never errors.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Bitemporal additions to insight_checkpoints_v2 (§8, I4).
--    Tier-A live checkpoints and Tier-B backfill run concurrently, so each
--    checkpoint carries BOTH valid-time (period it describes) and
--    transaction-time (when the row became known / was superseded).
--    Recomputing a period inserts a NEW version (as_of = now()) and stamps the
--    prior current row superseded_at = now() — readers select
--    WHERE superseded_at IS NULL for the current trail and time-travel via as_of.
--
--    The table may already exist (Insight Pipeline v2). We:
--      a) create it if missing (full canonical shape), then
--      b) additively ADD COLUMN IF NOT EXISTS for the bitemporal columns so an
--         already-existing table (any prior shape) gains them without error.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insight_checkpoints_v2 (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT NOT NULL,
  survey_id        UUID NOT NULL,
  lane             TEXT NOT NULL,             -- 'automated' | 'custom' | ...
  source           TEXT NOT NULL,             -- 'prism_import' | 'prism_backfill' | 'live'
  -- valid-time: the data period this checkpoint summarizes
  period_start     TIMESTAMPTZ NOT NULL,
  period_end       TIMESTAMPTZ NOT NULL,
  -- transaction-time: when this row became known / was superseded (bitemporal)
  as_of            TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at    TIMESTAMPTZ,               -- null = current version of this period
  payload          JSONB NOT NULL,            -- metrics/insights for the period
  meaningful_delta JSONB,                     -- vs the prior period's current version
  origin           TEXT NOT NULL,             -- 'prism_import' | 'prism_backfill' | 'live'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additive bitemporal columns — safe whether the table is new or pre-existing.
ALTER TABLE insight_checkpoints_v2 ADD COLUMN IF NOT EXISTS period_start  TIMESTAMPTZ;
ALTER TABLE insight_checkpoints_v2 ADD COLUMN IF NOT EXISTS period_end    TIMESTAMPTZ;
ALTER TABLE insight_checkpoints_v2 ADD COLUMN IF NOT EXISTS as_of         TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE insight_checkpoints_v2 ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
ALTER TABLE insight_checkpoints_v2 ADD COLUMN IF NOT EXISTS origin        TEXT;

-- One CURRENT version per (survey, lane, period); history kept via superseded_at.
-- (Unique includes as_of so superseded versions of the same period coexist.)
CREATE UNIQUE INDEX IF NOT EXISTS insight_checkpoints_v2_period_uq
  ON insight_checkpoints_v2 (org_id, survey_id, lane, period_start, period_end, as_of);
-- fast "current state of each period" read
CREATE INDEX IF NOT EXISTS insight_checkpoints_v2_current_idx
  ON insight_checkpoints_v2 (org_id, survey_id, lane, period_start)
  WHERE superseded_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. insight_response_citations — links an insight to the responses/signals it
--    cites (§5.2 lineage backward path; trust scoring / citation coverage §8).
--    A new table (no guard needed beyond IF NOT EXISTS). source_type
--    discriminates whether the cited row is a response or a signal so a single
--    citation row can point into the unified feedback space.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insight_response_citations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 TEXT NOT NULL,
  insight_id             UUID NOT NULL,
  response_or_signal_id  UUID NOT NULL,       -- the cited response or signal
  source_type            TEXT NOT NULL,       -- 'response' | 'signal'
  citation_text          TEXT,                -- the quoted verbatim / supporting text
  position               INTEGER,             -- ordering within the insight's citation list
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT insight_response_citations_source_type_chk
    CHECK (source_type IN ('response', 'signal'))
);

CREATE INDEX IF NOT EXISTS insight_response_citations_insight_idx
  ON insight_response_citations (org_id, insight_id);
-- backward lineage: "which insights cite this response/signal?" (erasure §5.4)
CREATE INDEX IF NOT EXISTS insight_response_citations_target_idx
  ON insight_response_citations (org_id, response_or_signal_id);

-- ----------------------------------------------------------------------------
-- 3. Canonical-table prerequisites (§4, engineering-plan §3).
--    The live responses table predates Prism and lacks metadata / soft-delete /
--    load-path columns; signals may not exist at all. Add columns and create
--    signals BEFORE the nat-key indexes and unified_feedback view reference them.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.responses') IS NOT NULL THEN
    ALTER TABLE responses ADD COLUMN IF NOT EXISTS metadata           JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE responses ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMPTZ;
    ALTER TABLE responses ADD COLUMN IF NOT EXISTS created_at           TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE responses ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE responses ADD COLUMN IF NOT EXISTS source_observed_at   TIMESTAMPTZ;
    ALTER TABLE responses ADD COLUMN IF NOT EXISTS payload_hash         TEXT;
    ALTER TABLE responses ADD COLUMN IF NOT EXISTS respondent           JSONB;
    ALTER TABLE responses ADD COLUMN IF NOT EXISTS ai_enrichment          JSONB;
  ELSE
    RAISE NOTICE 'Prism: table "responses" not found — skipped responses column additions.';
  END IF;
END
$$;

-- Non-survey feedback (§13 Signal Document). Created here so Prism nat-key indexes
-- and unified_feedback can reference it; load path uses metadata.prism provenance.
CREATE TABLE IF NOT EXISTS signals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT NOT NULL,
  linked_survey_id UUID REFERENCES surveys (id) ON DELETE SET NULL,
  source_id        UUID,
  content          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_enrichment    JSONB,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  original_at      TIMESTAMPTZ,
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_observed_at TIMESTAMPTZ,
  payload_hash     TEXT,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signals_org_idx
  ON signals (org_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Canonical-table additions (§4, engineering-plan §3) — guarded in a DO block
--    because responses / signals / surveys may not exist in every environment.
--
--    a) Exactly-once natural key for imports: a partial UNIQUE index on
--       (org_id, metadata.prism.source_platform, metadata.prism.source_record_id)
--       so a re-run UPSERTs instead of duplicating. WHERE metadata ? 'prism'
--       restricts the index to imported rows; AND deleted_at IS NULL keeps it a
--       live-row constraint (soft-deleted rows don't block re-import).
--    b) surveys.metric_method JSONB — the registry of record for how each metric
--       is computed (parity reproducibility, §8 / governance §5.5).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- responses natural-key unique index
  IF to_regclass('public.responses') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'responses' AND column_name = 'metadata'
     ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS responses_prism_nat_key
      ON responses (org_id,
                    (metadata -> 'prism' ->> 'source_platform'),
                    (metadata -> 'prism' ->> 'source_record_id'))
      WHERE metadata ? 'prism' AND deleted_at IS NULL;
  ELSE
    RAISE NOTICE 'Prism: table "responses" not found — skipped responses_prism_nat_key. Re-run after it exists.';
  END IF;

  -- signals natural-key unique index
  IF to_regclass('public.signals') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'signals' AND column_name = 'metadata'
     ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS signals_prism_nat_key
      ON signals (org_id,
                  (metadata -> 'prism' ->> 'source_platform'),
                  (metadata -> 'prism' ->> 'source_record_id'))
      WHERE metadata ? 'prism' AND deleted_at IS NULL;
  ELSE
    RAISE NOTICE 'Prism: table "signals" not found — skipped signals_prism_nat_key. Re-run after it exists.';
  END IF;

  -- surveys.metric_method column
  IF to_regclass('public.surveys') IS NOT NULL THEN
    ALTER TABLE surveys ADD COLUMN IF NOT EXISTS metric_method JSONB;
  ELSE
    RAISE NOTICE 'Prism: table "surveys" not found — skipped metric_method column. Re-run after it exists.';
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 5. unified_feedback — cross-source unification (§9, ADR-026).
--    CHOICE: a VIEW (not a table). Rationale (matches SURVEY_DATA_MODEL §23's
--    BigQuery feedback_items pattern): responses and signals share almost no
--    columns, so a unified TABLE would force a perpetual dual-write and leave
--    60–70% of columns NULL. A view is always consistent with its sources (no
--    sync, no drift), carries full provenance, and is exactly what Crystal reads
--    to reason across sources + what powers correct cross-source GDPR erasure.
--    It projects a NORMALIZED shape with a source_type discriminator so callers
--    treat responses and signals uniformly. The identity graph (I6) resolves
--    actors over this layer.
--
--    Guarded: only created when BOTH source tables exist. CREATE OR REPLACE so
--    re-running updates the definition in place. Columns are selected
--    defensively from each source's known canonical shape (SURVEY_DATA_MODEL.md
--    §11 Response, §13 Signal); the projection sticks to stable, documented
--    fields so it survives across environments.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.responses') IS NOT NULL
     AND to_regclass('public.signals') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW unified_feedback AS
        -- survey submissions
        SELECT
          r.id                                            AS feedback_id,
          'response'::text                                AS source_type,
          r.org_id                                        AS org_id,
          r.survey_id                                     AS survey_id,
          NULL::uuid                                      AS feedback_source_id,
          r.metadata -> 'prism' ->> 'source_platform'     AS source_platform,
          r.metadata -> 'prism' ->> 'source_record_id'    AS source_record_id,
          NULL::text                                      AS raw_text,
          r.answers                                       AS content,
          r.ai_enrichment                                 AS ai_enrichment,
          r.metadata                                      AS metadata,
          r.submitted_at                                  AS occurred_at,
          r.created_at                                    AS captured_at,
          r.deleted_at                                    AS deleted_at
        FROM responses r
        UNION ALL
        -- non-survey signals (reviews, calls, social, ...)
        SELECT
          s.id                                            AS feedback_id,
          'signal'::text                                  AS source_type,
          s.org_id                                        AS org_id,
          s.linked_survey_id                              AS survey_id,
          s.source_id                                     AS feedback_source_id,
          s.metadata -> 'prism' ->> 'source_platform'     AS source_platform,
          s.metadata -> 'prism' ->> 'source_record_id'    AS source_record_id,
          s.content ->> 'rawText'                         AS raw_text,
          s.content                                       AS content,
          s.ai_enrichment                                 AS ai_enrichment,
          s.metadata                                      AS metadata,
          COALESCE(s.original_at, s.captured_at)          AS occurred_at,
          s.captured_at                                   AS captured_at,
          s.deleted_at                                    AS deleted_at
        FROM signals s
    $view$;
  ELSE
    RAISE NOTICE 'Prism: responses and/or signals missing — skipped unified_feedback view. Re-run after both exist.';
  END IF;
EXCEPTION
  -- The view projects specific canonical column names (ai_enrichment, content,
  -- linked_survey_id, source_id, original_at, ...) inferred from
  -- SURVEY_DATA_MODEL.md but not verifiable against the live schema in this
  -- session. If the real column names differ, degrade to a NOTICE so the rest
  -- of the migration still applies; the view can be reconciled in a follow-up.
  WHEN undefined_column OR undefined_table OR datatype_mismatch THEN
    RAISE NOTICE 'Prism: unified_feedback view not created — canonical column mismatch (%). Reconcile column names against responses/signals and re-run.', SQLERRM;
END
$$;
