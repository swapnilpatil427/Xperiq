# XM Market Researcher — Examples

## Example invocations

```
/xm-market-researcher
```
Full competitive landscape research. Checks all major competitors, last 90 days.

```
/xm-market-researcher --competitor qualtrics --focus ai_capabilities
```
Focused research on Qualtrics AI feature launches only.

```
/xm-market-researcher --focus employee_experience
```
Research specifically on EX market (Culture Amp, Glint, Lattice, Medallia EX).

```
/xm-market-researcher --focus compliance
```
Research on SOC 2, HIPAA, FedRAMP certifications and what customers are requiring.

## Example gap update output (partial)

```json
{
  "gap_updates": [
    {
      "gap_id": "GAP-005",
      "change_type": "urgency_increase",
      "finding": "Qualtrics announced EmployeeXM AI Coach at X4 Summit (March 2026), which generates personalized development plans for managers from 360 data. This directly addresses the Crystal opportunity we identified for GAP-005.",
      "source": "https://www.qualtrics.com/blog/x4-2026-announcements/",
      "recommended_action": "Accelerate EX module design. The Crystal coaching angle is now directly competitive — ship before Qualtrics EX AI Coach reaches general availability (announced Q3 2026).",
      "priority_change": "increase"
    }
  ]
}
```
