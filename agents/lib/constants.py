"""Centralized constants for the Crystal Intelligence Platform.

All hardcoded thresholds, limits, and tuning values live here.
Import from this module — never hardcode these values in pipeline files.
"""

# ── Streaming consumer ────────────────────────────────────────────────────────
METRIC_SNAPSHOT_RESPONSE_THRESHOLD = 50    # write metric snapshot every N responses
CHECKPOINT_FULL_RESPONSE_THRESHOLD = 200   # write full checkpoint blob every N responses
CHECKPOINT_FULL_MAX_DAYS = 7               # also write full checkpoint if N days have passed

# ── Response loading ──────────────────────────────────────────────────────────
INGEST_MAX_RESPONSES_BOOTSTRAP = 300       # max responses loaded on first pipeline run
INGEST_MAX_RESPONSES_CAP = 250             # max responses loaded on incremental runs

# ── Manual refresh ────────────────────────────────────────────────────────────
MANUAL_REFRESH_MIN_NEW_RESPONSES = 10      # min new responses required to allow manual refresh
MANUAL_REFRESH_MAX_DAILY = 3               # max manual refreshes per survey per day

# ── Topic clustering ──────────────────────────────────────────────────────────
TOPIC_ASSIGNMENT_THRESHOLD = 0.72          # cosine similarity threshold for topic assignment
WINDOW_MIN_RESPONSES = {                   # min responses needed per window
    "all_time": 1,
    "last_30d": 10,
    "last_7d": 5,
}
TOPIC_CONFIDENCE_LOW = 0.5                 # below this: low confidence
TOPIC_CONFIDENCE_MEDIUM = 0.65            # below this: medium confidence
TOPIC_CONFIDENCE_HIGH = 0.80              # above this: high confidence

# ── Trust score ───────────────────────────────────────────────────────────────
TRUST_STATISTICAL_MODERATE_MIN = 30        # min responses for moderate statistical trust
TRUST_STATISTICAL_HIGH_MIN = 50            # min responses for high statistical trust
TRUST_LOW_MAX = 40                         # trust score ≤ this → low
TRUST_MEDIUM_MAX = 70                      # trust score ≤ this → medium
TRUST_HIGH_MAX = 100                       # trust score ≤ this → high

# ── Report quality ────────────────────────────────────────────────────────────
REPORT_QUALITY_RENARRATE_THRESHOLD = 60    # eval score below this triggers re-narration
CRYSTAL_EVAL_PASS_THRESHOLD = 72           # minimum quality score for Crystal response to pass

# ── Crystal ReAct ─────────────────────────────────────────────────────────────
CRYSTAL_MAX_TOOL_TURNS = 10                # max tool call iterations per Crystal turn
CRYSTAL_CONTEXT_COMPRESSION_THRESHOLD = 40_000  # token count triggering context compression
CRYSTAL_CONVERSATION_WINDOW = 6            # number of prior turns included in context

# ── Progressive data tiers ────────────────────────────────────────────────────
PROGRESSIVE_TIER_FIRST_VOICES = 10         # response count threshold: first_voices tier
PROGRESSIVE_TIER_EARLY_SIGNALS = 40        # response count threshold: early_signals tier
PROGRESSIVE_TIER_GROWING_PICTURE = 70      # response count threshold: growing_picture tier
PROGRESSIVE_TIER_FULL_REPORT = 100         # response count threshold: full_report tier

# ── Object store / checkpoint blobs ──────────────────────────────────────────
CHECKPOINT_BUCKET = ""                     # OCI bucket name (empty → local filesystem)
CHECKPOINT_LOCAL_PATH = "/tmp/checkpoints" # local dev checkpoint directory
CHECKPOINT_BLOB_SCHEMA_VERSION = 1         # current blob schema version

# ── Zombie run detection ──────────────────────────────────────────────────────
MAX_RUN_HEARTBEAT_STALE_MINUTES = 5        # heartbeat older than this → zombie candidate
MAX_RUN_DURATION_MINUTES = 30              # run older than this → zombie regardless of heartbeat

# ── Crystal thread lifecycle ──────────────────────────────────────────────────
CRYSTAL_THREAD_INACTIVITY_TTL_DAYS = 7     # inactive thread TTL before reset
CRYSTAL_THREAD_CONTEXT_WINDOW_TURNS = 6    # turns included in Crystal context
CRYSTAL_THREAD_STORAGE_TTL_DAYS = 90       # thread storage retention period

# ── Tiered report agent ───────────────────────────────────────────────────────
REPORT_MAX_RESPONSES_WINDOW = 200          # max responses sent to LLM for any tiered report

# ── Response velocity ─────────────────────────────────────────────────────────
RESPONSE_VELOCITY_UNIT = "per_day"         # velocity = response_count / days_since_first_response
