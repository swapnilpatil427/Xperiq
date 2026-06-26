-- Tier 3 Phase A: Contact Identity & Consent Layer
-- Enables response-level identity linking with consent-first, anonymity-safe model.
-- See docs/agent-framework/TIER3_XO_LEGENDARY_DESIGN.md §System 1

-- ── Contacts ─────────────────────────────────────────────────────────────────
-- External respondent/customer identity. PII fields (email, name, phone) are
-- gated by the data:pii permission in backend middleware and Crystal tools.
CREATE TABLE IF NOT EXISTS contacts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT        NOT NULL,

    -- External identity (PII)
    external_id     TEXT,                           -- CRM ID, employee ID, etc.
    email           TEXT,                           -- PII — require data:pii permission
    name            TEXT,                           -- PII
    phone           TEXT,                           -- PII

    -- Account grouping (non-PII — safe for org-chart routing)
    account_id      TEXT,                           -- Groups contacts by company/account
    account_name    TEXT,

    -- Flexible segmentation attributes (non-PII: region, plan_tier, segment)
    segment_attrs   JSONB       NOT NULL DEFAULT '{}',

    -- Consent & anonymity
    consent_given   BOOL        NOT NULL DEFAULT false,
    consent_at      TIMESTAMPTZ,
    -- GDPR erasure: set anonymized_at to zero PII fields (email/name/phone → NULL)
    -- row is retained for referential integrity (responses.contact_id still valid)
    anonymized_at   TIMESTAMPTZ,

    -- Data residency compliance (from BrandContext.data_region)
    data_region     TEXT        NOT NULL DEFAULT 'us'
                        CHECK (data_region IN ('us', 'eu', 'apac', 'ca')),

    -- Import provenance
    import_source   TEXT        DEFAULT 'csv'
                        CHECK (import_source IN ('csv', 'api', 'crm_sync', 'manual')),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Uniqueness constraints (email unique only when not anonymized)
    UNIQUE (org_id, external_id)
);

-- Partial unique index on email: only enforce uniqueness for active (non-anonymized) contacts
CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_email_active_uniq
    ON contacts (org_id, email)
    WHERE anonymized_at IS NULL AND email IS NOT NULL;

-- Query indexes
CREATE INDEX IF NOT EXISTS contacts_org_id_idx ON contacts (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contacts_account_idx ON contacts (org_id, account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_segment_attrs_idx ON contacts USING gin (segment_attrs);
CREATE INDEX IF NOT EXISTS contacts_consent_idx ON contacts (org_id, consent_given);

COMMENT ON TABLE  contacts                   IS 'External respondent/customer identity. PII fields require data:pii permission.';
COMMENT ON COLUMN contacts.anonymized_at     IS 'GDPR erasure: when set, email/name/phone are NULLed. Row retained for FK integrity.';
COMMENT ON COLUMN contacts.consent_given     IS 'Explicit consent to link responses to this contact identity.';
COMMENT ON COLUMN contacts.segment_attrs     IS 'Non-PII segmentation: {region, plan_tier, segment, account_tier}';
COMMENT ON COLUMN contacts.account_id        IS 'Stable identifier for account-level grouping (non-PII, safe for routing).';


-- ── Survey Distribution Tokens ───────────────────────────────────────────────
-- One token per contact per survey distribution event.
-- Token embedded in survey URL (?t={token}). At submission, backend resolves
-- token → contact_id and stores on response (only if non-anonymous + consent).
CREATE TABLE IF NOT EXISTS survey_distribution_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id   UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    contact_id  UUID        REFERENCES contacts(id) ON DELETE SET NULL,
    token       TEXT        NOT NULL UNIQUE,     -- URL-safe, 32-char random string
    channel     TEXT        NOT NULL DEFAULT 'link'
                    CHECK (channel IN ('link', 'email', 'sms', 'embed', 'kiosk')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    used_at     TIMESTAMPTZ,
    response_id UUID        REFERENCES responses(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS distribution_tokens_survey_idx ON survey_distribution_tokens (survey_id);
CREATE INDEX IF NOT EXISTS distribution_tokens_contact_idx ON survey_distribution_tokens (contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS distribution_tokens_token_idx ON survey_distribution_tokens (token);

COMMENT ON TABLE  survey_distribution_tokens         IS 'Link tokens for identity-linked survey distribution. Token in URL → contact_id on response.';
COMMENT ON COLUMN survey_distribution_tokens.token   IS 'URL-safe 32-char random token embedded in personalized survey URL.';
COMMENT ON COLUMN survey_distribution_tokens.used_at IS 'When the token was used (response submitted). NULL = not yet opened.';


-- ── Extend Responses with Contact Identity ────────────────────────────────────
-- contact_id is populated ONLY when:
--   1. surveys.anonymous = false (survey-level anonymity setting)
--   2. contacts.consent_given = true (contact-level consent)
--   3. A valid distribution_token was present in the submission
-- All three conditions must hold. This is enforced in backend/src/routes/responses.ts.
ALTER TABLE responses ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS distribution_token TEXT;

CREATE INDEX IF NOT EXISTS responses_contact_id_idx ON responses (contact_id) WHERE contact_id IS NOT NULL;

COMMENT ON COLUMN responses.contact_id          IS 'Linked contact. NULL for anonymous responses or when consent not given.';
COMMENT ON COLUMN responses.distribution_token  IS 'Token from URL at submission time (retained for audit even if anonymous).';
