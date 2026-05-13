import { Icon } from '../components/Icon';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useSurveys } from '../hooks/useSurveys';
import { INSIGHTS as INSIGHTS_THRESHOLDS } from '../constants/thresholds';
import { useTranslation } from '../lib/i18n';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const questions = [
  {
    title: 'How would you describe our tool in one word?',
    responses: '8,401 Responses',
    type: 'Open Text',
    typeColor: '#2a4bd9',
    typeBg: 'rgba(42,75,217,0.1)',
    avgTime: '42s',
  },
  {
    title: 'Rate your experience with our new dashboard.',
    responses: '12,482 Responses',
    type: 'Rating',
    typeColor: '#00647c',
    typeBg: 'rgba(0,100,124,0.1)',
    avgTime: '8s',
  },
  {
    title: 'Which feature is most critical to your workflow?',
    responses: '11,200 Responses',
    type: 'Multiple Choice',
    typeColor: '#8329c8',
    typeBg: 'rgba(131,41,200,0.1)',
    avgTime: '15s',
  },
];

export function ResponseDashboardPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('responseDashboard.pageTitle'), t('responseDashboard.dateFilter'));
  const { surveys } = useSurveys();
  const totalResponses = surveys.reduce((acc, s) => acc + (s.responseCount || 0), 0);
  const activeSurveys = surveys.filter((s) => s.status === 'active');
  const avgNps = activeSurveys.length
    ? Math.round(activeSurveys.filter((s) => s.npsScore).reduce((acc, s) => acc + s.npsScore, 0) / activeSurveys.filter((s) => s.npsScore).length)
    : 74;
  return (
        <div className="pb-24 md:pb-8 px-6 space-y-8 max-w-7xl mx-auto w-full">

          {/* Top Metrics */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Total Responses */}
            <Card
              className="p-8 relative overflow-hidden group bg-white border-muted/10"
              style={{
                borderRadius: '1rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
              }}
            >
              <div className="relative z-10">
                <p className="font-medium text-sm text-on-surface-variant">{t('responseDashboard.totalResponses')}</p>
                <h3 className="text-4xl font-black mt-2 font-headline text-on-surface">
                  {totalResponses.toLocaleString() || '12,482'}
                </h3>
                <div className="flex items-center gap-1 mt-4 font-bold text-sm text-success">
                  <Icon name="trending_up" size={16} />
                  <span>+14.2%</span>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-500 text-on-surface">
                <Icon name="groups" fill={1} size={120} />
              </div>
            </Card>

            {/* Completion Rate */}
            <Card
              className="p-8 relative overflow-hidden bg-white border-muted/10"
              style={{
                borderRadius: '1rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
              }}
            >
              <div className="relative z-10">
                <p className="font-medium text-sm text-on-surface-variant">{t('responseDashboard.completionRate')}</p>
                <h3 className="text-4xl font-black mt-2 font-headline text-on-surface">
                  84.6%
                </h3>
                <div className="mt-6">
                  <Progress value={84.6} className="h-2 [&>div]:bg-primary [&>div]:shadow-[0_0_12px_rgba(42,75,217,0.4)]" />
                </div>
              </div>
            </Card>

            {/* NPS Gauge */}
            <Card
              className="p-8 relative overflow-hidden text-white flex flex-col justify-center items-center border-0"
              style={{
                background: 'linear-gradient(135deg, #1e2b7a, #0f172a)',
                borderRadius: '1rem',
                boxShadow: '0 20px 40px -10px rgba(30,43,122,0.4)',
              }}
            >
              <div className="relative z-10 text-center">
                <p className="font-bold text-xs uppercase tracking-widest mb-2 text-indigo-300">
                  {t('responseDashboard.npsTitle')}
                </p>
                <div className="relative inline-block">
                  <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r="40" fill="transparent" stroke="rgba(99,102,241,0.3)" strokeWidth="8" />
                    <circle
                      cx="48" cy="48" r="40" fill="transparent"
                      stroke="#82deff"
                      strokeWidth="8"
                      strokeDasharray="251.2"
                      strokeDashoffset="62.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl font-black font-headline">
                    74
                  </span>
                </div>
                <p className="mt-4 font-bold text-[var(--color-secondary-fixed)]">{t('responseDashboard.npsExcellent')}</p>
              </div>
              <div
                className="absolute top-0 right-0 w-32 h-32 rounded-full"
                style={{ background: 'rgba(42,75,217,0.2)', filter: 'blur(60px)' }}
              />
            </Card>
          </section>

          {/* AI Insights + Sentiment */}
          <section className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* AI Summary */}
            <Card
              className="lg:col-span-3 p-8 relative overflow-hidden bg-white border-muted/10"
              style={{
                borderRadius: '1rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
              }}
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 rounded-xl text-tertiary bg-tertiary/10">
                  <Icon name="auto_awesome" fill={1} size={20} />
                </div>
                <h4 className="text-xl font-bold font-headline text-on-surface">
                  {t('responseDashboard.aiInsights')}
                </h4>
              </div>

              <div className="space-y-6">
                {[
                  {
                    color: '#2a4bd9',
                    text: (<><strong style={{ color: '#4f46e5' }}>Price Sensitivity:</strong> 64% of respondents mentioned value-for-money as a primary driver, yet 22% are willing to pay a premium for localized features.</>),
                  },
                  {
                    color: '#00647c',
                    text: (<><strong style={{ color: '#0d9488' }}>Onboarding Friction:</strong> Semantic analysis reveals high frustration levels during the &apos;Project Creation&apos; phase (Keywords: &quot;confusing&quot;, &quot;too many steps&quot;).</>),
                  },
                  {
                    color: '#8329c8',
                    text: (<><strong style={{ color: '#7c3aed' }}>Feature Requests:</strong> Strong recurring theme for &quot;Offline Mode&quot; and &quot;Cross-team collaboration&quot; appearing in 40% of open-ended responses.</>),
                  },
                ].map((item, i) => (
                  <div key={i} className="flex gap-4 group">
                    <div
                      className="mt-1.5 w-2 h-2 rounded-full shrink-0 group-hover:scale-150 transition-transform"
                      style={{ background: item.color }}
                    />
                    <p className="leading-relaxed text-sm text-on-surface">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-10 pt-6 flex items-center justify-between border-t border-muted/20">
                <div className="flex -space-x-2">
                  {['A', 'B', 'C'].map((l, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold text-white"
                      style={{
                        background: ['#879aff', '#d299ff', '#82deff'][i],
                        borderColor: '#ffffff',
                      }}
                    >
                      {l}
                    </div>
                  ))}
                </div>
                <div className="text-xs font-bold flex items-center gap-2 text-on-surface-variant">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {t('responseDashboard.aiConfidence', { pct: INSIGHTS_THRESHOLDS.AI_CONFIDENCE })}
                </div>
              </div>
            </Card>

            {/* Sentiment Chart */}
            <Card
              className="lg:col-span-2 p-8 relative flex flex-col justify-between overflow-hidden bg-surface-container-low border-0"
              style={{ borderRadius: '1rem' }}
            >
              <div>
                <h4 className="text-lg font-bold mb-1 font-headline text-on-surface">
                  {t('responseDashboard.sentimentProfile')}
                </h4>
                <p className="text-sm mb-8 text-on-surface-variant">
                  {t('responseDashboard.sentimentDistribution')}
                </p>
              </div>

              <div className="flex items-end justify-between gap-4 h-48 px-4 relative">
                {[
                  { label: t('responseDashboard.sentimentLabels.positive'), pct: 72, color: 'linear-gradient(to top, #2a4bd9, #879aff)' },
                  { label: t('responseDashboard.sentimentLabels.neutral'), pct: 18, color: 'linear-gradient(to top, #94a3b8, #cbd5e1)' },
                  { label: t('responseDashboard.sentimentLabels.negative'), pct: 10, color: 'linear-gradient(to top, #b41340, #f74b6d)' },
                ].map((bar) => (
                  <div key={bar.label} className="group relative flex-1">
                    <div
                      className="absolute -top-10 left-1/2 -translate-x-1/2 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800"
                    >
                      {bar.pct}%
                    </div>
                    <div
                      className="w-full rounded-t-xl soft-extrusion transition-all duration-300 group-hover:scale-y-105 group-hover:brightness-110"
                      style={{ height: `${bar.pct}%`, background: bar.color }}
                    />
                    <p className="text-[10px] font-bold text-center mt-3 uppercase tracking-tighter text-on-surface-variant">
                      {bar.label}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          {/* Questions Table */}
          <Card
            className="overflow-hidden bg-white border-muted/10"
            style={{
              borderRadius: '1rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
            }}
          >
            <div className="p-6 flex justify-between items-center border-b border-muted/20">
              <h4 className="text-xl font-bold font-headline text-on-surface">
                {t('responseDashboard.questionPerformance')}
              </h4>
              <Button variant="ghost" size="sm" className="flex items-center gap-2 text-sm font-bold text-primary hover:underline">
                <Icon name="filter_list" size={18} />
                {t('responseDashboard.filterQuestions')}
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-muted/5">
                  <tr>
                    {[t('responseDashboard.tableHeaders.questionTitle'), t('responseDashboard.tableHeaders.type'), t('responseDashboard.tableHeaders.avgTime'), t('responseDashboard.tableHeaders.action')].map((h, i) => (
                      <th
                        key={h}
                        className="px-6 py-4 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant"
                        style={{
                          textAlign: i === 3 ? 'right' : i === 2 ? 'center' : 'left',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q, i) => (
                    <tr
                      key={i}
                      className="group transition-colors border-t border-muted/10 hover:bg-muted/5"
                    >
                      <td className="px-6 py-5">
                        <p className="font-semibold text-on-surface">{q.title}</p>
                        <span className="text-[10px] text-on-surface-variant">{q.responses}</span>
                      </td>
                      <td className="px-6 py-5">
                        <Badge
                          variant="secondary"
                          className="px-3 py-1 text-[11px] font-bold rounded-full"
                          style={{ color: q.typeColor, background: q.typeBg }}
                        >
                          {q.type}
                        </Badge>
                      </td>
                      <td className="px-6 py-5 text-center font-medium text-on-surface-variant">
                        {q.avgTime}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2 ml-auto hover:-translate-y-0.5 bg-white text-on-surface border-border rounded-lg shadow-sm"
                        >
                          <Icon name="auto_awesome" fill={1} size={16} className="text-tertiary" />
                          {t('responseDashboard.viewAiExplanation')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
  );
}
