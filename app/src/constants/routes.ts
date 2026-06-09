// Single source of truth for all navigation route identifiers.
// Import ROUTES everywhere — never use raw string literals for page names.
export const ROUTES = {
  LANDING:            '/',
  SIGNIN:             '/signin',
  ONBOARDING:         '/onboarding',
  DASHBOARD:          '/app/dashboard',
  VISUAL_STUDIO:      '/app/visual',
  SURVEYS:            '/app/surveys',
  CREATE:             '/app/surveys/create',
  BUILDER:            '/app/surveys/:surveyId/build',
  RESPONSE_DASHBOARD: '/app/surveys/:surveyId/responses',
  SURVEY_INSIGHTS:    '/app/surveys/:surveyId/insights',
  SAMPLE_RESPONSES:   '/app/surveys/:surveyId/sample-responses',
  INSIGHTS:           '/app/insights',
  INSIGHTS_TOPICS:    '/app/insights/topics',
  ADVANCED_INSIGHTS:  '/app/insights/advanced',
  INSIGHTS_BRIEF:     '/app/insights/brief',
  INSIGHTS_METRICS:   '/app/insights/metrics',
  INSIGHTS_FINDINGS:  '/app/insights/findings',
  INSIGHTS_SURFACED:  '/app/insights/surfaced',
  RESPONDENTS:        '/app/respondents',
  TEMPLATES:          '/app/templates',
  TEMPLATE_EDITOR:    '/app/templates/new',
  WORKFLOWS:          '/app/workflows',
  WORKFLOW_BUILD:     '/app/workflows/build',
  WORKFLOW_CANVAS:    '/app/workflows/canvas',
  ALERTS:             '/app/alerts',
  SETTINGS:           '/app/settings',
  NOTIFICATION_PREFS: '/app/settings/notifications',
  SETTINGS_USERS:       '/app/settings/users',
  SETTINGS_ROLES:       '/app/settings/users/roles',
  SETTINGS_DEPARTMENTS: '/app/settings/users/departments',
  SETTINGS_GROUPS:      '/app/settings/users/groups',
  SETTINGS_PROVISIONING: '/app/settings/users/provisioning',
  SETTINGS_SEATS:        '/app/settings/users/seats',
  SETTINGS_AUDIT:        '/app/settings/users/audit',
  DATA:               '/app/data',
  EXPERIENCE:                  '/app/experience',
  EXPERIENCE_ORG_TRENDS:       '/app/experience/org/trends',
  EXPERIENCE_SURVEY:           '/app/experience/survey/:surveyId',
  EXPERIENCE_SURVEY_REPORT:    '/app/experience/survey/:surveyId/report',
  EXPERIENCE_SURVEY_TOPICS:    '/app/experience/survey/:surveyId/topics',
  EXPERIENCE_SURVEY_TOPIC:     '/app/experience/survey/:surveyId/topics/:topicId',
  EXPERIENCE_SURVEY_TRENDS:    '/app/experience/survey/:surveyId/trends',
};

/** Replace :param placeholders with concrete values */
export function toPath(route: string, params: Record<string, string> = {}) {
  return Object.entries(params).reduce(
    (p, [k, v]) => p.replace(`:${k}`, String(v)),
    route
  );
}
