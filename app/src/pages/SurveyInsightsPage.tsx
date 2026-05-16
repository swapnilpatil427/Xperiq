// SurveyInsightsPage — redirects to the unified Insights dashboard with this survey pre-selected.
// Deep links (/app/surveys/:id/insights) are preserved and land on the correct scope.
import { useParams, Navigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes';

export function SurveyInsightsPage() {
  const { surveyId } = useParams<{ surveyId: string }>();
  return <Navigate to={`${ROUTES.INSIGHTS}?survey=${surveyId ?? ''}`} replace />;
}
