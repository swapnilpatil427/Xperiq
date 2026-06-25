-- Tier 3 Phase G: CRM Sync
-- Pull contacts from Salesforce, HubSpot, or inbound webhooks.
-- Providers: 'hubspot' | 'salesforce' | 'webhook' | 'csv_url'

CREATE TABLE IF NOT EXISTS contact_sync_configs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT        NOT NULL,
    name            TEXT        NOT NULL,
    provider        TEXT        NOT NULL
                        CHECK (provider IN ('hubspot', 'salesforce', 'webhook', 'csv_url')),
    -- Provider-specific credentials (encrypted at rest in production):
    --   hubspot:    { api_key }
    --   salesforce: { instance_url, access_token, refresh_token, client_id, client_secret }
    --   webhook:    { endpoint_secret }
    --   csv_url:    { url, auth_header? }
    config          JSONB       NOT NULL DEFAULT '{}',
    -- Field mapping pairs: [{ source: 'email', dest: 'email' }, ...]
    -- dest fields: email, name, phone, account_name, account_id, external_id, data_region
    field_mappings  JSONB       NOT NULL DEFAULT '[]',
    sync_schedule   TEXT        CHECK (sync_schedule IN ('manual', 'hourly', 'daily', 'weekly')),
    is_active       BOOL        NOT NULL DEFAULT TRUE,
    last_synced_at  TIMESTAMPTZ,
    last_sync_status TEXT       CHECK (last_sync_status IN ('running', 'completed', 'failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, name)
);

-- Per-run sync log
CREATE TABLE IF NOT EXISTS contact_sync_logs (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              TEXT        NOT NULL,
    sync_config_id      UUID        NOT NULL REFERENCES contact_sync_configs(id) ON DELETE CASCADE,
    status              TEXT        NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'completed', 'failed')),
    contacts_fetched    INTEGER     NOT NULL DEFAULT 0,
    contacts_created    INTEGER     NOT NULL DEFAULT 0,
    contacts_updated    INTEGER     NOT NULL DEFAULT 0,
    contacts_failed     INTEGER     NOT NULL DEFAULT 0,
    error_detail        TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_configs_org ON contact_sync_configs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_config ON contact_sync_logs (sync_config_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_org ON contact_sync_logs (org_id, started_at DESC);

COMMENT ON TABLE  contact_sync_configs IS 'CRM/external system sync configurations. One row per integration per org.';
COMMENT ON COLUMN contact_sync_configs.config IS 'Provider credentials/config. Sensitive fields should be encrypted at rest.';
COMMENT ON COLUMN contact_sync_configs.field_mappings IS 'Array of {source, dest} pairs mapping external fields to contact columns.';
COMMENT ON TABLE  contact_sync_logs IS 'Audit log of each sync run with contact counts and error detail.';
