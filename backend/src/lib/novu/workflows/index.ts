export { surveyInviteWorkflow } from './survey-invite';
export { closeTheLoopWorkflow } from './close-the-loop';
export { responseAlertWorkflow } from './response-alert';
export { caseAlertWorkflow } from './case-alert';
export { slaBreachWorkflow } from './sla-breach';
export { insightReadyWorkflow } from './insight-ready';
export { weeklyDigestWorkflow } from './weekly-digest';

import { surveyInviteWorkflow } from './survey-invite';
import { closeTheLoopWorkflow } from './close-the-loop';
import { responseAlertWorkflow } from './response-alert';
import { caseAlertWorkflow } from './case-alert';
import { slaBreachWorkflow } from './sla-breach';
import { insightReadyWorkflow } from './insight-ready';
import { weeklyDigestWorkflow } from './weekly-digest';

export const allWorkflows = [
  surveyInviteWorkflow,
  closeTheLoopWorkflow,
  responseAlertWorkflow,
  caseAlertWorkflow,
  slaBreachWorkflow,
  insightReadyWorkflow,
  weeklyDigestWorkflow,
];
