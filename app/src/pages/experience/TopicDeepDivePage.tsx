import { useParams } from 'react-router-dom';
import { useTranslation } from '../../lib/i18n';
import { useTopicDeepDive } from '../../hooks/useExperience';

export function TopicDeepDivePage() {
  const { surveyId, topicId } = useParams<{ surveyId: string; topicId: string }>();
  const { t } = useTranslation();
  const { data, loading } = useTopicDeepDive(surveyId!, topicId!);

  if (loading) return <div className="p-6 animate-pulse">{t('common.loading')}</div>;
  if (!data) return <div className="p-6 opacity-50">{t('insights.topics.notFound')}</div>;

  const { topic, detail } = data as any;

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <div className="glass-card rounded-xl p-6">
        <h1 className="text-2xl font-semibold">{topic.name}</h1>
        <div className="flex gap-6 mt-3 text-sm opacity-70">
          <span>{topic.volume} {t('common.responses')}</span>
          {topic.sentiment_score != null && <span>Sentiment: {(topic.sentiment_score * 100).toFixed(0)}%</span>}
          {topic.effort_score != null && <span>Effort: {topic.effort_score}</span>}
          {topic.trending && <span className="capitalize">Trend: {topic.trending}</span>}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-medium mb-3">{t('insights.verbatims.title')}</h2>
        <div className="space-y-2">
          {detail?.verbatims?.map((v: any, i: number) => (
            <div key={i} className={`glass-card rounded-xl p-3 border-l-4 ${
              v.sentiment === 'positive' ? 'border-green-500' :
              v.sentiment === 'negative' ? 'border-red-500' : 'border-gray-400'
            }`}>
              <p className="text-sm">{v.text}</p>
              <div className="text-xs opacity-50 mt-1 capitalize">{v.sentiment}</div>
            </div>
          ))}
          {(!detail?.verbatims || detail.verbatims.length === 0) && (
            <div className="text-center py-8 opacity-50">{t('insights.verbatims.empty')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
