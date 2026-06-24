-- GAP 3: Add skill_name column to crystal_turn_events (used by CDX admin queries)
-- GAP 7: Make thread_id nullable (fire_telemetry calls before thread is created)
-- GAP 5: Fix skill_quality_metrics PK to handle NULL brand_id via default ''

ALTER TABLE crystal_turn_events
    ADD COLUMN IF NOT EXISTS skill_name TEXT;

CREATE INDEX IF NOT EXISTS crystal_turn_events_skill_name_idx
    ON crystal_turn_events (skill_name)
    WHERE skill_name IS NOT NULL;

-- Make thread_id nullable — telemetry fires before thread is established
ALTER TABLE crystal_turn_events
    ALTER COLUMN thread_id DROP NOT NULL;

-- GAP 5: Fix skill_quality_metrics to never have NULL brand_id so the PK works
ALTER TABLE skill_quality_metrics
    ALTER COLUMN brand_id SET DEFAULT '';

UPDATE skill_quality_metrics
    SET brand_id = '' WHERE brand_id IS NULL;

ALTER TABLE skill_quality_metrics
    ALTER COLUMN brand_id SET NOT NULL;

COMMENT ON COLUMN crystal_turn_events.skill_name IS 'Name of the skill that handled this turn (NULL for fallback Crystal path)';
