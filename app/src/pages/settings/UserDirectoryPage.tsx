import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { usePermissions } from '../../lib/permissions';
import { useUsers } from '../../hooks/useUsers';
import { useRoles } from '../../hooks/useRoles';
import { PageHeader } from '../../components/PageHeader';
import { SettingsUsersNav } from '../../components/SettingsUsersNav';
import { Icon } from '../../components/Icon';
import { ROUTES } from '../../constants/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { InviteUserModal } from '../../components/InviteUserModal';
import { UserDetailDrawer } from '../../components/UserDetailDrawer';
import type { DirectoryUser } from '../../lib/api';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral'> = {
  active: 'success', pending: 'warning', deactivated: 'neutral',
};

export function UserDirectoryPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('settings.userDirectory.pageTitle'), t('settings.userDirectory.pageSubtitle'));
  const { isAdmin } = usePermissions();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selected, setSelected] = useState<DirectoryUser | null>(null);

  const { users, total, loading, error, reload, updateUser, deleteUser, inviteUser } = useUsers();
  const { roles } = useRoles();

  // Debounced server-side search + role filter.
  useEffect(() => {
    const handle = setTimeout(() => {
      reload({
        search: search || undefined,
        roleId: roleFilter !== 'all' ? roleFilter : undefined,
      });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter]);

  const activeCount = useMemo(() => users.filter((u) => u.status === 'active').length, [users]);

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <PageHeader title={t('settings.userDirectory.pageTitle')} />
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
        crumbs={[{ label: t('nav.settings'), path: ROUTES.SETTINGS }, { label: t('settings.userDirectory.pageTitle') }]}
        title={t('settings.userDirectory.pageTitle')}
        subtitle={t('settings.userDirectory.pageSubtitle')}
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Icon name="person_add" size={16} className="mr-1.5" />
            {t('settings.userDirectory.inviteButton')}
          </Button>
        }
      />
      <SettingsUsersNav />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <Input
              className="pl-9"
              placeholder={t('settings.userDirectory.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t('settings.userDirectory.allRoles')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('settings.userDirectory.allRoles')}</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-on-surface-variant ml-auto">
            {t('settings.userDirectory.summary', { active: activeCount, total })}
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3 mb-4">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.userDirectory.colName')}</TableHead>
                <TableHead>{t('settings.userDirectory.colRole')}</TableHead>
                <TableHead>{t('settings.userDirectory.colDepartment')}</TableHead>
                <TableHead>{t('settings.userDirectory.colStatus')}</TableHead>
                <TableHead className="text-right">{t('settings.userDirectory.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-on-surface-variant">
                  {t('common.loading')}
                </TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-on-surface-variant">
                  {t('settings.userDirectory.empty')}
                </TableCell></TableRow>
              ) : users.map((u) => (
                <TableRow
                  key={u.userId}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => setSelected(u)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
                      >
                        {(u.displayName || u.email).charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-on-surface truncate">{u.displayName || u.email}</p>
                        <p className="text-xs text-on-surface-variant truncate">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{u.roleName || '—'}</TableCell>
                  <TableCell>{u.departmentName || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[u.status] ?? 'neutral'} className="capitalize">
                      {t(`settings.userDirectory.status.${u.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelected(u); }}>
                      {t('settings.userDirectory.manage')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </motion.div>

      <InviteUserModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles}
        onInvite={inviteUser}
      />
      <UserDetailDrawer
        user={selected}
        roles={roles}
        open={selected !== null}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
        onSave={updateUser}
        onDeactivate={async (id) => { await deleteUser(id); setSelected(null); }}
      />
    </div>
  );
}
