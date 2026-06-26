# Experient Support — External Publishing Pipeline
## How a doc goes from Crystal draft to live on support.experient.ai

**Status:** Design
**Owner:** Documentation Engineering + Backend + Growth
**Companion to:** [PIPELINE_DESIGN.md](./PIPELINE_DESIGN.md) · [ARCHITECTURE.md](../ARCHITECTURE.md) · [DESIGN_PROMPT.md](../DESIGN_PROMPT.md)
**Date:** June 2026

---

## Overview

The internal pipeline (described in PIPELINE_DESIGN.md) handles quality gates for in-app Crystal support: it takes a Crystal-drafted document through 11 states — Queued, Extracting, Drafting, QualityCheck, AutoApproved, PendingReview, RequiresAnnotation, Rejected, Publishing, Live, and Stale — before Crystal can cite it in answers to logged-in Experient users. That pipeline is sufficient for in-app use. A doc that reaches `pipeline_status = 'live'` has passed accuracy evaluation, completeness checks, code snippet validation, and clarity scoring. It is ready for Crystal to cite.

The external pipeline adds a separate and additional layer of gates before any doc can be published to support.experient.ai — the public-facing support site visible to anyone on the internet, indexed by search engines, and accessible to anonymous visitors including prospective customers and enterprise evaluators. The internal and external concerns are deliberately separated because they are different: a doc can be entirely fit for in-app Crystal citation but not ready for public SEO publication. It might use internal jargon ("org-key" instead of "organization API key"), contain a passing reference to a competitor, lack a meta description, or make a performance claim that would be fine in a private help article but constitutes a public warranty on a published web page.

The external pipeline adds three automated gates — Brand Voice Check, Legal Risk Scanner, and SEO Completeness Check — and four new pipeline states on top of the existing 11. The four new states live on a separate `external_status` column so that internal pipeline state and external pipeline state evolve independently: a doc can move from `external_live` back to `external_revision` without that transition touching `pipeline_status = 'live'` at all. These states are described fully in Section 3.

---

## 1. The Two-Pipeline Architecture

The two pipelines share a single document record but serve separate audiences through separate delivery mechanisms, governed by separate quality gates.

**Internal Pipeline** — the existing PIPELINE_DESIGN.md pipeline:
- Source: Postgres `support_docs` table
- Purpose: feeds in-app Crystal support (the `crystal-support` skill)
- Quality gates: `crystal-eval` (accuracy, completeness, code validity, clarity, status badge)
- Output: Live docs available via `/api/internal/support/docs`
- Audience: logged-in Experient users only

**External Pipeline** — the new addition:
- Source: Internal pipeline's Live state (docs that have already passed internal quality)
- Purpose: public publication to support.experient.ai
- Additional quality gates: Brand Voice Check, Legal Risk Scanner, SEO Completeness Check
- Output: Publicly accessible docs served by Next.js ISR from CDN edge
- Audience: anyone on the internet (anonymous visitors, prospective customers, enterprise evaluators)

**One doc, multiple states:**
A doc can be in any combination of:
- Internal only: `pipeline_status = 'live'`, `is_external = false` — in-app Crystal cites it, not publicly searchable
- External only: `pipeline_status = 'live'`, `is_external = true`, `external_status = 'external_live'` — publicly indexed
- Both: same doc, both flags true — most how-to guides and feature docs

The combination of `is_external = true` and `external_status = 'external_live'` is what makes a doc publicly visible. Either flag absent means the doc is not on the public site. This is intentional: the `is_external` flag is the admin's explicit intention signal, and `external_status` reflects where the doc is in the process of fulfilling that intention.

**Database additions to `support_docs`:**

```sql
ALTER TABLE support_docs
  ADD COLUMN is_external            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN external_status        TEXT CHECK (external_status IN (
    'not_submitted', 'external_gating', 'external_approved',
    'external_publishing', 'external_live', 'external_revision',
    'external_legal_review', 'unpublished'
  )) DEFAULT 'not_submitted',
  ADD COLUMN brand_voice_score      FLOAT,    -- 0.0–1.0
  ADD COLUMN legal_risk_score       FLOAT,    -- 0.0–1.0 (lower = safer)
  ADD COLUMN seo_score              FLOAT,    -- 0.0–1.0
  ADD COLUMN external_published_at  TIMESTAMPTZ,
  ADD COLUMN external_unpublished_at TIMESTAMPTZ,
  ADD COLUMN seo_slug               TEXT UNIQUE, -- URL-safe slug for the public URL
  ADD COLUMN meta_description       TEXT,     -- 120–160 chars
  ADD COLUMN og_image_url           TEXT;     -- social share card image URL
```

The score columns (`brand_voice_score`, `legal_risk_score`, `seo_score`) are nullable and remain NULL until ExternalGating has run at least once. The admin UI treats NULL as "not yet evaluated" — distinct from a score of 0. `seo_slug` carries a `UNIQUE` constraint because two docs cannot share a public URL; the constraint is enforced at the database level to prevent collisions even if the application layer is bypassed. `meta_description` and `og_image_url` are populated either by admin edit or by Crystal auto-generation during the SEO gate (see Gate 3).

---

## 2. External Quality Gates

Three automated gates run in parallel when a doc is submitted for external publishing. All three must pass before the doc can transition to `ExternalApproved`. Running them in parallel keeps ExternalGating fast: the combined target duration for all three gates is under 30 seconds, which allows the state machine to give near-real-time feedback without holding the admin's attention.

The gates are implemented as Python modules in `crystalos/lib/`. They are invoked by a gate orchestration handler in the backend (`POST /api/internal/support/docs/:id/external-gate-results`), which is called either by the CI workflow (`crystalos/scripts/check_external_gates.py`) or by the backend directly when an admin sets `is_external = true` via the DocPipelinePage.

---

### Gate 1: Brand Voice Check

**Purpose:** Ensures the doc uses Experient's brand voice — confident, direct, non-corporate — and avoids prohibited phrases.

**Implementation:** `crystalos/lib/brand_voice_checker.py`

**How it works:**

The checker runs two passes. The first is a fast, deterministic rule-based scan; the second is a contextual LLM pass for violations that require understanding surrounding context.

**Pass 1 — Rule-based scanner:**
Checks for prohibited phrases from `BRAND_VOICE.md`. Phrase categories:
- Corporate filler: "leverage", "utilize", "synergize", "best-in-class", "cutting-edge", "state-of-the-art"
- Weakness language: "simply", "just", "easy" (implies that alternatives are hard — an implicit competitor comparison)
- Overpromises: "always", "never fails", "guaranteed", "zero downtime" (unless the phrase appears inside a callout block that explicitly cites an SLA document)
- Passive constructions: "it is recommended that", "it should be noted", "users are advised to"
- Vague quantifiers: "many", "several", "various" (prefer specifics — if specifics are not available, rewrite to avoid the claim entirely)

The rule-based scan uses compiled regex patterns for performance. It records `line_number` for each match so the admin UI can highlight the exact line. Each matched phrase includes a pre-written `suggestion` stored alongside the pattern — the suggestion is used verbatim in the auto-rewrite prompt passed to the `doc-writer` skill.

**Pass 2 — LLM second pass (Crystal Haiku):**
Runs only after the rule-based pass completes. Evaluates:
- Brand voice tone overall: is the doc confident and direct, or hedging and bureaucratic?
- Reading grade level (target: grade 10, Flesch-Kincaid scale). Grade 10 corresponds to a reading ease score of approximately 60–70. Docs that score above grade 12 are flagged.
- Professional warmth: the doc should not read as a legal disclaimer or an academic abstract. It should read as if a knowledgeable colleague wrote it.

The LLM pass is given a structured prompt with the doc content, the brand voice guidelines summary, and the existing rule-based violations. It returns its assessment in JSON, which the checker validates against the expected schema before accepting.

**Returns structured result:**

```python
@dataclass
class BrandVoiceResult:
    score: float           # 0.0–1.0
    violations: list[dict] # [{phrase, line_number, suggestion, severity}]
    grade_level: float     # Flesch-Kincaid
    tone_assessment: str   # 'on-brand' | 'too-formal' | 'too-casual' | 'unclear'
    passed: bool           # score >= 0.80
```

**Score calculation:** Score begins at 1.0. Each violation deducts points based on severity: HIGH deducts 0.15, MEDIUM deducts 0.08, LOW deducts 0.03. The LLM tone assessment also contributes: `too-formal` or `too-casual` deducts 0.10; `unclear` deducts 0.05; `on-brand` deducts 0. Score is floored at 0.0.

**Threshold:** Score ≥ 0.80 to pass automatically.

**On fail:** Doc enters `ExternalRevision` state. Crystal auto-rewrites the flagged sections using the `doc-writer` skill with brand voice constraints active. The rewrite prompt includes: the original section text, the list of violations with their suggestions, and the brand voice guidelines. The rewritten section replaces the original in the doc draft. Retry loop runs ExternalGating again after each auto-fix attempt (max 3 attempts before the doc is routed to human review and admin is notified via the in-app notification system).

**File:** `crystalos/lib/brand_voice_checker.py`
**Called by:** `backend/src/routes/internal-metering.ts` (external gate orchestration endpoint)

---

### Gate 2: Legal Risk Scanner

**Purpose:** Catches language that could create legal liability before it goes public. A doc that makes a performance promise or includes a real email address in a code example is legally harmless in an internal support article but becomes a live public document the moment it is published to support.experient.ai.

**Implementation:** `crystalos/lib/legal_scanner.py`

**What it flags:**

| Category | Examples | Severity |
|----------|----------|----------|
| Performance promises | "Crystal will always answer correctly", "guaranteed uptime" | HIGH |
| Warranty language | "Experient warrants that...", "we guarantee..." | HIGH |
| Competitor mentions | Any named competitor (Qualtrics, Medallia, SurveyMonkey, etc.) | MEDIUM |
| PII examples | Email addresses, phone numbers, real names in code examples | HIGH |
| Regulatory claims | "HIPAA compliant" (if unverified), "certified for..." | HIGH |
| Pricing claims | Specific dollar amounts not matching current pricing page | MEDIUM |
| Future promises | "Coming soon", "will support", "planned" (only in Beta callouts) | LOW |

**How it works:**

**Pass 1 — Regex patterns for each category:**
Fast, deterministic. Competitor names are loaded from a maintained list in `crystalos/data/competitors.txt` (one name per line). PII patterns use standard regex for email format, US/international phone numbers, and common name patterns in code contexts (e.g., `name: "John Smith"` in JSON code blocks). The regex pass is conservative: it flags on any match, including inside code examples, because code examples in public documentation do go on the internet.

**Pass 2 — LLM second pass (Crystal Haiku):**
Handles ambiguous cases that regex cannot resolve, specifically:
- "Is this phrase making an unqualified promise, or is it describing a feature behavior?" (`"Crystal answers your question"` is a feature description; `"Crystal will always answer correctly"` is a promise.)
- "Is this regulatory claim backed by a verifiable statement?" (e.g., `"SOC 2 Type II certified"` is fine if Experient has that certification; `"HIPAA compliant"` requires verification.)
- "Is this pricing claim consistent with the current public pricing page?" (The LLM is given the current pricing page content as context.)

**Returns structured result:**

```python
@dataclass
class LegalScanResult:
    risk_score: float      # 0.0–1.0 (higher = more risky)
    flags: list[dict]      # [{type, text, line_number, severity, suggestion}]
    auto_passable: bool    # risk_score <= 0.20
    requires_legal_review: bool  # any HIGH severity flag
    passed: bool           # risk_score <= 0.20
```

**Risk score calculation:** Score begins at 0.0. Each flag adds to the score based on severity: HIGH adds 0.30, MEDIUM adds 0.12, LOW adds 0.04. Score is capped at 1.0. Note that two HIGH-severity flags alone produce a score of 0.60, which routes to `ExternalLegalReview` regardless of the threshold check.

**Threshold:**
- ≤ 0.20 risk score and no HIGH severity flags: auto-pass, proceed to Gate 3
- 0.21–0.50 risk score (no HIGH flags): `ExternalRevision` with specific suggestions; Crystal attempts auto-fix (removes competitor mentions, replaces real emails with `user@example.com`, softens performance claims)
- > 0.50 risk score OR any HIGH severity flag: `ExternalLegalReview` — mandatory human legal review; Crystal does not attempt auto-fix for HIGH severity items
- **Any single HIGH severity flag immediately routes to `ExternalLegalReview` regardless of overall risk score.** This is a hard override: a doc with a risk score of 0.05 but one HIGH-severity "HIPAA compliant" claim goes to legal review, not auto-pass.

**Legal review process:**

Doc enters `ExternalLegalReview` state. An in-app notification is sent to users with the `legal_reviewer` role (a separate role from `doc_admin` — these are different people). The notification includes the doc title, the number and severity of flags, and a deep link to the review panel.

The reviewer sees:
- The flagged text highlighted in the doc preview with severity indicators
- The suggestion for each flag (what the system proposes to change it to)
- The original context (surrounding 3 lines) for each flag
- Three action buttons: **Approve as-is** (publish with the flagged text unchanged — reviewer accepts legal responsibility), **Approve with edit** (inline editor for the flagged sections — reviewer rewrites and approves in one action), **Reject permanently** (doc cannot be published externally; sets `external_status` back to `not_submitted` and records the rejection reason in `pipeline_events`)

Docs can sit in `ExternalLegalReview` indefinitely — there is no auto-escalation or auto-expiry. The admin dashboard shows a count of pending legal reviews as a badge on the Legal Review queue filter. This count is also included in the weekly doc-ops digest email.

**File:** `crystalos/lib/legal_scanner.py`

---

### Gate 3: SEO Completeness Check

**Purpose:** Ensures the doc is well-structured for search engine indexing before going public. A doc can be accurate and brand-compliant but still not crawlable (no meta description, no structured data, images with empty alt text).

**Implementation:** `crystalos/lib/seo_checker.py`

**Checks performed:**

| Check | Rule | Points |
|-------|------|--------|
| H1 present | Exactly one H1, not the same text as meta description | 15 |
| Meta description | 120–160 characters, contains primary keyword | 20 |
| Keyword in first 100 words | Target keyword appears in opening paragraph | 15 |
| Internal links | At least 2 links to other support.experient.ai pages | 15 |
| Structured data | Valid JSON-LD with `@type: TechArticle` or `HowTo` | 10 |
| Image alt text | All images have non-empty alt attributes | 10 |
| URL slug | seo_slug is set, URL-safe, descriptive (not UUID) | 10 |
| Content length | Minimum 300 words for article pages | 5 |

Total possible points: 100. Score is `points_earned / 100` expressed as a float between 0.0 and 1.0.

**How the checker identifies the primary keyword:** The checker reads the doc's `title` and first `<h2>` to infer the primary keyword phrase using a TF-IDF-style approach on those two fields. The inferred keyword is what it checks for in the meta description and opening paragraph. If no keyword can be inferred (title and first heading are both absent or too short), the doc fails both keyword-related checks.

**How structured data is validated:** The checker parses any `<script type="application/ld+json">` blocks in the doc content. If none exist, the check fails but the checker generates a candidate JSON-LD block (type: `TechArticle`) from the doc metadata (`title`, `meta_description`, `author`, `updated_at`) and includes it in the result's `generated_structured_data` field. The admin or Crystal can apply this generated block during `ExternalRevision`.

**Returns structured result:**

```python
@dataclass
class SEOCheckResult:
    score: float           # 0.0–1.0 (points earned / total possible)
    missing: list[str]     # human-readable descriptions of failing checks
    meta_description: str  # generated if missing, for admin review
    suggested_slug: str    # generated if seo_slug not set
    generated_structured_data: dict  # generated JSON-LD if structured data absent
    passed: bool           # score >= 0.85
```

**Threshold:** ≥ 0.85 to pass (equivalent to ≥ 85 points).

**On fail:** Specific missing items are listed in the `ExternalRevision` state view with actionable descriptions (not just check names — "Add a meta description between 120 and 160 characters containing the phrase 'survey branching logic'", not "meta_description check failed"). Crystal auto-fills: meta description if missing (generated and stored in `generated_meta_description` for admin review before applying), slug if missing (generated from title and stored in `suggested_slug`). Internal links cannot be auto-generated — the system cannot know which other support docs are most relevant. This item is flagged for admin action: the doc will not proceed until a human adds at least 2 internal links. Structured data is auto-generated from doc metadata and applied automatically on retry.

**File:** `crystalos/lib/seo_checker.py`

---

## 3. Extended State Machine

The existing 11-state internal pipeline gains 4 new external states. These states exist only on the `external_status` column — the `pipeline_status` column continues to reflect internal pipeline state unchanged. The two columns evolve independently.

The 4 new states are: `ExternalGating`, `ExternalApproved`, `ExternalPublishing`, `ExternalLive`. The additional values `ExternalRevision`, `ExternalLegalReview`, and `Unpublished` handle exception and termination paths.

```
Internal pipeline completes → pipeline_status = 'live'
                                      │
                         is_external flag set to true
                         (by admin toggle in DocPipelinePage)
                                      │
                                      ▼
                           [ExternalGating]
                    (runs Gates 1, 2, 3 in parallel)
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                  │
              All pass           Brand/SEO fail      Legal HIGH flag
                    │            (Gate 1 or 3)       (any HIGH severity)
                    ▼                 │                  │
          [ExternalApproved]          ▼                  ▼
                    │          [ExternalRevision]  [ExternalLegalReview]
                    │          Crystal auto-fix          │
                    │               │                    ├── Approved
                    │          Retry →                   │      │
                    │          [ExternalGating]          │      ▼
                    │                              [ExternalApproved]
                    ▼                                    │
          [ExternalPublishing]                           └── Rejected
                    │                                          │
                    ▼                                          ▼
            [ExternalLive]                              [Rejected]
                    │                                 (internal pipeline)
            Admin "Unpublish"
                    │
                    ▼
            [Unpublished]
         (returns 404/redirect)
```

**State descriptions:**

**ExternalGating:** Three gates running in parallel. Doc content is not modified during this state — the gates are read-only observers; only ExternalRevision modifies content. Duration target: < 30 seconds for all three gates combined. The state machine transitions out of ExternalGating atomically: it waits for all three gates to complete, then evaluates their combined results to determine the next state. If any single gate times out (> 60 seconds), the transition fails safely: the doc stays in ExternalGating, the timeout is logged in `pipeline_events`, and the admin is notified. The gates will be retried on the next manual trigger or the next CI run.

**ExternalApproved:** All gates passed (or legal review cleared). Doc is queued for ISR publishing. Admin can still review gate scores before the publishing window closes. For docs flagged as `critical` risk tier (a manually-assigned tier in the doc record), a 5-minute review window is enforced: the backend does not call the revalidate endpoint until the window expires or an admin explicitly clicks "Publish now." For non-critical docs, the transition to ExternalPublishing is immediate.

**ExternalPublishing:** Next.js ISR revalidation in progress. Backend has called the revalidate endpoint and is waiting for acknowledgment. Duration: typically < 10 seconds. If the revalidate call fails, the doc stays in ExternalPublishing and a retry is queued (see Section 4: Fallback). The doc does not revert to ExternalApproved on revalidation failure — it stays in ExternalPublishing until the revalidation succeeds or an admin manually resets it.

**ExternalLive:** Doc is publicly live on support.experient.ai. Sitemap updated. Search engines notified. `external_published_at` timestamp set. This is the steady state for published docs. Docs in ExternalLive can be refreshed (internal pipeline regenerates the draft, goes through internal quality gates again, and on reaching `pipeline_status = 'live'` again, triggers a new ExternalGating pass). They can also be unpublished (admin action → `Unpublished`).

**ExternalRevision:** One or more gates failed (but no legal HIGH flag). Crystal is attempting auto-fixes. Admin is notified with a summary of what failed and what Crystal is attempting. Max 3 auto-fix attempts before routing to human: on the third failure, the doc stays in ExternalRevision, Crystal's auto-fix is disabled for this doc, and a `doc_admin` notification is sent describing which checks continue to fail and why. Admin can then edit the doc directly in the pipeline page and manually trigger a new ExternalGating pass.

**ExternalLegalReview:** Legal reviewer must act. Doc cannot be published until legal clears or rejects. No time limit — docs can sit here indefinitely. Admin dashboard shows a count of pending legal reviews as a badge count visible to all `doc_admin` users. Docs in `ExternalLegalReview` are not modified by Crystal. The only permitted write operations are those performed by a `legal_reviewer` through the review action buttons (approve as-is, approve with edit, reject permanently).

**Unpublished:** Admin explicitly removed from public site. Next.js serves 404 or configured redirect. Sitemap entry removed. `external_unpublished_at` timestamp set. To re-publish, admin must set `is_external = true` again — this resets `external_status` to `not_submitted` and triggers a new ExternalGating pass from scratch. Previously passing gate scores are not reused (content may have changed, and the legal/brand standards may have been updated).

---

## 4. ISR Integration

Next.js ISR (Incremental Static Regeneration) is the mechanism that makes docs live on the CDN edge within seconds of the ExternalLive transition, without requiring a full site rebuild.

**Full flow when a doc transitions to ExternalLive:**

1. Backend `pipeline_events` insert records the `external_live` transition with timestamp, doc ID, and triggering user/process
2. Backend calls `POST /api/internal/support/revalidate` — this is a new internal endpoint, protected by `X-Internal-Key` middleware (same middleware used by other internal routes in `backend/src/middleware/internalKey.ts`)
3. Request body: `{ doc_key: string, seo_slug: string, categories: string[] }`
4. Next.js support site handler receives the request, validates the `x-revalidate-token` header against `process.env.NEXT_REVALIDATE_TOKEN`
5. Handler calls `revalidatePath()` for each affected path: the article page, the category index, and the global guides index
6. Also revalidates: `/sitemap.xml` (triggering a fresh query to `GET /api/support/external-docs` and a regenerated XML response)
7. Next.js fetches fresh content from `GET /api/support/docs/:doc_key` (backend public endpoint)
8. New HTML is generated and stored in CDN cache — the old cached version is atomically replaced
9. CDN edge nodes across all regions serve the new HTML within approximately 5 seconds (CDN propagation time)
10. The backend updates `external_status = 'external_live'` and sets `external_published_at = NOW()` only after receiving a successful 200 response from the revalidate endpoint

**Revalidate endpoint implementation:**

```typescript
// backend/src/routes/internal-metering.ts (new handler)
router.post('/support/revalidate', requireInternalKey, async (req, res) => {
  const { doc_key, seo_slug, categories } = req.body;
  const paths = [
    `/guides/${seo_slug}`,
    `/guides`,
    `/sitemap.xml`,
    ...categories.map(c => `/guides/${c}`)
  ];
  
  const revalidateUrl = `${process.env.SUPPORT_SITE_URL}/api/revalidate`;
  await fetch(revalidateUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-revalidate-token': process.env.NEXT_REVALIDATE_TOKEN,
    },
    body: JSON.stringify({ paths })
  });
  
  res.json({ ok: true, revalidated: paths });
});
```

**Support site Next.js handler:**

```typescript
// support-site/app/api/revalidate/route.ts
export async function POST(request: Request) {
  const token = request.headers.get('x-revalidate-token');
  if (token !== process.env.NEXT_REVALIDATE_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { paths } = await request.json();
  await Promise.all(paths.map((path: string) => revalidatePath(path)));
  
  return Response.json({ revalidated: true, paths });
}
```

**Fallback:** If the revalidate call fails (network error, 5xx from the support site), the backend queues a retry with exponential backoff: 3 retries at 5 seconds, 15 seconds, and 45 seconds. Between retries, the doc remains in `ExternalPublishing` state — it does not revert to `ExternalApproved` and does not show as live. Old content remains live on the CDN throughout: ISR means the previous cached version continues serving while revalidation is pending. The site never serves a 404 due to a revalidation failure — the only way a doc 404s is if it was never published (no initial ISR build) or was explicitly unpublished (Section 6). After all 3 retries fail, the doc stays in `ExternalPublishing`, an alert fires to the on-call backend engineer, and an admin notification is sent.

**ISR revalidation token rotation:** `NEXT_REVALIDATE_TOKEN` should be rotated every 90 days. Rotation procedure: generate a new token, update it in both the backend env and the support site env simultaneously, deploy both, verify with a test revalidation call. The old token is invalidated the moment the support site deploys the new value.

---

## 5. Search Engine Notification

After a doc transitions to ExternalLive, the backend fires search engine notifications asynchronously (fire-and-forget with structured logging). Search notification is best-effort: a failure does not block the ExternalLive transition and does not retry automatically beyond the initial attempt. Search engines will discover the doc via sitemap crawl within 24–48 hours regardless.

**Implementation:** Called in the same async function that handles post-revalidation steps, after the revalidate call returns successfully.

**IndexNow (Google + Bing simultaneous):**

IndexNow is a shared protocol supported by both Google and Bing. A single API call to the IndexNow endpoint notifies both search engines' indexing queues simultaneously. This is preferable to separate API calls and avoids the OAuth complexity of Google Search Console's direct submission API.

```typescript
// backend/src/lib/searchNotify.ts
async function notifySearchEngines(docUrl: string): Promise<void> {
  const indexNowKey = process.env.INDEXNOW_API_KEY;
  const payload = {
    host: 'support.experient.ai',
    key: indexNowKey,
    keyLocation: `https://support.experient.ai/${indexNowKey}.txt`,
    urlList: [docUrl]
  };
  
  // IndexNow hits both Google and Bing indexing queues
  const [googleResult, bingResult] = await Promise.allSettled([
    fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }),
    fetch('https://www.bing.com/indexnow', {
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  ]);
  
  // Log results but don't throw — search notification is best-effort
  await logSearchNotification({
    doc_url: docUrl,
    google_status: googleResult.status === 'fulfilled' ? googleResult.value.status : 'failed',
    bing_status: bingResult.status === 'fulfilled' ? bingResult.value.status : 'failed',
    notified_at: new Date().toISOString()
  });
}
```

The `${indexNowKey}.txt` file must be deployed at the root of the support site and must contain only the IndexNow key value as its content. This file proves domain ownership to the IndexNow API. It is a static file checked into the support site repo and does not need to change unless the key is rotated.

**Sitemap update:** The sitemap is regenerated via ISR revalidation (see Section 4). The `/sitemap.xml` page in Next.js is a dynamic route that queries `GET /api/support/external-docs` (a public backend endpoint that returns all docs with `external_status = 'external_live'`) and renders the XML. Revalidating `/sitemap.xml` causes Next.js to re-run that query and regenerate the XML — the new doc's URL appears in the sitemap within the same revalidation cycle as the doc page itself.

**Google Search Console:** IndexNow is the primary notification mechanism. Direct GSC API submission is not implemented (requires OAuth — overkill for this use case, and IndexNow covers the same indexing signal). IndexNow covers Google indexing via the shared protocol as of its 2022 general availability.

**Logging table:**

```sql
CREATE TABLE search_engine_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          UUID NOT NULL REFERENCES support_docs(id),
  doc_url         TEXT NOT NULL,
  google_status   INTEGER,   -- HTTP response code or NULL if failed
  bing_status     INTEGER,
  notified_at     TIMESTAMPTZ DEFAULT NOW(),
  error_message   TEXT
);
```

This table is append-only. Each ExternalLive transition creates a new row. If a doc is unpublished and re-published, a new row is created for the second publication — the history is preserved. The table is used for the "Search Notifications" sub-panel in the DocPipelinePage detail view, and for the search notification section of the weekly doc-ops digest.

---

## 6. Content Rollback

**Trigger:** Admin clicks "Unpublish" on any ExternalLive doc. Requires `doc_admin` role. Cannot be undone automatically — re-publishing requires going through ExternalGating again from `not_submitted`.

**Full rollback sequence:**

1. Admin clicks "Unpublish" button in DocPipelinePage (visible only on docs in `external_status = 'external_live'` or `'external_approved'`)
2. Confirmation dialog appears: "Remove this doc from support.experient.ai? This cannot be undone automatically. To republish, the doc will go through all external gates again." Optional free-text field: "Reason (optional — visible in audit log)."
3. Admin confirms. Backend sets `external_status = 'unpublished'`, `external_unpublished_at = NOW()`, records `pipeline_events` row with `event_type = 'external_unpublished'`, acting user ID, and reason text.
4. Backend calls ISR revalidate for the doc's path and for `/sitemap.xml`
5. Next.js support site article page component checks `external_status` via the backend API at request time for non-cached requests. Revalidated pages now call `notFound()` — Next.js returns a 404 with the custom 404 page (search bar, popular guides, Crystal input)
6. For ISR-cached versions still in CDN: the revalidation clears the CDN cache for the doc's path. New requests immediately receive the 404. Requests in-flight during the revalidation window (< 5 seconds) may still receive the old page — this is acceptable for normal unpublish.
7. Sitemap regenerated: doc URL absent from new `/sitemap.xml`
8. A yellow notice appears in the admin UI: "This doc has been unpublished from support.experient.ai. To request removal from Google's index: [Google URL Removal Tool link]"

**Urgent removal (legal/security issue):** For situations where the doc must be removed immediately (e.g., PII leak discovered, legal emergency), the admin can check "Urgent — disable CDN caching" in the unpublish confirmation dialog. This sets a `Cache-Control: no-store` override via the revalidation endpoint, which instructs Next.js to not cache the 404 response. CDN edge nodes will not serve any cached version of the page after their current TTL expires (typically 30–60 seconds). Urgent removal does not bypass the confirmation dialog — it only changes the caching behavior.

**Google index removal:** The admin UI provides a direct link to the Google Search Console URL Removal Tool pre-filled with the doc URL. This is a manual step — the system cannot submit removal requests without a GSC API OAuth flow, which is out of scope for launch. The link is formatted as: `https://search.google.com/search-console/remove-outdated-content?hl=en` with the doc URL as a query parameter. Admin must have GSC access for `support.experient.ai` to use this tool.

**Bing index removal:** Bing Webmaster Tools content removal is a similar manual process. The Bing URL is: `https://www.bing.com/webmasters/url/removal`. The same yellow notice in the admin UI links to both.

**Rollback audit log:** All unpublish events are recorded in `pipeline_events` with `event_type = 'external_unpublished'`, the acting admin user ID, the timestamp, and the optional reason string. This provides a full audit trail for compliance purposes (e.g., when legal asks "when was this doc removed and who removed it?"). The pipeline_events record is immutable — it cannot be edited or deleted through the application layer.

---

## 7. Analytics Integration

**Primary analytics tool:** Plausible Analytics (self-hosted or cloud)

Selection rationale:
- No cookies required — GDPR-compliant by default for basic page view tracking, no consent banner needed
- No third-party advertising pixels — zero tolerance
- EU data storage option available with Plausible Cloud (data residency in EU for GDPR compliance)
- Script weight: ~1KB (vs. ~45KB for Google Analytics 4) — aligns with Devon's < 600ms FCP requirement
- Open source — auditable, no black-box data collection

**Alternative:** Umami (open source, self-hosted on the same Fly.io infrastructure as the backend). Umami is the fallback if Plausible Cloud pricing becomes prohibitive or if self-hosting is preferred for data sovereignty. Both tools expose the same event tracking API from the frontend perspective — switching between them requires updating only the tracking script and domain references, not the event calls.

**Prohibited tracking (hard requirements, not preferences):**
- No Meta Pixel
- No Google Ads conversion tracking
- No Hotjar / FullStory session recording
- No third-party chat widgets with their own data collection (Intercom, Drift, Zendesk Chat)
- Crystal is the only "chat" surface on the support site

**Tracking events:**

Custom events use Plausible's `plausible()` function with structured props. All props are strings or booleans — no PII, no user IDs, no session identifiers.

```javascript
// In support site — custom Plausible events
plausible('search', { props: { query: searchTerm, has_results: true } });
plausible('crystal_resolved', { props: { resolution: 'yes' | 'no', doc_key: docKey } });
plausible('article_helpful', { props: { helpful: true | false, doc_key: docKey } });
plausible('escalation', { props: { reason: 'crystal_failed' | 'user_initiated' } });
plausible('signup_intent', { props: { source: 'support', ref_doc: docKey } });
```

**Event semantics:**

`search` — fires when a user submits a search query. `query` is the raw search text (not hashed — confirm with legal that this is acceptable given no account linkage). `has_results` indicates whether Crystal or the search index returned any results.

`crystal_resolved` — fires when the user interacts with Crystal's resolution feedback widget (the "Did this answer your question?" control at the bottom of every Crystal response). `resolution: 'yes'` means the user clicked "Yes, this helped." `resolution: 'no'` means the user clicked "No, I need more help." This is the primary signal for Crystal Support Resolution Rate (CSRR).

`article_helpful` — fires when the user interacts with the article-level helpful feedback widget (separate from Crystal's per-response feedback). Tracks whether the static article content (not Crystal's answer) was useful.

`escalation` — fires when the user leaves the support site to seek human support. `crystal_failed` means the user clicked "Contact support" after Crystal gave a resolution: 'no' response. `user_initiated` means the user clicked "Contact support" without any Crystal interaction.

`signup_intent` — fires when the user clicks a CTA linking to the main Experient app. `ref_doc` records which doc triggered the intent signal. Used for support-to-app attribution.

**First-party attribution:**

Anonymous visitor clicks "See what Experient can do →" on the support site. Destination URL includes `?ref=support&doc=[doc_key]`. The app captures this UTM-style parameter at signup (`/sign-up?ref=support&doc=...`) and records `acquisition_source = 'support_site'` and `acquisition_doc_key = [doc_key]` on the new org record. This creates a direct, first-party linkage between support content and product acquisition without third-party tracking cookies.

**Crystal resolution rate tracking (external):**

The external CSRR metric is computed as: `count(crystal_resolved where resolution='yes') / count(crystal_resolved)` for a given time window. This is displayed in the DocPipelinePage analytics panel and in the weekly doc-ops digest. Negative signal: a user escalates immediately after Crystal answers — this is captured by firing `crystal_resolved: 'no'` followed immediately by `escalation: 'crystal_failed'`. The temporal proximity of these two events is meaningful but the frontend does not need to correlate them — the sequence itself appears in the event stream.

---

## 8. CI/CD Changes

The existing `.github/workflows/doc-refresh.yml` gains new steps for external publishing. These steps run conditionally — only when the changed docs include docs with `is_external = true`.

**Updated workflow structure:**

```yaml
# .github/workflows/doc-refresh.yml (additions)
jobs:
  doc-refresh:
    steps:
      # ... existing steps (extract, draft, eval) ...
      
      - name: Check external gates (for is_external docs)
        if: env.HAS_EXTERNAL_DOCS == 'true'
        run: |
          cd crystalos
          python scripts/check_external_gates.py \
            --doc-ids ${{ env.CHANGED_EXTERNAL_DOC_IDS }} \
            --backend-url ${{ secrets.BACKEND_URL }} \
            --internal-key ${{ secrets.INTERNAL_API_KEY }}
        
      - name: Notify search engines (for newly external_live docs)
        if: env.HAS_NEW_EXTERNAL_LIVE_DOCS == 'true'
        run: |
          cd crystalos
          python scripts/notify_search_engines.py \
            --doc-ids ${{ env.NEW_EXTERNAL_LIVE_DOC_IDS }} \
            --support-site-url ${{ secrets.SUPPORT_SITE_URL }} \
            --indexnow-key ${{ secrets.INDEXNOW_API_KEY }}
```

The `HAS_EXTERNAL_DOCS` and `CHANGED_EXTERNAL_DOC_IDS` environment variables are set by the existing extract step, which is extended to query `SELECT id FROM support_docs WHERE id = ANY($1) AND is_external = true` against the list of doc IDs being refreshed in this run.

**New scripts:**

**`crystalos/scripts/check_external_gates.py`**

Called with `--doc-ids` (comma-separated UUIDs), `--backend-url`, and `--internal-key`. For each doc ID:
1. Fetches the doc content via `GET /api/internal/support/docs/:id` (authenticated with `X-Internal-Key`)
2. Runs `BrandVoiceChecker`, `LegalScanner`, and `SEOChecker` in parallel (using `asyncio.gather`)
3. Posts the combined results to `POST /api/internal/support/docs/:id/external-gate-results` with the three result objects and the combined pass/fail decision
4. Backend endpoint updates the score columns and transitions `external_status` accordingly

Exit behavior:
- Exits 0 (success) even if gates fail — gate failures are expected outcomes handled by the state machine, not CI failures. A failing gate should not block the CI run or appear as a red check in GitHub.
- Exits 1 only if the gate scripts themselves error (infrastructure failure: Python import error, network timeout fetching doc content, backend API returning 5xx)
- Exits 2 if authentication fails (invalid internal key) — this is a configuration error and should block CI to alert the team

**`crystalos/scripts/notify_search_engines.py`**

Called with `--doc-ids` (comma-separated UUIDs of newly ExternalLive docs), `--support-site-url`, and `--indexnow-key`. For each doc ID:
1. Fetches `seo_slug` and `external_published_at` from backend
2. Constructs the canonical public URL: `{support_site_url}/guides/{seo_slug}`
3. Calls IndexNow for both Google and Bing endpoints
4. Logs results to `search_engine_notifications` table via `POST /api/internal/support/search-notifications` (internal key protected)

Always exits 0 (best-effort — search notification failure should not block CI).

**New environment variables needed** (add to `.env.example` and `docs/ENV_VARS.md`):

```bash
INDEXNOW_API_KEY=           # IndexNow API key from indexnow.org
SUPPORT_SITE_URL=           # https://support.experient.ai
NEXT_REVALIDATE_TOKEN=      # Secret token for ISR revalidation endpoint
PLAUSIBLE_SITE_ID=          # support.experient.ai (Plausible analytics)
PLAUSIBLE_API_URL=          # https://plausible.io or self-hosted URL
```

All five must be added to:
- `backend/.env.example` — `INDEXNOW_API_KEY`, `SUPPORT_SITE_URL`, `NEXT_REVALIDATE_TOKEN`, `PLAUSIBLE_API_URL`
- `app/.env.example` — `VITE_PLAUSIBLE_SITE_ID`, `VITE_PLAUSIBLE_API_URL` (for admin Plausible dashboard link, not tracking)
- Support site `.env.example` (new file when support site repo is created) — `NEXT_REVALIDATE_TOKEN`, `NEXT_PUBLIC_PLAUSIBLE_SITE_ID`, `NEXT_PUBLIC_PLAUSIBLE_API_URL`, `BACKEND_URL`, `INTERNAL_API_KEY`
- `docs/ENV_VARS.md` — canonical descriptions for all five keys with expected format and rotation policy

---

## 9. Admin UI Changes

The `DocPipelinePage` at `/admin/support` gains new columns and controls for external publishing. All new controls are gated behind `role: doc_admin`. New UI text strings go through `locales/en.ts` as always.

**New column: "External" toggle**

Appears on every doc row in the admin queue as a toggle switch (indigo background when on, gray when off). The toggle appears regardless of `pipeline_status` — an admin can set `is_external = true` on a doc before it reaches `live` (the ExternalGating run will be queued but will not execute until `pipeline_status = 'live'`). This allows pre-tagging a doc for external publishing during the internal pipeline run.

State transitions triggered by the toggle:
- Off → On: if `pipeline_status = 'live'`, starts ExternalGating immediately. If `pipeline_status != 'live'`, sets `is_external = true` and `external_status = 'not_submitted'` — gating will run automatically when the internal pipeline completes.
- On → Off: triggers Unpublish flow if `external_status = 'external_live'` or `'external_approved'` (confirmation dialog required — see Section 6). For all other external states, simply sets `is_external = false` and `external_status = 'not_submitted'` without going through the full unpublish sequence.

**External status badge (separate from pipeline_status)**

Shown as a second badge on each doc row alongside the existing internal `pipeline_status` badge. The external badge is only shown when `is_external = true`.

Badge states and styles:
- `not_submitted`: gray chip, "Not External"
- `external_gating`: indigo animated chip (spinner icon), "Checking gates..."
- `external_revision`: amber chip (pencil icon), "Needs revision"
- `external_legal_review`: red chip (alert icon), "Legal review"
- `external_approved`: light green chip (checkmark icon), "Approved"
- `external_publishing`: indigo chip (upload icon), "Publishing..."
- `external_live`: green chip with globe icon, "Live externally"
- `unpublished`: gray chip with strikethrough text, "Unpublished"

**Gate scores: 3 mini badges**

Once ExternalGating has run at least once, three mini score badges appear inline in the doc row immediately after the external status badge. These replace "N/A" placeholders for docs that have not been through gating yet.

Badge layout (left to right): Voice, Legal, SEO.

Score badge color logic:
- Voice (≥ 0.80 = green, 0.60–0.79 = amber, < 0.60 = red). Displayed as "Voice 87%"
- Legal (≤ 0.20 = green, 0.21–0.50 = amber, > 0.50 = red — note inverted: lower is safer). Displayed as "Legal OK" for green, "Legal 38%" for amber, "Legal HIGH" for red with any HIGH severity flag.
- SEO (≥ 0.85 = green, 0.70–0.84 = amber, < 0.70 = red). Displayed as "SEO 91%"

Each badge is clickable — clicking opens a slide-out detail panel showing the full gate result: violation list with highlighted text, line numbers, suggestions, and (for SEO) the list of specific missing items with actionable descriptions. The panel also includes a "Re-run gate" button for re-running an individual gate without triggering full ExternalGating.

**"Legal Review" escalation button**

Visible to `doc_admin` users on docs in any external state except `external_legal_review` (it's already there) and `not_submitted`. Styled as a red ghost button: "Flag for Legal Review."

On click: Confirmation dialog: "This will pause external publishing and require legal team review. Continue?" Two buttons: "Cancel" and "Flag for Review" (red).

On confirm: Backend sets `external_status = 'external_legal_review'` regardless of current gate scores, records `pipeline_events` row with `event_type = 'manual_legal_flag'`, and sends in-app notification to `legal_reviewer` role users.

This button exists because the automated legal scanner can miss context-specific issues that a human reader catches — an admin who reads a doc and feels uneasy about its claims should be able to route it to legal with one click, without having to argue about whether the scanner's score justified it.

**Keyboard shortcuts (in Focus Mode):**

These shortcuts operate on the currently focused doc row in the admin queue. Focus Mode is the existing keyboard-driven review interface described in PIPELINE_DESIGN.md.

- `X`: toggle `is_external` flag on current doc (with same confirmation logic as the toggle switch)
- `G`: manually trigger ExternalGating re-run (only available when `external_status` is not `external_gating` or `external_publishing`)
- `L`: flag for legal review (same action as the "Flag for Legal Review" button; requires `doc_admin` role)

---

## 10. Launch Checklist for External Publishing

This checklist must be completed before the first external article goes live. Each item has an owner. Items are grouped by domain. All items must be checked off and signed by the relevant owner before the first doc transitions to ExternalLive in production.

**Legal & Compliance**
- [ ] Privacy Policy written, reviewed by legal, published at /legal/privacy
- [ ] Terms of Service written, reviewed by legal, published at /legal/terms
- [ ] Cookie Policy written and published at /legal/cookies
- [ ] DPA available for download at /legal/dpa
- [ ] Security page live at /legal/security with SOC 2 report download gate
- [ ] Crystal AI disclosure text approved by legal (used in "AI-drafted" badge copy)
- [ ] "AI-drafted" badge verified to display on all Crystal-generated articles
- [ ] Cookie consent banner tested in EU region (use VPN to verify GDPR behavior)
- [ ] Contact email for legal/privacy inquiries set up: legal@experient.ai
- [ ] GDPR Data Subject Access Request process documented (internal runbook + /legal/privacy section)

**SEO & Search**
- [ ] robots.txt verified: allows all crawlers except /admin/*, /api/*, /_next/
- [ ] sitemap.xml generating correctly from ExternalLive docs
- [ ] Google Search Console: ownership verified (DNS TXT record or file method)
- [ ] Bing Webmaster Tools: set up and verified
- [ ] IndexNow API key generated and `${key}.txt` file deployed at root of support site
- [ ] Canonical URLs verified: no duplicate content (www vs. non-www redirects set up)
- [ ] hreflang tags set up for EN/ES/DE/FR language variants
- [ ] Structured data (JSON-LD) tested in Google Rich Results Test for sample articles
- [ ] Core Web Vitals baseline measured (Lighthouse CI in GitHub Actions)

**Analytics & Tracking**
- [ ] Plausible (or Umami) installed on support site and verified (check Plausible dashboard for first page view)
- [ ] No third-party advertising pixels verified (check Network tab in DevTools)
- [ ] Crystal resolution rate event tracking tested (`crystal_resolved` events appear in Plausible)
- [ ] First-party attribution `?ref=support` parameter passing verified end-to-end

**Technical**
- [ ] og:image social card generation tested (share a support.experient.ai URL on Twitter/LinkedIn — verify preview image renders)
- [ ] 404 page designed and live (includes search bar, links to popular guides, Crystal input)
- [ ] 503 / maintenance page designed and tested
- [ ] Security headers verified: CSP, HSTS, X-Frame-Options, X-Content-Type-Options (use securityheaders.com)
- [ ] ISR revalidation flow tested end-to-end (publish a test doc, verify it goes live within 10 seconds)

**Brand Voice & Legal Gates**
- [ ] All brand voice prohibited phrases encoded in `crystalos/lib/brand_voice_checker.py` (reviewed against BRAND_VOICE.md)
- [ ] Legal scanner regex patterns reviewed by Dr. Mori (legal) before first production run
- [ ] SEO gate checklist verified against Google's documentation best practices

---

## Data Flow Summary

```
Doc in internal pipeline_status = 'live'
        │
        │ Admin sets is_external = true
        ▼
external_status = 'external_gating'
        │
        │ Gates run in parallel (< 30 seconds)
        ├── brand_voice_checker.py (score ≥ 0.80 to pass)
        ├── legal_scanner.py (risk_score ≤ 0.20 to auto-pass)
        └── seo_checker.py (score ≥ 0.85 to pass)
        │
        │ All pass → external_status = 'external_approved'
        │                     │
        │           Revalidate endpoint called
        │                     │
        │           external_status = 'external_publishing'
        │                     │
        │           ISR regenerates page on CDN (< 10s)
        │                     │
        │           external_status = 'external_live'
        │           external_published_at = NOW()
        │                     │
        │           Search engines notified (IndexNow)
        │           Sitemap updated
        │
        ├── Brand/SEO fail → external_status = 'external_revision'
        │                     Crystal auto-fix → retry → 'external_gating'
        │                     (max 3 attempts before human intervention)
        │
        └── Legal HIGH flag → external_status = 'external_legal_review'
                              legal_reviewer acts → 'external_approved' or 'rejected'
```
