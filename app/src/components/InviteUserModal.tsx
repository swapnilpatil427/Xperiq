import { useState } from 'react';
import { useTranslation } from '../lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { DirectoryRole } from '../lib/api';

interface InviteUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: DirectoryRole[];
  onInvite: (payload: { email: string; roleId?: string; jobTitle?: string }) => Promise<unknown>;
}

export function InviteUserModal({ open, onOpenChange, roles, onInvite }: InviteUserModalProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState<string>('');
  const [jobTitle, setJobTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail(''); setRoleId(''); setJobTitle(''); setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onInvite({ email, roleId: roleId || undefined, jobTitle: jobTitle || undefined });
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.userDirectory.inviteError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.userDirectory.inviteTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">{t('settings.userDirectory.emailLabel')}</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">{t('settings.userDirectory.roleLabel')}</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger id="invite-role">
                <SelectValue placeholder={t('settings.userDirectory.rolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-title">{t('settings.userDirectory.jobTitleLabel')}</Label>
            <Input
              id="invite-title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder={t('settings.userDirectory.jobTitlePlaceholder')}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !email}>
              {submitting ? t('settings.userDirectory.inviting') : t('settings.userDirectory.sendInvite')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
