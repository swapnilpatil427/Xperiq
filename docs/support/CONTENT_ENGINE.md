# Experient Support Content Engine
## Automated Documentation Pipeline: Code → Docs → Live

**Status:** Design  
**Owner:** Documentation Engineering + CrystalOS  
**Companion to:** [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Philosophy

Documentation that requires a human to write it will always lag the code. The solution is not to hire more technical writers — it is to make the code describe itself.

Experient's content engine runs on a single rule: **code artifacts are the source of truth, documentation is a rendered view of that source.** Every route file, every Zod schema, every skill's SKILL.md, every TRACKER.md entry contains structured information that, when processed correctly, produces accurate, useful documentation.

The human role in this pipeline is not writing — it is annotating exceptional cases and approving quality thresholds. Estimated human time per doc page after initial setup: < 2 minutes.

---

## Source Artifacts

Five types of source artifacts feed the content engine:

### 1. Route Files (`backend/src/routes/*.ts`)

Each Express route file contains:
- HTTP method + path
- Zod request schema (input types, required fields, constraints)
- Authentication requirements (via `requireAuth`, `requireRole`)
- Rate limiting (via `apiLimiter`, `aiLimiter`)
- JSDoc comments where they exist

**Output:** API reference pages — one page per route group (surveys, insights, workflows, billing, etc.)

**Example source → output:**

Source: `backend/src/routes/experience.ts` — `POST /api/surveys`  
Output: `docs.experient.ai/api/surveys/create` — complete endpoint reference with:
- Authentication requirements
- Request body parameters (from Zod schema)
- Response structure (from response schema)
- Credit cost
- Rate limits
- Crystal-generated code example (Python + Node.js + curl)

### 2. Zod Schema Files (`backend/src/schemas/*.ts`)

Schema files define the data model for every API surface. The parser extracts:
- Type definitions and their descriptions
- Required vs. optional fields
- Validation constraints (min/max, regex, enum values)
- Nested object structures

**Output:** Data model reference pages and inline schema tables in API docs.

### 3. CrystalOS Skill Files (`crystalos/skills/*/SKILL.md`)

Each skill's SKILL.md contains:
- Purpose statement
- Input/output schema
- Tool declarations and their descriptions
- Evaluation criteria

**Output:** Crystal capabilities reference — what Crystal can and cannot do, organized by skill. This is the honest account of Crystal's abilities that customers need to set expectations correctly.

### 4. TRACKER.md

The work tracker contains:
- Feature status per item (Done, In Progress, Beta, Tested, Planned)
- Sprint organization (current sprint, upcoming)
- Notes on implementation details
- Phase structure (which phase each feature belongs to)

**Output:**
- Status annotations on every doc page (`[Beta]`, `[Building]`, `[Planned]` badges)
- The "What's Coming" roadmap page
- Release notes summaries

**Parsing rules:**
- `✅` or `🧪` → status: `stable` or `tested`
- `🔄` → status: `building`
- `⬜` in current phase → status: `planned`
- `⬜` in future phase → status: `future`
- `⏭️` → status: `skipped` (omit from public docs)
- Lines containing `[internal]` tag → excluded from public output
- Lines containing `[public]` tag → included in roadmap

### 5. Git Log (between main pushes)

The CI pipeline extracts commit messages since the last support site deploy.

**Parsing rules:**
- Commits prefixed `feat(...)` → changelog entry type: Feature
- Commits prefixed `fix(...)` → changelog entry type: Fix
- Commits prefixed `perf(...)` → changelog entry type: Improvement
- Commits prefixed `!` or `BREAKING` → changelog entry type: Breaking Change
- Commits prefixed `docs(...)`, `chore(...)`, `test(...)` → omitted from public changelog

**Output:** Changelog entries — the public record of what shipped and when.

---

## Pipeline Stages

```
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 0: Trigger                                                    │
│                                                                     │
│  Any push to main → GitHub Actions workflow starts                  │
│  `docs/support/.github/workflows/doc-refresh.yml`                  │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 1: Diff Detection                                            │
│                                                                     │
│  `git diff --name-only HEAD~1 HEAD` → list of changed files        │
│                                                                     │
│  Filter to doc-relevant files:                                      │
│  - backend/src/routes/**                                            │
│  - backend/src/schemas/**                                           │
│  - crystalos/skills/**/SKILL.md                                     │
│  - docs/TRACKER.md                                                  │
│                                                                     │
│  If TRACKER.md changed → also trigger roadmap + status re-render   │
│  If any route/schema changed → trigger API ref update               │
│  If any skill changed → trigger Crystal capabilities update         │
│  Always → run git-log extractor for changelog                       │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 2: Extraction                                                │
│                                                                     │
│  For each changed artifact, extract structured data:               │
│                                                                     │
│  Route extractor (TypeScript AST):                                  │
│    → { method, path, auth, schema_ref, rate_limit, tags }           │
│                                                                     │
│  Schema extractor (Zod reflection):                                 │
│    → { fields: [{ name, type, required, description, constraints }]}│
│                                                                     │
│  Skill extractor (Markdown parser):                                 │
│    → { purpose, input_schema, output_schema, tools, evals }        │
│                                                                     │
│  Tracker extractor (Markdown table parser):                         │
│    → { features: [{ id, title, status, sprint, notes, public }] }  │
│                                                                     │
│  Git log extractor:                                                 │
│    → { commits: [{ sha, type, scope, title, body, date }] }        │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 3: AI Enrichment (CrystalOS `doc-writer` skill)             │
│                                                                     │
│  For each extracted artifact:                                       │
│                                                                     │
│  doc-writer skill receives:                                         │
│    - Extracted structured data                                      │
│    - Adjacent test file (as usage examples)                         │
│    - Existing doc (if any) — to preserve stable sections           │
│    - Status from TRACKER.md                                         │
│    - Tone guide (from doc-writer skill's references/)               │
│                                                                     │
│  doc-writer produces:                                               │
│    - Title + description (1-2 sentences)                            │
│    - Parameter table (from schema)                                  │
│    - Code example (3 languages: curl, Node.js, Python)              │
│    - Common errors section (from test file error cases)             │
│    - Related docs links                                             │
│    - Status annotation                                              │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 4: Quality Evaluation                                       │
│                                                                     │
│  crystal-eval skill scores each generated doc:                     │
│                                                                     │
│  Criteria:                                                          │
│  1. Accuracy: no claims that aren't in the source schema/skill     │
│  2. Completeness: all required fields documented                   │
│  3. Code examples: syntactically valid, uses real field names      │
│  4. Clarity: no jargon, no circular definitions                   │
│  5. Status: badge matches TRACKER.md entry                         │
│                                                                     │
│  Score ≥ 0.80 → proceed to Stage 5                                 │
│  Score 0.65-0.79 → flag for human annotation (Stage 4b)           │
│  Score < 0.65 → reject, keep existing doc, create doc_gap issue   │
│                                                                     │
│  Stage 4b: Human Annotation Queue                                  │
│    - Slack notification to #doc-eng channel                        │
│    - Annotator reviews Crystal draft + adds a 1-sentence note      │
│    - Annotated draft re-submitted → goes to Stage 5                │
└────────────────────────────────────┬────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 5: Publish                                                   │
│                                                                     │
│  POST /api/internal/support/refresh-doc with:                      │
│    { doc_key, category, title, body_markdown, status_tag,          │
│      source_file, source_hash, quality_score, crystal_draft }      │
│                                                                     │
│  Backend:                                                           │
│  1. Upsert support_docs row                                        │
│  2. Re-generate pgvector embedding (OpenAI text-embedding-3-small) │
│  3. Invalidate Algolia index entry (if Algolia configured)         │
│  4. Trigger ISR revalidation on support site pages                 │
│                                                                     │
│  For TRACKER.md changes:                                            │
│  5. POST /api/internal/support/refresh-roadmap                     │
│     → Rebuilds roadmap JSON feed                                   │
│     → Updates status tags on existing docs                         │
│                                                                     │
│  For git log:                                                       │
│  6. POST /api/internal/support/ingest-changelog                    │
│     → Inserts new support_changelog rows                           │
│     → Prepends to changelog page                                   │
└────────────────────────────────────────────────────────────────────┘
```

---

## The `doc-writer` Skill

A new CrystalOS skill dedicated to documentation generation.

**Skill path:** `crystalos/skills/doc-writer/`

**Purpose:** Convert structured code artifacts into accurate, readable, customer-facing documentation.

**Input:**
```json
{
  "artifact_type": "route | schema | skill | feature",
  "artifact_data": "...",          // extracted structured data
  "test_examples": "...",          // from adjacent test file
  "existing_doc": "...",           // existing doc if updating
  "status": "stable|beta|building|planned",
  "tone_guide": "...",             // loaded from references/TONE.md
  "doc_key": "...",                // target key
  "related_doc_keys": ["..."]      // for cross-links
}
```

**Output:**
```json
{
  "title": "...",
  "description": "...",
  "body_markdown": "...",
  "status_tag": "...",
  "tags": ["..."],
  "cross_links": [{ "key": "...", "label": "..." }]
}
```

**Tone guide (references/TONE.md):**
- Direct. No marketing language in technical docs.
- Second person: "you" not "the user."
- Present tense: "returns" not "will return."
- Error sections: practical — "If you see X, it means Y. Do Z."
- Status honesty: beta features clearly marked, limitations stated plainly.

---

## Doc Key Convention

Every doc has a unique `doc_key` that determines its URL and cross-link behavior:

```
{category}.{scope}.{action}

Examples:
  api.surveys.create          → /support/api/surveys/create
  api.surveys.list            → /support/api/surveys/list
  skill.crystal-analyst       → /support/crystal/skills/crystal-analyst
  feature.saml-sso            → /support/features/saml-sso
  guide.getting-started       → /support/guides/getting-started
  guide.survey-builder        → /support/guides/survey-builder
  changelog.2026-06           → /support/changelog/2026-06
  roadmap.current             → /support/roadmap
```

---

## Freshness SLA

| Source Change | Target Lag | Mechanism |
|--------------|-----------|-----------|
| Route file change | < 20 minutes | CI trigger on push |
| Schema change | < 20 minutes | CI trigger on push |
| Skill SKILL.md change | < 20 minutes | CI trigger on push |
| TRACKER.md status change | < 10 minutes | CI trigger on push |
| Git log (new commit) | < 30 minutes | CI trigger on push |
| Known issue added | < 5 minutes | Direct API call from issue creator |
| Human annotation | < 2 hours | Slack queue with 2h SLA |

**Total lag from code to live doc: target < 30 minutes on the critical path.**

---

## Stale Detection

A daily cron job (7am UTC) scans `support_docs` for staleness:

```sql
-- Find docs whose source file was modified more recently than the doc was updated
SELECT d.doc_key, d.source_file, d.updated_at
FROM support_docs d
WHERE d.source_file IS NOT NULL
  AND d.updated_at < (
    SELECT last_commit_time 
    FROM file_commit_log 
    WHERE path = d.source_file
  );
```

Stale docs are flagged in the doc health dashboard. If stale for > 24h, a Slack alert fires to `#doc-eng`.

---

## Doc Health Dashboard

Visible to the doc-eng team at `/admin/support/doc-health`:

| Metric | Description |
|--------|-------------|
| Total docs | Count of docs in support_docs |
| Crystal-generated | % with `crystal_draft = true` |
| Human-annotated | % that required human annotation |
| Stale | Docs not updated since source file changed |
| Quality score distribution | Histogram of quality_score values |
| Doc gaps open | Count from support_doc_gaps |
| Coverage | % of routes/skills with a doc |

---

## Bootstrap: First-Run Generation

On first deploy, the pipeline runs against all existing source files (not just changed ones). This is the one-time "generate all docs" run:

```bash
# scripts/bootstrap-docs.sh

# Extract all routes
tsx scripts/extract-routes.ts > /tmp/route-artifacts.json

# Extract all schemas  
tsx scripts/extract-schemas.ts > /tmp/schema-artifacts.json

# Extract all skills
python crystalos/scripts/extract-skills.py > /tmp/skill-artifacts.json

# Parse TRACKER.md
python scripts/parse-tracker.py > /tmp/tracker-state.json

# Parse git log (last 90 days)
git log --since="90 days ago" --format="%H|%s|%b|%ai" > /tmp/git-log.txt

# Submit to content engine
tsx scripts/bootstrap-doc-submit.ts \
  --routes /tmp/route-artifacts.json \
  --schemas /tmp/schema-artifacts.json \
  --skills /tmp/skill-artifacts.json \
  --tracker /tmp/tracker-state.json \
  --gitlog /tmp/git-log.txt
```

Estimated bootstrap time: ~4 hours for all current routes, schemas, and skills. Run once; CI maintains from that point forward.
