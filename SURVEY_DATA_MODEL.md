# Experient Feedback Intelligence Data Model

**Version:** 2.0  
**Date:** 2026-05-11  
**Status:** Design — Pre-implementation  
**Change from v1.0:** Expanded from survey-only model to full feedback intelligence platform. Added Signal collection (audio, video, social, call data), MediaAsset sub-collection, AI enrichment pipeline, Education/University survey types, and unified cross-channel analytics architecture.

---

## Table of Contents

1. [Storage Architecture](#1-storage-architecture)
2. [Firestore Collection Hierarchy](#2-firestore-collection-hierarchy)
3. [Survey Document](#3-survey-document)
4. [Feedback Source Configuration](#4-feedback-source-configuration)
5. [Question Types](#5-question-types)
6. [Question Schema](#6-question-schema)
7. [Block & Page Schema](#7-block--page-schema)
8. [Logic & Branching](#8-logic--branching)
9. [Embedded Data Fields](#9-embedded-data-fields)
10. [Distribution Channel Schema](#10-distribution-channel-schema)
11. [Response Document](#11-response-document)
12. [Answer Schema](#12-answer-schema)
13. [Signal Document](#13-signal-document)
14. [Media Asset Document](#14-media-asset-document)
15. [AI Enrichment Pipeline](#15-ai-enrichment-pipeline)
16. [Contextual Enrichment Data](#16-contextual-enrichment-data)
17. [Respondent Identity Schema](#17-respondent-identity-schema)
18. [Quality Signals](#18-quality-signals)
19. [Analytics & Aggregates](#19-analytics--aggregates)
20. [Multilingual Support](#20-multilingual-support)
21. [Firestore Indexes](#21-firestore-indexes)
22. [Migration from v1.0 Schema](#22-migration-from-v10-schema)
23. [Key Design Decisions](#23-key-design-decisions)

---

## 1. Storage Architecture

Four-tier architecture — survey responses and signals each have dedicated ingestion paths, but share a unified analytics layer:

```
┌─────────────────────────────────────────────────────────────────────┐
│  FIRESTORE (Operational)                                            │
│  • Survey definitions, drafts, settings                             │
│  • Live response ingestion (write-optimized)                        │
│  • Signal ingestion: audio/video metadata, social posts, call logs  │
│  • Real-time aggregates cache (denormalized)                        │
│  • Respondent profiles, contact lists                               │
│  Documents ≤ 1 MiB each — subcollections for anything fan-out       │
└─────────────────────────────────────────────────────────────────────┘
         │  Firebase BigQuery Extension (streaming — both collections)
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BIGQUERY (Analytics)                                               │
│  • responses table — all survey submissions, streamed in real-time  │
│  • signals table — all non-survey feedback (audio, social, calls)   │
│  • feedback_items VIEW — UNION ALL of responses + signals, unified  │
│    cross-channel analytics with source_type discriminator           │
│  • AI/ML feature pipelines: sentiment trends, topic clustering,     │
│    driver analysis, anomaly detection                               │
│  • Long-term retention (never purged from BQ)                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  FIREBASE STORAGE (Binaries)                                        │
│  • Audio recordings: call recordings, voicemails, audio uploads     │
│    Path: orgs/{orgId}/signals/{signalId}/audio.{ext}                │
│  • Video recordings: video feedback, screen recordings, interviews  │
│    Path: orgs/{orgId}/signals/{signalId}/video.{ext}                │
│  • Survey file-upload answers (images, documents)                   │
│    Path: orgs/{orgId}/responses/{responseId}/{questionId}/{file}    │
│  • Survey branding assets, background images, logos                 │
│  • Heatmap canvases, signature images                               │
│  • Import/export payloads (CSV, SPSS, JSON exports)                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  SIGNAL INGESTION ADAPTERS (Cloud Functions)                        │
│  • Social listeners: Twitter/X stream, Reddit monitor               │
│  • Review scrapers: App Store, Google Play, G2, Glassdoor           │
│  • CRM sync connectors: Salesforce, HubSpot, Zendesk, Intercom     │
│  • Call platform webhooks: Gong, Chorus, Zoom Phone, Twilio         │
│  • Audio/video transcription: Google Speech-to-Text / Whisper API   │
│  Each adapter normalizes to the Signal schema before writing to     │
│  Firestore — pipeline is source-agnostic from Firestore onward      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Firestore Collection Hierarchy

```
orgs/{orgId}/
  surveys/{surveyId}                    ← Survey definition (≤ 200 KB target)
    questions/{questionId}              ← Overflow: use when survey has > 30 questions
    responses/{responseId}              ← One doc per submission
    aggregates/{metricKey}              ← Denormalized live stats cache
    insights/{insightId}                ← AI-generated analysis results (survey-level)
    distributions/{distributionId}      ← Email/SMS/link/embed campaigns
    translations/{locale}               ← Non-default locale strings

  signals/{signalId}                    ← Universal feedback unit (audio/video/social/call)
    mediaAssets/{assetId}               ← Audio/video file metadata + transcript

  signalIngestionJobs/{jobId}           ← Tracks bulk imports and social listener jobs

  insights/{insightId}                  ← Org-level cross-channel synthesized insights

  respondents/{respondentId}            ← Known respondent profiles (CRM-like)
  contactLists/{listId}                 ← Upload lists for targeted distribution
  themes/{themeId}                      ← Reusable brand themes across surveys
  embeddedDataDefs/{fieldId}            ← Org-wide embedded data field definitions
```

---

## 3. Survey Document

```typescript
interface Survey {
  // Identity
  id: string;
  orgId: string;
  workspaceId?: string;
  createdBy: string;
  ownedBy: string;

  // Display
  title: LocalizedString;
  description?: LocalizedString;
  internalName?: string;
  tags?: string[];

  // Type & Category
  surveyType: SurveyType;
  category?: SurveyCategory;
  methodology?: SurveyMethodology;

  // Structure
  blocks: Block[];
  embeddedDataFields: EmbeddedDataField[];
  variables: SurveyVariable[];

  // Presentation
  theme: SurveyTheme;
  settings: SurveySettings;
  completionMessage?: LocalizedString;
  redirectUrl?: string;
  progressBarStyle?: 'bar' | 'none' | 'percentage';
  questionNumbering?: 'auto' | 'none';

  // Distribution & Access
  publishToken: string;
  status: SurveyStatus;
  accessControl: SurveyAccessControl;
  quota?: ResponseQuota;

  // Response collection
  responseSettings: ResponseSettings;
  enrichmentConfig: EnrichmentConfig;

  // Timestamps
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt?: Timestamp;
  closedAt?: Timestamp;

  // Versioning
  version: number;
  publishedVersion?: number;

  // AI metadata
  aiGenerated?: boolean;
  aiPrompt?: string;
  aiModel?: string;

  // Analytics cache (denormalized)
  stats: SurveyStats;
}

type SurveyType =
  // ── Customer Experience ──────────────────────────────────────────
  | 'nps'                   // Net Promoter Score (0-10 likelihood to recommend)
  | 'nps_relational'        // Annual/periodic NPS (vs transactional)
  | 'csat'                  // Customer Satisfaction Score
  | 'ces'                   // Customer Effort Score
  | 'voc'                   // Voice of Customer (general CX)

  // ── Employee Experience ──────────────────────────────────────────
  | 'enps'                  // Employee NPS
  | 'pulse'                 // Short, frequent check-in (weekly/bi-weekly)
  | 'engagement'            // Annual engagement survey (Gallup Q12-style)
  | 'exit_interview'        // Offboarding feedback
  | '360_feedback'          // Multi-rater feedback (manager, peer, direct report)
  | 'onboarding_feedback'   // New hire experience (30/60/90 day)
  | 'manager_effectiveness' // Manager performance feedback (upward feedback)
  | 'dei_climate'           // Diversity, equity, and inclusion climate survey
  | 'wellbeing'             // Employee mental health and wellbeing check-in

  // ── Education / University ───────────────────────────────────────
  | 'course_evaluation'     // End-of-term student rating of course and instructor
  | 'student_satisfaction'  // Periodic student experience (campus, services, housing)
  | 'institutional_research'// Formal academic/IRB/accreditation research
  | 'peer_assessment'       // Student-to-student peer review (multi-rater, academic)
  | 'learning_outcomes'     // Pre/post knowledge or competency assessment
  | 'alumni_engagement'     // Post-graduation feedback, giving campaigns, career outcomes
  | 'faculty_feedback'      // Student feedback on faculty (separate from course eval)
  | 'program_evaluation'    // Degree program or curriculum review

  // ── Product & Market ─────────────────────────────────────────────
  | 'pmf'                   // Product-Market Fit (Sean Ellis test)
  | 'feature_request'       // Feature prioritization / feedback
  | 'usability'             // Usability / UX testing
  | 'concept_test'          // New concept/idea validation
  | 'brand_tracking'        // Brand health metrics
  | 'competitive'           // Competitive benchmarking

  // ── Research ─────────────────────────────────────────────────────
  | 'market_research'       // General market research
  | 'academic'              // Academic / IRB research (non-institutional)
  | 'conjoint'              // Conjoint analysis / choice-based trade-off studies
  | 'maxdiff'               // Maximum Difference Scaling (best-worst)
  | 'opinion_poll'          // Public opinion / political polling
  | 'longitudinal'          // Multi-wave panel study (same cohort, multiple points)
  | 'diary_study'           // Repeated self-report over time (daily/weekly diary)

  // ── Healthcare & Life Sciences ───────────────────────────────────
  | 'patient_satisfaction'  // HCAHPS-style patient experience
  | 'clinical_outcomes'     // PRO/patient-reported outcome measures
  | 'hcp_feedback'          // Healthcare provider / staff feedback

  // ── Operational ──────────────────────────────────────────────────
  | 'kiosk'                 // In-person kiosk (no respondent auth)
  | 'intercept'             // Website/app intercept popup
  | 'in_product'            // Embedded in product (logged-in users)
  | 'post_transaction'      // Post-purchase / post-support
  | 'event_feedback'        // Conference/webinar/event feedback
  | 'quiz'                  // Quiz with scoring
  | 'registration'          // Event/waitlist registration form
  | 'custom';               // Fully custom / no predefined type

type SurveyStatus = 'draft' | 'published' | 'paused' | 'closed' | 'archived';

type SurveyMethodology =
  | 'transactional'         // Triggered by a specific event (purchase, support call)
  | 'relational'            // Periodic relationship pulse (quarterly, annual)
  | 'always_on'             // Continuously open, ongoing collection
  | 'one_time'              // Single wave, fixed window
  | 'longitudinal'          // Same panel across multiple waves
  | 'diary'                 // Repeated self-report, same respondents over time
  | 'experimental';         // A/B or randomized controlled design

type SurveyCategory =
  | 'cx'                    // Customer Experience
  | 'ex'                    // Employee Experience
  | 'education'             // Education / University
  | 'product'               // Product & UX Research
  | 'market_research'       // Market & Consumer Research
  | 'academic'              // Academic / Scientific Research
  | 'healthcare'            // Healthcare & Life Sciences
  | 'operational'           // Operational / Event / Kiosk
  | 'other';

interface SurveyStats {
  totalResponses: number;
  completeResponses: number;
  partialResponses: number;
  averageCompletionTimeMs?: number;
  lastResponseAt?: Timestamp;
  npsScore?: number;
  csatScore?: number;
  completionRate?: number;
  linkedSignalCount?: number;           // Signals linked to this survey (cross-channel)
}
```

---

## 4. Feedback Source Configuration

A `FeedbackSource` is the configuration record for a non-survey data ingestion channel (social listener, call integration, CRM sync, etc.). It lives at the org level and drives the ingestion adapters that write `Signal` documents.

```typescript
interface FeedbackSource {
  id: string;
  orgId: string;
  name: string;                         // Human-readable label ("Gong Calls", "G2 Reviews")
  type: FeedbackSourceType;
  status: 'active' | 'paused' | 'error' | 'disconnected' | 'pending_auth';

  // Optional link to a survey (e.g. post-call survey campaign)
  linkedSurveyId?: string;
  tags?: string[];

  // Auth credentials (stored encrypted, never returned to client)
  credentialRef?: string;               // Ref to Secret Manager secret ID

  // Source-specific configuration (type-specific fields only)
  config: FeedbackSourceConfig;

  // What AI enrichment to apply to signals from this source
  enrichmentConfig: SignalEnrichmentConfig;

  // Ingestion stats
  stats: {
    totalSignals: number;
    lastSignalAt?: Timestamp;
    lastSyncAt?: Timestamp;
    errorCount: number;
    lastErrorMessage?: string;
  };

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

type FeedbackSourceType =
  // ── Audio ────────────────────────────────────────────────────────
  | 'audio_upload'              // Manual audio file upload via UI
  | 'call_recording_gong'       // Gong.io call recording sync
  | 'call_recording_chorus'     // Chorus (ZoomInfo) call recording sync
  | 'call_recording_zoom'       // Zoom Phone / Zoom Meetings recording
  | 'call_recording_twilio'     // Twilio call recordings via webhook
  | 'voicemail_import'          // Voicemail file import

  // ── Video ────────────────────────────────────────────────────────
  | 'video_upload'              // Manual video file upload via UI
  | 'video_feedback_link'       // Respondent records video via Experient link
  | 'screen_recording_import'   // Screen recording import (Loom, Scribe, etc.)
  | 'user_interview_recording'  // Uploaded interview recording (UserTesting, etc.)
  | 'youtube_channel'           // YouTube channel comments and mentions

  // ── Social Media ─────────────────────────────────────────────────
  | 'twitter_stream'            // Real-time Twitter/X keyword/mention stream
  | 'linkedin_mentions'         // LinkedIn brand/company page mentions
  | 'instagram_mentions'        // Instagram brand mentions and tags
  | 'facebook_page'             // Facebook page posts and comments
  | 'reddit_monitor'            // Subreddit and keyword monitoring
  | 'tiktok_mentions'           // TikTok brand mentions

  // ── Review Platforms ─────────────────────────────────────────────
  | 'app_store_reviews'         // Apple App Store reviews
  | 'google_play_reviews'       // Google Play reviews
  | 'g2_reviews'                // G2 software reviews
  | 'capterra_reviews'          // Capterra reviews
  | 'trustpilot_reviews'        // Trustpilot reviews
  | 'glassdoor_reviews'         // Glassdoor employer reviews
  | 'yelp_reviews'              // Yelp business reviews
  | 'tripadvisor_reviews'       // TripAdvisor reviews

  // ── Calls & Conversations ────────────────────────────────────────
  | 'crm_notes_salesforce'      // Salesforce activity/call notes sync
  | 'crm_notes_hubspot'         // HubSpot call notes and deal notes sync
  | 'support_tickets_zendesk'   // Zendesk ticket import (resolved tickets)
  | 'support_tickets_intercom'  // Intercom conversation import
  | 'support_tickets_freshdesk' // Freshdesk ticket import
  | 'chat_transcripts_drift'    // Drift chat transcript import
  | 'chat_transcripts_livechat' // LiveChat transcript import
  | 'email_import'              // Customer email thread import

  // ── Bulk / API ───────────────────────────────────────────────────
  | 'csv_import'                // One-time or scheduled CSV upload
  | 'api_push'                  // External system pushes via REST API
  | 'webhook_receiver'          // Receives webhook events from any platform
  | 'integration_sync';         // Generic OAuth integration

interface FeedbackSourceConfig {
  // Social stream config
  keywords?: string[];                  // Monitor these keywords/hashtags
  mentionHandle?: string;               // @handle to monitor
  languages?: string[];                 // Filter by language (ISO 639-1 codes)
  minEngagementThreshold?: number;      // Only ingest posts with >= N likes/votes

  // Review platform config
  appId?: string;                       // App Store / Google Play app identifier
  reviewPlatformId?: string;            // G2/Glassdoor/Yelp company ID
  minRating?: number;                   // Only import reviews >= N stars
  maxRating?: number;

  // CRM / support sync config
  crmInstance?: string;                 // CRM instance URL
  syncIntervalMinutes?: number;         // How often to pull new records
  filterCriteria?: Record<string, unknown>; // CRM query filter
  recordTypes?: string[];               // E.g. ['closed_won', 'closed_lost'] for CRM

  // Webhook config
  webhookSecret?: string;               // HMAC verification secret
  payloadMapping?: Record<string, string>; // Map incoming fields to Signal fields

  // CSV import config
  columnMapping?: Record<string, string>; // Map CSV column names to Signal fields
  dateFormat?: string;                  // Date parsing format

  // Call recording config
  callDirections?: ('inbound' | 'outbound' | 'internal')[];
  minCallDurationSeconds?: number;
  excludeInternalCalls?: boolean;
}

interface SignalEnrichmentConfig {
  runSentimentAnalysis: boolean;
  runTopicExtraction: boolean;
  runIntentClassification: boolean;
  runTranscription: boolean;            // For audio/video sources
  runEmotionDetection: boolean;         // For audio/video (voice tone)
  runPiiDetection: boolean;
  runSummaryGeneration: boolean;
  inferCxMetrics: boolean;              // Infer NPS/CSAT from unstructured text
  customTopicTaxonomy?: string[];       // Org-specific topic labels to classify against
}
```

---

## 5. Question Types

```typescript
type QuestionType =
  // ── Scale & Rating ───────────────────────────────────────────────
  | 'nps'                   // 0-10 likelihood scale with detractor/passive/promoter
  | 'csat'                  // 1-5 satisfaction (smiley or stars)
  | 'ces'                   // 1-7 effort scale
  | 'rating_stars'          // 1-5 or 1-10 star rating
  | 'rating_numeric'        // Numeric scale with custom min/max/labels
  | 'rating_emoji'          // Emoji picker (customizable set)
  | 'slider'                // Continuous slider with min/max
  | 'range_slider'          // Dual-handle range selection

  // ── Choice ───────────────────────────────────────────────────────
  | 'multiple_choice'       // Single-select radio buttons
  | 'checkbox'              // Multi-select checkboxes
  | 'dropdown'              // Single-select dropdown
  | 'image_choice'          // Image as answer option (single or multi)
  | 'card_sort'             // Drag cards to categories
  | 'ranking'               // Drag-to-rank ordered list
  | 'constant_sum'          // Allocate points across options

  // ── Text ─────────────────────────────────────────────────────────
  | 'open_text'             // Single-line text
  | 'long_text'             // Multi-line textarea
  | 'email'                 // Email with validation
  | 'phone'                 // Phone number with country picker
  | 'number'                // Numeric input with validation
  | 'url'                   // URL with validation

  // ── Date & Time ──────────────────────────────────────────────────
  | 'date'
  | 'time'
  | 'date_time'

  // ── Matrix ───────────────────────────────────────────────────────
  | 'matrix'                // Grid: rows × columns (radio per row)
  | 'matrix_checkbox'       // Grid: rows × columns (multi per row)
  | 'likert'                // Labeled agreement scale (strongly disagree → agree)
  | 'semantic_diff'         // Bipolar scale with opposing labels

  // ── Advanced Research ────────────────────────────────────────────
  | 'conjoint'              // Trade-off / choice-based conjoint
  | 'maxdiff'               // Best-worst scaling
  | 'van_westendorp'        // Price sensitivity meter (4 price questions)

  // ── Audio & Video (NEW) ──────────────────────────────────────────
  | 'audio_response'        // Respondent records an audio answer (voice note)
  | 'video_response'        // Respondent records a video answer (face-cam)
  | 'screen_recording'      // Respondent records their screen + audio narration

  // ── Media & Interaction ──────────────────────────────────────────
  | 'file_upload'           // File upload (image/doc/video/audio)
  | 'image_heatmap'         // Click on image (hotspot)
  | 'signature'             // Draw signature
  | 'yes_no'                // Binary yes/no (large buttons)

  // ── Structure (non-response) ─────────────────────────────────────
  | 'display_text'
  | 'display_image'
  | 'display_video'         // Embed a stimulus video for respondent to watch
  | 'display_audio'         // Embed a stimulus audio clip (new)
  | 'page_break'

  // ── Behavioral ───────────────────────────────────────────────────
  | 'loop'
  | 'a_b_test'
  | 'captcha';
```

---

## 6. Question Schema

```typescript
interface Question {
  id: string;
  blockId: string;
  type: QuestionType;
  position: number;

  text: LocalizedString;
  description?: LocalizedString;
  imageUrl?: string;

  config: QuestionConfig;

  required: boolean;
  validation?: QuestionValidation;

  displayLogic?: LogicRule[];
  skipLogic?: LogicRule[];
  pipingSource?: PipingConfig;

  layout?: QuestionLayout;
  randomizeOptions?: boolean;
  anchors?: {
    fixFirst?: number;
    fixLast?: number;
  };

  scoring?: QuestionScoring;

  metric?: 'nps' | 'csat' | 'ces' | 'custom';
  dimension?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  aiGenerated?: boolean;
}

interface QuestionConfig {
  // Scale/Rating
  scale?: {
    min: number;
    max: number;
    minLabel?: LocalizedString;
    maxLabel?: LocalizedString;
    step?: number;
    showNumbers?: boolean;
  };

  // Choice options
  options?: ChoiceOption[];
  allowOther?: boolean;
  otherLabel?: LocalizedString;
  noneOption?: boolean;
  noneLabel?: LocalizedString;
  minSelections?: number;
  maxSelections?: number;

  // Text
  placeholder?: LocalizedString;
  maxLength?: number;
  minLength?: number;
  richText?: boolean;

  // Matrix
  rows?: LocalizedString[];
  columns?: LocalizedString[];
  columnType?: 'radio' | 'checkbox' | 'text' | 'dropdown' | 'number';

  // File upload
  allowedFileTypes?: string[];          // MIME types or extensions
  maxFileSizeMb?: number;
  maxFiles?: number;

  // Image heatmap
  imageUrl?: string;
  maxClicks?: number;

  // Constant sum
  totalPoints?: number;
  currencySymbol?: string;

  // Conjoint / MaxDiff
  attributes?: ConjointAttribute[];
  levels?: Record<string, string[]>;
  tasksCount?: number;
  optionsPerTask?: number;

  // Audio / Video response (new)
  maxDurationSeconds?: number;          // Max recording length
  minDurationSeconds?: number;          // Enforce minimum (e.g. "speak for at least 15s")
  allowRetake?: boolean;                // Let respondent re-record
  showPlayback?: boolean;               // Show preview before submitting
  promptText?: LocalizedString;         // On-screen speaking prompt / reminder
  videoFacingMode?: 'user' | 'environment'; // Front or back camera default

  // Display video/audio stimulus
  stimulusUrl?: string;                 // Video/audio URL to show respondent
  autoPlay?: boolean;
  mustWatchFull?: boolean;              // Prevent next question until media ends
}

interface ChoiceOption {
  id: string;
  value: string;
  label: LocalizedString;
  imageUrl?: string;
  exclusive?: boolean;
  score?: number;
  disqualify?: boolean;
}

interface QuestionValidation {
  pattern?: string;
  min?: number;
  max?: number;
  mustContain?: string[];
  customErrorMessage?: LocalizedString;
}

interface QuestionLayout {
  columns?: 1 | 2 | 3 | 4;
  buttonStyle?: 'radio' | 'button';
  size?: 'compact' | 'normal' | 'large';
}

interface QuestionScoring {
  correctAnswer?: string | string[];
  points?: number;
  partialCredit?: boolean;
}

interface PipingConfig {
  sourceQuestionId: string;
  transform?: 'verbatim' | 'score' | 'label';
}
```

---

## 7. Block & Page Schema

```typescript
interface Block {
  id: string;
  surveyId: string;
  type: BlockType;
  title?: LocalizedString;
  description?: LocalizedString;
  position: number;

  questionIds: string[];
  randomizeQuestions?: boolean;

  displayLogic?: LogicRule[];

  pageBreakBefore?: boolean;
  pageBreakAfter?: boolean;

  loopSource?: 'embedded_data' | 'prior_answer' | 'contact_list';
  loopField?: string;
  loopMax?: number;

  variants?: { id: string; weight: number }[];
}

type BlockType = 'standard' | 'loop' | 'ab_test' | 'randomizer' | 'end_of_survey';
```

---

## 8. Logic & Branching

```typescript
interface LogicRule {
  id: string;
  type: 'display' | 'skip' | 'quota' | 'end' | 'disqualify';
  condition: LogicCondition | LogicConditionGroup;
  action: LogicAction;
}

interface LogicCondition {
  subject: LogicSubject;
  operator: LogicOperator;
  value?: string | number | string[];
}

interface LogicConditionGroup {
  operator: 'AND' | 'OR';
  conditions: (LogicCondition | LogicConditionGroup)[];
}

type LogicSubject =
  | { type: 'question'; questionId: string; property: 'answer' | 'score' | 'shown' }
  | { type: 'embedded_data'; field: string }
  | { type: 'quota'; quotaId: string; property: 'count' | 'percentage' }
  | { type: 'loop_iteration'; index: number }
  | { type: 'device'; property: 'type' | 'os' | 'browser' }
  | { type: 'geo'; property: 'country' | 'region' }
  | { type: 'random_number'; seed?: number };

type LogicOperator =
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with'
  | 'greater_than' | 'less_than' | 'greater_or_equal' | 'less_or_equal'
  | 'between' | 'not_between'
  | 'is_empty' | 'is_not_empty'
  | 'matches_regex'
  | 'in_list' | 'not_in_list';

interface LogicAction {
  type: 'show' | 'hide' | 'skip_to' | 'end_survey' | 'disqualify' | 'set_embedded_data' | 'trigger_quota';
  target?: string;
  embeddedDataField?: string;
  embeddedDataValue?: string;
}
```

---

## 9. Embedded Data Fields

```typescript
interface EmbeddedDataField {
  id: string;
  name: string;
  label: string;
  type: EmbeddedDataType;
  source: EmbeddedDataSource;
  defaultValue?: string;
  required?: boolean;
  piiFlag?: boolean;
  format?: string;
  allowedValues?: string[];
}

type EmbeddedDataType = 'text' | 'number' | 'boolean' | 'date' | 'json' | 'url';

type EmbeddedDataSource =
  | 'url_param'
  | 'cookie'
  | 'js_variable'
  | 'api_prefill'
  | 'contact_attribute'
  | 'prior_answer'
  | 'computed'
  | 'manual';
```

---

## 10. Distribution Channel Schema

```typescript
interface Distribution {
  id: string;
  surveyId: string;
  orgId: string;
  type: DistributionType;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';

  audience: DistributionAudience;
  config: DistributionConfig;

  scheduledAt?: Timestamp;
  sentAt?: Timestamp;
  reminders?: DistributionReminder[];

  stats: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    started: number;
    completed: number;
    unsubscribed: number;
    bounced: number;
  };

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

type DistributionType =
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'anonymous_link'
  | 'individual_links'
  | 'website_intercept'
  | 'in_app_embed'
  | 'qr_code'
  | 'social'
  | 'api_trigger';

interface DistributionAudience {
  type: 'contact_list' | 'segment' | 'open' | 'api_provided';
  contactListId?: string;
  segmentFilter?: Record<string, unknown>;
  estimatedSize?: number;
}

interface DistributionConfig {
  fromName?: string;
  fromEmail?: string;
  replyToEmail?: string;
  subject?: LocalizedString;
  bodyHtml?: LocalizedString;
  bodyText?: LocalizedString;
  message?: LocalizedString;
  senderId?: string;
  interceptTrigger?: 'on_load' | 'on_exit' | 'on_scroll' | 'time_on_page' | 'click_selector' | 'api';
  triggerDelay?: number;
  triggerScrollPercent?: number;
  triggerSelector?: string;
  samplingRate?: number;
  suppressionDays?: number;
  displayPosition?: 'modal' | 'bottom_bar' | 'side_panel' | 'corner_widget';
  maxShowsPerSession?: number;
}

interface DistributionReminder {
  sendAfterDays: number;
  subject?: LocalizedString;
  bodyHtml?: LocalizedString;
  onlyIfNotStarted?: boolean;
  onlyIfNotCompleted?: boolean;
}
```

---

## 11. Response Document

A `Response` represents a survey form submission. It is always a child of a survey. For feedback from non-survey channels (calls, social, audio, video), see [Section 13: Signal Document](#13-signal-document).

```typescript
interface Response {
  id: string;
  surveyId: string;
  orgId: string;
  surveyVersion: number;

  status: 'partial' | 'complete' | 'screened_out' | 'quota_full' | 'abandoned';
  completionPercent: number;

  answers: Record<string, Answer>;      // questionId → Answer

  embeddedData: Record<string, string | number | boolean>;

  respondent: RespondentIdentity;
  context: ResponseContext;
  distribution: ResponseDistributionTrace;
  quality: ResponseQualitySignals;

  // AI enrichment (populated async, same schema as Signal.aiEnrichment)
  aiEnrichment?: AIEnrichment;

  startedAt: Timestamp;
  submittedAt?: Timestamp;
  lastActiveAt: Timestamp;
  durationMs?: number;

  scores: ResponseScores;

  isTest: boolean;
  isAnonymized: boolean;
}

interface ResponseScores {
  npsScore?: number;
  npsGroup?: 'promoter' | 'passive' | 'detractor';
  csatScore?: number;
  cesScore?: number;
  quizScore?: number;
  quizMaxPossible?: number;
  customScores?: Record<string, number>;
}
```

---

## 12. Answer Schema

```typescript
type Answer =
  | ScaleAnswer
  | ChoiceAnswer
  | TextAnswer
  | DateAnswer
  | MatrixAnswer
  | RankingAnswer
  | ConstantSumAnswer
  | HeatmapAnswer
  | FileAnswer
  | AudioAnswer
  | VideoAnswer
  | ConjointAnswer;

interface BaseAnswer {
  questionId: string;
  questionType: QuestionType;
  answeredAt: Timestamp;
  timeSpentMs: number;
  skipped?: boolean;
  piped?: boolean;
}

interface ScaleAnswer extends BaseAnswer {
  value: number;
}

interface ChoiceAnswer extends BaseAnswer {
  selectedIds: string[];
  otherText?: string;
}

interface TextAnswer extends BaseAnswer {
  text: string;
  // AI-enriched (async, Cloud Function)
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  sentimentScore?: number;
  topics?: string[];
  language?: string;
  wordCount?: number;
  piiDetected?: boolean;
  piiTypes?: string[];
}

interface DateAnswer extends BaseAnswer {
  date?: string;
  time?: string;
  dateTime?: string;
}

interface MatrixAnswer extends BaseAnswer {
  rows: Record<string, string | string[]>;
}

interface RankingAnswer extends BaseAnswer {
  ranking: string[];
}

interface ConstantSumAnswer extends BaseAnswer {
  allocations: Record<string, number>;
}

interface HeatmapAnswer extends BaseAnswer {
  clicks: Array<{
    x: number;
    y: number;
    sequence: number;
    timestampMs: number;
  }>;
}

interface FileAnswer extends BaseAnswer {
  files: Array<{
    storagePath: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: Timestamp;
  }>;
}

// NEW: Audio response answer
interface AudioAnswer extends BaseAnswer {
  storagePath: string;                  // Firebase Storage path to the recording
  fileName: string;
  mimeType: string;                     // 'audio/webm', 'audio/mp4', 'audio/ogg'
  sizeBytes: number;
  durationMs: number;
  mediaAssetId?: string;                // Ref to MediaAsset once created
  uploadedAt: Timestamp;

  // AI-enriched (async, after transcription)
  transcript?: string;
  transcriptConfidence?: number;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  sentimentScore?: number;
  topics?: string[];
  language?: string;
  dominantEmotion?: string;
}

// NEW: Video response answer
interface VideoAnswer extends BaseAnswer {
  storagePath: string;
  fileName: string;
  mimeType: string;                     // 'video/webm', 'video/mp4'
  sizeBytes: number;
  durationMs: number;
  resolution?: string;                  // "1280x720"
  mediaAssetId?: string;
  uploadedAt: Timestamp;

  // AI-enriched (async, after transcription)
  transcript?: string;
  transcriptConfidence?: number;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  sentimentScore?: number;
  topics?: string[];
  language?: string;
  emotionTimeline?: Array<{
    timestampMs: number;
    emotion: string;
    confidence: number;
  }>;
}

interface ConjointAnswer extends BaseAnswer {
  tasks: Array<{
    taskIndex: number;
    chosenOptionIndex: number;
    optionsShown: Record<string, string>[];
    timeSpentMs: number;
  }>;
}
```

---

## 13. Signal Document

A `Signal` is the universal feedback unit for all non-survey data sources: audio recordings, video feedback, social media posts, call summaries, review site entries, CRM notes, support tickets, and bulk imports. Signals live at `orgs/{orgId}/signals/{signalId}`.

**Boundary rule:** If feedback came from a respondent filling out a survey form, it is a `Response`. If it came from any other channel, it is a `Signal`.

```typescript
interface Signal {
  id: string;
  orgId: string;
  sourceId: string;                     // Parent FeedbackSource config ID
  sourceType: SignalSourceType;

  // Optional cross-references
  linkedSurveyId?: string;              // If this signal is tied to a survey campaign
  linkedRespondentId?: string;          // If attributed to a known respondent profile
  linkedResponseId?: string;            // If paired with a survey response (e.g. post-call + NPS)

  // Raw content — the unprocessed input
  content: SignalContent;

  // AI-enriched fields (populated async by enrichment pipeline)
  aiEnrichment?: AIEnrichment;

  // Attribution
  author: SignalAuthor;

  // Source-type-specific metadata
  // Shape is determined by sourceType — see SignalMetadata union below
  metadata: SocialSignalMetadata | CallSignalMetadata | ReviewSignalMetadata | Record<string, unknown>;

  // Quality flags
  quality: SignalQualityFlags;

  // Timestamps
  capturedAt: Timestamp;                // When Experient ingested / created this signal
  originalAt?: Timestamp;               // When the source event originally occurred
  enrichedAt?: Timestamp;

  // State
  status: 'pending_enrichment' | 'enriched' | 'reviewed' | 'actioned' | 'archived';
  isTest: boolean;
  isAnonymized: boolean;
}

type SignalSourceType =
  // ── Audio ────────────────────────────────────────────────────────
  | 'call_recording'            // Recorded phone/video call (Gong, Chorus, Zoom, Twilio)
  | 'voicemail'                 // Voicemail recording
  | 'audio_upload'              // Manually uploaded audio file

  // ── Video ────────────────────────────────────────────────────────
  | 'video_feedback'            // Respondent-recorded video via Experient link
  | 'recorded_session'          // User research interview / session recording
  | 'screen_recording'          // Screen recording with audio narration
  | 'video_upload'              // Manually uploaded video file

  // ── Social Media ─────────────────────────────────────────────────
  | 'twitter'                   // Tweet or reply
  | 'linkedin'                  // Post, comment, or DM
  | 'instagram'                 // Post, story, or comment
  | 'facebook'                  // Post or comment
  | 'reddit'                    // Thread or comment
  | 'tiktok'                    // Video or comment
  | 'youtube_comment'           // YouTube comment

  // ── Review Platforms ─────────────────────────────────────────────
  | 'app_store_review'          // Apple App Store
  | 'google_play_review'        // Google Play Store
  | 'g2_review'
  | 'capterra_review'
  | 'trustpilot_review'
  | 'glassdoor_review'
  | 'yelp_review'
  | 'tripadvisor_review'
  | 'amazon_review'

  // ── Call & Conversation Text ──────────────────────────────────────
  | 'call_summary'              // CRM-generated or AI-generated call summary
  | 'call_transcript'           // Full call transcript (text)
  | 'chat_transcript'           // Live chat/support conversation transcript
  | 'email_thread'              // Customer email thread
  | 'support_ticket'            // Help desk ticket (subject + description + thread)
  | 'crm_note'                  // Sales/CRM activity note
  | 'sales_call_notes'          // Manually written post-call notes

  // ── Imports ──────────────────────────────────────────────────────
  | 'csv_import'
  | 'api_push'
  | 'webhook';

interface SignalContent {
  type: 'text' | 'audio' | 'video' | 'mixed';

  // For text-based signals (social, reviews, call summaries, support tickets)
  rawText?: string;

  // For audio signals (before or after transcription)
  audioAssetId?: string;                // Ref to MediaAsset subcollection
  audioDurationMs?: number;
  transcript?: string;                  // Full transcript once available
  transcriptConfidence?: number;        // 0.0–1.0

  // For video signals
  videoAssetId?: string;
  videoDurationMs?: number;

  // For mixed (e.g. video with separate text summary)
  supplementaryText?: string;

  // Source URL (for social posts, reviews)
  externalUrl?: string;
  externalId?: string;                  // Platform's own ID for this post/review
}

// ─── Author / Attribution ─────────────────────────────────────────────────────

interface SignalAuthor {
  isAnonymous: boolean;
  anonymousId?: string;
  respondentId?: string;

  // PII fields — flagged for GDPR scrubbing
  name?: string;
  email?: string;
  phone?: string;
  externalId?: string;                  // CRM contact ID

  // Social identity
  socialHandle?: string;                // @username
  socialProfileUrl?: string;
  followerCount?: number;
  isVerifiedAccount?: boolean;

  // Employee identity (EX use cases)
  employeeId?: string;
  department?: string;
  jobLevel?: string;
  managerId?: string;
  tenureMonths?: number;
  locationOffice?: string;

  // Academic identity (Education use cases)
  studentId?: string;
  courseId?: string;
  programId?: string;
  academicYear?: string;
  institution?: string;
  instructorId?: string;

  // Agent / Support identity (for calls and tickets)
  agentId?: string;
  agentName?: string;
  teamName?: string;
  queue?: string;
}

// ─── Source-specific Metadata ─────────────────────────────────────────────────

interface SocialSignalMetadata {
  platform: 'twitter' | 'linkedin' | 'instagram' | 'facebook' | 'reddit' | 'tiktok' | 'youtube';
  postId: string;
  postUrl?: string;
  contentType: 'post' | 'reply' | 'comment' | 'story' | 'reel' | 'thread' | 'dm';

  // Engagement at time of capture
  likeCount?: number;
  shareCount?: number;
  commentCount?: number;
  viewCount?: number;
  reachEstimate?: number;

  // Threading
  isReply?: boolean;
  parentPostId?: string;
  threadDepth?: number;

  // Reddit-specific
  subreddit?: string;
  upvoteRatio?: number;
  awardCount?: number;

  originalPostedAt: Timestamp;
}

interface ReviewSignalMetadata {
  platform: 'app_store' | 'google_play' | 'g2' | 'capterra' | 'trustpilot' | 'glassdoor' | 'yelp' | 'tripadvisor' | 'amazon';
  reviewId: string;
  reviewUrl?: string;
  reviewTitle?: string;
  rating?: number;                      // 1–5 star rating
  isVerifiedPurchase?: boolean;
  helpfulVotes?: number;
  appVersion?: string;                  // For App Store / Google Play
  productVersion?: string;             // For G2 / Capterra
  employmentStatus?: string;            // For Glassdoor ("Current Employee", etc.)
  jobTitle?: string;                    // For Glassdoor
  yearsAtCompany?: string;              // For Glassdoor
  originalPostedAt: Timestamp;
}

interface CallSignalMetadata {
  callId?: string;                      // CRM/platform call ID
  callType: 'inbound' | 'outbound' | 'internal' | 'conference' | 'unknown';
  durationSeconds: number;
  talkTimeSeconds?: number;
  holdTimeSeconds?: number;
  silenceRatio?: number;                // 0.0–1.0

  // CRM context
  crmSystem?: 'salesforce' | 'hubspot' | 'pipedrive' | 'zoho' | 'dynamics' | 'other';
  crmRecordId?: string;
  crmRecordType?: 'contact' | 'lead' | 'deal' | 'account' | 'ticket';
  dealStage?: string;
  accountName?: string;

  // Outcomes
  disposition?: string;                 // Call wrap-up code
  wasTransferred?: boolean;
  wasEscalated?: boolean;
  issueResolved?: boolean;
  followUpRequired?: boolean;

  // Ticket-specific (for support_ticket sourceType)
  ticketPriority?: 'low' | 'medium' | 'high' | 'critical';
  ticketStatus?: 'open' | 'pending' | 'resolved' | 'closed';
  channel?: 'phone' | 'email' | 'chat' | 'social' | 'in_app';

  calledAt?: Timestamp;
  resolvedAt?: Timestamp;
}

// ─── Quality Flags ────────────────────────────────────────────────────────────

interface SignalQualityFlags {
  isSpam?: boolean;
  isBotGenerated?: boolean;
  isDuplicate?: boolean;
  isDuplicate_signalId?: string;        // ID of the original if this is a dup
  lowTranscriptConfidence?: boolean;
  contentTooShort?: boolean;            // Below meaningful analysis threshold
  languageUnsupported?: boolean;
  overallScore?: number;                // 0.0–1.0 quality score
}

// ─── Ingestion Job ────────────────────────────────────────────────────────────

interface SignalIngestionJob {
  id: string;
  orgId: string;
  sourceId: string;
  sourceType: SignalSourceType;

  status: 'queued' | 'running' | 'complete' | 'partial' | 'failed';

  // Progress
  totalRecords: number;
  processedRecords: number;
  successCount: number;
  errorCount: number;
  errors?: Array<{ record: string; message: string }>;

  // For scheduled syncs
  syncWindowStart?: Timestamp;
  syncWindowEnd?: Timestamp;

  startedAt: Timestamp;
  completedAt?: Timestamp;
  triggeredBy: 'schedule' | 'manual' | 'webhook';
  triggeredByUserId?: string;
}
```

---

## 14. Media Asset Document

A `MediaAsset` lives at `orgs/{orgId}/signals/{signalId}/mediaAssets/{assetId}` (for signal-sourced media) or is referenced from survey `AudioAnswer`/`VideoAnswer` documents. It tracks the binary file in Firebase Storage and all AI-generated outputs (transcript, emotion timeline, speaker diarization).

```typescript
interface MediaAsset {
  id: string;
  orgId: string;
  parentType: 'signal' | 'response';
  parentId: string;                     // signalId or responseId

  type: 'audio' | 'video' | 'screen_recording';

  // Firebase Storage reference
  storagePath: string;
  cdnUrl?: string;                      // Signed CDN URL (refreshed on read)
  fileName: string;
  mimeType: string;
  sizeBytes: number;

  // Media properties
  durationMs: number;
  resolution?: string;                  // Video only: "1920x1080"
  frameRate?: number;
  sampleRate?: number;                  // Audio only: 44100, 48000
  channels?: number;                    // 1 = mono, 2 = stereo
  bitrate?: number;                     // kbps

  // Processing pipeline state
  processingStatus: 'pending' | 'uploading' | 'transcribing' | 'analyzing' | 'complete' | 'failed';
  processingError?: string;

  // Transcription output
  transcript?: MediaTranscript;

  // Speaker diarization (who spoke when)
  speakers?: SpeakerSegment[];

  // Video-only: face / emotion timeline (opt-in, privacy-gated)
  emotionTimeline?: EmotionTimelineEntry[];

  // Screen recording: UI event log (if captured)
  uiEvents?: Array<{
    timestampMs: number;
    type: 'click' | 'scroll' | 'hover' | 'focus' | 'input' | 'navigation';
    target?: string;
    value?: string;
    coordinates?: { x: number; y: number };
  }>;

  uploadedAt: Timestamp;
  processedAt?: Timestamp;
  uploadedBy?: string;                  // userId (null if respondent-uploaded)
}

interface MediaTranscript {
  fullText: string;
  confidence: number;                   // Overall 0.0–1.0
  language: string;                     // ISO 639-1
  provider: 'google_stt' | 'whisper' | 'deepgram' | 'assembly_ai' | 'aws_transcribe';

  // Word-level timestamps (for playback-sync highlighting)
  words?: Array<{
    word: string;
    startMs: number;
    endMs: number;
    confidence: number;
    speakerLabel?: string;
  }>;

  // Sentence-level segments
  segments: Array<{
    text: string;
    startMs: number;
    endMs: number;
    speakerLabel?: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
    topics?: string[];
  }>;
}

interface SpeakerSegment {
  label: string;                        // "Agent", "Customer", "Speaker 1", etc.
  speakTimeMs: number;
  interruptionCount?: number;
  avgSentiment?: number;
  segments: Array<{ startMs: number; endMs: number }>;
}

interface EmotionTimelineEntry {
  timestampMs: number;
  emotion: 'joy' | 'sadness' | 'anger' | 'fear' | 'surprise' | 'disgust' | 'neutral' | 'frustration' | 'delight';
  confidence: number;
  arousal?: number;                     // 0.0–1.0 (low=calm, high=excited)
  valence?: number;                     // -1.0–1.0 (negative to positive)
}
```

---

## 15. AI Enrichment Pipeline

The `AIEnrichment` object is attached to both `Response` and `Signal` documents at a top-level `aiEnrichment` field. It is populated asynchronously by a Cloud Function after the document is written. The enrichment pipeline is source-agnostic — it operates on `rawText` (signals), concatenated open-text answers (responses), or transcript text (audio/video).

```typescript
interface AIEnrichment {
  // Pipeline state
  status: 'pending' | 'processing' | 'complete' | 'failed';
  processedAt?: Timestamp;
  modelId?: string;                     // Which AI model ran this (e.g. "gpt-4o", "claude-3-5")
  enrichmentVersion?: number;           // Schema version — increment to trigger re-enrichment

  // ── Sentiment ─────────────────────────────────────────────────────
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  sentimentScore?: number;              // -1.0 (very negative) to 1.0 (very positive)

  // Sentence-level breakdown
  sentimentSegments?: Array<{
    text: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    score: number;
  }>;

  // ── Emotion ───────────────────────────────────────────────────────
  // Derived from tone/content (text) or audio/video analysis
  dominantEmotion?: 'joy' | 'sadness' | 'anger' | 'fear' | 'surprise' | 'disgust' | 'frustration' | 'delight' | 'neutral';
  emotionScores?: Record<string, number>; // emotion → 0.0–1.0 confidence

  // ── Intent ────────────────────────────────────────────────────────
  intent?: 'complaint' | 'praise' | 'suggestion' | 'question' | 'churn_risk' | 'upsell_opportunity' | 'bug_report' | 'neutral';
  intentScore?: number;                 // 0.0–1.0 confidence
  urgency?: 'low' | 'medium' | 'high' | 'critical';

  // ── Topics & Themes ───────────────────────────────────────────────
  topics?: Array<{
    name: string;
    confidence: number;
    isCustomTaxonomy?: boolean;         // True if matched org's custom topic list
  }>;
  themes?: string[];                    // Higher-level clusters (grouped from topics)
  categories?: string[];                // Product area / org-defined categories

  // ── Entities ──────────────────────────────────────────────────────
  entities?: Array<{
    text: string;
    type: 'product_feature' | 'competitor' | 'person' | 'organization' | 'location' | 'date' | 'price' | 'other';
    sentiment?: 'positive' | 'neutral' | 'negative';
    count?: number;                     // Mention frequency
  }>;
  keyPhrases?: string[];

  // ── Inferred CX / EX Metrics ──────────────────────────────────────
  // Estimated from unstructured content — not a replacement for direct survey metrics
  inferredNps?: number;                 // 0–10 estimated likelihood to recommend
  inferredCsat?: number;                // 1–5 estimated satisfaction
  inferredEnps?: number;                // 0–10 estimated employee NPS (for EX signals)

  // ── Summary ───────────────────────────────────────────────────────
  summary?: string;                     // 1–2 sentence AI-generated summary
  actionItems?: string[];               // Extracted follow-up actions (for calls/tickets)
  highlights?: string[];                // Key quotes / notable phrases

  // ── Language ──────────────────────────────────────────────────────
  language?: string;                    // ISO 639-1 detected language
  isMultilingual?: boolean;             // Content spans multiple languages

  // ── PII ───────────────────────────────────────────────────────────
  piiDetected?: boolean;
  piiTypes?: Array<'email' | 'phone' | 'name' | 'address' | 'ssn' | 'credit_card' | 'dob' | 'ip' | 'other'>;

  // ── Speaker Analysis (audio/video only) ───────────────────────────
  speakerSentiments?: Record<string, {  // speakerLabel → analysis
    sentiment: string;
    sentimentScore: number;
    speakTimeRatio: number;
    interruptionCount: number;
  }>;
  talkListenRatio?: number;             // Agent talk time / total call time (0.0–1.0)
  overtalkRatio?: number;               // Overlap / interruption time ratio
}
```

---

## 16. Contextual Enrichment Data

```typescript
interface ResponseContext {
  ip?: {
    address: string;
    type: 'residential' | 'corporate' | 'datacenter' | 'vpn' | 'tor' | 'mobile' | 'unknown';
    isp?: string;
    asn?: string;
    isProxy?: boolean;
    isTor?: boolean;
    isBotnet?: boolean;
  };

  geo?: {
    source: 'ip_lookup' | 'gps' | 'user_provided';
    countryCode: string;
    countryName: string;
    regionCode?: string;
    regionName?: string;
    city?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
    timezone?: string;
    accuracy?: 'city' | 'region' | 'country';
  };

  device?: {
    type: 'desktop' | 'tablet' | 'mobile' | 'kiosk' | 'smart_tv' | 'unknown';
    os: string;
    osVersion?: string;
    browser: string;
    browserVersion?: string;
    screenWidth?: number;
    screenHeight?: number;
    devicePixelRatio?: number;
    language?: string;
    isTouch?: boolean;
    model?: string;
  };

  network?: {
    connectionType?: 'wifi' | 'cellular' | 'ethernet' | 'unknown';
    effectiveType?: '2g' | '3g' | '4g' | '5g';
    downlinkMbps?: number;
  };

  session?: {
    id: string;
    fingerprint?: string;
    pageLoadedAt: Timestamp;
    firstInteractionAt?: Timestamp;
    idlePeriods?: Array<{ from: Timestamp; to: Timestamp }>;
  };

  source?: {
    referrerUrl?: string;
    referrerDomain?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    gclid?: string;
    fbclid?: string;
    channel?: string;
    distributionId?: string;
  };
}
```

---

## 17. Respondent Identity Schema

```typescript
interface RespondentIdentity {
  respondentId?: string;
  anonymousId: string;

  // PII — scrub on anonymization
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string;

  isAuthenticated: boolean;
  authProvider?: string;

  contactListId?: string;
  contactListRowId?: string;
}
```

---

## 18. Quality Signals

```typescript
// For survey Responses
interface ResponseQualitySignals {
  isDuplicate?: boolean;
  isBot?: boolean;
  isSpeeder?: boolean;
  isStraightLiner?: boolean;
  hasDropoffs?: boolean;

  overallScore?: number;
  botScore?: number;
  duplicateScore?: number;

  medianQuestionTimeMs?: number;
  expectedMinTimeMs?: number;
  expectedMaxTimeMs?: number;
  completionRatio?: number;

  openTextCharsTotal?: number;
  gibberishDetected?: boolean;

  quotaGroupsMatched?: string[];
}

// For Signals — see SignalQualityFlags in Section 13
```

---

## 19. Analytics & Aggregates

```typescript
// Survey-level aggregates: orgs/{orgId}/surveys/{surveyId}/aggregates/{metricKey}
// Org-level cross-channel aggregates: orgs/{orgId}/aggregates/{metricKey}
// Updated by Cloud Functions on each new Response or Signal write

interface SurveyAggregate {
  id: string;
  type: AggregateType;
  questionId?: string;

  nps?: {
    promoters: number;
    passives: number;
    detractors: number;
    score: number;
    totalResponses: number;
  };

  choiceDistribution?: Record<string, number>;

  stats?: {
    count: number;
    sum: number;
    min: number;
    max: number;
    mean: number;
    median?: number;
    p25?: number;
    p75?: number;
    stddev?: number;
  };

  timeSeries?: Record<string, number>;  // "2026-05-11" → value
  segments?: Record<string, unknown>;

  updatedAt: Timestamp;
}

// NEW: Org-level cross-channel aggregate (signals + responses combined)
interface OrgAggregate {
  id: string;
  orgId: string;
  type: OrgAggregateType;

  // Sentiment trend across all channels
  sentimentBreakdown?: {
    positive: number;
    neutral: number;
    negative: number;
    mixed: number;
    totalSignals: number;
    netSentimentScore: number;          // (positive - negative) / total * 100
  };

  // Volume by source type
  signalVolumeBySource?: Record<SignalSourceType, number>;

  // Topic frequency (cross-channel)
  topTopics?: Array<{
    topic: string;
    count: number;
    sentimentScore: number;
    trend: 'rising' | 'stable' | 'falling';
  }>;

  // Intent distribution
  intentBreakdown?: Record<string, number>;  // intent → count

  // Review ratings (for review platform signals)
  reviewRatingDistribution?: Record<string, number>;  // "1"–"5" → count
  averageReviewRating?: number;

  // Call analytics (for call signals)
  callMetrics?: {
    avgDurationSeconds: number;
    avgTalkListenRatio: number;
    resolutionRate: number;
    escalationRate: number;
    totalCalls: number;
  };

  timeSeries?: Record<string, number>;
  updatedAt: Timestamp;
}

type AggregateType =
  | 'nps'
  | 'csat'
  | 'ces'
  | 'choice_dist'
  | 'numeric_stats'
  | 'text_topics'
  | 'completion_funnel'
  | 'sentiment_trend';

type OrgAggregateType =
  | 'cross_channel_sentiment'
  | 'signal_volume_by_source'
  | 'topic_frequency'
  | 'intent_distribution'
  | 'review_ratings'
  | 'call_metrics'
  | 'inferred_nps_trend';
```

---

## 20. Multilingual Support

```typescript
type LocalizedString =
  | string
  | Record<string, string>;             // { "en": "...", "fr": "...", "de": "..." }

function resolveString(val: LocalizedString, locale: string, fallback = 'en'): string {
  if (typeof val === 'string') return val;
  return val[locale] ?? val[fallback] ?? Object.values(val)[0] ?? '';
}

interface SurveySettings {
  defaultLocale: string;
  availableLocales: string[];
  autoDetectLocale: boolean;
  rtlSupport: boolean;

  allowPartialSave: boolean;
  allowMultipleResponses: boolean;
  anonymizeAfterDays?: number;

  maxResponses?: number;
  closeSurveyOnQuotaFull?: boolean;
}
```

---

## 21. Firestore Indexes

```json
{
  "indexes": [
    // ── Surveys ──────────────────────────────────────────────────────
    {
      "collectionGroup": "surveys",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "surveys",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "surveyType", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "surveys",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "category", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    },

    // ── Responses ────────────────────────────────────────────────────
    {
      "collectionGroup": "responses",
      "fields": [
        { "fieldPath": "surveyId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "submittedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "responses",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "submittedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "responses",
      "fields": [
        { "fieldPath": "surveyId", "order": "ASCENDING" },
        { "fieldPath": "respondent.email", "order": "ASCENDING" },
        { "fieldPath": "submittedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "responses",
      "fields": [
        { "fieldPath": "surveyId", "order": "ASCENDING" },
        { "fieldPath": "quality.isBot", "order": "ASCENDING" },
        { "fieldPath": "submittedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "responses",
      "fields": [
        { "fieldPath": "surveyId", "order": "ASCENDING" },
        { "fieldPath": "aiEnrichment.sentiment", "order": "ASCENDING" },
        { "fieldPath": "submittedAt", "order": "DESCENDING" }
      ]
    },

    // ── Signals ──────────────────────────────────────────────────────
    {
      "collectionGroup": "signals",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "sourceType", "order": "ASCENDING" },
        { "fieldPath": "capturedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "signals",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "capturedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "signals",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "aiEnrichment.sentiment", "order": "ASCENDING" },
        { "fieldPath": "capturedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "signals",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "aiEnrichment.intent", "order": "ASCENDING" },
        { "fieldPath": "capturedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "signals",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "linkedSurveyId", "order": "ASCENDING" },
        { "fieldPath": "capturedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "signals",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "linkedRespondentId", "order": "ASCENDING" },
        { "fieldPath": "capturedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "signals",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "capturedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "signals",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "aiEnrichment.status", "order": "ASCENDING" },
        { "fieldPath": "capturedAt", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "signals",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "sourceType", "order": "ASCENDING" },
        { "fieldPath": "aiEnrichment.urgency", "order": "ASCENDING" },
        { "fieldPath": "capturedAt", "order": "DESCENDING" }
      ]
    },

    // ── Media Assets ─────────────────────────────────────────────────
    {
      "collectionGroup": "mediaAssets",
      "fields": [
        { "fieldPath": "orgId", "order": "ASCENDING" },
        { "fieldPath": "processingStatus", "order": "ASCENDING" },
        { "fieldPath": "uploadedAt", "order": "ASCENDING" }
      ]
    },

    // ── Distributions ────────────────────────────────────────────────
    {
      "collectionGroup": "distributions",
      "fields": [
        { "fieldPath": "surveyId", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "scheduledAt", "order": "ASCENDING" }
      ]
    },

    // ── Aggregates ───────────────────────────────────────────────────
    {
      "collectionGroup": "aggregates",
      "fields": [
        { "fieldPath": "surveyId", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## 22. Migration from v1.0 Schema

### Survey document (no breaking changes)

New fields with defaults for existing surveys:
```
category: null                 → null (optional, no backfill needed)
stats.linkedSignalCount: 0
```

New enum values are additive — no existing `surveyType` values were renamed or removed.

### Response document (additive only)

New field:
```
aiEnrichment: null             → null until Cloud Function processes it
```

The `onNewResponse` Cloud Function is extended to call `enrichContent()` and write back `aiEnrichment` within seconds of submission. Existing responses without `aiEnrichment` are valid — the field is optional.

### New collections (no migration needed)

`signals`, `signalIngestionJobs`, and top-level `insights` are new collections with no existing data to migrate.

### Firestore indexes (additive)

All new indexes in Section 21 must be added to `firestore.indexes.json`. Existing indexes are unchanged.

---

## 23. Key Design Decisions

### Response vs. Signal — why not a single unified collection?

`Response` and `Signal` share almost no document structure. A `Response` has `answers: Record<questionId, Answer>`, `surveyVersion`, `completionPercent`, and a submission flow. A tweet has none of those. Forcing a union document type would leave 60–70% of fields null on every document, corrupt the `surveys/{surveyId}/responses` subcollection semantics, and make per-type Firestore rules unwriteable. The unified view lives in BigQuery as a `feedback_items` view — a `UNION ALL` of the two streamed tables with a `source_type` discriminator column. The persistence layer stays clean; the analytics layer does the join.

### Why MediaAsset is a subcollection of Signal, not a top-level collection

A media asset is always owned by and meaningless without its parent signal. There is no real query pattern for "all audio files across all signals" without also needing the parent context. Subcollection placement enforces ownership, allows security rules to inherit from the signal document, and keeps the signal document itself under 1 MiB (the binary lives in Firebase Storage; the asset doc is metadata only). Survey audio/video answers reference `mediaAssetId` as a pointer to this subcollection via `parentType: 'response'`.

### Why Signal metadata is a discriminated union, not separate collections

`signals` is one collection with a `sourceType` discriminator. This enables `where('sourceType', 'in', ['twitter', 'linkedin'])` and `where('aiEnrichment.sentiment', '==', 'negative')` in a single Firestore query — impossible if each source type were a separate collection. Unused fields in the `metadata` nested map have zero Firestore storage cost.

### AI enrichment is always async, never blocking

`AIEnrichment` is populated by a Cloud Function triggered after the document is written, not during the write path. This keeps survey submission and signal ingestion latency under 200ms p95. The enrichment function calls the same `enrichContent()` library regardless of whether it is processing a tweet, a call transcript, or open-text survey answers. The `status: 'pending'` field lets the UI show a "analyzing..." state while enrichment runs (typically 2–8 seconds).

### Education survey types are a first-class category, not a subset of Academic

`academic` (v1.0) covers generic IRB/scientific research — the researcher is often not an institution. The new `education` category covers the university lifecycle: course evaluations, student satisfaction, peer assessment, learning outcomes, alumni engagement. These require different benchmark databases, different question templates, different distribution patterns (LMS integrations vs. email), and different analytics outputs (class-level vs. cohort vs. institution). Conflating them under `academic` would have made vertical-specific template and benchmark logic impossible.

### EX survey types are expanded, not replaced

v1.0 had five EX types. v2.0 adds `onboarding_feedback`, `manager_effectiveness`, `dei_climate`, and `wellbeing`. These were identified as the highest-demand EX survey categories not covered by the existing five. The existing five types are unchanged — no field renames, no deprecations.

### Why subcollections for questions and responses? (unchanged from v1.0)

Firestore's 1 MiB document limit is the constraint. A survey with 100 questions, each with 20 localized answer options, can easily exceed 200 KB inline. Responses accumulate unboundedly. Subcollections remove the ceiling.

### Why BigQuery for analytics? (unchanged from v1.0)

Firestore aggregation is limited: no cross-collection joins, no percentile queries, no time-bucketing. BigQuery handles arbitrary SQL across all orgs, all surveys, all signals, all time. The Firebase BigQuery Extension streams every new document automatically. Zero ETL code to maintain. The new `feedback_items` unified view adds one layer of SQL on top of the two existing streamed tables — no new infrastructure required.

### LocalizedString backward compatibility (unchanged from v1.0)

`string | Record<string, string>` is backwards compatible. Existing plain strings still work. The `resolveString()` helper handles both forms.
