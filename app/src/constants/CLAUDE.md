# Constants — Single Source of Truth

Never use raw string literals for routes, colors, or question types in components/pages.

## routes.js — ROUTES object
All app routes as named constants. Always import ROUTES and use `ROUTES.SURVEYS` etc.
`toPath(ROUTES.BUILDER, { surveyId: id })` for parameterized routes.

Current routes:
- SURVEYS: /app/surveys
- CREATE: /app/surveys/create
- BUILDER: /app/surveys/:surveyId/build
- RESPONSE_DASHBOARD: /app/surveys/:surveyId/responses
- INSIGHTS: /app/insights
- ADVANCED_INSIGHTS: /app/insights/advanced
- RESPONDENTS: /app/respondents
- TEMPLATES: /app/templates
- TEMPLATE_EDITOR: /app/templates/new
- WORKFLOWS: /app/workflows
- SETTINGS: /app/settings
- DATA: /app/data

## colors.js — GRADIENTS, BADGES, SENTIMENT_COLORS
Pre-defined color palettes for survey types, sentiment indicators, and gradients.

## questionTypes.js — QTYPE_META, QTYPE_GROUPS
All survey question type metadata (icon, label, group). Use `createQuestion(typeKey)` factory.

## surveyTypes.js — SURVEY_CATEGORIES
The list of survey category types (NPS, CSAT, Product Feedback, etc.) with descriptions.

## thresholds.js — NPS, SENTIMENT, CSAT
Score interpretation thresholds for NPS, CSAT, and sentiment analysis.
