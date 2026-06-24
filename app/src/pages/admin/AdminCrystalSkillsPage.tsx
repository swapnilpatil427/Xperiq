import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useAdminApi } from '../../hooks/useAdminApi';
import { PageHeader } from '../../components/PageHeader';
import { AdminCrystalNav } from '../../components/AdminCrystalNav';
import { Icon } from '../../components/Icon';
import { ROUTES, toPath } from '../../constants/routes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import type { SkillListItem, SkillHealth } from '../../lib/adminApi';

const NEW_SKILL_TEMPLATE = `# My Skill Name

## Description
What this skill does in 1-2 sentences.

## Triggers
- example trigger phrase
- another phrase

## Allowed Tools
- get_survey_overview
- get_insights_list

## Output Schema
\`\`\`json
{
  "answer": "string",
  "summary": "string"
}
\`\`\`

## Rollout
version: 1.0.0
rollout_pct: 10
`;

function NewSkillDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('admin.crystal.skills.newSkill')}</DialogTitle>
          <DialogDescription>{t('admin.crystal.skills.newSkillDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm font-mono whitespace-pre overflow-x-auto">
            {NEW_SKILL_TEMPLATE}
          </div>
          <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
            <li>{t('admin.crystal.skills.newSkillStep1')}</li>
            <li>{t('admin.crystal.skills.newSkillStep2')}</li>
            <li>{t('admin.crystal.skills.newSkillStep3')}</li>
          </ol>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>{t('common.close')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function healthColor(h: SkillHealth): string {
  if (h === 'healthy')   return 'var(--color-success, #059669)';
  if (h === 'attention') return 'var(--color-warning, #d97706)';
  return 'var(--color-error, #dc2626)';
}

function healthIcon(h: SkillHealth): string {
  if (h === 'healthy')   return 'circle';
  if (h === 'attention') return 'change_history';
  return 'cancel';
}

function scoreColor(score: number): string {
  if (score >= 0.75) return 'var(--color-success, #059669)';
  if (score >= 0.60) return 'var(--color-warning, #d97706)';
  return 'var(--color-error, #dc2626)';
}

function fmt(n: number, dec = 2): string {
  return n.toFixed(dec);
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function fmtPct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// ── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <TableCell key={i}>
          <div className="skeleton h-4 rounded w-20" />
        </TableCell>
      ))}
    </TableRow>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AdminCrystalSkillsPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('admin.crystal.skills.title'), t('admin.crystal.skills.subtitle'));

  const api = useAdminApi();
  const navigate = useNavigate();

  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'global' | 'brand'>('all');
  const [healthFilter, setHealthFilter] = useState<'all' | 'healthy' | 'attention' | 'failing'>('all');
  const [newSkillOpen, setNewSkillOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAdminSkills({
        source: sourceFilter === 'all' ? undefined : sourceFilter,
        health: healthFilter === 'all' ? undefined : healthFilter,
      });
      setSkills(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, [api, sourceFilter, healthFilter]);

  useEffect(() => { void load(); }, [load]);

  function handleRowClick(skillName: string) {
    navigate(toPath(ROUTES.ADMIN_CRYSTAL_SKILL_DETAIL, { skillName }));
  }

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('admin.crystal.skills.title') }]}
        title={t('admin.crystal.skills.title')}
        subtitle={t('admin.crystal.skills.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <Icon name="play_circle" size={16} className="mr-1.5" />
              {t('admin.crystal.skills.runCi')}
            </Button>
            <Button size="sm" onClick={() => setNewSkillOpen(true)}>
              <Icon name="add" size={16} className="mr-1.5" />
              {t('admin.crystal.skills.newSkill')}
            </Button>
          </div>
        }
      />

      <AdminCrystalNav />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select
          value={sourceFilter}
          onValueChange={(v) => setSourceFilter(v as typeof sourceFilter)}
        >
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.crystal.skills.filterAll')}</SelectItem>
            <SelectItem value="global">{t('admin.crystal.skills.filterGlobal')}</SelectItem>
            <SelectItem value="brand">{t('admin.crystal.skills.filterBrand')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={healthFilter}
          onValueChange={(v) => setHealthFilter(v as typeof healthFilter)}
        >
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.crystal.skills.healthAll')}</SelectItem>
            <SelectItem value="healthy">{t('admin.crystal.skills.healthHealthy')}</SelectItem>
            <SelectItem value="attention">{t('admin.crystal.skills.healthAttention')}</SelectItem>
            <SelectItem value="failing">{t('admin.crystal.skills.healthFailing')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-xl border border-border overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.crystal.skills.columns.skill')}</TableHead>
              <TableHead className="text-right">{t('admin.crystal.skills.columns.queries')}</TableHead>
              <TableHead className="text-right">{t('admin.crystal.skills.columns.avgScore')}</TableHead>
              <TableHead className="text-right">{t('admin.crystal.skills.columns.negRate')}</TableHead>
              <TableHead className="text-right">{t('admin.crystal.skills.columns.p50')}</TableHead>
              <TableHead>{t('admin.crystal.skills.columns.source')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}

            {!loading && skills.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-on-surface-variant">
                  <Icon name="manage_search" size={32} className="mx-auto mb-2 opacity-40" />
                  <p>{t('admin.crystal.skills.empty')}</p>
                </TableCell>
              </TableRow>
            )}

            {!loading && skills.map((skill) => (
              <TableRow
                key={skill.name}
                className="cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => handleRowClick(skill.name)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Icon
                      name={healthIcon(skill.health)}
                      size={14}
                      style={{ color: healthColor(skill.health) }}
                      aria-label={t(`admin.crystal.health.${skill.health}`)}
                    />
                    <span className="font-mono text-sm font-medium">{skill.name}</span>
                    <span className="text-xs text-on-surface-variant">v{skill.version}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {skill.queries_30d.toLocaleString()}
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums"
                    style={{ color: scoreColor(skill.avg_eval_score) }}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: scoreColor(skill.avg_eval_score) }}
                    />
                    {fmt(skill.avg_eval_score)}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {fmtPct(skill.neg_rate)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {fmtMs(skill.p50_ms)}
                </TableCell>
                <TableCell>
                  <Badge variant={skill.source === 'global' ? 'secondary' : 'outline'}>
                    {skill.source}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </motion.div>

      {/* Health legend */}
      <div className="flex gap-4 mt-3 text-xs text-on-surface-variant">
        {(['healthy', 'attention', 'failing'] as SkillHealth[]).map((h) => (
          <span key={h} className="flex items-center gap-1">
            <Icon name={healthIcon(h)} size={12} style={{ color: healthColor(h) }} />
            {t(`admin.crystal.health.${h}`)}
          </span>
        ))}
      </div>

      <NewSkillDialog open={newSkillOpen} onClose={() => setNewSkillOpen(false)} />
    </div>
  );
}
