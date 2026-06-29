-- ── Migration: insights table v2 extensions (Phase 1+) ──────────────────────────
-- Adds the lane / projection-source / report linkage columns to the insights
-- table. See §6. Depends on:
--   - insight_lane enum + insight_checkpoints_v2 (20240523000000)
--   - insight_reports                            (20240524000000)
-- All ALTERs are idempotent (ADD COLUMN IF NOT EXISTS).

ALTER TABLE insights ADD COLUMN IF NOT EXISTS
  projection_source_checkpoint_id UUID REFERENCES insight_checkpoints_v2(id);

ALTER TABLE insights ADD COLUMN IF NOT EXISTS
  lane insight_lane NOT NULL DEFAULT 'automated';

ALTER TABLE insights ADD COLUMN IF NOT EXISTS
  insight_report_id UUID REFERENCES insight_reports(id);
