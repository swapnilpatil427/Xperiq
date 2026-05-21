import { Link } from 'react-router-dom';
import { useTranslation } from '../../lib/i18n';
import { useOrgOverview } from '../../hooks/useExperience';
import { ROUTES, toPath } from '../../constants/routes';

export function ExperienceHubPage() {
  const { t } = useTranslation();
  const { data, loading } = useOrgOverview();

  return (
    <div className="max-w-7xl mx-auto w-full">
      <h1 className="text-2xl font-semibold mb-2">{t('nav.experience')}</h1>
      <p className="text-sm opacity-60 mb-6">{t('experience.hub.subtitle')}</p>

      {loading && <div className="animate-pulse">{t('common.loading')}</div>}

      {data?.surveys && data.surveys.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.surveys.map((survey) => (
            <Link
              key={survey.id}
              to={toPath(ROUTES.EXPERIENCE_SURVEY, { surveyId: survey.id })}
              className="glass-card p-4 rounded-xl hover:shadow-md transition-shadow"
            >
              <div className="font-medium truncate">{survey.title}</div>
              <div className="text-sm opacity-60 mt-1">{survey.response_count} {t('common.responses')}</div>
              {survey.nps_score != null && (
                <div className={`text-sm font-semibold mt-2 ${survey.nps_score >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  NPS {survey.nps_score > 0 ? '+' : ''}{survey.nps_score}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {!loading && (!data?.surveys || data.surveys.length === 0) && (
        <div className="text-center py-16 opacity-50">{t('experience.hub.noSurveys')}</div>
      )}
    </div>
  );
}
