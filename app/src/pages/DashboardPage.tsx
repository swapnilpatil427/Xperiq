import { useState, useEffect } from 'react';
import { useTranslation } from '../lib/i18n';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useApi } from '../hooks/useApi';
import { Icon } from '../components/Icon';
import { Button } from '@/components/ui/button';
import { PageHeader } from '../components/PageHeader';
import { DashboardFilterBar } from '../components/dashboard/DashboardFilterBar';
import { DashboardScopeBar } from '../components/dashboard/DashboardScopeBar';
import { WidgetGrid } from '../components/dashboard/WidgetGrid';
import { WidgetLibraryPanel } from '../components/dashboard/WidgetLibraryPanel';
import {
  DEFAULT_WIDGETS, DEFAULT_FILTERS, DATE_RANGE_DAYS,
} from '../types/dashboard';
import type { WidgetConfig, WidgetType, DashboardFilters } from '../types/dashboard';
import type { DashboardSummary, DashboardOperations, SurveyTag } from '../lib/api';
import type { Survey } from '../types';

export function DashboardPage() {
  const { t } = useTranslation();
  const api = useApi();
  useSetPageTitle(t('dashboard.pageTitle'), t('dashboard.pageSubtitle'));

  const [widgets, setWidgets] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [dashboardName, setDashboardName] = useState('My Dashboard');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [operations, setOperations] = useState<DashboardOperations | null>(null);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [tags, setTags] = useState<SurveyTag[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load saved config + supporting data on mount.
  useEffect(() => {
    Promise.all([
      api.getDashboardConfig().catch(() => null),
      api.listSurveys().catch(() => ({ surveys: [] as Survey[] })),
      api.listTags().catch(() => ({ tags: [] as SurveyTag[] })),
    ])
      .then(([savedConfig, surveysResp, tagsResp]) => {
        if (savedConfig) {
          if (Array.isArray(savedConfig.widgets) && savedConfig.widgets.length) setWidgets(savedConfig.widgets);
          // Merge saved filters with defaults so new fields (npsSegment) have fallbacks
          if (savedConfig.filters) setFilters({ ...DEFAULT_FILTERS, ...savedConfig.filters });
          if (savedConfig.name) setDashboardName(savedConfig.name);
        }
        setSurveys(surveysResp.surveys || []);
        setTags(tagsResp.tags || []);
      })
      .catch(() => {});
  }, [api]);

  // Reload summary whenever any filter changes — all filters now drive the API.
  useEffect(() => {
    const days = DATE_RANGE_DAYS[filters.dateRange];
    Promise.all([
      api.getDashboardSummary(days, {
        surveyId:   filters.surveyId,
        tagId:      filters.tagId,
        npsSegment: filters.npsSegment,
      }).catch(() => null),
      api.getDashboardOperations().catch(() => null),
    ]).then(([sum, ops]) => {
      setSummary(sum);
      setOperations(ops);
    });
  }, [api, filters.dateRange, filters.surveyId, filters.tagId, filters.npsSegment]);

  const handleAddWidget = (type: WidgetType, colSpan: number) => {
    setWidgets((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type, colSpan: colSpan as WidgetConfig['colSpan'], config: {} },
    ]);
    setDirty(true);
  };

  const handleRemoveWidget = (id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    setDirty(true);
  };

  const handleReorder = (fromId: string, toId: string) => {
    setWidgets((prev) => {
      const arr = [...prev];
      const fromIdx = arr.findIndex((w) => w.id === fromId);
      const toIdx = arr.findIndex((w) => w.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [item] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, item);
      return arr;
    });
    setDirty(true);
  };

  const handleFilterChange = (next: DashboardFilters) => {
    setFilters(next);
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveDashboardConfig({ name: dashboardName, widgets, filters });
      setDirty(false);
    } catch {
      /* keep dirty so the user can retry */
    } finally {
      setSaving(false);
    }
  };

  const saveLabel = saving
    ? t('dashboard.toolbar.saving')
    : dirty
      ? t('dashboard.toolbar.save')
      : t('dashboard.toolbar.saved');

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('dashboard.pageTitle') }]}
        title={dashboardName}
        subtitle={t('dashboard.pageSubtitle')}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowLibrary(true)}>
              <Icon name="add" size={16} className="mr-1" />
              {t('dashboard.toolbar.addWidget')}
            </Button>
            <Button
              size="sm"
              variant={dirty ? 'default' : 'secondary'}
              disabled={saving}
              onClick={handleSave}
            >
              <Icon name={dirty ? 'save' : 'check_circle'} size={16} className="mr-1" />
              {saveLabel}
            </Button>
          </>
        }
      />

      <DashboardFilterBar
        filters={filters}
        surveys={surveys.map((s) => ({ id: s.id, title: s.title }))}
        tags={tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color }))}
        onChange={handleFilterChange}
      />

      <DashboardScopeBar
        filters={filters}
        surveys={surveys.map((s) => ({ id: s.id, title: s.title }))}
        tags={tags.map((tag) => ({ id: tag.id, name: tag.name }))}
        summary={summary}
      />

      <WidgetGrid
        widgets={widgets}
        filters={filters}
        summary={summary}
        operations={operations}
        onRemove={handleRemoveWidget}
        onReorder={handleReorder}
      />

      <WidgetLibraryPanel
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        onAdd={handleAddWidget}
        existingTypes={widgets.map((w) => w.type)}
      />
    </div>
  );
}
