import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { PageHeader } from '../../components/PageHeader';
import { FileDropzone } from '../../components/prism/FileDropzone';
import type { FileDropzoneMeta } from '../../components/prism/FileDropzone';
import { useApi } from '../../hooks/useApi';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useTranslation } from '../../lib/i18n';
import { invalidate } from '../../lib/dataBus';
import { ROUTES, toPath } from '../../constants/routes';
import { DEFAULT_CONNECTORS, findConnector, acceptForConnector, isMultiFileConnector } from './connectorCatalog';
import { cn } from '@/lib/utils';
import type { ConnectorMeta, PrismMode, ResourceRef } from '../../types/prism';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const MODE_LABEL: Record<'augment' | 'ingest', string> = {
  augment: 'prism.connect.modeAugmentTitle',
  ingest: 'prism.connect.modeIngestTitle',
};

/** Smart default mode: review / continuous-sync sources → augment; else ingest.
 *  We never default to migrate (the destructive path). */
function smartDefaultMode(meta: ConnectorMeta): 'augment' | 'ingest' {
  return meta.capabilities.includes('review') || meta.capabilities.includes('continuous_sync')
    ? 'augment'
    : 'ingest';
}

export function PrismConnectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const api = useApi();
  const { platform = '' } = useParams<{ platform: string }>();
  const [searchParams] = useSearchParams();
  useSetPageTitle(t('prism.title'));

  const [registry, setRegistry] = useState<ConnectorMeta[]>(DEFAULT_CONNECTORS);
  const meta = findConnector(platform, registry);

  const connectedId = searchParams.get('connected');

  const [apiToken, setApiToken] = useState('');
  const [dataCenter, setDataCenter] = useState('');
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [fileRef, setFileRef] = useState('');
  /** Uploaded files for file_upload imports (1 for single-format tiles, N for file_auto). */
  const [uploadedFiles, setUploadedFiles] = useState<FileDropzoneMeta[]>([]);
  const [mode, setMode] = useState<PrismMode>('ingest');
  const [historyWindow, setHistoryWindow] = useState<number>(3);
  const [useTokenFallback, setUseTokenFallback] = useState(false);
  const [pasteKeyFallback, setPasteKeyFallback] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listPrismConnectors()
      .then((r) => { if (r.connectors?.length) setRegistry(r.connectors); })
      .catch(() => { /* keep default */ });
  }, [api]);

  // Seed the smart default mode once we know the connector capabilities.
  useEffect(() => {
    if (meta) setMode(smartDefaultMode(meta));
  }, [meta?.platform]); // eslint-disable-line react-hooks/exhaustive-deps

  // The effective auth path: oauth2 sources may fall back to an API token.
  const authKind = meta
    ? (meta.authKind === 'oauth2' && useTokenFallback ? 'api_key' : meta.authKind)
    : 'api_key';

  const isReview = meta ? (meta.group === 'reviews' || meta.capabilities.includes('review')) : false;
  const defaultModeKey = meta ? smartDefaultMode(meta) : 'ingest';

  const returnUrl = useMemo(
    () => `${window.location.origin}${toPath(ROUTES.PRISM_CONNECT, { platform })}`,
    [platform],
  );

  // OAuth return: a `?connected=` param means the provider redirected back with a
  // live connection. Auto-advance: create the discovery job and route into it.
  useEffect(() => {
    if (!connectedId || !meta) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      setError(null);
      try {
        const { job } = await api.createPrismJob({
          connectionId: connectedId,
          kind: mode === 'migrate' ? 'migration' : mode === 'ingest' ? 'sync' : 'backfill',
          resources: [],
        });
        if (cancelled) return;
        invalidate('prism');
        navigate(toPath(ROUTES.PRISM_JOB, { jobId: job.id }));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [connectedId, meta?.platform]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createConnectionAndJob() {
    if (!meta) return;
    setBusy(true);
    setError(null);
    try {
      // For data file imports the connection points at the first uploaded file;
      // the job's `resources` array carries one ResourceRef per uploaded file.
      const isFileImport = authKind === 'file_upload' && meta.authKind === 'file_upload';
      const connectionFileRef = isFileImport ? uploadedFiles[0]?.fileRef : fileRef;
      const { connection } = await api.createPrismConnection({
        platform: meta.platform,
        authKind,
        mode,
        history_window: historyWindow,
        credentials: authKind === 'api_key'
          ? { apiKey: apiToken, extra: dataCenter ? { datacenterId: dataCenter } : undefined }
          : authKind === 'service_account'
            ? { serviceAccountJson }
            : undefined,
        fileRef: authKind === 'file_upload' ? connectionFileRef : undefined,
      });
      const resources: ResourceRef[] = isFileImport
        ? uploadedFiles.map((f) => ({
            kind: meta.platform === 'qsf' ? 'survey_def' : 'response',
            id: f.fileRef,
            extra: { format: f.detectedFormat, platform: f.detectedPlatform },
          }))
        : [];
      const { job } = await api.createPrismJob({
        connectionId: connection.id,
        kind: mode === 'migrate' ? 'migration' : mode === 'ingest' ? 'sync' : 'backfill',
        resources,
      });
      invalidate('prism');
      navigate(toPath(ROUTES.PRISM_JOB, { jobId: job.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  async function startOAuth() {
    if (!meta) return;
    setBusy(true);
    setError(null);
    try {
      const { authorizeUrl } = await api.startPrismOAuth(meta.platform, {
        mode,
        history_window: historyWindow,
        returnUrl,
      });
      window.location.assign(authorizeUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (!meta) {
    return (
      <div className="max-w-3xl mx-auto w-full">
        <PageHeader crumbs={[{ label: t('prism.title'), path: ROUTES.PRISM }, { label: platform }]} title={platform} />
        <p className="text-sm text-on-surface-variant">{t('prism.gallery.loadError')}</p>
        <Button variant="outline" className="rounded-xl mt-4" onClick={() => navigate(ROUTES.PRISM)}>
          {t('prism.connect.backToGallery')}
        </Button>
      </div>
    );
  }

  // Has the user provided what's needed to import (non-OAuth paths)?
  const canImport =
    authKind === 'file_upload' ? uploadedFiles.length > 0
      : authKind === 'api_key' ? apiToken.trim().length > 0
        : authKind === 'service_account' ? (!!fileRef || serviceAccountJson.trim().length > 0)
          : false;

  const initial = meta.label.charAt(0).toUpperCase();

  // Per-format drop prompt ("Drop a .csv file…"); falls back to a generic prompt
  // listing the accepted extensions. i18n echoes the key on a miss.
  const promptKey = `prism.connect.fileDropPrompt.${meta.platform}`;
  const promptResolved = t(promptKey);
  const fileDropPrompt = promptResolved === promptKey
    ? t('prism.connect.fileDropPromptGeneric', { accept: acceptForConnector(meta) })
    : promptResolved;

  return (
    <div className="max-w-3xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('prism.title'), path: ROUTES.PRISM }, { label: meta.label }]}
        title={t('prism.connect.title', { platform: meta.label })}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="space-y-6"
      >
        {/* Source header: logo + label + one-line "what we'll do" */}
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white font-black font-headline text-lg"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' }}
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-extrabold font-headline text-on-surface">{meta.label}</h2>
            <p className="text-sm text-on-surface-variant leading-relaxed mt-0.5">
              {t(`prism.connect.whatWeDo.${meta.authKind}`, { platform: meta.label })}
            </p>
          </div>
        </div>

        {/* ToS chip for review sources */}
        {isReview && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-surface-container text-on-surface-variant">
            <Icon name="verified_user" size={13} className="text-primary" fill={1} />
            {meta.legalPosture.basis === 'display_only' ? t('prism.tos.displayOnly') : t('prism.tos.officialApi')}
          </span>
        )}

        {/* Connected (OAuth return) state */}
        {connectedId ? (
          <Card className="p-6 flex items-center gap-3">
            <Icon name="check_circle" size={22} fill={1} className="text-success" />
            <div>
              <p className="text-sm font-bold text-on-surface">{t('prism.connect.connected')}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{t('prism.connect.connectedAdvancing')}</p>
            </div>
          </Card>
        ) : (
          <Card className="p-5 space-y-4">
            {/* PRIMARY auth — one obvious path adapted to the connector */}

            {authKind === 'file_upload' && (
              <FileDropzone
                accept={acceptForConnector(meta)}
                maxMb={50}
                multiple={isMultiFileConnector(meta)}
                showDetected={meta.autodetect ?? meta.platform === 'file_auto'}
                prompt={fileDropPrompt}
                onUploaded={(_ref, m) => { setUploadedFiles([m]); setError(null); }}
                onUploadedMany={(metas) => { setUploadedFiles(metas); setError(null); }}
                onError={(msg) => setError(msg)}
              />
            )}

            {meta.authKind === 'oauth2' && !useTokenFallback && (
              <div className="space-y-3">
                <Button variant="gradient" size="lg" className="w-full gap-2" onClick={startOAuth} disabled={busy}>
                  <Icon name={busy ? 'progress_activity' : 'login'} size={18} className={busy ? 'animate-spin' : ''} />
                  {t('prism.connect.oauthCta', { platform: meta.label })}
                </Button>
                <button
                  type="button"
                  onClick={() => setUseTokenFallback(true)}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  {t('prism.connect.useTokenInstead')}
                </button>
              </div>
            )}

            {authKind === 'api_key' && (
              <div className="space-y-3">
                {meta.platform === 'qualtrics' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="prism-dc">{t('prism.connect.dataCenterLabel')}</Label>
                    <Input id="prism-dc" value={dataCenter} onChange={(e) => setDataCenter(e.target.value)} placeholder={t('prism.connect.dataCenterPlaceholder')} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="prism-token">
                    {t('prism.connect.apiTokenLabel')}{' '}
                    <span className="text-on-surface-variant font-normal normal-case">({t('prism.connect.encryptedHint')})</span>
                  </Label>
                  <Input id="prism-token" type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} placeholder={t('prism.connect.apiTokenPlaceholder')} autoComplete="off" />
                </div>
                <details className="group rounded-lg">
                  <summary className="cursor-pointer text-xs font-semibold text-primary hover:underline list-none flex items-center gap-1">
                    <Icon name="help" size={14} />
                    {t('prism.connect.whereToFind')}
                  </summary>
                  <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
                    {meta.platform === 'qualtrics'
                      ? t('prism.connect.qualtricsTokenHelp')
                      : t('prism.connect.genericTokenHelp', { platform: meta.label })}
                  </p>
                </details>
                <p className="flex items-start gap-2 text-xs text-on-surface-variant">
                  <Icon name="lock" size={14} className="mt-0.5 shrink-0 text-primary" />
                  {t('prism.connect.tokenHint', { platform: meta.label })}
                </p>
              </div>
            )}

            {authKind === 'service_account' && (
              <div className="space-y-3">
                {!pasteKeyFallback ? (
                  <>
                    <FileDropzone
                      accept=".json,.p8"
                      maxMb={5}
                      prompt={t('prism.connect.serviceAccountDropPrompt')}
                      onUploaded={(ref) => { setFileRef(ref); setError(null); }}
                      onError={(msg) => setError(msg)}
                    />
                    <button
                      type="button"
                      onClick={() => setPasteKeyFallback(true)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      {t('prism.connect.pasteInstead')}
                    </button>
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="prism-sa">{t('prism.connect.serviceAccountLabel')}</Label>
                    <textarea
                      id="prism-sa"
                      value={serviceAccountJson}
                      onChange={(e) => setServiceAccountJson(e.target.value)}
                      placeholder={t('prism.connect.serviceAccountPlaceholder')}
                      className="flex min-h-[96px] w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Advanced options — collapsed, with a smart-default summary */}
        {!connectedId && (
          <details className="rounded-xl border border-border/60 bg-surface-container/40 px-4 py-3">
            <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                <Icon name="tune" size={16} className="text-on-surface-variant" />
                {t('prism.connect.advancedOptions')}
              </span>
              <span className="flex items-center gap-2 text-xs text-on-surface-variant min-w-0">
                <span className="truncate">{t(`prism.connect.defaultSummary.${defaultModeKey}`)}</span>
                <span className="text-primary font-semibold shrink-0">{t('prism.connect.changeDefault')}</span>
              </span>
            </summary>

            <div className="mt-4 space-y-5">
              {/* Mode */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold font-headline text-on-surface">{t('prism.connect.modeHeading')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label={t('prism.connect.modeHeading')}>
                  {(['augment', 'ingest'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      onClick={() => setMode(m)}
                      className={cn(
                        'text-left rounded-xl p-3 border transition-colors',
                        mode === m ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/30',
                      )}
                    >
                      <p className="font-bold text-sm text-on-surface">{t(MODE_LABEL[m])}</p>
                      <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                        {t(`prism.connect.mode${m.charAt(0).toUpperCase() + m.slice(1)}Desc`)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* History window */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold font-headline text-on-surface">{t('prism.connect.historyHeading')}</h3>
                  <span className="text-sm font-bold text-primary tabular-nums">{t('prism.connect.historyLabel', { n: historyWindow })}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={historyWindow}
                  onChange={(e) => setHistoryWindow(Number(e.target.value))}
                  aria-label={t('prism.connect.historyHeading')}
                  aria-valuetext={t('prism.connect.historyLabel', { n: historyWindow })}
                  className="w-full accent-[var(--color-primary)]"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                <p className="text-xs text-on-surface-variant">{t('prism.connect.historyHint')}</p>
              </div>
            </div>
          </details>
        )}

        {error && (
          <div className="rounded-xl px-4 py-3 bg-destructive/10 text-destructive text-sm font-medium flex items-center gap-2">
            <Icon name="error" size={16} />{error}
          </div>
        )}

        {/* Primary action for non-OAuth, credential-based paths */}
        {!connectedId && authKind !== 'oauth2' && (
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" className="rounded-xl" onClick={() => navigate(ROUTES.PRISM)} disabled={busy}>
              {t('prism.connect.cancel')}
            </Button>
            <Button variant="gradient" className="rounded-xl gap-1.5" onClick={createConnectionAndJob} disabled={busy || !canImport}>
              {busy
                ? <><Icon name="progress_activity" size={16} className="animate-spin" />{t('prism.connect.connecting')}</>
                : <><Icon name="bolt" size={16} />{t('prism.connect.importCta')}</>}
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
