// SurveyScopePicker — the survey selector used on the Insights page.
//
// Design principles (per Survey Scope UX doc):
//   - Single-line trigger, no two-line stacks
//   - "All surveys" is a peer scope at the top, primary-tinted but not loud
//   - Survey rows are one line: status dot · title · subtle meta
//   - Subtle dividers between status groups; no heavy section headers
//   - No KPI clutter in the picker — picker is for navigation, not insight delivery

import { useMemo, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from './Icon';
import type { Survey, SurveyStatus } from '../types';

export type SurveyScope = 'all' | string;

interface Props {
  surveys: Survey[];
  scope: SurveyScope;
  onChange: (scope: SurveyScope) => void;
}

const STATUS_DOT: Record<SurveyStatus, string> = {
  active: '#10b981',
  paused: '#f59e0b',
  draft: '#abadaf',
  closed: '#9ca3af',
};

const STATUS_ORDER: SurveyStatus[] = ['active', 'paused', 'draft', 'closed'];

function nFmt(n: number | undefined): string {
  if (!n) return '0';
  if (n < 1000) return n.toString();
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

export function SurveyScopePicker({ surveys, scope, onChange }: Props) {
  const [query, setQuery] = useState('');

  const visibleSurveys = useMemo(() => surveys.filter((s) => !s.deleted_at), [surveys]);
  const activeCount = visibleSurveys.filter((s) => s.status === 'active').length;
  const selected = scope === 'all' ? null : visibleSurveys.find((s) => s.id === scope);

  // Group by status, applying search filter
  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Record<SurveyStatus, Survey[]> = { active: [], paused: [], draft: [], closed: [] };
    for (const s of visibleSurveys) {
      if (q && !(s.title ?? '').toLowerCase().includes(q)) continue;
      out[s.status]?.push(s);
    }
    return out;
  }, [visibleSurveys, query]);

  const showSearch = visibleSurveys.length > 6;
  const matchedAll = !query || 'all surveys'.includes(query.trim().toLowerCase());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 gap-2.5 pl-3 pr-2 font-medium border-border/60 hover:border-border bg-card"
          aria-label="Choose survey scope"
        >
          {scope === 'all' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-primary to-tertiary" />
              <span className="text-sm font-semibold">All surveys</span>
              <span className="text-[11px] text-muted-foreground font-normal hidden sm:inline">
                {activeCount} active
              </span>
            </>
          ) : selected ? (
            <>
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: STATUS_DOT[selected.status] }}
              />
              <span className="text-sm font-semibold truncate max-w-[200px]">
                {selected.title || 'Untitled survey'}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Select scope…</span>
          )}
          <Icon name="expand_more" size={16} className="text-muted-foreground ml-0.5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-[320px] p-1 max-h-[60vh] overflow-y-auto border-border/60"
      >
        {showSearch && (
          <div className="p-1.5 sticky top-0 bg-card z-10">
            <div className="relative">
              <Icon
                name="search"
                size={16}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search surveys…"
                className="h-8 pl-8 text-sm border-border/40 bg-muted/30 focus-visible:bg-card"
              />
            </div>
          </div>
        )}

        {matchedAll && (
          <DropdownMenuItem
            onSelect={() => onChange('all')}
            className="gap-2.5 py-2 cursor-pointer focus:bg-primary/5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-br from-primary to-tertiary flex-shrink-0" />
            <span className="text-sm font-semibold flex-1">All surveys</span>
            <span className="text-[11px] text-muted-foreground">{activeCount} active</span>
            {scope === 'all' && (
              <Icon name="check" size={16} className="text-primary" />
            )}
          </DropdownMenuItem>
        )}

        {STATUS_ORDER.map((status) => {
          const items = grouped[status];
          if (!items || items.length === 0) return null;
          return (
            <div key={status}>
              <DropdownMenuSeparator className="my-1" />
              {items.map((s) => {
                const isSelected = scope === s.id;
                return (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={() => onChange(s.id)}
                    className="gap-2.5 py-2 cursor-pointer"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: STATUS_DOT[status] }}
                    />
                    <span className="text-sm font-medium flex-1 truncate">
                      {s.title || 'Untitled survey'}
                    </span>
                    <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0">
                      {nFmt(s.response_count)}
                    </span>
                    {isSelected && (
                      <Icon name="check" size={16} className="text-primary flex-shrink-0" />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </div>
          );
        })}

        {visibleSurveys.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No surveys yet
          </div>
        )}

        {visibleSurveys.length > 0 && query && !matchedAll &&
          STATUS_ORDER.every((s) => grouped[s].length === 0) && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No surveys match "{query}"
            </div>
          )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
