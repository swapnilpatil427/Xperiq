import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useApi } from '../hooks/useApi';
import { useTranslation } from '../lib/i18n';
import { ROUTES } from '../constants/routes';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

// ── Animation variants ────────────────────────────────────────────────────────

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
const rise = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type BroadcastStatus = 'pending_approval' | 'approved' | 'sending' | 'sent' | 'rejected' | 'expired' | 'failed';

interface Broadcast {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  created_by: string;
  segment_id: string | null;
  contact_ids: string[] | null;
  estimated_count: number;
  workflow_id: string;
  channels: string[];
  payload: Record<string, unknown>;
  status: BroadcastStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  expires_at: string;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

interface BroadcastStats {
  pending: number;
  approved: number;
  sent: number;
  rejected: number;
  sending: number;
  failed: number;
  expired: number;
}

interface BroadcastPayloadForm {
  surveyTitle: string;
  surveyUrl: string;
  subject: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  senderName: string;
}

interface CreateBroadcastForm {
  name: string;
  description: string;
  audienceType: 'segment' | 'all';
  segmentId: string;
  channels: string[];
  payload: BroadcastPayloadForm;
}

interface ContactSegment {
  id: string;
  name: string;
  contact_count: number;
}

// ── Status chip ───────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<BroadcastStatus, { bg: string; text: string; label: string }> = {
  pending_approval: { bg: 'rgba(217,119,6,0.1)',   text: '#d97706', label: 'broadcasts.status.pending_approval' },
  approved:         { bg: 'rgba(5,150,105,0.1)',   text: '#059669', label: 'broadcasts.status.approved' },
  sending:          { bg: 'rgba(42,75,217,0.1)',   text: '#2a4bd9', label: 'broadcasts.status.sending' },
  sent:             { bg: 'rgba(42,75,217,0.1)',   text: '#2a4bd9', label: 'broadcasts.status.sent' },
  rejected:         { bg: 'rgba(220,38,38,0.1)',   text: '#dc2626', label: 'broadcasts.status.rejected' },
  expired:          { bg: 'rgba(107,114,128,0.1)', text: '#6b7280', label: 'broadcasts.status.expired' },
  failed:           { bg: 'rgba(220,38,38,0.1)',   text: '#dc2626', label: 'broadcasts.status.failed' },
};

function StatusChip({ status }: { status: BroadcastStatus }) {
  const { t } = useTranslation();
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.expired;
  return (
    <span
      className="text-[11px] font-bold px-2 py-1 rounded-lg inline-flex items-center"
      style={{ background: style.bg, color: style.text }}
    >
      {t(style.label)}
    </span>
  );
}

// ── Channel badge ─────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, string> = {
  email: 'email',
  sms: 'sms',
  push: 'notifications',
  in_app: 'inbox',
};

function ChannelBadge({ channel }: { channel: string }) {
  return (
    <Badge
      variant="outline"
      className="text-[10px] capitalize flex items-center gap-1"
    >
      <Icon name={CHANNEL_ICONS[channel] ?? 'send'} size={11} />
      {channel}
    </Badge>
  );
}

// ── Relative time helper ──────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)  return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps { label: string; value: number; color: string; icon: string }

function StatCard({ label, value, color, icon }: StatCardProps) {
  return (
    <motion.div variants={rise}>
      <div
        className="rounded-xl p-4 flex items-center gap-3 border"
        style={{ background: `${color}10`, borderColor: `${color}30` }}
      >
        <div className="rounded-lg p-2" style={{ background: `${color}18` }}>
          <Icon name={icon} size={20} style={{ color }} />
        </div>
        <div>
          <div className="text-2xl font-black" style={{ color }}>{value}</div>
          <div className="text-xs text-[color:var(--color-on-surface-muted)] mt-0.5">{label}</div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Broadcast card ────────────────────────────────────────────────────────────

function BroadcastCard({ broadcast, onClick }: { broadcast: Broadcast; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.div variants={rise}>
      <button
        className="w-full text-left rounded-xl border p-4 hover:border-[color:var(--color-primary)] transition-colors bg-[color:var(--color-surface)]"
        onClick={onClick}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">{broadcast.name}</span>
              <StatusChip status={broadcast.status} />
            </div>
            {broadcast.description && (
              <p className="text-xs text-[color:var(--color-on-surface-muted)] mt-1 line-clamp-1">
                {broadcast.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs text-[color:var(--color-on-surface-muted)] flex items-center gap-1">
                <Icon name="group" size={13} />
                ~{broadcast.estimated_count.toLocaleString()}
              </span>
              {broadcast.channels.map((ch) => (
                <ChannelBadge key={ch} channel={ch} />
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] text-[color:var(--color-on-surface-muted)]">
              {formatRelativeTime(broadcast.created_at)}
            </div>
            <div className="text-[11px] text-[color:var(--color-on-surface-muted)] mt-0.5 truncate max-w-[120px]">
              {t('broadcasts.form.senderName') ? broadcast.created_by : broadcast.created_by}
            </div>
          </div>
        </div>
      </button>
    </motion.div>
  );
}

// ── New broadcast sheet ───────────────────────────────────────────────────────

const CHANNELS = ['email', 'sms', 'push', 'in_app'] as const;

const INITIAL_FORM: CreateBroadcastForm = {
  name: '',
  description: '',
  audienceType: 'segment',
  segmentId: '',
  channels: ['email'],
  payload: {
    surveyTitle: '',
    surveyUrl: '',
    subject: '',
    body: '',
    ctaLabel: '',
    ctaUrl: '',
    senderName: '',
  },
};

function NewBroadcastSheet({
  open,
  onClose,
  onCreated,
  segments,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  segments: ContactSegment[];
}) {
  const { t } = useTranslation();
  const api = useApi();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CreateBroadcastForm>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setStep(1);
    setForm(INITIAL_FORM);
    setError(null);
  }, []);

  function handleClose() {
    resetForm();
    onClose();
  }

  function updatePayload(key: keyof BroadcastPayloadForm, value: string) {
    setForm((f) => ({ ...f, payload: { ...f.payload, [key]: value } }));
  }

  function toggleChannel(ch: string) {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter((c) => c !== ch)
        : [...f.channels, ch],
    }));
  }

  async function handleSubmit() {
    if (!form.name.trim()) { setError('Broadcast name is required'); return; }
    if (form.channels.length === 0) { setError('Select at least one channel'); return; }
    if (form.audienceType === 'segment' && !form.segmentId) { setError('Select a contact segment'); return; }

    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        channels: form.channels,
        payload: {
          surveyTitle: form.payload.surveyTitle || undefined,
          surveyUrl: form.payload.surveyUrl || undefined,
          subject: form.payload.subject || undefined,
          body: form.payload.body || undefined,
          ctaLabel: form.payload.ctaLabel || undefined,
          ctaUrl: form.payload.ctaUrl || undefined,
          senderName: form.payload.senderName || undefined,
        },
      };
      if (form.audienceType === 'segment') {
        body.segmentId = form.segmentId;
      }

      await (api as unknown as { post: (url: string, data: unknown) => Promise<unknown> })
        .post?.('/api/outreach/broadcasts', body);

      setToast(t('broadcasts.form.submitSuccess'));
      setTimeout(() => setToast(null), 3000);
      handleClose();
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create broadcast');
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-[color:var(--color-outline)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-primary)] text-[color:var(--color-on-surface)]';

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('broadcasts.new')}</SheetTitle>
          </SheetHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-1 mt-4 mb-6">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className="h-1.5 flex-1 rounded-full transition-colors duration-300"
                style={{ background: s <= step ? 'var(--color-primary)' : 'var(--color-outline)' }}
              />
            ))}
          </div>

          <div className="space-y-5">
            {/* Step 1: Name + Description */}
            {step === 1 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('broadcasts.form.name')}</label>
                  <input
                    className={inputCls}
                    placeholder={t('broadcasts.form.namePlaceholder')}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('broadcasts.form.description')}</label>
                  <textarea
                    className={`${inputCls} resize-none h-24`}
                    placeholder={t('broadcasts.form.descriptionPlaceholder')}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </motion.div>
            )}

            {/* Step 2: Audience */}
            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div className="text-sm font-medium">{t('broadcasts.form.audience')}</div>
                <div className="space-y-2">
                  {(['segment'] as const).map((type) => (
                    <label key={type} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-[color:var(--color-primary)] transition-colors">
                      <input
                        type="radio"
                        name="audienceType"
                        value={type}
                        checked={form.audienceType === type}
                        onChange={() => setForm((f) => ({ ...f, audienceType: type }))}
                        className="accent-[color:var(--color-primary)]"
                      />
                      <span className="text-sm">{t('broadcasts.form.segment')}</span>
                    </label>
                  ))}
                </div>
                {form.audienceType === 'segment' && (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('broadcasts.form.segment')}</label>
                    <select
                      className={inputCls}
                      value={form.segmentId}
                      onChange={(e) => setForm((f) => ({ ...f, segmentId: e.target.value }))}
                    >
                      <option value="">Select a segment…</option>
                      {segments.map((seg) => (
                        <option key={seg.id} value={seg.id}>
                          {seg.name} ({seg.contact_count?.toLocaleString() ?? '?'} contacts)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 3: Channels */}
            {step === 3 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                <div className="text-sm font-medium">{t('broadcasts.form.channels')}</div>
                {CHANNELS.map((ch) => (
                  <label key={ch} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-[color:var(--color-primary)] transition-colors">
                    <input
                      type="checkbox"
                      checked={form.channels.includes(ch)}
                      onChange={() => toggleChannel(ch)}
                      className="accent-[color:var(--color-primary)] w-4 h-4"
                    />
                    <Icon name={CHANNEL_ICONS[ch] ?? 'send'} size={18} />
                    <span className="text-sm capitalize">{ch.replace('_', ' ')}</span>
                  </label>
                ))}
              </motion.div>
            )}

            {/* Step 4: Content */}
            {step === 4 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div className="text-sm font-medium">{t('broadcasts.form.content')}</div>
                {[
                  { key: 'subject' as const,     label: 'broadcasts.form.subject',     type: 'input',    placeholder: 'Email subject line' },
                  { key: 'senderName' as const,  label: 'broadcasts.form.senderName',  type: 'input',    placeholder: 'Sender name' },
                  { key: 'ctaLabel' as const,    label: 'broadcasts.form.ctaLabel',    type: 'input',    placeholder: 'Button label' },
                  { key: 'ctaUrl' as const,      label: 'broadcasts.form.ctaUrl',      type: 'input',    placeholder: 'https://…' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium mb-1.5">{t(label)}</label>
                    <input
                      className={inputCls}
                      placeholder={placeholder}
                      value={form.payload[key]}
                      onChange={(e) => updatePayload(key, e.target.value)}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium mb-1.5">{t('broadcasts.form.body')}</label>
                  <textarea
                    className={`${inputCls} resize-none h-32`}
                    placeholder="Message body…"
                    value={form.payload.body}
                    onChange={(e) => updatePayload('body', e.target.value)}
                  />
                </div>
              </motion.div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">
              {error}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex gap-2 mt-8">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
                Back
              </Button>
            )}
            {step < 4 ? (
              <Button
                className="ml-auto"
                onClick={() => {
                  if (step === 1 && !form.name.trim()) { setError('Broadcast name is required'); return; }
                  setError(null);
                  setStep((s) => s + 1);
                }}
              >
                Next
              </Button>
            ) : (
              <Button
                className="ml-auto"
                style={{ background: 'var(--color-primary)' }}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? t('broadcasts.form.submitting') : t('broadcasts.form.submit')}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-xl text-sm font-medium"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type TabKey = 'all' | 'pending_approval' | 'sent';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all',              label: 'All' },
  { key: 'pending_approval', label: 'Pending Approval' },
  { key: 'sent',             label: 'Sent' },
];

export function BroadcastsPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('broadcasts.title'), t('broadcasts.subtitle'));
  const navigate = useNavigate();
  const api = useApi();

  const [tab, setTab] = useState<TabKey>('all');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [stats, setStats] = useState<BroadcastStats>({ pending: 0, approved: 0, sent: 0, rejected: 0, sending: 0, failed: 0, expired: 0 });
  const [segments, setSegments] = useState<ContactSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const http = api as unknown as { get: (url: string) => Promise<{ data: unknown }> };
      const statusParam = tab === 'all' ? '' : `?status=${tab}`;
      const [broadcastsRes, statsRes, segmentsRes] = await Promise.all([
        http.get(`/api/outreach/broadcasts${statusParam}`),
        http.get('/api/outreach/broadcasts/stats'),
        api.listSegments().catch(() => []),
      ]);
      setBroadcasts(((broadcastsRes.data as { broadcasts: Broadcast[] }).broadcasts) ?? []);
      setStats((statsRes.data as BroadcastStats) ?? stats);
      setSegments(segmentsRes as ContactSegment[]);
    } catch {
      // graceful degradation — table may not exist yet
    } finally {
      setLoading(false);
    }
  }, [tab, api]);

  useEffect(() => { void loadData(); }, [loadData]);

  const statCards = [
    { label: t('broadcasts.stats.pending'),  value: stats.pending,  color: '#d97706', icon: 'pending' },
    { label: t('broadcasts.stats.approved'), value: stats.approved, color: '#059669', icon: 'check_circle' },
    { label: t('broadcasts.stats.sent'),     value: stats.sent,     color: '#2a4bd9', icon: 'send' },
    { label: t('broadcasts.stats.failed'),   value: stats.failed,   color: '#dc2626', icon: 'error' },
  ];

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('broadcasts.title') }]}
        title={t('broadcasts.title')}
        subtitle={t('broadcasts.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(ROUTES.BROADCASTS_APPROVAL)}
              className="flex items-center gap-1.5"
            >
              <Icon name="approval" size={16} />
              Approvals
              {stats.pending > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {stats.pending}
                </span>
              )}
            </Button>
            <Button
              onClick={() => setSheetOpen(true)}
              style={{ background: 'var(--color-primary)' }}
              className="flex items-center gap-1.5"
            >
              <Icon name="add" size={16} />
              {t('broadcasts.new')}
            </Button>
          </div>
        }
      />

      {/* Stats row */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </motion.div>

      {/* Tab strip */}
      <div className="flex gap-1 mb-4 p-1 rounded-lg bg-[color:var(--color-surface-2)] w-fit">
        {TABS.map((t_) => (
          <button
            key={t_.key}
            onClick={() => setTab(t_.key)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors"
            style={
              tab === t_.key
                ? { background: 'var(--color-surface)', color: 'var(--color-primary)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                : { color: 'var(--color-on-surface-muted)' }
            }
          >
            {t_.label}
          </button>
        ))}
      </div>

      {/* Broadcast list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : broadcasts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-[color:var(--color-surface-2)] flex items-center justify-center mb-4">
            <Icon name="broadcast_on_home" size={32} className="text-[color:var(--color-on-surface-muted)]" />
          </div>
          <div className="font-semibold text-lg mb-1">{t('broadcasts.noItems')}</div>
          <div className="text-sm text-[color:var(--color-on-surface-muted)] max-w-sm">
            {t('broadcasts.noItemsDescription')}
          </div>
          <Button
            className="mt-6"
            style={{ background: 'var(--color-primary)' }}
            onClick={() => setSheetOpen(true)}
          >
            <Icon name="add" size={16} className="mr-1.5" />
            {t('broadcasts.new')}
          </Button>
        </motion.div>
      ) : (
        <motion.div
          className="space-y-3"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          {broadcasts.map((b) => (
            <BroadcastCard
              key={b.id}
              broadcast={b}
              onClick={() => navigate(`${ROUTES.BROADCASTS}/${b.id}`)}
            />
          ))}
        </motion.div>
      )}

      {/* New broadcast sheet */}
      <NewBroadcastSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onCreated={loadData}
        segments={segments}
      />
    </div>
  );
}
