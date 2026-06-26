# Evals: crystal-support

## Criteria

| ID | Criterion | Weight | Threshold |
|----|-----------|--------|-----------|
| E1 | Output is valid JSON matching output schema (answer, citations, suggestions, intent, confidence, resolved all present) | 25 | must pass |
| E2 | Intent is correctly classified for the input message | 20 | must pass |
| E3 | answer is 2-5 sentences, cites at least one doc key or tool result | 20 | >= 0.85 |
| E4 | suggestions are specific and actionable (not generic "can I help with anything else?") | 15 | >= 0.80 |
| E5 | escalation_package is present when resolved=false and absent when resolved=true | 10 | must pass |
| E6 | confidence value is calibrated: >= 0.80 for answered questions, < 0.50 for escalated ones | 10 | >= 0.80 |

## Scoring

Pass threshold: overall score >= 0.75

## Failure Behavior

On failure inject failed criteria. Max 1 retry.
E2 failure: inject "Re-classify the intent from: how_to, bug_report, billing, feature_request, account_issue, api_help, data_question, escalate — re-read the message carefully."
E3 failure: inject "Every factual claim about the platform must be supported by a doc key citation in [support-doc:key] format. Answer must be 2-5 sentences."
E5 failure: inject "escalation_package must be present when resolved=false and must be absent (or null) when resolved=true."

---

## Eval Cases

### Case 1: how_to — Creating a survey

**Input**:
```json
{
  "message": "How do I create a new survey?",
  "conversation_context": {
    "previous_turns": [],
    "intent_history": [],
    "tool_calls_made": [],
    "unresolved_issues": []
  },
  "tool_results": {
    "search_support_docs": {
      "docs": [
        {
          "key": "create-survey",
          "title": "Create Your First Survey",
          "excerpt": "To create a survey, click New Survey from the dashboard. Choose a template or start from scratch. Add questions using the question builder.",
          "category": "feature"
        }
      ],
      "total": 1
    }
  },
  "session_state": {
    "org_id": "org_abc123",
    "user_id": "user_xyz",
    "plan_tier": "growth",
    "session_id": "sess_001",
    "turn_number": 1
  }
}
```

**Expected output fields**:
```json
{
  "intent": "how_to",
  "resolved": true,
  "confidence": ">= 0.80",
  "citations": ["create-survey"],
  "answer": "contains 'New Survey' or 'dashboard' and cites [support-doc:create-survey]"
}
```

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| intent = how_to | 2 | Must be exact |
| answer references create-survey doc | 2 | Doc key must appear |
| answer is 2-5 sentences | 2 | Count sentences |
| suggestions are specific how-to follow-ups | 2 | Not generic |
| resolved = true | 2 | This is answerable |

---

### Case 2: bug_report — Survey responses not loading

**Input**:
```json
{
  "message": "My survey responses aren't loading. The page just spins.",
  "conversation_context": {
    "previous_turns": [],
    "intent_history": [],
    "tool_calls_made": [],
    "unresolved_issues": []
  },
  "tool_results": {
    "get_known_issues": {
      "issues": [
        {
          "id": "KI-0042",
          "title": "Responses tab loading spinner — intermittent delay",
          "severity": "medium",
          "status": "investigating",
          "workaround": "Hard refresh (Ctrl+Shift+R / Cmd+Shift+R) clears the cache. If the issue persists, try a different browser."
        }
      ]
    },
    "get_account_state": {
      "plan": "growth",
      "credits_remaining": 4200,
      "active_surveys": 3,
      "has_issues": false
    }
  },
  "session_state": {
    "org_id": "org_abc123",
    "user_id": "user_xyz",
    "plan_tier": "growth",
    "session_id": "sess_002",
    "turn_number": 1
  }
}
```

**Expected output fields**:
```json
{
  "intent": "bug_report",
  "resolved": true,
  "confidence": ">= 0.75",
  "citations": ["KI-0042"],
  "answer": "contains known issue KI-0042 and the workaround (hard refresh)"
}
```

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| intent = bug_report | 2 | Must be exact |
| answer surfaces known issue KI-0042 | 2 | Must mention the known issue |
| workaround included in answer | 2 | Hard refresh must be mentioned |
| no unnecessary diagnostics requested | 2 | Don't ask user to reproduce — it's a known issue |
| suggestions include workaround or escalation option | 2 | Context-specific suggestions |

---

### Case 3: billing — Credits ran out mid-survey

**Input**:
```json
{
  "message": "My credits ran out in the middle of collecting survey responses. Some responses may be lost.",
  "conversation_context": {
    "previous_turns": [],
    "intent_history": [],
    "tool_calls_made": [],
    "unresolved_issues": []
  },
  "tool_results": {
    "get_account_state": {
      "plan": "starter",
      "credits_remaining": 0,
      "active_surveys": 2,
      "has_issues": true
    },
    "search_support_docs": {
      "docs": [
        {
          "key": "credits-and-billing",
          "title": "Credits and Billing",
          "excerpt": "When credits reach zero, new responses are queued but not processed until credits are replenished. Queued responses are retained for 48 hours.",
          "category": "billing"
        }
      ],
      "total": 1
    }
  },
  "session_state": {
    "org_id": "org_abc123",
    "user_id": "user_xyz",
    "plan_tier": "starter",
    "session_id": "sess_003",
    "turn_number": 1
  }
}
```

**Expected output fields**:
```json
{
  "intent": "billing",
  "resolved": false,
  "confidence": "< 0.65",
  "escalation_package": {
    "severity": "high",
    "context": {
      "intent": "billing",
      "known_issues_checked": true
    }
  }
}
```

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| intent = billing | 2 | Must be exact |
| answer explains queued-response behavior (48h) | 2 | From doc credits-and-billing |
| escalation_package present | 2 | Billing + data concern = escalate |
| severity = high | 2 | Potential data loss concern |
| action_proposals includes plan upgrade if applicable | 1 | Optional but shows awareness |

---

### Case 4: account_issue — Can't see org's surveys

**Input**:
```json
{
  "message": "I can't see any of my organization's surveys. I only see surveys I created myself.",
  "conversation_context": {
    "previous_turns": [],
    "intent_history": [],
    "tool_calls_made": [],
    "unresolved_issues": []
  },
  "tool_results": {
    "get_account_state": {
      "plan": "growth",
      "credits_remaining": 8500,
      "active_surveys": 0,
      "has_issues": false
    },
    "search_support_docs": {
      "docs": [
        {
          "key": "survey-visibility-permissions",
          "title": "Survey Visibility and Permissions",
          "excerpt": "Surveys are visible to users based on their role. Viewers can only see surveys they are explicitly invited to. Editors and above see all org surveys. Check your role in Settings > Team Members.",
          "category": "account"
        }
      ],
      "total": 1
    }
  },
  "session_state": {
    "org_id": "org_abc123",
    "user_id": "user_xyz",
    "plan_tier": "growth",
    "session_id": "sess_004",
    "turn_number": 1
  }
}
```

**Expected output fields**:
```json
{
  "intent": "account_issue",
  "resolved": true,
  "confidence": ">= 0.80",
  "citations": ["survey-visibility-permissions"],
  "answer": "explains role-based visibility and directs user to Settings > Team Members"
}
```

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| intent = account_issue | 2 | Must be exact |
| answer mentions Viewer role limitation | 2 | Core doc content |
| answer mentions Settings > Team Members | 2 | Actionable direction |
| doc key cited | 2 | survey-visibility-permissions must appear |
| suggestions include checking role | 2 | Specific to this issue |

---

### Case 5: api_help — Webhooks API authentication

**Input**:
```json
{
  "message": "How do I authenticate requests to the Experient webhooks API? I keep getting 401 errors.",
  "conversation_context": {
    "previous_turns": [],
    "intent_history": [],
    "tool_calls_made": [],
    "unresolved_issues": []
  },
  "tool_results": {
    "search_support_docs": {
      "docs": [
        {
          "key": "webhooks-api-auth",
          "title": "Webhooks API Authentication",
          "excerpt": "All webhook requests are authenticated with an HMAC-SHA256 signature in the X-Experient-Signature header. Compute the signature using your webhook secret from Settings > Integrations > Webhooks.",
          "category": "api"
        }
      ],
      "total": 1
    }
  },
  "session_state": {
    "org_id": "org_abc123",
    "user_id": "user_xyz",
    "plan_tier": "growth",
    "session_id": "sess_005",
    "turn_number": 1
  }
}
```

**Expected output fields**:
```json
{
  "intent": "api_help",
  "resolved": true,
  "confidence": ">= 0.85",
  "citations": ["webhooks-api-auth"],
  "answer": "mentions HMAC-SHA256, X-Experient-Signature header, and Settings > Integrations location"
}
```

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| intent = api_help | 2 | Must be exact |
| answer explains HMAC-SHA256 mechanism | 2 | Core technical detail |
| answer mentions where to find webhook secret | 2 | Settings > Integrations > Webhooks |
| suggestions include testing with curl example | 1 | Helpful but not required |
| no hallucinated API behavior | 2 | Only what doc says |

---

### Case 6: known_issue — Asking about something in known issues

**Input**:
```json
{
  "message": "The insights page is showing a loading error for our NPS survey. Is this a bug?",
  "conversation_context": {
    "previous_turns": [],
    "intent_history": [],
    "tool_calls_made": [],
    "unresolved_issues": []
  },
  "tool_results": {
    "get_known_issues": {
      "issues": [
        {
          "id": "KI-0055",
          "title": "Insights page error for surveys with > 5000 responses",
          "severity": "high",
          "status": "fix_in_progress",
          "workaround": "Use the Export feature to download data and view offline while the fix is deployed. ETA: 2026-07-01."
        }
      ]
    }
  },
  "session_state": {
    "org_id": "org_abc123",
    "user_id": "user_xyz",
    "plan_tier": "enterprise",
    "session_id": "sess_006",
    "turn_number": 1
  }
}
```

**Expected output fields**:
```json
{
  "intent": "bug_report",
  "resolved": true,
  "confidence": ">= 0.90",
  "citations": ["KI-0055"],
  "answer": "confirms known issue KI-0055, mentions workaround (Export feature) and ETA"
}
```

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| intent = bug_report | 2 | Must be exact |
| answer confirms this is a known issue | 2 | Does not deny or deflect |
| workaround surfaced | 2 | Export feature must be mentioned |
| ETA communicated | 2 | 2026-07-01 from known issue |
| does NOT ask user to reproduce steps | 2 | Already confirmed known issue |

---

### Case 7: escalate — User explicitly asks for human

**Input**:
```json
{
  "message": "I need to speak with a real support engineer. This has been going on for 3 days.",
  "conversation_context": {
    "previous_turns": [
      {"role": "user", "content": "My responses export keeps failing"},
      {"role": "assistant", "content": "I searched for docs on export failures but couldn't find a specific match..."}
    ],
    "intent_history": ["bug_report"],
    "tool_calls_made": ["search_support_docs", "get_known_issues"],
    "unresolved_issues": ["responses export failing for 3 days"]
  },
  "tool_results": {
    "get_account_state": {
      "plan": "growth",
      "credits_remaining": 3100,
      "active_surveys": 5,
      "has_issues": false
    },
    "create_support_ticket": {
      "ticket_id": "TKT-20260625-0042",
      "status": "created",
      "message": "Ticket created. A support engineer will respond within 4 hours."
    }
  },
  "session_state": {
    "org_id": "org_abc123",
    "user_id": "user_xyz",
    "plan_tier": "growth",
    "session_id": "sess_007",
    "turn_number": 3
  }
}
```

**Expected output fields**:
```json
{
  "intent": "escalate",
  "resolved": false,
  "confidence": "< 0.50",
  "escalation_package": {
    "title": "contains 'export' and issue description",
    "severity": "high",
    "context": {
      "intent": "escalate",
      "known_issues_checked": true
    }
  },
  "answer": "confirms ticket TKT-20260625-0042 created and includes response time"
}
```

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| intent = escalate | 2 | Must be exact |
| ticket ID in answer | 2 | TKT-20260625-0042 must appear |
| resolved = false | 2 | User asked for human, not resolved by AI |
| escalation_package severity = high | 2 | 3-day ongoing issue |
| answer empathetic and confirms next steps | 2 | "A support engineer will respond within 4 hours" |

---

### Case 8: multi-turn — Using context from previous turns

**Input**:
```json
{
  "message": "Still not working. I tried the hard refresh you mentioned.",
  "conversation_context": {
    "previous_turns": [
      {"role": "user", "content": "My survey responses aren't loading"},
      {"role": "assistant", "content": "This matches known issue KI-0042. Try a hard refresh (Ctrl+Shift+R). [support-doc:known-issue-KI-0042]"}
    ],
    "intent_history": ["bug_report"],
    "tool_calls_made": ["get_known_issues", "get_account_state"],
    "unresolved_issues": ["responses tab not loading after hard refresh"]
  },
  "tool_results": {
    "create_support_ticket": {
      "ticket_id": "TKT-20260625-0099",
      "status": "created",
      "message": "Ticket created. A support engineer will respond within 4 hours."
    }
  },
  "session_state": {
    "org_id": "org_abc123",
    "user_id": "user_xyz",
    "plan_tier": "growth",
    "session_id": "sess_008",
    "turn_number": 2
  }
}
```

**Expected output fields**:
```json
{
  "intent": "bug_report",
  "resolved": false,
  "confidence": "< 0.50",
  "escalation_package": {
    "severity": "medium",
    "context": {
      "conversation_summary": "mentions previous workaround failed"
    }
  },
  "answer": "acknowledges prior attempt failed, confirms ticket TKT-20260625-0099"
}
```

**Rubric**:
| Criterion | Score (0-2) | Notes |
|-----------|-------------|-------|
| intent = bug_report (continuity from prior turn) | 2 | Must continue prior intent |
| answer acknowledges hard refresh was tried | 2 | Must reference prior turn context |
| escalation_package includes conversation history context | 2 | conversation_summary must reference the hard refresh attempt |
| does NOT repeat the hard refresh advice | 2 | Already tried — don't repeat failed advice |
| ticket ID in answer | 2 | TKT-20260625-0099 must appear |
