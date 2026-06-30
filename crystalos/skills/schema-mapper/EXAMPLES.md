# Examples: schema-mapper

<!-- Hand-authored seed examples. The skill runtime appends high-scoring runs below. -->

## Good Example

**Input**

```json
{
  "source_platform": "qualtrics",
  "source_survey_title": "Q2 Relationship NPS",
  "source_fields": [
    {"source_field_id": "QID1", "label": "How likely are you to recommend us? (0-10)", "source_type": "NPS", "sample_values": ["9", "3", "10"], "option_labels": []},
    {"source_field_id": "QID2", "label": "Overall satisfaction", "source_type": "Matrix-Likert", "sample_values": ["6", "7", "4"], "option_labels": ["1","2","3","4","5","6","7"]},
    {"source_field_id": "QID3", "label": "What could we do better?", "source_type": "TE", "sample_values": ["faster support"], "option_labels": []},
    {"source_field_id": "ResponseId", "label": "Response ID", "source_type": "meta", "sample_values": ["R_abc"], "option_labels": []}
  ],
  "target_questions": [
    {"question_id": "q1", "question": "How likely are you to recommend us?", "type": "nps", "options": []},
    {"question_id": "q2", "question": "How satisfied are you overall?", "type": "csat", "options": [{"id": "o1","label":"1"},{"id":"o2","label":"2"},{"id":"o3","label":"3"},{"id":"o4","label":"4"},{"id":"o5","label":"5"}]}
  ],
  "known_metrics": ["nps", "csat"]
}
```

**Expected Output**

```json
{
  "summary": "2 fields mapped to existing questions, 1 new open-text question proposed, 1 field preserved as metadata; 1 metric-affecting scale change flagged.",
  "mappings": [
    {"source_field_id": "QID1", "target_question_id": "q1", "disposition": "mapped", "target_type": "nps", "metric": "nps", "value_rule": null, "option_map": [], "confidence": 0.98, "rationale": "Source NPS 0-10 maps directly to the Xperiq nps question of identical scale."},
    {"source_field_id": "QID2", "target_question_id": "q2", "disposition": "mapped", "target_type": "csat", "metric": "csat", "value_rule": "linear rescale 1-7 -> 1-5", "option_map": [], "confidence": 0.82, "rationale": "Satisfaction Likert matches the CSAT question but the 1-7 source scale must be rescaled to the 1-5 target."},
    {"source_field_id": "QID3", "target_question_id": null, "disposition": "new", "target_type": "open_text", "metric": null, "value_rule": null, "option_map": [], "confidence": 0.9, "rationale": "Free-text improvement prompt has no existing target; propose a new open_text question."},
    {"source_field_id": "ResponseId", "target_question_id": null, "disposition": "preserved", "target_type": "open_text", "metric": null, "value_rule": null, "option_map": [], "confidence": 1.0, "rationale": "Source response identifier carried through as preserved metadata, not a survey question."}
  ],
  "unmapped": [],
  "scale_changes": [
    {"source_field_id": "QID2", "from_scale": "1-7", "to_scale": "1-5", "metric_affecting": true, "note": "CSAT rescale changes the reported metric; requires user confirmation."}
  ]
}
```

Why it's good: every source field is accounted for (no drops), the NPS and CSAT fields carry an
explicit `metric`, no target id is invented (QID3 is `new`, ResponseId is `preserved`), the 1-7→1-5
scale change is flagged as metric-affecting, and confidence is differentiated (0.98 vs 0.82).

## Bad Example

**Same input as above.**

**Bad Output**

```json
{
  "summary": "Mapped the questions.",
  "mappings": [
    {"source_field_id": "QID1", "target_question_id": "q1", "disposition": "mapped", "target_type": "nps", "metric": null, "value_rule": null, "option_map": [], "confidence": 0.95, "rationale": "It's NPS."},
    {"source_field_id": "QID2", "target_question_id": "q9", "disposition": "mapped", "target_type": "csat", "metric": "csat", "value_rule": null, "option_map": [], "confidence": 0.95, "rationale": "Satisfaction."}
  ],
  "unmapped": [],
  "scale_changes": []
}
```

Why it's bad: **drops QID3 and ResponseId** (E2 fail — not every field accounted for); the NPS field
has `metric: null` (E3 fail — unflagged metric); `q9` is a **hallucinated** target id that does not
exist in `target_questions` (E4 fail); the 1-7→1-5 CSAT rescale is silently applied with no
`scale_changes` entry (E5 fail); confidence is a blanket 0.95 (E6 fail).
