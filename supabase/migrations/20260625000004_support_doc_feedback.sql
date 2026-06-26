-- Adds the support_doc_feedback table missing from the initial support system migration.
-- Also adds indexes for the support_tickets table that were referenced but not created.

CREATE TABLE IF NOT EXISTS support_doc_feedback (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     TEXT        NOT NULL,
  user_id    TEXT        NOT NULL,
  doc_key    TEXT        NOT NULL,
  type       TEXT        NOT NULL,
    -- 'helpful' | 'not_helpful' | 'outdated' | 'error' (open-ended from public)
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX support_doc_feedback_doc_key_idx ON support_doc_feedback(doc_key);
CREATE INDEX support_doc_feedback_type_idx    ON support_doc_feedback(type);
