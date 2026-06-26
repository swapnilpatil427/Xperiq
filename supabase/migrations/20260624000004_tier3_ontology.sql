-- Tier 3 Phase D: Ontology Layer
-- The semantic bridge between X-data (experience) and O-data (operational).
-- Core insight: X+O fusion is not a JOIN — it requires a shared vocabulary.
-- "Detractor" (NPS) and "Churn Risk" (CRM) are the same phenomenon.
-- The ontology maps these lenses to each other so Crystal can reason across systems.
-- See docs/agent-framework/TIER3_XO_LEGENDARY_DESIGN.md §System 5

-- ── Ontology Nodes ────────────────────────────────────────────────────────────
-- Entity definitions: Customer, Account, Segment, Touchpoint, Driver, Metric,
-- RiskSignal, Action, etc. org_id='' = platform defaults (shipped with Experient).
CREATE TABLE IF NOT EXISTS ontology_nodes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT        NOT NULL DEFAULT '',  -- '' = platform node, viewable by all

    -- Node classification
    category        TEXT        NOT NULL
                        CHECK (category IN ('entity', 'metric', 'signal', 'risk', 'action', 'concept')),

    -- Identity
    label           TEXT        NOT NULL,             -- 'Detractor', 'ChurnRisk', 'NearingRenewal'
    description     TEXT,                             -- human-readable description
    definition      TEXT,                             -- formal definition (e.g. "NPS score 0–6")
    synonyms        TEXT[]      NOT NULL DEFAULT '{}', -- ['Passive Churn', 'At Risk'] etc.

    -- Cross-system references
    x_data_ref      TEXT,                             -- XM concept: 'nps_score' | 'sentiment_score' | 'topic'
    x_data_range    JSONB,                            -- e.g. {"min": 0, "max": 6} for NPS detractor
    o_data_ref      TEXT,                             -- O-data field: 'crm.health_score' | 'billing.arr'

    -- Platform nodes ship with Experient and cannot be deleted by orgs
    platform_node   BOOL        NOT NULL DEFAULT false,

    -- Hierarchy
    parent_id       UUID        REFERENCES ontology_nodes(id) ON DELETE SET NULL,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (org_id, label)
);

CREATE INDEX IF NOT EXISTS ontology_nodes_org_cat_idx ON ontology_nodes (org_id, category);
CREATE INDEX IF NOT EXISTS ontology_nodes_label_idx ON ontology_nodes (label);
CREATE INDEX IF NOT EXISTS ontology_nodes_x_data_ref_idx ON ontology_nodes (x_data_ref) WHERE x_data_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ontology_nodes_synonyms_idx ON ontology_nodes USING gin (synonyms);

COMMENT ON TABLE  ontology_nodes                IS 'Semantic vocabulary layer. Maps XM concepts to O-data signals for Crystal reasoning.';
COMMENT ON COLUMN ontology_nodes.platform_node  IS 'If true: shipped with Experient, readable by all orgs, cannot be deleted.';
COMMENT ON COLUMN ontology_nodes.x_data_range   IS 'Optional NPS/CSAT/CES range that maps to this concept. E.g. {"min":0,"max":6} = detractor.';


-- ── Ontology Edges ────────────────────────────────────────────────────────────
-- Relationships between nodes. Crystal traverses these edges to reason across concepts.
-- Example path: Detractor →[is_instance_of]→ HighChurnRisk →[correlates_with]→ NearingRenewal
CREATE TABLE IF NOT EXISTS ontology_edges (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT        NOT NULL DEFAULT '',

    from_node_id    UUID        NOT NULL REFERENCES ontology_nodes(id) ON DELETE CASCADE,
    to_node_id      UUID        NOT NULL REFERENCES ontology_nodes(id) ON DELETE CASCADE,

    relationship    TEXT        NOT NULL
                        CHECK (relationship IN (
                            'drives',           -- A → causes/influences → B
                            'correlates_with',  -- A ↔ statistically associated with ↔ B
                            'escalates_to',     -- A → triggers escalation to → B
                            'is_instance_of',   -- A → is a specific case of → B (NPS 0–6 is_instance_of Detractor)
                            'requires',         -- A → action requires → B (prerequisite)
                            'signals',          -- A → is an observable signal of → B
                            'resolves'          -- A → action resolves → B (case resolves risk)
                        )),

    -- Relationship strength (0–1). 1.0 = definitional, 0.5 = empirical, 0.3 = inferred
    weight          NUMERIC(4,3) NOT NULL DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),

    -- How this relationship was established
    evidence_type   TEXT        NOT NULL DEFAULT 'manual'
                        CHECK (evidence_type IN ('manual', 'empirical', 'inferred', 'imported')),
    evidence_note   TEXT,                            -- optional: citation or reasoning

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (from_node_id, to_node_id, relationship)
);

CREATE INDEX IF NOT EXISTS ontology_edges_from_idx ON ontology_edges (from_node_id, relationship);
CREATE INDEX IF NOT EXISTS ontology_edges_to_idx ON ontology_edges (to_node_id, relationship);
CREATE INDEX IF NOT EXISTS ontology_edges_org_idx ON ontology_edges (org_id);

COMMENT ON TABLE  ontology_edges               IS 'Semantic relationships between ontology nodes. Crystal traverses these to reason across X+O.';
COMMENT ON COLUMN ontology_edges.weight        IS '0–1 strength. 1.0=definitional, 0.5=empirical (measured), 0.3=inferred (LLM-suggested).';


-- ── Ontology Vocabulary Mappings ──────────────────────────────────────────────
-- Maps external system values → Experient ontology nodes.
-- Example: CRM "Opportunity Stage = Renewal Risk" → Experient "HighChurnRisk" node
-- This is what makes X+O fusion intelligent rather than a simple JOIN.
CREATE TABLE IF NOT EXISTS ontology_mappings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          TEXT        NOT NULL DEFAULT '',

    -- Source: external system + field + value
    source_system   TEXT        NOT NULL,             -- 'crm' | 'helpdesk' | 'billing' | 'usage' | 'custom'
    source_field    TEXT        NOT NULL,             -- 'opportunity_stage' | 'health_score' | 'arr'
    source_value    TEXT,                             -- 'Renewal Risk' | NULL for numeric ranges
    source_range_low  NUMERIC,                        -- for numeric: range start (inclusive)
    source_range_high NUMERIC,                        -- for numeric: range end (exclusive)

    -- Target: ontology node
    target_node_id  UUID        NOT NULL REFERENCES ontology_nodes(id) ON DELETE CASCADE,
    target_label    TEXT        NOT NULL,             -- cached from node (denormalized for query speed)

    -- Optional XM metric range that co-defines this mapping
    nps_range_low   INT,                              -- e.g. 0 = maps NPS ≥0 part of this concept
    nps_range_high  INT,                              -- e.g. 6 = maps NPS ≤6 part of this concept

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Expression-based uniqueness (NULL source_value treated as '') requires a unique
-- index — Postgres does not allow expressions in an inline table UNIQUE constraint.
CREATE UNIQUE INDEX IF NOT EXISTS ontology_mappings_uniq_idx
    ON ontology_mappings (org_id, source_system, source_field, COALESCE(source_value, ''));

CREATE INDEX IF NOT EXISTS ontology_mappings_org_sys_idx ON ontology_mappings (org_id, source_system, source_field);
CREATE INDEX IF NOT EXISTS ontology_mappings_target_idx ON ontology_mappings (target_node_id);

COMMENT ON TABLE  ontology_mappings IS 'Vocabulary bridge: external system values → Experient ontology nodes. The semantic glue for X+O fusion.';


-- ── Platform Ontology Seed Data ───────────────────────────────────────────────
-- The default Experient ontology. All platform_node=true. Cannot be deleted by orgs.

-- Core XM entities
INSERT INTO ontology_nodes (org_id, category, label, description, definition, x_data_ref, x_data_range, platform_node) VALUES
    ('', 'signal',  'Detractor',        'NPS detractor (passive or unhappy respondent)', 'NPS score 0–6', 'nps_score', '{"min": 0, "max": 6}', true),
    ('', 'signal',  'Passive',          'NPS passive (neutral respondent)', 'NPS score 7–8', 'nps_score', '{"min": 7, "max": 8}', true),
    ('', 'signal',  'Promoter',         'NPS promoter (highly satisfied respondent)', 'NPS score 9–10', 'nps_score', '{"min": 9, "max": 10}', true),
    ('', 'risk',    'HighChurnRisk',    'High probability of customer churn or disengagement', NULL, 'nps_score', NULL, true),
    ('', 'risk',    'EscalationRisk',   'Situation likely to escalate if not addressed promptly', NULL, NULL, NULL, true),
    ('', 'risk',    'ComplianceRisk',   'Potential compliance or regulatory exposure', NULL, NULL, NULL, true),
    ('', 'concept', 'NearingRenewal',   'Customer account approaching renewal date', NULL, NULL, NULL, true),
    ('', 'concept', 'ActiveDetractor',  'Detractor who has not yet been contacted for recovery', NULL, 'sentiment_score', NULL, true),
    ('', 'entity',  'Customer',         'An identified external customer or respondent', NULL, NULL, NULL, true),
    ('', 'entity',  'Account',          'A company or organizational unit grouping multiple contacts', NULL, NULL, NULL, true),
    ('', 'entity',  'Segment',          'A cohort of respondents sharing common attributes', NULL, NULL, NULL, true),
    ('', 'entity',  'Touchpoint',       'A specific point of interaction in the customer journey', NULL, NULL, NULL, true),
    ('', 'metric',  'NPS',              'Net Promoter Score', 'Percentage promoters minus percentage detractors', 'nps_score', '{"min": -100, "max": 100}', true),
    ('', 'metric',  'CSAT',             'Customer Satisfaction Score', NULL, 'csat_score', NULL, true),
    ('', 'metric',  'CES',              'Customer Effort Score', NULL, 'effort_score', NULL, true),
    ('', 'action',  'InnerLoopRecovery','Individual detractor recovery action', 'Contact a specific detractor within 48h to understand and resolve their concern', NULL, NULL, true),
    ('', 'action',  'OuterLoopRemediation', 'Systemic issue remediation', 'Fix the root cause driving detractor-level responses at scale', NULL, NULL, true)
ON CONFLICT (org_id, label) DO NOTHING;

-- Core relationships (platform defaults)
-- Detractor → is_instance_of → HighChurnRisk
-- HighChurnRisk → correlates_with → NearingRenewal
-- Detractor → signals → EscalationRisk
-- InnerLoopRecovery → resolves → ActiveDetractor
INSERT INTO ontology_edges (org_id, from_node_id, to_node_id, relationship, weight, evidence_type)
SELECT
    '' AS org_id,
    f.id AS from_node_id,
    t.id AS to_node_id,
    r.relationship,
    r.weight,
    'manual' AS evidence_type
FROM (VALUES
    ('Detractor',           'HighChurnRisk',       'is_instance_of',  1.0),
    ('Passive',             'HighChurnRisk',        'signals',         0.4),
    ('HighChurnRisk',       'NearingRenewal',       'correlates_with', 0.7),
    ('Detractor',           'EscalationRisk',       'signals',         0.8),
    ('Detractor',           'ActiveDetractor',      'is_instance_of',  1.0),
    ('InnerLoopRecovery',   'ActiveDetractor',      'resolves',        0.9),
    ('OuterLoopRemediation','HighChurnRisk',         'resolves',        0.7)
) AS r (from_label, to_label, relationship, weight)
JOIN ontology_nodes f ON f.label = r.from_label AND f.org_id = ''
JOIN ontology_nodes t ON t.label = r.to_label   AND t.org_id = ''
ON CONFLICT (from_node_id, to_node_id, relationship) DO NOTHING;

-- Default vocabulary mappings (NPS ranges)
INSERT INTO ontology_mappings (org_id, source_system, source_field, source_range_low, source_range_high, target_node_id, target_label)
SELECT '', 'xm', 'nps_score', r.low, r.high, n.id, n.label
FROM (VALUES
    (0,  7,  'Detractor'),
    (7,  9,  'Passive'),
    (9,  11, 'Promoter')
) AS r (low, high, label)
JOIN ontology_nodes n ON n.label = r.label AND n.org_id = ''
ON CONFLICT DO NOTHING;
