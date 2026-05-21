import { useParams, Link } from 'react-router-dom';
import { useTranslation } from '../../lib/i18n';
import { useTopicAnalysis } from '../../hooks/useExperience';
import { ROUTES, toPath } from '../../constants/routes';

export function TopicAnalysisHubPage() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const { t } = useTranslation();
  const { data, loading } = useTopicAnalysis(surveyId!);

  const topics: any[] = (data as any)?.topics || [];

  // Group by parent_topic_id
  const rootTopics = topics.filter((topic: any) => !topic.parent_topic_id);
  const childMap: Record<string, any[]> = {};
  topics.forEach((topic: any) => {
    if (topic.parent_topic_id) {
      (childMap[topic.parent_topic_id] = childMap[topic.parent_topic_id] || []).push(topic);
    }
  });

  if (loading) return <div className="p-6 animate-pulse">{t('common.loading')}</div>;

  return (
    <div className="max-w-5xl mx-auto w-full">
      <h1 className="text-2xl font-semibold mb-6">{t('insights.topics.title')}</h1>
      <div className="space-y-3">
        {rootTopics.map((topic: any) => (
          <div key={topic.id} className="glass-card rounded-xl p-4">
            <Link
              to={toPath(ROUTES.EXPERIENCE_SURVEY_TOPIC, { surveyId: surveyId!, topicId: topic.id })}
              className="font-medium hover:underline"
            >
              {topic.name}
            </Link>
            <div className="text-sm opacity-60 mt-1">
              {topic.volume} {t('common.responses')} · {topic.dominant_emotion || 'neutral'}
            </div>
            {childMap[topic.id]?.map((child: any) => (
              <div key={child.id} className="ml-4 mt-2 border-l-2 pl-3 opacity-80">
                <Link
                  to={toPath(ROUTES.EXPERIENCE_SURVEY_TOPIC, { surveyId: surveyId!, topicId: child.id })}
                  className="text-sm hover:underline"
                >
                  {child.name}
                </Link>
                <span className="text-xs opacity-60 ml-2">{child.volume}</span>
              </div>
            ))}
          </div>
        ))}
        {rootTopics.length === 0 && (
          <div className="text-center py-16 opacity-50">{t('insights.topics.empty')}</div>
        )}
      </div>
    </div>
  );
}
