-- Tier 3 Phase F: Contact Segments
-- Named filter-based groups of contacts. Dynamic segments re-evaluate membership
-- on demand. Static segments support manual member management.

-- Segment definitions
CREATE TABLE IF NOT EXISTS contact_segments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT        NOT NULL,
    name            TEXT        NOT NULL,
    description     TEXT,
    color           TEXT        NOT NULL DEFAULT '#2a4bd9',
    is_dynamic      BOOL        NOT NULL DEFAULT TRUE,
    -- Filter definition JSON: { logic: 'AND'|'OR', conditions: [{ field, operator, value }] }
    -- Supported fields: consent_given, account_name, account_id, data_region,
    --   segment_attrs.<key>, email_domain, created_at
    -- Supported operators: eq, neq, contains, starts_with, ends_with, in, before, after, within_days
    filter_def      JSONB       NOT NULL DEFAULT '{"logic":"AND","conditions":[]}',
    contact_count   INTEGER     NOT NULL DEFAULT 0,
    last_evaluated_at TIMESTAMPTZ,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, name)
);

-- Materialized segment membership
CREATE TABLE IF NOT EXISTS contact_segment_members (
    segment_id  UUID        NOT NULL REFERENCES contact_segments(id) ON DELETE CASCADE,
    contact_id  UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_manual   BOOL        NOT NULL DEFAULT FALSE,
    PRIMARY KEY (segment_id, contact_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_segments_org ON contact_segments (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_segment_members_contact ON contact_segment_members (contact_id);
CREATE INDEX IF NOT EXISTS idx_segment_members_segment ON contact_segment_members (segment_id);

-- Update contact_count when membership changes
CREATE OR REPLACE FUNCTION update_segment_contact_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE contact_segments SET contact_count = contact_count + 1, updated_at = NOW()
        WHERE id = NEW.segment_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE contact_segments SET contact_count = GREATEST(contact_count - 1, 0), updated_at = NOW()
        WHERE id = OLD.segment_id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_segment_member_count ON contact_segment_members;
CREATE TRIGGER trg_segment_member_count
AFTER INSERT OR DELETE ON contact_segment_members
FOR EACH ROW EXECUTE FUNCTION update_segment_contact_count();

COMMENT ON TABLE  contact_segments IS 'Named filter-based groups of contacts. Dynamic segments re-evaluate on demand.';
COMMENT ON COLUMN contact_segments.filter_def IS 'JSON filter: { logic: AND|OR, conditions: [{ field, operator, value }] }';
COMMENT ON TABLE  contact_segment_members IS 'Materialized membership after segment evaluation. is_manual=true for hand-picked members.';
