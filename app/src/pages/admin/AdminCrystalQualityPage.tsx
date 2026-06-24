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
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { SkillListItem, SkillHealth } from '../../lib/adminApi';

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
  if (score >= 0.75) return '#059669';
  if (score >= 0.60) return '#d97706';
  return '#dc2626';
}

function SkeletonRow() {
  return (
    <TableRow>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <TableCell key={i}><div className="skeleton h-4 rounded w-20" /></TableCell>
      ))}
    </TableRow>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AdminCrystalQualityPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('admin.crystal.nav.quality'), t('admin.crystal.quality.subtitle'));

  const api = useAdminApi();
  const navigate = useNavigate();

  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all skills sorted by health (failing first) for the quality view
      const data = await api.getAdminSkills();
      // Sort: failing → attention → healthy
      const order: Record<SkillHealth, number> = { failing: 0, attention: 1, healthy: 2 };
      setSkills([...data].sort((a, b) => order[a.health] - order[b.health]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quality data');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  // Summary counts
  const healthy   = skills.filter((s) => s.health === 'healthy').length;
  const attention = skills.filter((s) => s.health === 'attention').length;
  const failing   = skills.filter((s) => s.health === 'failing').length;

  const stagger = {
    hidden:  {},
    visible: { transition: { staggerChildren: 0.05 } },
  };
  const rise = {
    hidden:  { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
  };

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('admin.crystal.nav.quality') }]}
        title={t('admin.crystal.nav.quality')}
        subtitle={t('admin.crystal.quality.subtitle')}
      />

      <AdminCrystalNav />

      {/* KPI cards */}
      {!loading && (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-3 gap-4 mb-6"
        >
          {([
            { label: t('admin.crystal.health.failing'),   count: failing,   health: 'failing'   as SkillHealth },
            { label: t('admin.crystal.health.attention'),  count: attention, health: 'attention' as SkillHealth },
            { label: t('admin.crystal.health.healthy'),    count: healthy,   health: 'healthy'   as SkillHealth },
          ] as const).map((kpi) => (
            <motion.div
              key={kpi.health}
              variants={rise}
              className="rounded-xl border border-border p-5"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon name={healthIcon(kpi.health)} size={16} style={{ color: healthColor(kpi.health) }} />
                <span className="text-sm text-on-surface-variant">{kpi.label}</span>
              </div>
              <p className="text-3xl font-bold tabular-nums">{kpi.count}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      {/* Full skill table sorted by health */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-xl border border-border overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.crystal.skills.columns.skill')}</TableHead>
              <TableHead>{t('admin.crystal.skills.columns.source')}</TableHead>
              <TableHead className="text-right">{t('admin.crystal.skills.columns.avgScore')}</TableHead>
              <TableHead className="text-right">{t('admin.crystal.skills.columns.negRate')}</TableHead>
              <TableHead className="text-right">{t('admin.crystal.skills.columns.queries')}</TableHead>
              <TableHead className="text-right">{t('admin.crystal.skills.columns.p50')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}

            {!loading && skills.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-on-surface-variant">
                  <Icon name="bar_chart" size={32} className="mx-auto mb-2 opacity-40" />
                  <p>No skills registered yet.</p>
                </TableCell>
              </TableRow>
            )}

            {!loading && skills.map((skill) => (
              <TableRow
                key={skill.name}
                className="cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => navigate(toPath(ROUTES.ADMIN_CRYSTAL_SKILL_DETAIL, { skillName: skill.name }))}
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
                <TableCell>
                  <Badge variant={skill.source === 'global' ? 'secondary' : 'outline'}>
                    {skill.source}
                  </Badge>
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
                    {skill.avg_eval_score.toFixed(2)}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {Math.round(skill.neg_rate * 100)}%
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {skill.queries_30d.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {skill.p50_ms >= 1000
                    ? `${(skill.p50_ms / 1000).toFixed(1)}s`
                    : `${Math.round(skill.p50_ms)}ms`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </motion.div>
    </div>
  );
}
