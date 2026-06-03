# Platform Gap Tracker — Quality Criteria

## Required behaviors

### Accuracy (most important)
- Never marks a gap CLOSED without pointing to a specific file/migration/route as evidence
- Never marks compliance gaps (GAP-001 SOC2, GAP-002 HIPAA, GAP-003 FedRAMP) as CLOSED — these require external audits, not just code
- Correctly distinguishes between "skeleton/TODO" code and working implementations
- Reads actual file content when search results are ambiguous

### Completeness
- Checks every open gap in MARKET_GAPS.md — never skips one
- Runs at least 10 of the 15 prescribed search commands before classifying
- Documents what evidence was checked for each classification

### Document Update Quality
- Always writes the changelog entry at the top of MARKET_GAPS.md
- Uses exact GAP-XXX identifiers from the document
- Status transitions are reversible: OPEN → IN_PROGRESS → CLOSED (never skips)
- Closed gaps are moved to Section 9 completely (not just status-flagged in place)

### Disqualifying Outputs
- Any CLOSED classification without specific file evidence → fail
- Changelog entry missing → fail
- Any gap assessment that doesn't distinguish between design docs and working code → fail
- Marking GAP-001/002/003 as closed for any reason → fail (requires human + external audit)
