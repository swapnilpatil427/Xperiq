import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { useTranslation } from '../lib/i18n';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ChartSpec } from '../lib/api';

const EXAMPLES = [
  'Show me NPS by region as a bar chart',
  'How has CSAT trended over time?',
  'Sentiment distribution as a pie',
  'Responses by survey',
];
const PIE_COLORS = ['var(--color-primary)', 'var(--color-tertiary)', 'var(--color-secondary)', '#d97706', '#059669'];

export function ChartStudioPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('visual.pageTitle'), t('visual.pageSubtitle'));
  const api = useApi();
  const [request, setRequest] = useState('');
  const [spec, setSpec] = useState<ChartSpec | null>(null);
  const [data, setData] = useState<Array<{ label: string; value: number }>>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Demo data: org response volume by day (real data from the org analytics endpoint).
  useEffect(() => {
    api.getOrgAnalytics()
      .then((a) => setData((a.responses_by_day || []).map((d) => ({ label: d.day, value: d.count }))))
      .catch(() => setData([]));
  }, [api]);

  async function generate(req: string) {
    const q = req.trim();
    if (!q) return;
    setGenerating(true); setError(null);
    try {
      const { spec } = await api.generateChartSpec(q);
      setSpec(spec);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('visual.error'));
    } finally { setGenerating(false); }
  }

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader title={t('visual.pageTitle')} subtitle={t('visual.pageSubtitle')} />

      <Card className="p-4 mb-4">
        <form onSubmit={(e) => { e.preventDefault(); generate(request); }} className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}>◆</span>
          <Input value={request} onChange={(e) => setRequest(e.target.value)} placeholder={t('visual.placeholder')} className="flex-1" />
          <Button type="submit" disabled={generating || !request.trim()}>
            {generating ? t('visual.generating') : t('visual.generate')}
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => { setRequest(ex); generate(ex); }}
              className="text-xs px-2.5 py-1 rounded-full bg-muted/60 text-on-surface-variant hover:text-on-surface transition-colors">
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3 mb-4">{error}</div>}

      {spec && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-on-surface">{spec.title}</h3>
              <Badge variant="purple" className="capitalize">{spec.chartType}</Badge>
            </div>
            <p className="text-xs text-on-surface-variant mb-4">
              <Icon name="auto_awesome" size={12} className="inline mr-1" />{spec.rationale}
            </p>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>{renderChart(spec.chartType, data)}</ResponsiveContainer>
            </div>
            <p className="text-[11px] text-on-surface-variant/70 mt-2">{t('visual.demoNote')}</p>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

function renderChart(type: ChartSpec['chartType'], data: Array<{ label: string; value: number }>) {
  const common = { data };
  switch (type) {
    case 'line':
      return <LineChart {...common}><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} /></LineChart>;
    case 'area':
      return <AreaChart {...common}><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Area type="monotone" dataKey="value" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.2} /></AreaChart>;
    case 'pie':
      return <PieChart><Pie data={data.slice(-6)} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={90}>{data.slice(-6).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip /></PieChart>;
    case 'scatter':
      return <ScatterChart><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis dataKey="value" tick={{ fontSize: 11 }} /><Tooltip /><Scatter data={data} fill="var(--color-primary)" /></ScatterChart>;
    default:
      return <BarChart {...common}><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} /></BarChart>;
  }
}
