# Examples: crystal-support

## Example 1: How-to question — Adding skip logic

**Input**:
```json
{
  "message": "How do I add skip logic so question 4 only shows if someone answered 'No' to question 2?",
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
          "key": "skip-logic-setup",
          "title": "Conditional Logic (Skip Logic)",
          "excerpt": "Skip logic lets you show or hide questions based on prior answers. In the Survey Builder, click the Logic tab on any question. Set the condition (e.g. Question 2 = No) and the action (Show Question 4 / Hide all others).",
          "category": "feature"
        },
        {
          "key": "skip-logic-limits",
          "title": "Skip Logic Plan Requirements",
          "excerpt": "Conditional logic is available on Growth and Enterprise plans. Starter plan surveys support simple linear question flow only.",
          "category": "feature"
        }
      ],
      "total": 2
    },
    "get_feature_status": {
      "feature": "skip-logic",
      "status": "live",
      "docs": ["skip-logic-setup"],
      "known_issues": []
    }
  },
  "session_state": {
    "org_id": "org_acme_01",
    "user_id": "user_jsmith",
    "plan_tier": "growth",
    "session_id": "sess_howto_001",
    "turn_number": 1
  }
}
```

**Output**:
```json
{
  "answer": "To add skip logic, open your survey in the Survey Builder and click the Logic tab on Question 4 [support-doc:skip-logic-setup]. Set the condition to 'Question 2 equals No' and the action to 'Show this question'. Respondents who answer anything other than 'No' to Question 2 will skip Question 4 automatically. This feature is available on your Growth plan [support-doc:skip-logic-limits].",
  "citations": ["skip-logic-setup", "skip-logic-limits"],
  "suggestions": [
    "How do I add multiple conditions to the same skip logic rule?",
    "Can I preview how the skip logic will work before publishing?",
    "How do I set up piping to carry a previous answer into a later question's text?"
  ],
  "intent": "how_to",
  "confidence": 0.95,
  "resolved": true
}
```

---

## Example 2: Bug report — NPS chart not updating

**Input**:
```json
{
  "message": "Our NPS chart in the Insights page hasn't updated in 3 days even though we have new responses coming in.",
  "conversation_context": {
    "previous_turns": [],
    "intent_history": [],
    "tool_calls_made": [],
    "unresolved_issues": []
  },
  "tool_results": {
    "get_known_issues": {
      "issues": []
    },
    "get_account_state": {
      "plan": "enterprise",
      "credits_remaining": 47200,
      "active_surveys": 8,
      "has_issues": false
    },
    "search_support_docs": {
      "docs": [
        {
          "key": "insights-refresh-schedule",
          "title": "Insights Page Refresh Schedule",
          "excerpt": "Insights metrics update every 6 hours for Growth plans and every 2 hours for Enterprise. Manual refresh is available via the Refresh button in the top-right of the Insights page. If insights haven't updated after 24 hours, contact support.",
          "category": "feature"
        }
      ],
      "total": 1
    }
  },
  "session_state": {
    "org_id": "org_techcorp_99",
    "user_id": "user_amartinez",
    "plan_tier": "enterprise",
    "session_id": "sess_bug_002",
    "turn_number": 1
  }
}
```

**Output**:
```json
{
  "answer": "No active known issues were found for the Insights page [tool:get_known_issues]. On Enterprise, insights should refresh every 2 hours — if you haven't seen an update in 3 days, this is outside the expected behavior [support-doc:insights-refresh-schedule]. Try the manual Refresh button in the top-right of the Insights page first. If that doesn't resolve it within an hour, I recommend creating a support ticket so our team can inspect the insight pipeline for your org.",
  "citations": ["insights-refresh-schedule"],
  "suggestions": [
    "Would you like me to create a support ticket to investigate the 3-day refresh delay?",
    "Have new responses actually appeared in the Responses tab, or could the intake also be affected?",
    "Which survey specifically is showing stale insights — is it one survey or all 8 of your active surveys?"
  ],
  "intent": "bug_report",
  "confidence": 0.68,
  "resolved": false,
  "escalation_package": {
    "title": "NPS insights not refreshing for 3 days — Enterprise org",
    "description": "User reports NPS chart in Insights page has not updated for 3 days despite active survey responses being collected. Enterprise plan (2-hour refresh expected). No known issues found. Manual refresh not yet attempted at time of report.",
    "context": {
      "intent": "bug_report",
      "conversation_summary": "User on Enterprise plan reports 3-day stale Insights page. No matching known issues. Account state shows 8 active surveys and healthy credit balance.",
      "docs_consulted": ["insights-refresh-schedule"],
      "account_state": {
        "plan": "enterprise",
        "credits_remaining": 47200,
        "active_surveys": 8,
        "has_issues": false
      },
      "known_issues_checked": true,
      "crystal_confidence": 0.68
    },
    "severity": "high"
  }
}
```

---

## Example 3: API help — Webhook signature validation

**Input**:
```json
{
  "message": "I'm trying to validate webhook signatures in Python but keep getting mismatches. Here's my code: `hmac.new(secret, payload, sha256).hexdigest()`",
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
          "key": "webhooks-signature-validation",
          "title": "Webhook Signature Validation",
          "excerpt": "The HMAC signature is computed over the raw request body bytes using your webhook secret as the key. The secret must be encoded as UTF-8 bytes. The X-Experient-Signature header contains the hex digest prefixed with 'sha256='. Example Python: `hmac.new(secret.encode('utf-8'), payload, hashlib.sha256).hexdigest()` — compare to header value after stripping the 'sha256=' prefix.",
          "category": "api"
        }
      ],
      "total": 1
    },
    "get_doc_by_key": {
      "key": "webhooks-signature-validation",
      "title": "Webhook Signature Validation",
      "content": "Full doc: The HMAC key must be the secret encoded as UTF-8 bytes, not a string. The header value is `sha256=<hexdigest>`. Strip the prefix before comparing. Use `hmac.compare_digest()` to prevent timing attacks. Your webhook secret is in Settings > Integrations > Webhooks > Secret."
    }
  },
  "session_state": {
    "org_id": "org_devshop_44",
    "user_id": "user_devops",
    "plan_tier": "growth",
    "session_id": "sess_api_003",
    "turn_number": 1
  }
}
```

**Output**:
```json
{
  "answer": "The issue is that `hmac.new()` expects the key as bytes, not a string — you need `secret.encode('utf-8')` [support-doc:webhooks-signature-validation]. Also, the `X-Experient-Signature` header value is prefixed with `sha256=`, so you must strip that prefix before comparing to your computed digest. Use `hmac.compare_digest()` instead of `==` to prevent timing attacks.",
  "citations": ["webhooks-signature-validation"],
  "suggestions": [
    "Should I show you the complete corrected Python validation code?",
    "Are you using the webhook secret from Settings > Integrations > Webhooks > Secret, or a different key?",
    "Do you want to check if there are any recent changes to the webhook payload format that could affect the signature?"
  ],
  "intent": "api_help",
  "confidence": 0.93,
  "resolved": true
}
```
