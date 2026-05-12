-- Experient local schema
-- Mirrors the SURVEY_DATA_MODEL.md v2.0 in relational form.
-- Run via: supabase db reset

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";   -- pgvector; used by embedding pipeline (future)

-- ── Surveys ───────────────────────────────────────────────────────────────────
CREATE TABLE surveys (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         TEXT        NOT NULL,
  title          TEXT        NOT NULL,
  description    TEXT,
  status         TEXT        NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft','active','paused')),
  survey_type_id TEXT,
  questions      JSONB       NOT NULL DEFAULT '[]',
  created_by     TEXT,
  publish_token  TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  nps_score      NUMERIC,           -- cached from latest insights run
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX surveys_org_id   ON surveys(org_id);
CREATE INDEX surveys_token    ON surveys(publish_token);
CREATE INDEX surveys_status   ON surveys(status);

-- ── Responses ────────────────────────────────────────────────────────────────
CREATE TABLE responses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id      UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  org_id         TEXT        NOT NULL,
  answers        JSONB       NOT NULL DEFAULT '[]',
  nps_score      INT,
  respondent_id  TEXT,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX responses_survey_id ON responses(survey_id);
CREATE INDEX responses_org_id    ON responses(org_id);

-- ── Insights ──────────────────────────────────────────────────────────────────
CREATE TABLE insights (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id           UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  org_id              TEXT        NOT NULL,
  summary             TEXT,
  nps_score           NUMERIC,
  topics              JSONB       DEFAULT '[]',
  sentiment_breakdown JSONB       DEFAULT '{}',
  top_phrases         JSONB       DEFAULT '[]',
  response_count      INT         DEFAULT 0,
  triggered_by        TEXT        DEFAULT 'manual',
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX insights_survey_id ON insights(survey_id);

-- ── Workflows ─────────────────────────────────────────────────────────────────
CREATE TABLE workflows (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  condition     JSONB       NOT NULL DEFAULT '{}',
  action        JSONB       NOT NULL DEFAULT '{}',
  status        TEXT        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','paused')),
  trigger_count INT         NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX workflows_org_id ON workflows(org_id);

-- ── Seed data for dev-org ─────────────────────────────────────────────────────
INSERT INTO surveys (org_id, title, status, survey_type_id, questions, created_by, nps_score) VALUES
(
  'dev-org',
  'Q2 Product Experience Survey',
  'active',
  'nps',
  '[
    {"id":"q1","type":"nps","question":"How likely are you to recommend us to a colleague?","required":true},
    {"id":"q2","type":"multiple_choice","question":"Which area needs the most improvement?","options":["Onboarding","Performance","Features","Support"],"required":true},
    {"id":"q3","type":"open_text","question":"What one change would make you a promoter?","required":false}
  ]'::jsonb,
  'dev-user',
  74
),
(
  'dev-org',
  'Post-Support CSAT Pulse',
  'active',
  'csat',
  '[
    {"id":"q1","type":"rating","question":"Rate your support experience (1–5)","required":true},
    {"id":"q2","type":"open_text","question":"What did our support team do well?","required":false}
  ]'::jsonb,
  'dev-user',
  88
),
(
  'dev-org',
  'Onboarding Friction Audit',
  'draft',
  'onboarding_feedback',
  '[
    {"id":"q1","type":"rating","question":"How easy was the onboarding process?","required":true},
    {"id":"q2","type":"multiple_choice","question":"Where did you get stuck?","options":["Account setup","First project","Integrations","Documentation","Other"],"required":true},
    {"id":"q3","type":"open_text","question":"Describe your biggest friction point","required":false}
  ]'::jsonb,
  'dev-user',
  null
);

-- Seed 12 mock responses for the first survey so the insights page has data
WITH s AS (SELECT id, org_id FROM surveys WHERE title = 'Q2 Product Experience Survey' LIMIT 1)
INSERT INTO responses (survey_id, org_id, answers, nps_score)
SELECT
  s.id,
  s.org_id,
  jsonb_build_array(
    jsonb_build_object('id','a1','type','nps','value', (ARRAY[3,4,5,6,7,7,8,8,9,9,10,10])[gs.n]),
    jsonb_build_object('id','a2','type','multiple_choice','value',(ARRAY['Onboarding','Features','Support','Performance','Onboarding','Features','Support','Onboarding','Features','Performance','Support','Onboarding'])[gs.n]),
    jsonb_build_object('id','a3','type','open_text','value',(ARRAY['Too many steps','Needs better docs','Great product','Slow at times','Confusing nav','Love the UI','Support was fast','Hard to start','Best tool yet','Needs polish','Excellent overall','Onboarding unclear'])[gs.n])
  ),
  (ARRAY[3,4,5,6,7,7,8,8,9,9,10,10])[gs.n]
FROM s, generate_series(1,12) AS gs(n);

-- Seed 3 workflows
WITH org AS (SELECT 'dev-org' AS org_id)
INSERT INTO workflows (org_id, name, condition, action, status, trigger_count, created_by)
SELECT
  org.org_id,
  unnest(ARRAY['Critical Detractor Alert','Feature Request Tagger','Retention Watch']),
  unnest(ARRAY[
    '{"field":"nps","operator":"<","value":"7"}'::jsonb,
    '{"field":"topic","operator":"=","value":"Feature Request"}'::jsonb,
    '{"field":"nps","operator":"<","value":"6"}'::jsonb
  ]),
  unnest(ARRAY[
    '{"type":"email","config":{"to":"support@company.com"}}'::jsonb,
    '{"type":"tag","config":{"tag":"feature-request"}}'::jsonb,
    '{"type":"notify","config":{"team":"customer-success"}}'::jsonb
  ]),
  unnest(ARRAY['active','active','paused']),
  unnest(ARRAY[48, 156, 12]),
  'dev-user'
FROM org;
