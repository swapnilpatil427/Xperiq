import { useState } from 'react';
import { useTranslation } from '../lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { PERMISSION_ACTIONS, PERMISSION_SCOPES } from '../constants/permissions';
import type { PermissionScope } from '../lib/api';

interface CreateCustomRoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (data: { name: string; description?: string; permissions: Record<string, PermissionScope> }) => Promise<unknown>;
}

function defaultPerms(): Record<string, PermissionScope> {
  return Object.fromEntries(PERMISSION_ACTIONS.map((a) => [a, 'NONE'])) as Record<string, PermissionScope>;
}

export function CreateCustomRoleModal({ open, onOpenChange, onCreate }: CreateCustomRoleModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<Record<string, PermissionScope>>(defaultPerms());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName(''); setDescription(''); setPermissions(defaultPerms()); setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name, description: description || undefined, permissions });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.roles.createError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.roles.createTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">{t('settings.roles.nameLabel')}</Label>
              <Input id="role-name" required value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t('settings.roles.namePlaceholder')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-desc">{t('settings.roles.descriptionLabel')}</Label>
              <Input id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('settings.roles.permissionsLabel')}</Label>
            <div className="rounded-lg border border-border divide-y divide-border">
              {PERMISSION_ACTIONS.map((action) => (
                <div key={action} className="flex items-center justify-between gap-3 px-3 py-2">
                  <code className="text-xs text-on-surface-variant">{action}</code>
                  <Select
                    value={permissions[action]}
                    onValueChange={(v) => setPermissions((p) => ({ ...p, [action]: v as PermissionScope }))}
                  >
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERMISSION_SCOPES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !name}>
              {submitting ? t('common.saving') : t('settings.roles.createButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
