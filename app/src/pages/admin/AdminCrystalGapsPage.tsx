import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useAdminApi } from '../../hooks/useAdminApi';
import { PageHeader } from '../../components/PageHeader';
import { AdminCrystalNav } from '../../components/AdminCrystalNav';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import type { CapabilityGap } from '../../lib/adminApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      {[1, 2, 3, 4].map((i) => (
        <TableCell key={i}><div className="skeleton h-4 rounded w-28" /></TableCell>
      ))}
    </TableRow>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-on-surface-variant text-xs">—</span>;
  const color = score >= 0.6 ? '#d97706' : '#dc2626';
  return (
    <span className="tabular-nums text-sm" style={{ color }}>
      {score.toFixed(2)} similarity
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AdminCrystalGapsPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('admin.crystal.gaps.title'), t('admin.crystal.gaps.subtitle'));

  const api = useAdminApi();

  const [gaps, setGaps] = useState<CapabilityGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedGap, setSelectedGap] = useState<CapabilityGap | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getCapabilityGaps();
      setGaps(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load capability gaps');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  function handleCreateSkill(gap?: CapabilityGap) {
    setSelectedGap(gap ?? gaps[0] ?? null);
    setCreateModalOpen(true);
  }

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('admin.crystal.gaps.title') }]}
        title={t('admin.crystal.gaps.title')}
        subtitle={t('admin.crystal.gaps.subtitle')}
        actions={
          gaps.length > 0 && (
            <Button size="sm" onClick={() => handleCreateSkill()}>
              <Icon name="add" size={16} className="mr-1.5" />
              {t('admin.crystal.gaps.createSkill')}
            </Button>
          )
        }
      />

      <AdminCrystalNav />

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-xl border border-border overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.crystal.gaps.columns.pattern')}</TableHead>
              <TableHead className="text-right">{t('admin.crystal.gaps.columns.count')}</TableHead>
              <TableHead>{t('admin.crystal.gaps.columns.bestMatch')}</TableHead>
              <TableHead>{t('admin.crystal.gaps.columns.lastSeen')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

            {!loading && gaps.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16 text-on-surface-variant">
                  <Icon name="search_off" size={36} className="mx-auto mb-3 opacity-40" />
                  <p className="font-medium">{t('admin.crystal.gaps.empty')}</p>
                </TableCell>
              </TableRow>
            )}

            {!loading && gaps.map((gap: CapabilityGap, idx: number) => (
              <TableRow key={gap.id}>
                <TableCell className="text-sm max-w-sm">
                  <span className="font-mono text-xs bg-muted/60 px-1.5 py-0.5 rounded">
                    &ldquo;{gap.query_pattern}&rdquo;
                  </span>
                  {idx === 0 && (
                    <span
                      className="ml-2 text-xs font-medium"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      #1 gap
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {gap.count.toLocaleString()}
                </TableCell>
                <TableCell>
                  <div>
                    {gap.best_match_skill && (
                      <span className="text-xs font-mono text-on-surface-variant mr-2">
                        {gap.best_match_skill}
                      </span>
                    )}
                    <ScoreBadge score={gap.best_match_score} />
                  </div>
                </TableCell>
                <TableCell className="text-xs text-on-surface-variant">
                  {new Date(gap.last_seen).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCreateSkill(gap)}
                    aria-label={`Create skill for gap: ${gap.query_pattern}`}
                  >
                    <Icon name="add_circle" size={14} className="mr-1" />
                    {t('admin.crystal.gaps.createSkill')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </motion.div>

      {/* Create skill modal — shows CDX scaffold guidance */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('admin.crystal.gaps.createSkill')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedGap && (
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p className="font-medium mb-1">Query pattern to address:</p>
                <p className="font-mono text-xs">
                  &ldquo;{selectedGap.query_pattern}&rdquo;
                </p>
                <p className="text-on-surface-variant mt-1 text-xs">
                  {selectedGap.count} occurrences — last seen{' '}
                  {new Date(selectedGap.last_seen).toLocaleDateString()}
                </p>
              </div>
            )}
            <p className="text-sm text-on-surface-variant">
              To scaffold a new skill, run the CDX CLI in your terminal:
            </p>
            <pre className="rounded-lg bg-muted/60 p-3 text-xs font-mono overflow-x-auto">
              {`experient-cdx scaffold --name my-new-skill \\\n  --trigger "${selectedGap?.query_pattern ?? 'query pattern here'}"`}
            </pre>
            <p className="text-xs text-on-surface-variant">
              This generates SKILL.md, EVALS.md, and a test fixture. Add your tool implementation
              and push — Crystal picks it up on the next deploy.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
