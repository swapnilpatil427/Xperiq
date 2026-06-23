import { useTranslation } from '../../lib/i18n';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { DEFAULT_FILTERS } from '../../types/dashboard';
import type { DashboardFilters } from '../../types/dashboard';

interface DashboardFilterBarProps {
  filters: DashboardFilters;
  surveys: Array<{ id: string; title: string }>;
  tags: Array<{ id: string; name: string; color: string }>;
  onChange: (filters: DashboardFilters) => void;
}

const RANGES: Array<DashboardFilters['dateRange']> = ['30d', '90d', '180d'];
const ALL = '__all__';

function isDefault(f: DashboardFilters): boolean {
  return (
    f.dateRange === DEFAULT_FILTERS.dateRange &&
    f.surveyId === DEFAULT_FILTERS.surveyId &&
    f.tagId === DEFAULT_FILTERS.tagId
  );
}

/**
 * Sticky filter bar: date range segment control, survey picker, group/tag
 * picker, and a Clear link shown only when filters differ from the defaults.
 */
export function DashboardFilterBar({ filters, surveys, tags, onChange }: DashboardFilterBarProps) {
  const { t } = useTranslation();

  return (
    <div className="sticky top-16 z-10 -mx-6 md:-mx-8 px-6 md:px-8 py-2 bg-[var(--color-surface-raised)]/80 backdrop-blur-sm border-b border-[var(--color-outline)]/20">
      <div className="flex flex-wrap items-center gap-3">
        {/* Date range segment control */}
        <div className="inline-flex rounded-lg border border-[var(--color-outline)]/20 overflow-hidden">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => onChange({ ...filters, dateRange: r })}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filters.dateRange === r
                  ? 'bg-primary text-white'
                  : 'text-on-surface-variant hover:bg-primary/5'
              }`}
              style={filters.dateRange === r ? { background: 'var(--color-primary)' } : undefined}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Survey picker */}
        <Select
          value={filters.surveyId ?? ALL}
          onValueChange={(v) => onChange({ ...filters, surveyId: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder={t('dashboard.filterBar.allSurveys')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('dashboard.filterBar.allSurveys')}</SelectItem>
            {surveys.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Group / tag picker */}
        <Select
          value={filters.tagId ?? ALL}
          onValueChange={(v) => onChange({ ...filters, tagId: v === ALL ? null : v })}
        >
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder={t('dashboard.filterBar.allGroups')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('dashboard.filterBar.allGroups')}</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.id} value={tag.id}>
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: tag.color }} />
                  {tag.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear — only when non-default */}
        {!isDefault(filters) && (
          <button
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="ml-auto text-xs text-primary hover:underline"
          >
            {t('dashboard.filterBar.reset')}
          </button>
        )}
      </div>
    </div>
  );
}
