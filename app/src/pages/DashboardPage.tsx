import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot } from 'recharts';
import { useTranslation } from '../lib/i18n';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useApi } from '../hooks/useApi';
import { useCrystalPanel } from '../contexts/crystalPanel';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Link } from 'react-router-dom';
import { ROUTES } from '../constants/routes';
import { CustomLayout } from '../components/dashboard/CustomLayout';
import type { DashboardSummary, OrgMetricSnapshot } from '../lib/api';

const SENTIMENT_ACCENT = {
  positive: 'var(--color-success, #10b981)',
  negative: 'var(--color-destructive, #ef4444)',
  neutral: 'var(--color-primary)',
};

export function DashboardPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('dashboard.pageTitle'), t('dashboard.pageSubtitle'));
  const api = useApi();
  const { openCrystal } = useCrystalPanel();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [history, setHistory] = useState<OrgMetricSnapshot[]>([]);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getDashboardSummary(days), api.getOrgMetricHistory(days).catch(() => ({ history: [] }))])
      .then(([s, h]) => { setSummary(s); setHistory(h.history || []); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, [api, days]);

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        title={t('dashboard.pageTitle')}
        subtitle={t('dashboard.pageSubtitle')}
        actions={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">{t('dashboard.range.30')}</SelectItem>
              <SelectItem value="90">{t('dashboard.range.90')}</SelectItem>
              <SelectItem value="180">{t('dashboard.range.180')}</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <Tabs defaultValue="executive">
        <TabsList>
          <TabsTrigger value="executive">{t('dashboard.layouts.executive')}</TabsTrigger>
          <TabsTrigger value="analyst">{t('dashboard.layouts.analyst')}</TabsTrigger>
          <TabsTrigger value="operations">{t('dashboard.layouts.operations')}</TabsTrigger>
          <TabsTrigger value="insights">{t('dashboard.layouts.insights')}</TabsTrigger>
          <TabsTrigger value="custom">{t('dashboard.layouts.custom')}</TabsTrigger>
        </TabsList>

        <TabsContent value="executive">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3 mb-4">{error}</div>
          )}
          {loading || !summary ? (
            <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>
          ) : (
            <motion.div className="space-y-6"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>

              {/* Crystal Narrative Card — the dashboard writes its own story */}
              <Card className="p-6 relative overflow-hidden"
                style={{ borderLeft: `3px solid ${SENTIMENT_ACCENT[summary.narrative.sentiment]}` }}>
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}>◆</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-headline font-bold text-lg text-on-surface">{summary.narrative.headline}</h2>
                      <span className="text-[10px] uppercase tracking-wide text-on-surface-variant/70 font-semibold">{t('dashboard.crystalBrief')}</span>
                    </div>
                    {summary.narrative.paragraphs.map((p, i) => (
                      <p key={i} className="text-sm text-on-surface-variant mt-1.5 leading-relaxed">{p}</p>
                    ))}
                    <Button variant="outline" size="sm" className="mt-3"
                      onClick={() => openCrystal(t('dashboard.askCrystalSeed'))}>
                      <Icon name="auto_awesome" size={14} className="mr-1.5" />{t('dashboard.askCrystal')}
                    </Button>
                  </div>
                </div>
              </Card>

              {/* KPI tiles */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi label={t('dashboard.kpiNps')} value={summary.kpis.nps} delta={summary.kpis.npsDelta} />
                <Kpi label={t('dashboard.kpiCsat')} value={summary.kpis.csat} delta={summary.kpis.csatDelta} decimals={1} />
                <Kpi label={t('dashboard.kpiResponses')} value={summary.kpis.responses} delta={summary.kpis.responsesDelta} integer />
                <Kpi label={t('dashboard.kpiActive')} value={summary.kpis.activeSurveys} integer />
              </div>

              {/* NPS trend */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-on-surface">{t('dashboard.npsTrend')}</h3>
                  <Button variant="ghost" size="sm" onClick={() => openCrystal(t('dashboard.askTrendSeed'))}>
                    <Icon name="auto_awesome" size={14} className="mr-1" />{t('dashboard.askCrystal')}
                  </Button>
                </div>
                {history.length === 0 ? (
                  <p className="text-sm text-on-surface-variant py-8 text-center">{t('dashboard.noHistory')}</p>
                ) : (
                  <>
                    <div style={{ width: '100%', height: 220 }}>
                      <ResponsiveContainer>
                        <AreaChart data={buildTrendData(history, summary.forecast)}>
                          <defs>
                            <linearGradient id="npsFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} domain={[-100, 100]} />
                          <Tooltip />
                          <Area type="monotone" dataKey="nps" stroke="var(--color-primary)" fill="url(#npsFill)" strokeWidth={2} connectNulls />
                          {summary.forecast && (
                            <Area type="monotone" dataKey="forecast" stroke="var(--color-tertiary)" fill="none"
                              strokeWidth={2} strokeDasharray="5 4" connectNulls />
                          )}
                          {/* Crystal anomaly markers */}
                          {(summary.anomalies || []).map((a) => {
                            const pt = history[a.index];
                            if (!pt) return null;
                            return <ReferenceDot key={a.index} x={(pt.captured_at || '').slice(0, 10)} y={a.value} r={5}
                              fill={a.direction === 'down' ? 'var(--color-destructive, #ef4444)' : 'var(--color-warning, #f59e0b)'}
                              stroke="#fff" strokeWidth={1.5} />;
                          })}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    {summary.forecast && (
                      <p className="text-xs text-on-surface-variant mt-2 flex items-center gap-1.5">
                        <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--color-tertiary)' }} />
                        {t('dashboard.forecastNote', { direction: t(`dashboard.dir.${summary.forecast.direction}`) })}
                      </p>
                    )}
                    {summary.anomalies && summary.anomalies.length > 0 && (
                      <p className="text-xs text-warning mt-1 flex items-center gap-1.5">
                        <Icon name="warning" size={13} />
                        {t('dashboard.anomalyNote', { count: summary.anomalies.length })}
                      </p>
                    )}
                  </>
                )}
              </Card>
            </motion.div>
          )}
        </TabsContent>

        <TabsContent value="analyst"><AnalystLayout summary={summary} /></TabsContent>
        <TabsContent value="operations"><OperationsLayout /></TabsContent>
        <TabsContent value="insights"><InsightsLayout /></TabsContent>
        <TabsContent value="custom"><CustomLayout summary={summary} /></TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, delta, decimals = 0, integer = false }: {
  label: string; value: number | null; delta?: number | null; decimals?: number; integer?: boolean;
}) {
  const fmt = (n: number) => (integer ? Math.round(n).toLocaleString() : n.toFixed(decimals));
  const up = (delta ?? 0) > 0, down = (delta ?? 0) < 0;
  return (
    <Card className="p-4">
      <p className="text-xs text-on-surface-variant uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-on-surface mt-1">{value == null ? '—' : fmt(value)}</p>
      {delta != null && delta !== 0 && (
        <p className={`text-xs mt-0.5 flex items-center gap-0.5 ${up ? 'text-success' : down ? 'text-destructive' : 'text-on-surface-variant'}`}>
          <Icon name={up ? 'trending_up' : 'trending_down'} size={13} />
          {up ? '+' : ''}{integer ? Math.round(delta).toLocaleString() : delta.toFixed(decimals)}
        </p>
      )}
    </Card>
  );
}

// Build chart data with a dashed forecast tail anchored to the last real point.
function buildTrendData(history: OrgMetricSnapshot[], forecast: DashboardSummary['forecast']) {
  const data: Array<{ day: string; nps: number | null; forecast: number | null }> = history.map((h) => ({
    day: (h.captured_at || '').slice(0, 10), nps: h.avg_nps, forecast: null,
  }));
  if (forecast && data.length) {
    data[data.length - 1].forecast = data[data.length - 1].nps; // anchor the dashed line
    forecast.points.forEach((p, i) => data.push({ day: `+${i + 1}`, nps: null, forecast: p }));
  }
  return data;
}

const SEV_VARIANT: Record<string, 'destructive' | 'warning' | 'default' | 'success'> = {
  critical: 'destructive', warning: 'warning', info: 'default', success: 'success',
};

function AnalystLayout({ summary }: { summary: DashboardSummary | null }) {
  const { t } = useTranslation();
  if (!summary) return <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>;
  const k = summary.kpis;
  const rows = [
    { label: t('dashboard.kpiNps'), value: k.nps, delta: k.npsDelta },
    { label: t('dashboard.kpiCsat'), value: k.csat, delta: k.csatDelta },
    { label: t('dashboard.kpiResponses'), value: k.responses, delta: k.responsesDelta },
  ];
  return (
    <Card className="p-5">
      <h3 className="font-semibold text-on-surface mb-3">{t('dashboard.analyst.title')}</h3>
      <table className="w-full text-sm">
        <thead><tr className="text-on-surface-variant text-xs uppercase tracking-wide">
          <th className="text-left py-2">{t('dashboard.analyst.metric')}</th>
          <th className="text-right">{t('dashboard.analyst.current')}</th>
          <th className="text-right">{t('dashboard.analyst.change')}</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border/60">
              <td className="py-2 text-on-surface">{r.label}</td>
              <td className="text-right text-on-surface">{r.value ?? '—'}</td>
              <td className={`text-right ${(r.delta ?? 0) > 0 ? 'text-success' : (r.delta ?? 0) < 0 ? 'text-destructive' : 'text-on-surface-variant'}`}>
                {r.delta == null ? '—' : `${r.delta > 0 ? '+' : ''}${r.delta}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary.topMover && (
        <p className="text-sm text-on-surface-variant mt-4">
          {t('dashboard.analyst.topMover', { title: summary.topMover.title, delta: summary.topMover.npsDelta })}
        </p>
      )}
    </Card>
  );
}

function OperationsLayout() {
  const { t } = useTranslation();
  const api = useApi();
  const [ops, setOps] = useState<import('../lib/api').DashboardOperations | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.getDashboardOperations().then(setOps).catch(() => {}).finally(() => setLoading(false)); }, [api]);
  if (loading || !ops) return <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="p-0 overflow-hidden lg:col-span-2">
        <div className="px-4 py-3 border-b border-border font-semibold text-on-surface">{t('dashboard.ops.healthMatrix')}</div>
        <div className="divide-y divide-border">
          {ops.surveys.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.freshness === 'fresh' ? 'bg-success' : s.freshness === 'stale' ? 'bg-warning' : 'bg-muted-foreground'}`} />
              <span className="flex-1 min-w-0 truncate text-on-surface">{s.title}</span>
              <span className="text-on-surface-variant">{s.responseCount}</span>
              <span className="w-12 text-right text-on-surface">{s.nps ?? '—'}</span>
            </div>
          ))}
          {ops.surveys.length === 0 && <p className="px-4 py-6 text-center text-on-surface-variant text-sm">{t('dashboard.ops.noSurveys')}</p>}
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border font-semibold text-on-surface">{t('dashboard.ops.anomalies')}</div>
        <div className="divide-y divide-border">
          {ops.anomalies.map((a) => (
            <div key={a.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <Badge variant={SEV_VARIANT[a.severity] || 'default'} className="capitalize text-[10px]">{a.severity}</Badge>
              <span className="flex-1 min-w-0 truncate text-on-surface">{a.title}</span>
            </div>
          ))}
          {ops.anomalies.length === 0 && <p className="px-4 py-6 text-center text-on-surface-variant text-sm">{t('dashboard.ops.noAnomalies')}</p>}
        </div>
      </Card>
    </div>
  );
}

function InsightsLayout() {
  const { t } = useTranslation();
  const api = useApi();
  const [data, setData] = useState<import('../lib/api').DashboardInsights | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.getDashboardInsights().then(setData).catch(() => {}).finally(() => setLoading(false)); }, [api]);
  if (loading || !data) return <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="font-semibold text-on-surface">{t('dashboard.insights.actionBoard')}</span>
          <Badge variant="neutral">{data.actionItems.length}</Badge>
        </div>
        <div className="divide-y divide-border">
          {data.actionItems.map((a) => (
            <Link key={a.id} to={ROUTES.ALERTS} className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted/40 transition-colors">
              <Badge variant={SEV_VARIANT[a.severity] || 'default'} className="capitalize text-[10px]">{a.severity}</Badge>
              <span className="flex-1 min-w-0 truncate text-on-surface">{a.title}</span>
              <Icon name="chevron_right" size={14} className="text-on-surface-variant" />
            </Link>
          ))}
          {data.actionItems.length === 0 && <p className="px-4 py-6 text-center text-on-surface-variant text-sm">{t('dashboard.insights.noActions')}</p>}
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="font-semibold text-on-surface">{t('dashboard.insights.activity')}</span>
          <span className="text-xs text-on-surface-variant">{t('dashboard.insights.discoveries', { count: data.discoveryCount })}</span>
        </div>
        <div className="divide-y divide-border">
          {data.recentActivity.map((n) => (
            <div key={n.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <span className="flex-1 min-w-0 truncate text-on-surface">{n.title}</span>
              <span className="text-xs text-on-surface-variant whitespace-nowrap">{new Date(n.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
          {data.recentActivity.length === 0 && <p className="px-4 py-6 text-center text-on-surface-variant text-sm">{t('dashboard.insights.noActivity')}</p>}
        </div>
      </Card>
    </div>
  );
}
