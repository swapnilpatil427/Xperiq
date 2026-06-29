-- ── Backfill: survey_insight_checkpoints → insight_checkpoints_v2 ────────────────
-- See docs/insights/new_design/03_DATA_MODEL.md §9.
--
-- Walks the legacy survey_insight_checkpoints table ordered by
-- (survey_id, checkpoint_number) and inserts a corresponding row into
-- insight_checkpoints_v2, building the linked list by pointing each row's
-- parent_checkpoint_id at the previous row's NEW id (per survey).
--
-- Mappings (§9):
--   lane                = 'automated'
--   run_mode            = 'automated_incremental'
--   trigger 'schedule'  → 'scheduler'   (other legacy trigger values pass through)
--   report_url          → report_blob_ref
--
-- run_id NOT NULL handling
-- ------------------------
-- insight_checkpoints_v2.run_id is `UUID NOT NULL REFERENCES agent_runs(id)`, but
-- the legacy survey_insight_checkpoints table has NO run_id column at all. To keep
-- the FK + NOT NULL invariant we synthesise ONE placeholder agent_runs row per
-- backfilled checkpoint and reference it. The placeholder uses
-- run_type='survey_creation' (the only value the agent_runs CHECK allows),
-- status='completed', and a deterministic thread_id derived from the legacy
-- checkpoint id ('backfill:ckpt:<legacy_id>') so re-runs are idempotent and the
-- synthetic run is traceable back to its source checkpoint.
--
-- Re-runnable: a legacy row is skipped if a v2 row already exists for the same
-- (survey_id, org_id, checkpoint_number). The synthetic agent_runs insert uses
-- ON CONFLICT (thread_id) DO NOTHING.

DO $$
DECLARE
  rec              RECORD;
  prev_survey_id   UUID := NULL;
  prev_new_id      UUID := NULL;
  v_parent_id      UUID;
  v_new_id         UUID;
  v_run_id         UUID;
  v_thread_id      TEXT;
  v_trigger        TEXT;
BEGIN
  FOR rec IN
    SELECT *
    FROM survey_insight_checkpoints
    ORDER BY survey_id, checkpoint_number
  LOOP
    -- Reset the per-survey "previous" pointer when we move to a new survey so
    -- the first checkpoint of each survey has parent_checkpoint_id = NULL.
    IF prev_survey_id IS DISTINCT FROM rec.survey_id THEN
      prev_new_id := NULL;
    END IF;

    -- Skip if this checkpoint was already migrated.
    IF EXISTS (
      SELECT 1 FROM insight_checkpoints_v2 v
      WHERE v.survey_id = rec.survey_id
        AND v.org_id = rec.org_id
        AND v.checkpoint_number = rec.checkpoint_number
    ) THEN
      -- Keep the chain pointer advancing so subsequent (unmigrated) rows still
      -- link to the right parent. Resolve the existing v2 id for this number.
      SELECT v.id INTO prev_new_id
      FROM insight_checkpoints_v2 v
      WHERE v.survey_id = rec.survey_id
        AND v.org_id = rec.org_id
        AND v.checkpoint_number = rec.checkpoint_number;
      prev_survey_id := rec.survey_id;
      CONTINUE;
    END IF;

    -- Map legacy trigger → v2 trigger vocabulary.
    v_trigger := CASE
      WHEN rec.trigger = 'schedule' THEN 'scheduler'
      WHEN rec.trigger IN ('stream','scheduler','manual','milestone','api','days','responses')
        THEN rec.trigger
      ELSE 'scheduler'  -- conservative default for any unexpected legacy value
    END;

    -- Synthesise a placeholder agent_runs row to satisfy the NOT NULL FK.
    v_thread_id := 'backfill:ckpt:' || rec.id::text;
    v_run_id := gen_random_uuid();
    INSERT INTO agent_runs (id, org_id, user_id, thread_id, run_type, status, created_at, completed_at)
    VALUES (
      v_run_id,
      rec.org_id,
      'system:backfill',
      v_thread_id,
      'survey_creation',
      'completed',
      COALESCE(rec.created_at, NOW()),
      COALESCE(rec.created_at, NOW())
    )
    ON CONFLICT (thread_id) DO NOTHING;

    -- If the run already existed from a prior partial run, fetch its id.
    IF NOT FOUND THEN
      SELECT id INTO v_run_id FROM agent_runs WHERE thread_id = v_thread_id;
    END IF;

    v_parent_id := prev_new_id;
    v_new_id := gen_random_uuid();

    INSERT INTO insight_checkpoints_v2 (
      id,
      survey_id,
      org_id,
      checkpoint_number,
      parent_checkpoint_id,
      lane,
      run_id,
      run_mode,
      trigger,
      created_by,
      created_at,
      response_count_at_checkpoint,
      response_high_watermark,
      new_response_count,
      nps_at_checkpoint,
      csat_at_checkpoint,
      ces_at_checkpoint,
      topic_fingerprint,
      delta_from_prior,
      meaningful_delta,
      report_blob_ref,
      schema_version
    )
    VALUES (
      v_new_id,
      rec.survey_id,
      rec.org_id,
      rec.checkpoint_number,
      v_parent_id,
      'automated',
      v_run_id,
      'automated_incremental',
      v_trigger,
      'system:backfill',
      COALESCE(rec.created_at, NOW()),
      COALESCE(rec.response_count_at_checkpoint, 0),
      NULL,                                  -- legacy table has no response_high_watermark
      0,
      rec.nps_at_checkpoint,
      rec.csat_at_checkpoint,
      rec.ces_at_checkpoint,
      rec.topic_fingerprint,
      rec.delta_from_prior,
      COALESCE(rec.meaningful_delta, FALSE),
      rec.report_url,                        -- report_url → report_blob_ref
      2
    );

    prev_new_id := v_new_id;
    prev_survey_id := rec.survey_id;
  END LOOP;
END $$;
