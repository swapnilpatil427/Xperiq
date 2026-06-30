# Prism — Source Platforms Catalog

**Status:** Research complete; tiering ratified
**Date:** 2026-06-29
**Owners:** Yuki Tanaka (PM, Connectors), Sara Müller (Staff Eng, Connectors)

> Per source: auth, key endpoints, what exports vs locks, rate limits, extraction mode,
> legal posture/verdict. **The load-bearing columns are *what's locked* (sets customer
> expectations) and *legal posture* (gates whether we may store/AI-process — see
> [`security-compliance.md`](./security-compliance.md)).** Endpoint names/limits are from
> official docs where possible; **[⚠] flags must be re-verified against live docs/account
> before building a connector.** Engine: [`architecture-ingestion.md`](./architecture-ingestion.md).

---

## 0. Two universal truths

1. **Data migrates; intelligence rebuilds.** Raw responses + survey structure +
   contacts/embedded-data export cleanly wherever an API exists. The **proprietary
   intelligence layer** (TA models/taxonomies) and **experience-config layer** (dashboards,
   alerts/workflows, roles/permissions) **never export** — Prism *rebuilds* them.
2. **Reviews are first-party-only.** The only compliant pattern is ingesting properties the
   customer **owns** via per-org OAuth. Third-party review content is near-universally
   **store-prohibited**; Yelp/Trustpilot/G2 **forbid feeding content to AI** without a
   written license. Reviews are gated by `legalPosture`.

---

## 1. Tiering

| Tier | Sources | Why | Mode |
|---|---|---|---|
| **T1 — Enterprise migration** | Qualtrics, Medallia | Highest-value switchers; deepest data gravity | Guided + services |
| **T1 — Self-serve survey** | SurveyMonkey, Typeform, Google Forms | Largest volume; must be zero-touch | Self-serve |
| **T1 — Reviews (owned)** | Google Business Profile, Apple App Store, Google Play, Trustpilot (own) | First-party, compliant, fast "wow" | Self-serve (OAuth) |
| **T2** | Alchemer, Forsta (Confirmit/Decipher), Jotform | Clean APIs / portable formats; smaller base | Self-serve |
| **T2** | CSV / Excel / SPSS / Qualtrics QSF / JSON | Universal fallback; covers everything else | Self-serve (file) |
| **T3 — Display-only** | Google Places, Yelp, TripAdvisor | ToS forbids storage → live widget only | Widget |
| **T3 — Contract-gated** | G2, Capterra/GDM | API/AI only under paid license | Deferred |
| **Excluded** | Glassdoor, Amazon reviews, MS Forms (structure) | No compliant/feasible API path | — |

---

## 2. Per-source essentials

### Qualtrics — *most open, fully self-serve* ✅ flagship
| | |
|---|---|
| **Auth** | `X-API-TOKEN` header **or** OAuth2 `client_credentials` (`/oauth2/token`, space-separated scopes e.g. `read:surveys read:survey_responses manage:users` [⚠ scope list unverified]) |
| **Base/IDs** | `https://{dcId}.qualtrics.com/API/v3/...`; datacenter (`fra1`/`iad1`/`syd1`) in host; Brand+DC ID under Account Settings → Qualtrics IDs |
| **Key endpoints** | `GET /survey-definitions/{id}` (full structure + `?format=qsf`); **responses async 3-step:** `POST /surveys/{id}/export-responses`→`progressId`; poll `GET …/export-responses/{progressId}`→`fileId`; `GET …/{fileId}/file`→ZIP. Formats csv/tsv/spss/json/ndjson/xml. `GET /mailinglists`→`/{id}/contacts` (XM Directory, async export); `GET /distributions?surveyId=` |
| **Exports** | Defs (QSF+JSON), responses, directory contacts + embedded data. NPS native (0–10 + recode); **CSAT/CES NOT native** (scale/matrix; dashboard metrics) → **Prism recomputes** |
| **Locks** | CX/EX dashboards, computed CX metrics, Stats iQ, **Text iQ models/taxonomies** |
| **Rate limits** | brand-wide ~3,000 req/min, concurrency ~50 [⚠ community-sourced; export lower]; 429→backoff; token pagination (`nextPage`/`skipToken`) |
| **Extraction** | async export-poll (responses/directory) + paginated API (defs/distributions). `continuationToken` for incrementals; ⚠ `startDate`/`endDate` filter on survey **start** date |
| **Verdict** | **Best-in-class export.** Serialize large multi-survey jobs (low export limits + concurrency) |

Source: api.qualtrics.com

### Medallia — *closed, account-team-gated* ⚠ guided + services
| | |
|---|---|
| **Auth** | OAuth2 client-credentials, token `https://{instance}.medallia.com/oauth/{company}/token`, **1-hr tokens, per-instance** creds; **provisioning gated** — engage account team (biggest practical blocker) |
| **Data model** | Experience Cloud (MEC); core unit = **signal**; Feedback/Invitation/Profiles; typed Fields (account-specific catalog); org = Units + Users |
| **Key endpoints** | **Query API** (outbound reads) = **GraphQL** `POST https://{instance}-{company}.apis.medallia.com/data/v0/query` (introspectable; filters+aggregates; cursor pagination default 30/**max 100**; needs Query API role). **REST = inbound import only.** History → **SFTP batch** (PS/account-team configured). Sync → **Omni Exporter** webhooks |
| **Exports** | Athena TA per-comment topic/theme/sentiment **outputs ARE retrievable** (tags in exports) → "take the labels, not the labeler" (seeds `taxonomy-mapper`) |
| **Locks** | TA models, dashboards/reports, alerts/workflows/case rules, permission/masking config, survey design as portable spec |
| **Rate limits** | cost-unit based (~3M cost-units/query) [⚠ account-level login-gated] |
| **Extraction** | PS-assisted SFTP (history) + Query API (targeted/incremental) + Omni Exporter (cutover) |
| **Verdict** | **Hard but high-value.** Provisioning first; introspect schema for account-specific field IDs. White-glove flow |

Source: developer.medallia.com

### InMoment — *most closed* ⚠ file/PS + Wootric API
| | |
|---|---|
| **Auth** | Account/PS-mediated feeds; **Wootric** sub-path = OAuth2 (`https://api.wootric.com`) |
| **Key endpoints** | No comprehensive public self-serve REST for defs+responses. Responses historically scheduled **SFTP/CSV** + UI Data Download. **Wootric** REST (`/v1/responses`, `/v1/end_users`, `/v1/declines`) is the most API-accessible part |
| **Exports** | Raw responses + basic metadata (SFTP/CSV) |
| **Locks** | Survey logic, dashboards, **Lexalytics TA models** |
| **Rate limits** | n/a (file/PS) |
| **Extraction** | one-time bulk SFTP/CSV via account team; Wootric path where used |
| **Verdict** | **Hardest.** Lowest research confidence [⚠] |

Source: docs.wootric.com/api

### Forsta (Confirmit + FocusVision) — *best portable formats* ✅ T2 but clean
| | |
|---|---|
| **Auth** | Decipher `x-apikey`; Confirmit SOAP+REST |
| **Key endpoints** | **Decipher:** REST `https://[instance].decipherinc.com/api/v1/`; surveys as **XML (survey.xml) + datamap**; `/surveys/{id}/data` exports CSV/TSV/XLSX/SPSS/JSON/fixed-width/XML. **Confirmit (Horizons):** Dimensions heritage → **DDF (case data) + MDD (metadata)**, **triple-S (.sss)**, SPSS — cleanest portable formats in the catalog |
| **Exports** | Decipher REST + datamap, or DDF+MDD / triple-S / SPSS |
| **Locks** | dashboards, proprietary scripting/logic, Confirmit Genius TA |
| **Rate limits** | [⚠ verify post-rebrand] |
| **Extraction** | paginated REST (Decipher) + portable-format export (Confirmit) |
| **Verdict** | **Good.** [⚠ endpoint paths may differ post-rebrand — verify docs.developer.forsta.com] |

Source: docs.developer.forsta.com

> Survey/form universal pattern: **two calls** — fetch schema (resolve IDs/types), then
> responses, then join. **Conditional logic is the universal pain point (see §3).**

### SurveyMonkey ✅ self-serve
| | |
|---|---|
| **Auth** | OAuth2; scopes `surveys_read`, **`responses_read_detail`** (paid), `contacts_read`; tokens "don't expire" [⚠ newer 90-day policy on some tiers] |
| **Key endpoints** | `GET /v3/surveys/{id}/details` (whole design, one call); `GET /v3/surveys/{id}/responses/bulk` (**ID-only by default**, or **`simple=true`** to inline text — recommended); `/contacts`, `/contact_lists`, `/contact_fields` |
| **Exports** | Responses, contacts (first-class), **quiz/scoring** (`quiz_options`, per-choice `score`). ⚠ key on `family`+`display_type` (sliders/star/smiley/image are base families modified by `display_options`) |
| **Locks** | **Conditional logic essentially NOT exposed** (skip/branching lost); piping not structured |
| **Rate limits** | **120/min and 500/day** (500/day = binding → multi-day paced backfill); `per_page` ≤100 |
| **Extraction** | paginated API; multi-day paced backfill |
| **Verdict** | **Ship self-serve;** flag logic gap |

Source: developer.surveymonkey.com

### Typeform ✅ self-serve
| | |
|---|---|
| **Auth** | OAuth2/PAT; read = `forms:read`+`responses:read`(+`images:read`) |
| **Key endpoints** | `GET /forms/{id}`→`fields[]`,`hidden[]`,`logic[]`,`variables`; `GET /forms/{id}/responses` (answers keyed by `answer.type` — switch on type; filters `since`/`until`, cursor `before`/`after`). Webhooks `form_response` **embed form def + answers** (optional `Typeform-Signature` HMAC) |
| **Exports** | Full structure. **`logic[]` fully exposed — best logic fidelity in catalog.** **`ref`** (stable client key) is the join key for logic/piping/answers — key on `ref`, fall back to `id`. Recall/piping via `{{field:ref}}` |
| **Locks** | logic op/condition model proprietary (fidelity risk); scoring kept as final `calculated.score` if target lacks calc engine |
| **Rate limits** | **2 req/sec per account, shared** Create+Responses [⚠ verify]; ⚠ responses <~30 min old may not appear |
| **Extraction** | paginated/cursor API + optional webhook sync; `file_url`s authenticated → must re-fetch/re-host |
| **Verdict** | **Ship self-serve;** highest-fidelity logic import |

Source: typeform.com/developers

### Google Forms ✅ self-serve (access caveat)
| | |
|---|---|
| **Auth** | OAuth2 read = `forms.body.readonly` + `forms.responses.readonly`. ⚠ **service account reads only forms it owns/shared; cross-org bulk needs domain-wide delegation** (impersonate Workspace user) — main operational hurdle |
| **Key endpoints** | `GET /v1/forms/{id}`→`items[]` (questionItem/questionGroupItem grids/pageBreakItem sections); `GET /v1/forms/{id}/responses` keyed by `questionId` (build map first; values in `textAnswers`; files = Drive refs; incremental `filter: timestamp > N`; `pageSize` ≤5000); push via `forms.watches` (Pub/Sub) |
| **Exports** | Structure + responses; quiz via `settings.quizSettings` + per-question `grading` |
| **Locks** | **Logic partial** — `goToAction`/`goToSectionId` on **RADIO/SELECT choice only** [⚠ enum wording inconsistent] |
| **Rate limits** | `forms.responses.list` "expensive read" → ~180/min/user (binding); **`forms.watches` expire after 7 days → renewal cron** |
| **Extraction** | paginated API + optional Pub/Sub watch (renewed) |
| **Verdict** | **Ship self-serve;** flag partial logic + DWD setup |

Source: developers.google.com/forms/api

### Alchemer (ex-SurveyGizmo) ✅ T2
| | |
|---|---|
| **Auth** | `api_token`+`api_token_secret` or OAuth; **API access enterprise/Full-Access plans only** |
| **Key endpoints** | `GET /v5/survey/{id}` (Survey→Page→Question→Option; NPS/rating/grid/MaxDiff/heatmap/highlighter); `surveyresponse` keyed by question/option IDs + URL vars; per-question **`shown` flag** distinguishes skipped-by-logic vs unanswered (valuable) |
| **Exports** | Structure + responses + `shown` flags |
| **Locks** | piping/repeating (per-instance keying), MaxDiff/heatmap/highlighter shapes, logic on separate rule structures, quiz in separate reads |
| **Rate limits** | **240/min account-level** [⚠ per-day undocumented]; pagination `page`+`resultsperpage` (≤500) |
| **Extraction** | paginated API |
| **Verdict** | **Good T2** (well-documented) |

Source: apihelp.alchemer.com

### Jotform ✅ T2
| | |
|---|---|
| **Auth** | **API key** (header/param) |
| **Key endpoints** | `/form/{id}/questions` (flat **qid-keyed** map; `control_*` types; options pipe-delimited `"A|B|C"`); submissions `answers` keyed by qid (`answer`+`prettyFormat`) |
| **Exports** | Structure + submissions |
| **Locks** | conditional logic in separate conditions/properties (verify `/properties`); composite/matrix need flattening; no native quiz scoring; weak audience API |
| **Rate limits** | **per-day by plan** (1k Starter → 100k Gold → unlimited Enterprise); pagination `limit`(≤1000)/`offset`/`filter` |
| **Extraction** | paginated API |
| **Verdict** | **Good T2** |

Source: api.jotform.com

### Microsoft Forms ❌ structure not API-accessible
| | |
|---|---|
| **Auth** | n/a (no Graph read API) |
| **Key endpoints** | **No official Graph read API** for Forms data (MS-confirmed backlog); only beta usage-reporting (counts). `Forms.read.write` mention is **unverified rumor — do not design against it.** Indirect: **Excel/OneDrive/SharePoint** backing workbook (Graph Excel/Files), **Power Automate** trigger, Purview eDiscovery |
| **Exports** | Response **workbook (CSV/Excel)** only |
| **Locks** | structure/logic/sections/quiz **not recoverable via API** |
| **Rate limits** | n/a |
| **Extraction** | file/export-driven only (ingest workbook); **never cookie-based scrapers** |
| **Verdict** | **Lossy, export-driven.** Set expectations clearly |

Source: learn.microsoft.com/graph

### Files (universal fallback) ✅ self-serve
Covers everything else; lossy sources (MS Forms, InMoment exports) ride this. Same
MAP → DRY-RUN → LOAD pipeline — connector parses to `prism_raw_records` instead of calling
an API. Cursor = byte/row offset for resumability.

| Format | Notes |
|---|---|
| **CSV / Excel (.xlsx)** | Most common. Column-mapping UI; date-format detection; row-per-response or wide/long pivots |
| **SPSS (.sav)** | Value labels + variable metadata (richer than CSV); common Qualtrics/Forsta/Alchemer analyst exports |
| **Qualtrics QSF** | Full survey *definition* (structure + logic) — pairs with response CSV |
| **triple-S (.sss + data)** | Industry interchange (Forsta/Confirmit/Dimensions) — clean structure+data |
| **JSON / NDJSON** | API-style payloads; generic mapping |

### 3. Conditional-logic reality (set expectations in UI)
| Tool | Branching exposure |
|---|---|
| Typeform / Qualtrics | **Full** (proprietary but complete; Qualtrics in `survey-definitions` flow) |
| Google Forms | **Partial** (RADIO/SELECT choice only) |
| Alchemer / Jotform | **Separate** rule structures (importable with work) |
| SurveyMonkey | **Not exposed** — lost unless rebuilt |
| MS Forms | **Lost** |

Prism imports logic where exposed; where not, it **flags the gap in the dry-run** rather
than silently dropping it (Principle 1).

---

## 4. Reviews & public voice — decision matrix (legal posture governs everything)

> Enforcement mechanism (`legalPosture` per connector): [`security-compliance.md`](./security-compliance.md) §6.

| Source | API | Store text? | AI/Crystal? | Verdict |
|---|---|---|---|---|
| **Google Business Profile** (owned, OAuth `business.manage`) | read+reply | ✅ | ✅ | **Ship** — needs Google approval; **default quota 0 until granted** (days–weeks) |
| **Google Places** (any place, ≤5) | read | ❌ Place ID only | ❌ | **Display-only** — Maps terms ban caching review content |
| **Yelp Fusion** (≤3 excerpts, ~160 chars) | read (paid) | ❌ (24h cap) | ❌ **explicit GenAI ban** | **Display-only** unless licensed; 500 calls/day |
| **Trustpilot** (own profile, OAuth) | read+reply | ✅ | ⚠ license | **Ship** for owned profile; confirm AI under data licence |
| **Apple App Store** (own apps, ASC API) | read+reply | ✅ | ✅ | **Ship** — JWT ES256 (.p8); ~3,600/hr [⚠]; RSS = sampling only |
| **Google Play** (own apps) | reply-to-reviews + GCS export | ✅ | ✅ | **Ship** — API ≈ last **7 days & commented only** → **GCS CSV export** for history/rating-only |
| **G2** | real API + syndication | ⚠ contract | ⚠ written waiver | **Deferred** — paid contract + AI waiver required |
| **Capterra / Gartner Digital Markets** | none (embeds) | ❌ | ❌ | **Excluded** (programmatic). G2 now owns GDM (deal ~Feb 2026) — negotiate together |
| **TripAdvisor** (≤5 snippets) | read | ❌ location_id only | ❌ | **Display-only** — caching banned |
| **Glassdoor** | none (enterprise-only/closed) | ❌ | ❌ | **Excluded** — never scrape |
| **Amazon reviews** | none | ❌ | ❌ | **Excluded** — no reviews API; ToS bans scraping |

**Owned-property review connectors** map to the existing `Signal` model
(`sourceType: google_play_review` etc.) + `ReviewSignalMetadata` in
`docs/SURVEY_DATA_MODEL.md`, and support ongoing one-way sync (webhook/poll) — which
discovery confirmed customers want (unlike incumbent survey sync).

---

## 5. Connector build priority (waves)

| Wave | Connectors | Rationale |
|---|---|---|
| **W1** | CSV/Excel + SPSS · Qualtrics · Typeform | Universal fallback + flagship enterprise + best self-serve logic fidelity |
| **W2** | SurveyMonkey · Google Forms · Google Business Profile · Apple ASC · Google Play | High-volume self-serve + first-wow owned reviews |
| **W3** | Medallia · Alchemer · Trustpilot (own) · Forsta | High-value enterprise (services) + clean T2 |
| **W4** | Jotform · QSF/triple-S import · display-only widgets (Yelp/Places/TripAdvisor) | Long tail + compliant live widgets |
| **Deferred** | G2/Capterra (contract) | Pending licensing |
| **Excluded** | Glassdoor, Amazon, MS Forms structure | No compliant/feasible path |

See [`engineering-plan.md`](./engineering-plan.md) for phasing and per-connector DoD.
