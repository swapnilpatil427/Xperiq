import { useState, useCallback } from 'react';
import { ResponsiveGridLayout, useContainerWidth, type Layout, type LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '../Icon';
import { useTranslation } from '../../lib/i18n';
import type { DashboardSummary } from '../../lib/api';

const LS_KEY = 'dashboard_custom_layout_v1';

// The widgets a user can arrange on their personal dashboard.
const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'narrative', x: 0, y: 0, w: 8, h: 3, minW: 4, minH: 2 },
  { i: 'nps', x: 8, y: 0, w: 4, h: 2, minW: 2, minH: 2 },
  { i: 'csat', x: 8, y: 2, w: 4, h: 2, minW: 2, minH: 2 },
  { i: 'responses', x: 0, y: 3, w: 4, h: 2, minW: 2, minH: 2 },
  { i: 'active', x: 4, y: 3, w: 4, h: 2, minW: 2, minH: 2 },
  { i: 'anomalies', x: 8, y: 4, w: 4, h: 2, minW: 2, minH: 2 },
];

function loadLayout(): LayoutItem[] {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) { const parsed = JSON.parse(s); if (Array.isArray(parsed) && parsed.length) return parsed; }
  } catch { /* corrupt or unavailable storage → defaults */ }
  return DEFAULT_LAYOUT;
}

// A user-arrangeable dashboard: drag tiles by their header, resize from the corner.
// The layout persists to localStorage so each user keeps their own arrangement.
// react-grid-layout v2 measures container width via the useContainerWidth hook
// (the v1 WidthProvider HOC is gone).
export function CustomLayout({ summary }: { summary: DashboardSummary | null }) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<LayoutItem[]>(loadLayout);
  const { width, containerRef, mounted } = useContainerWidth();

  const onLayoutChange = useCallback((current: Layout) => {
    const next = [...current];
    setLayout(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, []);

  const reset = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  }, []);

  if (!summary) return <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
          <Icon name="drag_indicator" size={14} />{t('dashboard.custom.hint')}
        </p>
        <Button variant="ghost" size="sm" onClick={reset}>
          <Icon name="restart_alt" size={14} className="mr-1" />{t('dashboard.custom.reset')}
        </Button>
      </div>
      <div ref={containerRef}>
        {mounted && (
          <ResponsiveGridLayout
            className="layout"
            width={width}
            layouts={{ lg: layout, md: layout, sm: layout }}
            breakpoints={{ lg: 1024, md: 768, sm: 0 }}
            cols={{ lg: 12, md: 8, sm: 4 }}
            rowHeight={72}
            margin={[16, 16]}
            dragConfig={{ handle: '.widget-drag' }}
            onLayoutChange={onLayoutChange}
          >
            {layout.map((item) => (
              <div key={item.i}>
                <Widget id={item.i} summary={summary} />
              </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}

function Widget({ id, summary }: { id: string; summary: DashboardSummary }) {
  const { t } = useTranslation();
  const k = summary.kpis;
  const titles: Record<string, string> = {
    narrative: t('dashboard.crystalBrief'),
    nps: t('dashboard.kpiNps'),
    csat: t('dashboard.kpiCsat'),
    responses: t('dashboard.kpiResponses'),
    active: t('dashboard.kpiActive'),
    anomalies: t('dashboard.ops.anomalies'),
  };
  return (
    <Card className="h-full w-full p-0 overflow-hidden flex flex-col">
      <div className="widget-drag cursor-move px-3 py-2 border-b border-border flex items-center gap-1.5 bg-muted/30">
        <Icon name="drag_indicator" size={14} className="text-on-surface-variant" />
        <span className="text-xs font-semibold text-on-surface truncate">{titles[id] || id}</span>
      </div>
      <div className="flex-1 min-h-0 p-4 overflow-auto">
        {id === 'narrative' && (
          <div>
            <h3 className="font-headline font-bold text-on-surface">{summary.narrative.headline}</h3>
            {summary.narrative.paragraphs.map((p, i) => (
              <p key={i} className="text-sm text-on-surface-variant mt-1.5 leading-relaxed">{p}</p>
            ))}
          </div>
        )}
        {id === 'nps' && <KpiBody value={k.nps} delta={k.npsDelta} />}
        {id === 'csat' && <KpiBody value={k.csat} delta={k.csatDelta} decimals={1} />}
        {id === 'responses' && <KpiBody value={k.responses} delta={k.responsesDelta} integer />}
        {id === 'active' && <KpiBody value={k.activeSurveys} integer />}
        {id === 'anomalies' && (
          <div className="space-y-1.5">
            {(summary.anomalies || []).length === 0
              ? <p className="text-sm text-on-surface-variant">{t('dashboard.ops.noAnomalies')}</p>
              : (summary.anomalies || []).map((a) => (
                <div key={a.index} className="flex items-center gap-2 text-sm">
                  <Icon name={a.direction === 'down' ? 'trending_down' : 'trending_up'} size={14}
                    className={a.direction === 'down' ? 'text-destructive' : 'text-warning'} />
                  <span className="text-on-surface-variant">{t('dashboard.custom.anomalyAt', { value: a.value })}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function KpiBody({ value, delta, decimals = 0, integer = false }: {
  value: number | null; delta?: number | null; decimals?: number; integer?: boolean;
}) {
  const fmt = (n: number) => (integer ? Math.round(n).toLocaleString() : n.toFixed(decimals));
  const up = (delta ?? 0) > 0, down = (delta ?? 0) < 0;
  return (
    <div className="flex flex-col justify-center h-full">
      <p className="text-3xl font-bold text-on-surface">{value == null ? '—' : fmt(value)}</p>
      {delta != null && delta !== 0 && (
        <p className={`text-xs mt-1 flex items-center gap-0.5 ${up ? 'text-success' : down ? 'text-destructive' : 'text-on-surface-variant'}`}>
          <Icon name={up ? 'trending_up' : 'trending_down'} size={13} />
          {up ? '+' : ''}{integer ? Math.round(delta).toLocaleString() : delta.toFixed(decimals)}
        </p>
      )}
    </div>
  );
}
