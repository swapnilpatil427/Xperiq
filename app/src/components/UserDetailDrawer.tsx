import { useState, useEffect } from 'react';
import { useTranslation } from '../lib/i18n';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Icon } from './Icon';
import type { DirectoryUser, DirectoryRole, UpdateUserPayload } from '../lib/api';

interface UserDetailDrawerProps {
  user: DirectoryUser | null;
  roles: DirectoryRole[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (userId: string, data: UpdateUserPayload) => Promise<unknown>;
  onDeactivate: (userId: string) => Promise<unknown>;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral'> = {
  active: 'success', pending: 'warning', deactivated: 'neutral',
};

export function UserDetailDrawer({ user, roles, open, onOpenChange, onSave, onDeactivate }: UserDetailDrawerProps) {
  const { t } = useTranslation();
  const [roleId, setRoleId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoleId(user?.roleId ?? '');
    setError(null);
  }, [user]);

  if (!user) return null;

  const dirty = roleId !== (user.roleId ?? '');

  async function handleSave() {
    if (!user || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(user.userId, { roleId: roleId || null });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.userDirectory.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('settings.userDirectory.detailTitle')}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Identity */}
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
            >
              {(user.displayName || user.email).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-on-surface truncate">{user.displayName || user.email}</p>
              <p className="text-sm text-on-surface-variant truncate">{user.email}</p>
            </div>
            <Badge variant={STATUS_VARIANT[user.status] ?? 'neutral'} className="ml-auto capitalize">
              {t(`settings.userDirectory.status.${user.status}`)}
            </Badge>
          </div>

          {/* Meta */}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Field label={t('settings.userDirectory.jobTitleLabel')} value={user.jobTitle} />
            <Field label={t('settings.userDirectory.departmentLabel')} value={user.departmentName} />
            <Field label={t('settings.userDirectory.locationLabel')} value={user.location} />
            <Field label={t('settings.userDirectory.providerLabel')} value={user.provisionedBy} />
          </dl>

          {/* Role editor */}
          <div className="space-y-1.5">
            <Label htmlFor="detail-role">{t('settings.userDirectory.roleLabel')}</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="detail-role">
                <SelectValue placeholder={t('settings.userDirectory.rolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={!dirty || saving}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
            {user.status !== 'deactivated' && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive ml-auto"
                onClick={() => onDeactivate(user.userId)}
              >
                <Icon name="person_off" size={16} className="mr-1.5" />
                {t('settings.userDirectory.deactivate')}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-on-surface-variant text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-on-surface mt-0.5">{value || '—'}</dd>
    </div>
  );
}
