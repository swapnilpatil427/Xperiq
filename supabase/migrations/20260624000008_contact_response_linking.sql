-- Tier 3 Phase H: Anonymous → Identified Response Linking
-- When a survey response contains an email field, auto-upsert a contact and
-- create an explicit link record. Supports both auto-linking and manual override.

-- Explicit link table (more robust than scanning responses by email each time)
CREATE TABLE IF NOT EXISTS contact_response_links (
    contact_id  UUID        NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    response_id UUID        NOT NULL,  -- references responses(id) without FK for perf
    survey_id   UUID        REFERENCES surveys(id) ON DELETE SET NULL,
    linked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    linked_by   TEXT        NOT NULL DEFAULT 'auto'
                    CHECK (linked_by IN ('auto', 'manual', 'token')),
    PRIMARY KEY (contact_id, response_id)
);

CREATE INDEX IF NOT EXISTS idx_response_links_response ON contact_response_links (response_id);
CREATE INDEX IF NOT EXISTS idx_response_links_contact  ON contact_response_links (contact_id, linked_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_links_survey   ON contact_response_links (survey_id) WHERE survey_id IS NOT NULL;

-- Track which responses we've attempted to auto-link (so backfill doesn't re-scan)
CREATE TABLE IF NOT EXISTS contact_link_audit (
    response_id     UUID        PRIMARY KEY,
    attempted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    result          TEXT        NOT NULL CHECK (result IN ('linked', 'no_email', 'no_match', 'consent_blocked', 'error')),
    contact_id      UUID        REFERENCES contacts(id) ON DELETE SET NULL
);

COMMENT ON TABLE  contact_response_links IS 'Explicit links between contacts and survey responses. Sources: auto (email match), manual (UI action), token (distribution token at submission).';
COMMENT ON TABLE  contact_link_audit IS 'Audit of auto-linking attempts. Prevents backfill from re-scanning already-processed responses.';
COMMENT ON COLUMN contact_response_links.linked_by IS 'auto=email match, manual=UI action, token=distribution token at submission.';
