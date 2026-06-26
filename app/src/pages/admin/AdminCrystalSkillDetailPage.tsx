import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LineChart, Line, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useAdminApi } from '../../hooks/useAdminApi';
import { PageHeader } from '../../components/PageHeader';
import { AdminCrystalNav } from '../../components/AdminCrystalNav';
import { Icon } from '../../components/Icon';
import { ROUTES } from '../../constants/routes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import type {
  SkillDetail, SkillExample, SkillVariant, SkillHealth,
} from '../../lib/adminApi';

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

function fmt2(n: number): string { return n.toFixed(2); }
function fmtPct(rate: number): string { return `${Math.round(rate * 100)}%`; }

const PAGE_SIZE = 10;

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-on-surface mb-3 uppercase tracking-wide">
      {children}
    </h3>
  );
}

function ScoreDot({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums text-sm font-medium"
      style={{ color: scoreColor(score) }}>
      <span className="w-2 h-2 rounded-full shrink-0"
        style={{ background: scoreColor(score) }} />
      {fmt2(score)}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AdminCrystalSkillDetailPage() {
  const { t } = useTranslation();
  const { skillName = '' } = useParams<{ skillName: string }>();
  const navigate = useNavigate();
  const api = useAdminApi();

  useSetPageTitle(skillName, t('admin.crystal.skills.title'));

  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [examples, setExamples] = useState<SkillExample[]>([]);
  const [totalExamples, setTotalExamples] = useState(0);
  const [exPage, setExPage] = useState(0);
  const [variants, setVariants] = useState<SkillVariant[]>([]);
  const [selectedExIds, setSelectedExIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Confirmation dialogs
  const [graduateTarget, setGraduateTarget] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!skillName) return;
    setLoading(true);
    setError(null);
    try {
      const [d, v] = await Promise.all([
        api.getAdminSkill(skillName),
        api.getAdminSkillVariants(skillName),
      ]);
      setDetail(d);
      setVariants(v.variants);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skill');
    } finally {
      setLoading(false);
    }
  }, [api, skillName]);

  const loadExamples = useCallback(async () => {
    if (!skillName) return;
    try {
      const res = await api.getAdminSkillExamples(skillName, PAGE_SIZE, exPage * PAGE_SIZE);
      setExamples(res.examples);
      setTotalExamples(res.total);
    } catch {
      // non-blocking — examples are secondary
    }
  }, [api, skillName, exPage]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);
  useEffect(() => { void loadExamples(); }, [loadExamples]);

  async function handleGraduate() {
    if (!graduateTarget) return;
    setActionLoading(true);
    try {
      await api.graduateSkillVariant(skillName, graduateTarget);
      await loadDetail();
    } finally {
      setActionLoading(false);
      setGraduateTarget(null);
    }
  }

  async function handleRollback() {
    if (!rollbackTarget) return;
    setActionLoading(true);
    try {
      await api.rollbackSkillVariant(skillName, rollbackTarget);
      await loadDetail();
    } finally {
      setActionLoading(false);
      setRollbackTarget(null);
    }
  }

  async function handlePurge() {
    if (selectedExIds.size === 0) return;
    setActionLoading(true);
    try {
      await api.deleteAdminSkillExamples(skillName, Array.from(selectedExIds));
      setSelectedExIds(new Set());
      await loadExamples();
    } finally {
      setActionLoading(false);
      setPurgeConfirm(false);
    }
  }

  function toggleExample(id: string) {
    setSelectedExIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <PageHeader
          crumbs={[
            { label: t('admin.crystal.skills.title'), path: ROUTES.ADMIN_CRYSTAL_SKILLS },
            { label: skillName },
          ]}
          title={skillName}
        />
        <AdminCrystalNav />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <PageHeader
          crumbs={[
            { label: t('admin.crystal.skills.title'), path: ROUTES.ADMIN_CRYSTAL_SKILLS },
            { label: skillName },
          ]}
          title={skillName}
        />
        <AdminCrystalNav />
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-destructive text-sm">
          {error ?? 'Skill not found.'}
        </div>
      </div>
    );
  }

  const trendData = detail.quality_trend.map((p) => ({
    date: new Date(p.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    score: p.avg_eval_score,
  }));

  const totalExPages = Math.ceil(totalExamples / PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[
          { label: t('admin.crystal.skills.title'), path: ROUTES.ADMIN_CRYSTAL_SKILLS },
          { label: skillName },
        ]}
        title={skillName}
        subtitle={`v${detail.version} · ${detail.model}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Icon name="edit" size={16} className="mr-1.5" />
              {t('admin.crystal.skillDetail.editSkill')}
            </Button>
            <Button variant="outline" size="sm">
              <Icon name="terminal" size={16} className="mr-1.5" />
              {t('admin.crystal.skillDetail.runCdx')}
            </Button>
          </div>
        }
      />

      <AdminCrystalNav />

      {/* Header badges */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <Badge variant={detail.source === 'global' ? 'secondary' : 'outline'}>
          {detail.source}
        </Badge>
        <span
          className="inline-flex items-center gap-1.5 text-sm font-medium"
          style={{ color: healthColor(detail.health) }}
        >
          <Icon name={healthIcon(detail.health)} size={14} />
          {t(`admin.crystal.health.${detail.health}`)}
        </span>
        <span className="text-sm text-on-surface-variant">
          {detail.queries_30d.toLocaleString()} queries (30d)
        </span>
        <span className="text-sm text-on-surface-variant">
          avg {fmt2(detail.avg_eval_score)} · neg {fmtPct(detail.neg_rate)}
        </span>
      </div>

      <div className="space-y-6">
        {/* Quality trend chart */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-xl border border-border p-5"
        >
          <SectionTitle>{t('admin.crystal.skillDetail.qualityTrend')}</SectionTitle>
          {trendData.length < 2 ? (
            <p className="text-sm text-on-surface-variant py-6 text-center">
              Not enough data points to draw a trend.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant, #e5e7eb)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
                <ReTooltip
                  formatter={(value) => [fmt2(Number(value ?? 0)), 'Avg Score']}
                  contentStyle={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-outline)',
                    borderRadius: '8px',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--color-primary)' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </motion.section>

        {/* Top queries + Eval criteria (2-col on desktop) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-5"
        >
          {/* Top queries */}
          <div className="rounded-xl border border-border p-5">
            <SectionTitle>{t('admin.crystal.skillDetail.topQueries')}</SectionTitle>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.crystal.skillDetail.columns.query')}</TableHead>
                  <TableHead className="text-right">
                    {t('admin.crystal.skillDetail.columns.evalScore')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.top_queries.map((q, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm truncate max-w-xs" title={q.query}>
                      &ldquo;{q.query}&rdquo;
                    </TableCell>
                    <TableCell className="text-right">
                      <ScoreDot score={q.eval_score} />
                    </TableCell>
                  </TableRow>
                ))}
                {detail.top_queries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-on-surface-variant py-4 text-sm">
                      No query data yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Eval criteria */}
          <div className="rounded-xl border border-border p-5">
            <SectionTitle>{t('admin.crystal.skillDetail.evalCriteria')}</SectionTitle>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.crystal.skillDetail.columns.criterion')}</TableHead>
                  <TableHead>{t('admin.crystal.skillDetail.columns.method')}</TableHead>
                  <TableHead className="text-right">
                    {t('admin.crystal.skillDetail.columns.score')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.eval_criteria.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="text-sm">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{c.method}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ScoreDot score={c.score} />
                    </TableCell>
                  </TableRow>
                ))}
                {detail.eval_criteria.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-on-surface-variant py-4 text-sm">
                      No criteria defined.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </motion.div>

        {/* Example bank */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-xl border border-border p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>
              {t('admin.crystal.skillDetail.exampleBank')}&nbsp;
              <span className="text-on-surface-variant font-normal normal-case tracking-normal text-xs">
                ({t('admin.crystal.skillDetail.exampleCount', { n: totalExamples })})
              </span>
            </SectionTitle>
            {selectedExIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setPurgeConfirm(true)}
              >
                <Icon name="delete" size={14} className="mr-1.5" />
                {t('admin.crystal.skillDetail.purgeSelected')} ({selectedExIds.size})
              </Button>
            )}
          </div>

          {examples.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">
              {t('admin.crystal.skillDetail.noExamples')}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>{t('admin.crystal.skillDetail.columns.exampleInput')}</TableHead>
                    <TableHead className="text-right">
                      {t('admin.crystal.skillDetail.columns.exampleScore')}
                    </TableHead>
                    <TableHead>{t('admin.crystal.skillDetail.columns.exampleOrg')}</TableHead>
                    <TableHead>{t('admin.crystal.skillDetail.columns.exampleDate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {examples.map((ex) => (
                    <TableRow key={ex.id}>
                      <TableCell className="py-2">
                        <input
                          type="checkbox"
                          checked={selectedExIds.has(ex.id)}
                          onChange={() => toggleExample(ex.id)}
                          aria-label={`Select example ${ex.id}`}
                          className="rounded"
                        />
                      </TableCell>
                      <TableCell className="text-sm truncate max-w-xs" title={ex.input}>
                        &ldquo;{ex.input}&rdquo;
                      </TableCell>
                      <TableCell className="text-right">
                        <ScoreDot score={ex.eval_score} />
                      </TableCell>
                      <TableCell className="text-xs text-on-surface-variant font-mono">
                        {ex.org_id_hash}
                      </TableCell>
                      <TableCell className="text-xs text-on-surface-variant">
                        {new Date(ex.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalExPages > 1 && (
                <div className="flex items-center justify-between mt-3 text-sm">
                  <span className="text-on-surface-variant text-xs">
                    {t('admin.crystal.skillDetail.paginationShowing', {
                      from: exPage * PAGE_SIZE + 1,
                      to: Math.min((exPage + 1) * PAGE_SIZE, totalExamples),
                      total: totalExamples,
                    })}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={exPage === 0}
                      onClick={() => setExPage((p) => p - 1)}
                    >
                      {t('admin.crystal.skillDetail.prevPage')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={exPage >= totalExPages - 1}
                      onClick={() => setExPage((p) => p + 1)}
                    >
                      {t('admin.crystal.skillDetail.nextPage')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.section>

        {/* Variants */}
        {variants.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-xl border border-border p-5"
          >
            <SectionTitle>{t('admin.crystal.skillDetail.variants')}</SectionTitle>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.crystal.skillDetail.columns.variant')}</TableHead>
                  <TableHead className="text-right">
                    {t('admin.crystal.skillDetail.columns.rollout')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('admin.crystal.skillDetail.columns.passRate')}
                  </TableHead>
                  <TableHead className="text-right">
                    {t('admin.crystal.skillDetail.columns.negRate')}
                  </TableHead>
                  <TableHead>{t('admin.crystal.skillDetail.columns.created')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.variant}>
                    <TableCell className="font-mono text-sm">
                      {v.variant}
                      {v.is_current && (
                        <Badge variant="secondary" className="ml-2 text-xs">current</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {v.rollout_pct}%
                    </TableCell>
                    <TableCell className="text-right">
                      <ScoreDot score={v.pass_rate} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {fmtPct(v.neg_rate)}
                    </TableCell>
                    <TableCell className="text-xs text-on-surface-variant">
                      {new Date(v.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 justify-end">
                        {!v.is_current && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setGraduateTarget(v.variant)}
                          >
                            {t('admin.crystal.skillDetail.graduate')}
                          </Button>
                        )}
                        {v.is_current && variants.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRollbackTarget(v.variant)}
                          >
                            {t('admin.crystal.skillDetail.rollback')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </motion.section>
        )}
      </div>

      {/* Graduate confirmation dialog */}
      <Dialog open={!!graduateTarget} onOpenChange={() => setGraduateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.crystal.skillDetail.graduate')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-on-surface-variant">
            {t('admin.crystal.skillDetail.graduateConfirm', { variant: graduateTarget ?? '' })}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGraduateTarget(null)}>Cancel</Button>
            <Button onClick={() => void handleGraduate()} disabled={actionLoading}>
              {actionLoading ? 'Graduating…' : t('admin.crystal.skillDetail.graduate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback confirmation dialog */}
      <Dialog open={!!rollbackTarget} onOpenChange={() => setRollbackTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.crystal.skillDetail.rollback')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-on-surface-variant">
            {t('admin.crystal.skillDetail.rollbackConfirm', { variant: rollbackTarget ?? '' })}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRollbackTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleRollback()} disabled={actionLoading}>
              {actionLoading ? 'Rolling back…' : t('admin.crystal.skillDetail.rollback')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge confirmation dialog */}
      <Dialog open={purgeConfirm} onOpenChange={setPurgeConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.crystal.skillDetail.purgeSelected')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-on-surface-variant">
            Delete {selectedExIds.size} selected example(s) from the bank? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPurgeConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handlePurge()} disabled={actionLoading}>
              {actionLoading ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
