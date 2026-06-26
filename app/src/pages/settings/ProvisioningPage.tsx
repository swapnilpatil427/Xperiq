import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { usePermissions } from '../../lib/permissions';
import { useApi } from '../../hooks/useApi';
import { PageHeader } from '../../components/PageHeader';
import { SettingsUsersNav } from '../../components/SettingsUsersNav';
import { Icon } from '../../components/Icon';
import { ROUTES } from '../../constants/routes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { ScimToken } from '../../lib/api';

export function ProvisioningPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('settings.provisioning.pageTitle'), t('settings.provisioning.pageSubtitle'));
  const { isAdmin } = usePermissions();
  const api = useApi();

  const [tokens, setTokens] = useState<ScimToken[]>([]);
  const [scimBaseUrl, setScimBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);

  // SSO mapping state: list of { samlAttr, field } rows.
  const [mappingRows, setMappingRows] = useState<Array<{ k: string; v: string }>>([]);
  const [mappingSaved, setMappingSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ tokens, scimBaseUrl }, { mappings }] = await Promise.all([
        api.listScimTokens(), api.getSsoMappings(),
      ]);
      setTokens(tokens);
      setScimBaseUrl(scimBaseUrl);
      setMappingRows(Object.entries(mappings).map(([k, v]) => ({ k, v: String(v) })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load provisioning settings');
    } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  async function revoke(id: string) {
    await api.revokeScimToken(id);
    setTokens((prev) => prev.map((tk) => (tk.id === id ? { ...tk, isActive: false } : tk)));
  }

  async function saveMappings() {
    const mappings = Object.fromEntries(mappingRows.filter((r) => r.k && r.v).map((r) => [r.k, r.v]));
    await api.updateSsoMappings(mappings);
    setMappingSaved(true);
    setTimeout(() => setMappingSaved(false), 2000);
  }

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto w-full">
        <PageHeader title={t('settings.provisioning.pageTitle')} />
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
        crumbs={[{ label: t('nav.settings'), path: ROUTES.SETTINGS }, { label: t('settings.provisioning.pageTitle') }]}
        title={t('settings.provisioning.pageTitle')}
        subtitle={t('settings.provisioning.pageSubtitle')}
      />
      <SettingsUsersNav />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm p-3 mb-4">{error}</div>
      )}

      <motion.div className="space-y-6"
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>

        {/* SCIM endpoint URL */}
        <Card className="p-5">
          <h3 className="font-semibold text-on-surface mb-1">{t('settings.provisioning.endpointTitle')}</h3>
          <p className="text-sm text-on-surface-variant mb-3">{t('settings.provisioning.endpointHint')}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm bg-muted rounded-lg px-3 py-2 truncate">{scimBaseUrl || '—'}</code>
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(scimBaseUrl)}>
              <Icon name="content_copy" size={15} />
            </Button>
          </div>
        </Card>

        {/* SCIM tokens */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-on-surface">{t('settings.provisioning.tokensTitle')}</h3>
              <p className="text-sm text-on-surface-variant">{t('settings.provisioning.tokensHint')}</p>
            </div>
            <Button onClick={() => { setNewToken(null); setCreateOpen(true); }}>
              <Icon name="add" size={16} className="mr-1.5" />{t('settings.provisioning.createToken')}
            </Button>
          </div>
          {loading ? (
            <p className="text-on-surface-variant text-sm py-4">{t('common.loading')}</p>
          ) : tokens.length === 0 ? (
            <p className="text-on-surface-variant text-sm py-4">{t('settings.provisioning.noTokens')}</p>
          ) : (
            <div className="divide-y divide-border">
              {tokens.map((tk) => (
                <div key={tk.id} className="flex items-center gap-3 py-3">
                  <Icon name="key" size={18} className="text-on-surface-variant" />
                  <div className="min-w-0">
                    <p className="font-medium text-on-surface truncate">{tk.name}</p>
                    <p className="text-xs text-on-surface-variant">
                      {tk.tokenPrefix}··· · {tk.provider}
                    </p>
                  </div>
                  {tk.isActive
                    ? <Badge variant="success" className="ml-auto">{t('settings.provisioning.active')}</Badge>
                    : <Badge variant="neutral" className="ml-auto">{t('settings.provisioning.revoked')}</Badge>}
                  {tk.isActive && (
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                      onClick={() => revoke(tk.id)}>
                      {t('settings.provisioning.revoke')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* SSO attribute mapping */}
        <Card className="p-5">
          <h3 className="font-semibold text-on-surface mb-1">{t('settings.provisioning.ssoTitle')}</h3>
          <p className="text-sm text-on-surface-variant mb-3">{t('settings.provisioning.ssoHint')}</p>
          <div className="space-y-2">
            {mappingRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="flex-1" placeholder={t('settings.provisioning.samlAttr')}
                  value={row.k} onChange={(e) => setMappingRows((p) => p.map((r, idx) => idx === i ? { ...r, k: e.target.value } : r))} />
                <Icon name="arrow_forward" size={16} className="text-on-surface-variant flex-shrink-0" />
                <Input className="flex-1" placeholder={t('settings.provisioning.experientField')}
                  value={row.v} onChange={(e) => setMappingRows((p) => p.map((r, idx) => idx === i ? { ...r, v: e.target.value } : r))} />
                <Button variant="ghost" size="sm" onClick={() => setMappingRows((p) => p.filter((_, idx) => idx !== i))}>
                  <Icon name="close" size={15} />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setMappingRows((p) => [...p, { k: '', v: '' }])}>
                <Icon name="add" size={14} className="mr-1" />{t('settings.provisioning.addMapping')}
              </Button>
              <Button size="sm" className="ml-auto" onClick={saveMappings}>
                {mappingSaved ? t('settings.provisioning.saved') : t('common.save')}
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={(o) => { setCreateOpen(o); if (!o) { setNewToken(null); load(); } }}
        newToken={newToken}
        onCreate={async (name, provider) => {
          const res = await api.createScimToken({ name, provider });
          setNewToken(res.token);
        }}
      />
    </div>
  );
}

function CreateTokenDialog({ open, onOpenChange, newToken, onCreate }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  newToken: string | null;
  onCreate: (name: string, provider: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('okta');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try { await onCreate(name, provider); setName(''); }
    catch (err) { setError(err instanceof Error ? err.message : t('settings.provisioning.createError')); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t('settings.provisioning.createToken')}</DialogTitle></DialogHeader>
        {newToken ? (
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">{t('settings.provisioning.tokenOnce')}</p>
            <code className="block text-sm bg-muted rounded-lg px-3 py-2 break-all">{newToken}</code>
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(newToken)}>
              <Icon name="content_copy" size={15} className="mr-1.5" />{t('settings.provisioning.copy')}
            </Button>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{t('settings.provisioning.done')}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tok-name">{t('settings.provisioning.tokenNameLabel')}</Label>
              <Input id="tok-name" required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Okta Production" />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={submitting || !name}>{submitting ? t('common.saving') : t('settings.provisioning.generate')}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
