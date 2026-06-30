# Examples: taxonomy-mapper

<!-- Hand-authored seed examples. The skill runtime appends high-scoring runs below. -->

## Good Example

**Input**

```json
{
  "source_platform": "qualtrics",
  "imported_labels": [
    {"label": "Getting Started", "volume": 220, "sample_verbatims": ["setup took forever", "hard to get going"]},
    {"label": "Pricing", "volume": 140, "sample_verbatims": ["too expensive for what it does"]},
    {"label": "Support", "volume": 90, "sample_verbatims": ["agent was slow but the billing fix was good"]},
    {"label": "Mobile App Crashes", "volume": 30, "sample_verbatims": ["app crashes on android"]}
  ],
  "registry_topics": [
    {"topic_id": "t1", "name": "Onboarding", "aliases": ["Setup", "First-run"], "parent_category": "Product"},
    {"topic_id": "t2", "name": "Customer Support", "aliases": ["Help Desk"], "parent_category": "Service"},
    {"topic_id": "t3", "name": "Billing", "aliases": ["Invoicing"], "parent_category": "Service"}
  ]
}
```

**Expected Output**

```json
{
  "summary": "1 label merged into an existing topic, 1 new topic proposed, 2 conflicts flagged for review.",
  "resolutions": [
    {"label": "Getting Started", "action": "merge", "target_topic_id": "t1", "target_topic_name": "Onboarding", "add_as_alias": true, "confidence": 0.9, "rationale": "'Getting Started' is a synonym of the Onboarding topic (matches alias 'Setup'); kept as an alias so historical assignments are preserved."},
    {"label": "Pricing", "action": "new", "target_topic_id": null, "target_topic_name": null, "add_as_alias": false, "confidence": 0.85, "rationale": "No registry topic covers pricing; propose a new standalone topic."},
    {"label": "Support", "action": "conflict", "target_topic_id": null, "target_topic_name": null, "add_as_alias": false, "confidence": 0.4, "rationale": "Verbatims span both support quality and a billing fix — could map to Customer Support or Billing; needs human review."},
    {"label": "Mobile App Crashes", "action": "conflict", "target_topic_id": null, "target_topic_name": null, "add_as_alias": false, "confidence": 0.5, "rationale": "Plausibly a new specific topic or a child of a broader Product/Reliability topic not in the registry; flag for human decision."}
  ],
  "conflicts": [
    {"label": "Support", "candidate_topic_ids": ["t2", "t3"], "reason": "Verbatims reference both support responsiveness and a billing fix; mapping is genuinely ambiguous."},
    {"label": "Mobile App Crashes", "candidate_topic_ids": ["t1", "t2"], "reason": "No clear registry match; could be new or nested under an existing product topic — human should decide placement."}
  ],
  "registry_additions": [
    {"name": "Pricing", "parent_category": "Commercial", "from_label": "Pricing"}
  ]
}
```

Why it's good: every imported label is resolved exactly once (no drops), the merge targets a real
registry id (`t1`) and preserves history via `add_as_alias`, the ambiguous labels are `conflict`
with >= 2 candidates each and a concrete reason, the `new` label has a `registry_additions` entry,
and confidence is honest (0.9 vs 0.4).

## Bad Example

**Same input as above.**

**Bad Output**

```json
{
  "summary": "Mapped everything.",
  "resolutions": [
    {"label": "Getting Started", "action": "merge", "target_topic_id": "t1", "target_topic_name": "Onboarding", "add_as_alias": false, "confidence": 0.9, "rationale": "Onboarding."},
    {"label": "Support", "action": "merge", "target_topic_id": "t2", "target_topic_name": "Customer Support", "add_as_alias": true, "confidence": 0.9, "rationale": "Support."},
    {"label": "Mobile App Crashes", "action": "merge", "target_topic_id": "t9", "target_topic_name": "Reliability", "add_as_alias": true, "confidence": 0.9, "rationale": "Crashes."}
  ],
  "conflicts": [],
  "registry_additions": []
}
```

Why it's bad: **drops "Pricing"** entirely (E2 fail — not every label resolved); silently merges the
ambiguous "Support" label instead of flagging it (E4 fail); merges "Mobile App Crashes" onto `t9`,
a **non-existent** registry id (E3 fail); and emits no conflicts or registry additions despite clear
ambiguity and a novel concept.
