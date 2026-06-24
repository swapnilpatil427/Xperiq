# XM Market Researcher — Quality Criteria

## What "good" looks like

### Sourcing (Required)
- Every competitor capability claim has at least one source (URL, publication name, date)
- Sources are from the last 90 days unless explicitly noted as historical
- G2/Capterra reviews are cited with approximate count ("~30 reviews mention X"), not single anecdotes
- Job postings used as signals are from within the last 60 days

### Gap Analysis Quality
- `gap_updates` contains at least 3 entries after any 90-day research window
- New gaps (`new_gaps`) are genuinely new — not duplicates of existing GAP-XXX entries
- Each gap has a specific Crystal opportunity identified where one exists
- Effort estimates are realistic (not "1 day" for SOC 2 certification)

### Market Shifts Quality
- At least 1 macro market shift identified per research run
- Implication for Experient is specific (not "this could be important") 
- Urgency classifications are defensible: "immediate" = decision needed in <30 days

### Competitor Weaknesses
- Weaknesses are based on customer evidence (reviews, forums), not assumptions
- Each weakness maps to a specific Experient capability that addresses it
- Crystal opportunity is identified where the weakness creates an AI-first win

### Disqualifying Outputs
- Any output without source citations on competitor claims → fail
- Any output that claims a gap is closed without evidence it shipped → fail
- Output that is purely positive about Experient's position → fail (this document exists to surface hard truths)
- Missing new gaps when research clearly shows a competitor shipped something material → fail
