import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { usePermissions } from '../../lib/permissions';
import { useRoles } from '../../hooks/useRoles';
import { PageHeader } from '../../components/PageHeader';
import { SettingsUsersNav } from '../../components/SettingsUsersNav';
import { Icon } from '../../components/Icon';
import { ROUTES } from '../../constants/routes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PERMISSION_ACTIONS } from '../../constants/permissions';
import { CreateCustomRoleModal } from '../../components/CreateCustomRoleModal';
import type { PermissionScope } from '../../lib/api';

const SCOPE_VARIANT: Record<PermissionScope, 'success' | 'warning' | 'purple' | 'neutral'> = {
  ALL: 'success', OWNED: 'warning', SHARED: 'purple', OWN: 'warning', NONE: 'neutral',
};

export function RolesPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('settings.roles.pageTitle'), t('settings.roles.pageSubtitle'));
  const { isAdmin } = usePermissions();
  const { roles, loading, error, createRole, deleteRole } = useRoles();
  const [createOpen, setCreateOpen] = useState(false);

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <PageHeader title={t('settings.roles.pageTitle')} />
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
        crumbs={[
          { label: t('nav.settings'), path: ROUTES.SETTINGS },
          { label: t('settings.userDirectory.pageTitle'), path: ROUTES.SETTINGS_USERS },
          { label: t('settings.roles.pageTitle') },
        ]}
        title={t('settings.roles.pageTitle')}
        subtitle={t('settings.roles.pageSubtitle')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Icon name="add" size={16} className="mr-1.5" />
            {t('settings.roles.createButton')}
          </Button>
        }
      />
      <SettingsUsersNav />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-on-surface-variant py-10 text-center">{t('common.loading')}</p>
      ) : (
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {roles.map((role) => (
            <Card key={role.id} className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-on-surface truncate">{role.name}</h3>
                    {role.isBuiltin
                      ? <Badge variant="neutral">{t('settings.roles.builtin')}</Badge>
                      : <Badge variant="purple">{t('settings.roles.custom')}</Badge>}
                  </div>
                  {role.description && (
                    <p className="text-sm text-on-surface-variant mt-1">{role.description}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-on-surface-variant">{t('settings.roles.assigned')}</p>
                  <p className="font-bold text-on-surface">{role.assignedCount ?? 0}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PERMISSION_ACTIONS.filter((a) => role.permissions[a] && role.permissions[a] !== 'NONE').map((a) => (
                  <Badge key={a} variant={SCOPE_VARIANT[role.permissions[a]]} className="text-[10px]">
                    {a.replace('survey:', '')}: {role.permissions[a]}
                  </Badge>
                ))}
              </div>

              {!role.isBuiltin && (
                <div className="mt-4 pt-3 border-t border-border flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteRole(role.id)}
                  >
                    <Icon name="delete" size={15} className="mr-1" />
                    {t('common.delete')}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </motion.div>
      )}

      <CreateCustomRoleModal open={createOpen} onOpenChange={setCreateOpen} onCreate={createRole} />
    </div>
  );
}
