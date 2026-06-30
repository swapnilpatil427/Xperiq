-- ============================================================================
-- Prism — Continuous-sync (CDC) state + cross-source identity graph (W1)
-- ----------------------------------------------------------------------------
-- Canonical DDL: docs/otherplatforms/migration/architecture-ingestion.md §5 (CDC),
--   §9 (cross-source unification, ADR-026); security-compliance.md §5.8 (I6
--   reversible identity graph).
--
-- Depends on 20260629120000_prism_core_ingestion.sql (prism_connections).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- prism_sync_state — one row per (connection, record_type) (§5).
-- Drives continuous-sync scheduling, freshness SLOs and lag alerts. The sync
-- cursor is per (connection, record_type); PK is (connection_id, record_type).
-- Freshness SLO: push < 5 min; poll < cadence + 1 interval.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prism_sync_state (
  connection_id      UUID NOT NULL REFERENCES prism_connections (id),
  record_type        TEXT NOT NULL,            -- cursor is per (connection, record_type)
  org_id             TEXT NOT NULL,
  capture_mode       TEXT NOT NULL,            -- 'push' | 'poll' | 'push+poll'
  cursor             JSONB,                    -- incremental delta marker (continuationToken/since/...)
  last_event_at      TIMESTAMPTZ,              -- newest source-observed time seen (lag = now - this)
  last_synced_at     TIMESTAMPTZ,              -- last successful append from this stream
  lag_seconds        INTEGER,                  -- materialized for alerting
  freshness_slo_s    INTEGER NOT NULL DEFAULT 300, -- push: 300; poll: cadence + 1 interval
  poll_cadence_s     INTEGER,                  -- adaptive within rate budget; null for pure push
  consecutive_fail   INTEGER NOT NULL DEFAULT 0,   -- drives backoff + circuit-break → alert
  webhook_secret_ref TEXT,                     -- Secret Manager ref for HMAC verify (per-tenant key)
  paused             BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, record_type)
);

CREATE INDEX IF NOT EXISTS prism_sync_state_org_idx
  ON prism_sync_state (org_id);
-- scheduler scan: active streams ordered by staleness
CREATE INDEX IF NOT EXISTS prism_sync_state_due_idx
  ON prism_sync_state (org_id, last_synced_at) WHERE NOT paused;

-- ----------------------------------------------------------------------------
-- prism_identity_edges — reversible cross-source identity graph (ADR-026, I6).
-- Identities are *linked* via evidence edges, NEVER destructively merged, so a
-- link can be un-done (GDPR-safe; keeps DSAR erasure precise and per-source
-- provenance intact). evidence holds the match basis (email/phone/external-id
-- deterministic, or a probabilistic match awaiting confirmation); confidence is
-- 0.0–1.0.
--
-- Deriving xperiq_person_id (documented approach — no destructive merge):
--   The stable xperiq_person_id is the CONNECTED-COMPONENT id over this edge
--   set. Treat each distinct person reference (person_a / person_b) as a graph
--   node and each row as an undirected edge; a person's xperiq_person_id is the
--   canonical (e.g. min-uuid or a dedicated component-label) id of the connected
--   component it belongs to. Compute it incrementally with union-find as edges
--   are confirmed, or batch via a recursive CTE over prism_identity_edges
--   (WITH RECURSIVE walk over person_a/person_b reachability). Because edges are
--   reversible, deleting/under-cutting an edge can SPLIT a component — recompute
--   the affected component's labels rather than mutating rows in place. The
--   resolved id is stamped into lineage like every other node; it is derived,
--   not stored authoritatively here, so a wrong link is correctable without data
--   loss. (Optional materialization can live in a separate view/table later.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prism_identity_edges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  person_a    TEXT NOT NULL,                   -- stable identity_key (email→phone→external-id resolver)
  person_b    TEXT NOT NULL,                   -- the other endpoint of the link
  evidence    JSONB NOT NULL DEFAULT '{}'::jsonb, -- {basis, matched_on, source_platforms, ...}
  confidence  NUMERIC NOT NULL DEFAULT 1.0,    -- 0.0–1.0 (1.0 = deterministic)
  confirmed   BOOLEAN NOT NULL DEFAULT false,  -- probabilistic edges are proposed → confirmed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prism_identity_edges_confidence_chk
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  -- one edge per unordered pair within an org (writer normalizes a <= b)
  CONSTRAINT prism_identity_edges_pair_uq
    UNIQUE (org_id, person_a, person_b)
);

CREATE INDEX IF NOT EXISTS prism_identity_edges_org_a_idx
  ON prism_identity_edges (org_id, person_a);
CREATE INDEX IF NOT EXISTS prism_identity_edges_org_b_idx
  ON prism_identity_edges (org_id, person_b);
