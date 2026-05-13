import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Icon } from '../components/Icon';
import { useApi } from '../hooks/useApi';
import { ROUTES, toPath } from '../constants/routes';
import { useTranslation } from '../lib/i18n';
import { useSetPageTitle } from '../contexts/pageTitle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '../components/PageHeader';

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const SURVEY_TYPE_COLORS = {
  nps:              '#2a4bd9',
  csat:             '#059669',
  product_feedback: '#8329c8',
  employee:         '#d97706',
  onboarding:       '#0891b2',
  custom:           '#6b7280',
};

const fadeUp = {
  hidden:  { opacity: 0, y: 16 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.35, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] } }),
};

export function DataPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const api = useApi();
  useSetPageTitle(t('data.pageTitle'), t('data.pageSubtitle'));

  const [surveys, setSurveys] = useState([]);
  const [selectedSurveyId, setSelectedSurveyId] = useState('all');
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load surveys for the filter dropdown
  useEffect(() => {
    if (!api) return;
    api.listSurveys({ limit: 50 })
      .then(r => setSurveys(r.surveys || []))
      .catch(err => console.error('Failed to load surveys:', err));
  }, [api]);

  // Load responses for selected survey
  const loadResponses = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    setError(null);
    try {
      if (selectedSurveyId === 'all') {
        // Load responses across all surveys by loading each active survey's responses
        const r = await api.listSurveys({ status: ['active'], limit: 10 });
        const activeSurveys = r.surveys || [];
        const allResponses = [];
        await Promise.all(
          activeSurveys.slice(0, 5).map(async (survey) => {
            try {
              const res = await api.getResponses(survey.id);
              const rows = (res.responses || []).map(resp => ({ ...resp, _survey: survey }));
              allResponses.push(...rows);
            } catch {}
          })
        );
        allResponses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setResponses(allResponses.slice(0, 50));
      } else {
        const res = await api.getResponses(selectedSurveyId);
        const survey = surveys.find(s => s.id === selectedSurveyId);
        const rows = (res.responses || []).map(resp => ({ ...resp, _survey: survey }));
        setResponses(rows);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api, selectedSurveyId, surveys]);

  useEffect(() => { loadResponses(); }, [loadResponses]);

  return (
    <div className="max-w-5xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('data.pageTitle'), icon: 'dataset', path: ROUTES.DATA }]}
        title={t('data.pageTitle')}
        subtitle={selectedSurveyId === 'all'
          ? `${responses.length} responses across active surveys`
          : `${responses.length} total responses`}
        actions={
          <div className="flex items-center gap-3">
            <Select value={selectedSurveyId} onValueChange={setSelectedSurveyId}>
              <SelectTrigger className="w-52 text-sm font-semibold rounded-xl border-[rgba(171,173,175,0.3)]">
                <SelectValue placeholder={t('data.allSurveys')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('data.allSurveys')}</SelectItem>
                {surveys.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" onClick={loadResponses} className="rounded-xl">
              <Icon name="refresh" size={18} />
            </Button>
          </div>
        }
      />

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(42,75,217,0.2)', borderTopColor: '#2a4bd9' }} />
        </div>
      )}

      {error && !loading && (
        <div className="banner-error mb-4">{error}</div>
      )}

      {!loading && !error && responses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(42,75,217,0.06)' }}>
            <Icon name="dataset" size={28} className="text-primary" />
          </div>
          <h3 className="font-bold text-lg text-on-surface mb-2 font-headline">{t('data.emptyHeading')}</h3>
          <p className="text-sm text-on-surface-variant max-w-xs">{t('data.emptyDescription')}</p>
          <Button onClick={() => navigate(ROUTES.SURVEYS)} variant="gradient" className="mt-6 rounded-xl font-bold">
            View Surveys
          </Button>
        </div>
      )}

      {!loading && !error && responses.length > 0 && (
        <motion.div
          className="space-y-3"
          variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
          initial="hidden"
          animate="visible"
        >
          {responses.map((resp, i) => {
            const survey = resp._survey;
            const accentColor = SURVEY_TYPE_COLORS[survey?.survey_type_id] || '#6b7280';
            const answers = resp.answers || {};
            const answerCount = Object.keys(answers).length;

            return (
              <motion.div
                key={resp.id || i}
                custom={i}
                variants={fadeUp}
                className="glass-card rounded-2xl border border-[rgba(255,255,255,0.6)] shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => survey && navigate(toPath(ROUTES.RESPONSE_DASHBOARD, { surveyId: survey.id }))}
              >
                <div className="flex items-start gap-4 p-4">
                  {/* Left accent bar */}
                  <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: accentColor, minHeight: 40 }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {survey && (
                        <span className="text-xs font-bold text-on-surface-variant truncate max-w-[200px]">
                          {survey.title}
                        </span>
                      )}
                      <span className="text-on-surface-variant opacity-40">·</span>
                      <span className="text-xs text-on-surface-variant">{timeAgo(resp.created_at)}</span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <Badge variant="secondary" className="text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {answerCount} {answerCount === 1 ? 'answer' : 'answers'}
                      </Badge>
                      {resp.metadata?.channel && (
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5 rounded-full">
                          {resp.metadata.channel}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Icon name="chevron_right" size={16} className="text-on-surface-variant flex-shrink-0 mt-1" />
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
