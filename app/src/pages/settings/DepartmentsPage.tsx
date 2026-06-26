import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { usePermissions } from '../../lib/permissions';
import { useDepartments } from '../../hooks/useDepartments';
import { PageHeader } from '../../components/PageHeader';
import { SettingsUsersNav } from '../../components/SettingsUsersNav';
import { Icon } from '../../components/Icon';
import { ROUTES } from '../../constants/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { DepartmentNode } from '../../lib/api';

export function DepartmentsPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('settings.departments.pageTitle'), t('settings.departments.pageSubtitle'));
  const { isAdmin } = usePermissions();
  const { tree, flat, loading, error, createDepartment, deleteDepartment } = useDepartments();
  const [createOpen, setCreateOpen] = useState(false);

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <PageHeader title={t('settings.departments.pageTitle')} />
        <div className="rounded-xl border border-border p-8 text-center text-on-surface-variant">
          <Icon name="lock" size={32} className="mx-auto mb-3 opacity-50" />
          {t('settings.userDirectory.accessDenied')}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.settings'), path: ROUTES.SETTINGS }, { label: t('settings.departments.pageTitle') }]}
        title={t('settings.departments.pageTitle')}
        subtitle={t('settings.departments.pageSubtitle')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Icon name="add" size={16} className="mr-1.5" />
            {t('settings.departments.addButton')}
          </Button>
        }
      />
      <SettingsUsersNav />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3 mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>
      ) : tree.length === 0 ? (
        <div className="rounded-xl border border-border p-8 text-center text-on-surface-variant">
          {t('settings.departments.empty')}
        </div>
      ) : (
        <motion.div
          className="rounded-xl border border-border divide-y divide-border"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {tree.map((node) => (
            <DeptRow key={node.id} node={node} onDelete={deleteDepartment} />
          ))}
        </motion.div>
      )}

      <CreateDepartmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parents={flat}
        onCreate={createDepartment}
      />
    </div>
  );
}

function DeptRow({ node, onDelete }: { node: DepartmentNode; onDelete: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <div>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors group"
        style={{ paddingLeft: `${16 + node.depth * 20}px` }}
      >
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: node.color || 'var(--color-primary)' }}
        />
        <span className="font-medium text-on-surface">{node.name}</span>
        <span className="text-xs text-on-surface-variant">
          {t('settings.departments.memberCount', { count: node.totalMemberCount ?? node.directMemberCount })}
        </span>
        {node.headDisplayName && (
          <span className="text-xs text-on-surface-variant">· {node.headDisplayName}</span>
        )}
        <Button
          variant="ghost" size="sm"
          className="ml-auto opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
          onClick={() => onDelete(node.id)}
        >
          <Icon name="delete" size={15} />
        </Button>
      </div>
      {node.children?.map((child) => <DeptRow key={child.id} node={child} onDelete={onDelete} />)}
    </div>
  );
}

function CreateDepartmentDialog({ open, onOpenChange, parents, onCreate }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  parents: DepartmentNode[];
  onCreate: (data: { name: string; description?: string | null; parentDepartmentId?: string | null }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      await onCreate({ name, parentDepartmentId: parentId || null });
      setName(''); setParentId('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.departments.createError'));
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('settings.departments.addTitle')}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dept-name">{t('settings.departments.nameLabel')}</Label>
            <Input id="dept-name" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.departments.namePlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dept-parent">{t('settings.departments.parentLabel')}</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger id="dept-parent">
                <SelectValue placeholder={t('settings.departments.noParent')} />
              </SelectTrigger>
              <SelectContent>
                {parents.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={submitting || !name}>{submitting ? t('common.saving') : t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
