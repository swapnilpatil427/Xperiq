# Gap Analyst Skill Evals

## E1: Coverage score is in [0.0, 1.0]
PASS: output.coverage_score >= 0.0 AND output.coverage_score <= 1.0
FAIL: score outside range

## E2: Every gap has a suggested_survey with non-empty title and type
PASS: all gaps have suggested_survey.title and suggested_survey.type
FAIL: any gap missing suggested_survey

## E3: Severity distribution is sensible
PASS: critical gaps <= 3 (not everything is critical)
FAIL: more than 3 critical gaps in a single output

## E4: Summary is present and non-empty
PASS: len(output.summary) > 30
FAIL: missing or too short summary

## E5: No hallucinated survey types
PASS: all suggested_survey.type values are standard XM survey types
FAIL: invented survey types not in [nps, csat, ces, pulse, exit_interview, product_feedback, onboarding, engagement, custom]
