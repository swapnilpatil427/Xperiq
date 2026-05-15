// Single source of truth for all navigation route identifiers.
// Import ROUTES everywhere — never use raw string literals for page names.
export const ROUTES = {
  LANDING:            '/',
  SIGNIN:             '/signin',
  ONBOARDING:         '/onboarding',
  SURVEYS:            '/app/surveys',
  CREATE:             '/app/surveys/create',
  BUILDER:            '/app/surveys/:surveyId/build',
  RESPONSE_DASHBOARD: '/app/surveys/:surveyId/responses',
  INSIGHTS:           '/app/insights',
  ADVANCED_INSIGHTS:  '/app/insights/advanced',
  INSIGHTS_BRIEF:     '/app/insights/brief',
  INSIGHTS_METRICS:   '/app/insights/metrics',
  INSIGHTS_FINDINGS:  '/app/insights/findings',
  INSIGHTS_SURFACED:  '/app/insights/surfaced',
  RESPONDENTS:        '/app/respondents',
  TEMPLATES:          '/app/templates',
  TEMPLATE_EDITOR:    '/app/templates/new',
  WORKFLOWS:          '/app/workflows',
  SETTINGS:           '/app/settings',
  DATA:               '/app/data',
};

/** Replace :param placeholders with concrete values */
export function toPath(route: string, params: Record<string, string> = {}) {
  return Object.entries(params).reduce(
    (p, [k, v]) => p.replace(`:${k}`, String(v)),
    route
  );
}
