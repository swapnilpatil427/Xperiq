import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useApi } from '../hooks/useApi';
import { useTranslation } from '../lib/i18n';
import { PageHeader } from '../components/PageHeader';
import { ROUTES } from '../constants/routes';
import { Icon } from '../components/Icon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

// ── Animation variants ────────────────────────────────────────────────────────

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };
const rise = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type BroadcastStatus = 'pending_approval' | 'approved' | 'rejected' | 'sending' | 'sent' | 'failed' | 'expired';

interface Broadcast {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  segment_id: string | null;
  segment_name?: string | null;
  contact_ids: string[] | null;
  estimated_count: number;
  channels: string[];
  payload: {
    surveyTitle?: string;
    subject?: string;
    body?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    senderName?: string;
  };
  status: BroadcastStatus;
  expires_at: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  sent_count: number;
  delivered_count: number;
}

interface AuditEntry {
  id: string;
  broadcast_id: string;
  actor_user_id: string;
  actor_name: string | null;
  action: string;
  note: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function formatExpiryCountdown(expiresAt: string): { label: string; color: string; expired: boolean } {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { label: 'Expired', color: '#dc2626', expired: true };

  const hours = Math.floor(diff / 3_600_000);
  const mins  = Math.floor((diff % 3_600_000) / 60_000);

  let color = '#059669';
  if (hours < 4)  color = '#dc2626';
  else if (hours < 24) color = '#d97706';

  const label = hours > 0 ? `Expires in ${hours}h ${mins}m` : `Expires in ${mins}m`;
  return { label, color, expired: false };
}

const CHANNEL_ICONS: Record<string, string> = {
  email: 'email',
  sms: 'sms',
  push: 'notifications',
  in_app: 'inbox',
};

const ACTION_LABELS: Record<string, string> = {
  created:  'Created',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  sent:     'Sent',
  failed:   'Failed',
  expired:  'Auto-expired',
};

const ACTION_COLORS: Record<string, string> = {
  created:  '#6b7280',
  submitted: '#2a4bd9',
  approved: '#059669',
  rejected: '#dc2626',
  sent:     '#2a4bd9',
  failed:   '#dc2626',
  expired:  '#9ca3af',
};

// ── Approve dialog ────────────────────────────────────────────────────────────

function ApproveDialog({
  open,
  broadcast,
  onClose,
  onConfirm,
  approving,
}: {
  open: boolean;
  broadcast: Broadcast | null;
  onClose: () => void;
  onConfirm: () => void;
  approving: boolean;
}) {
  const { t } = useTranslation();
  if (!broadcast) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="check_circle" size={20} className="text-emerald-600" />
            {t('broadcasts.approval.approve')}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[color:var(--color-on-surface-muted)]">
          {t('broadcasts.approval.approveConfirm').replace('{count}', broadcast.estimated_count.toLocaleString())}
        </p>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <div className="font-semibold text-sm text-emerald-800">{broadcast.name}</div>
          <div className="text-xs text-emerald-700 mt-1">
            ~{broadcast.estimated_count.toLocaleString()} recipients via {broadcast.channels.join(', ')}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={approving}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={approving}
            style={{ background: 'var(--color-success, #059669)', color: '#fff' }}
          >
            {approving ? t('broadcasts.approval.approving') : t('broadcasts.approval.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reject dialog ─────────────────────────────────────────────────────────────

function RejectDialog({
  open,
  onClose,
  onConfirm,
  rejecting,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  rejecting: boolean;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);

  function handleConfirm() {
    if (!reason.trim()) { setErr('Rejection reason is required'); return; }
    setErr(null);
    onConfirm(reason.trim());
  }

  function handleClose() {
    setReason('');
    setErr(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="cancel" size={20} className="text-red-600" />
            {t('broadcasts.approval.rejectTitle')}
          </DialogTitle>
        </DialogHeader>
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('broadcasts.approval.rejectReason')}</label>
          <textarea
            className="w-full rounded-lg border border-[color:var(--color-outline)] bg-[color:var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none h-24"
            placeholder={t('broadcasts.approval.rejectReasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {err && <p className="text-red-600 text-xs mt-1">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={rejecting}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={rejecting || !reason.trim()}
          >
            {rejecting ? t('broadcasts.approval.rejecting') : t('broadcasts.approval.reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Audit trail accordion ─────────────────────────────────────────────────────

function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-4">
      <button
        className="flex items-center gap-2 text-sm font-medium text-[color:var(--color-on-surface-muted)] hover:text-[color:var(--color-on-surface)] transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} />
        {t('broadcasts.detail.auditTrail')} ({entries.length})
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 pl-2 border-l-2 border-[color:var(--color-outline)]">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 text-xs">
                  <div
                    className="w-2 h-2 rounded-full mt-1 shrink-0"
                    style={{ background: ACTION_COLORS[entry.action] ?? '#6b7280' }}
                  />
                  <div>
                    <span className="font-semibold" style={{ color: ACTION_COLORS[entry.action] ?? '#6b7280' }}>
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                    {' '}
                    <span className="text-[color:var(--color-on-surface-muted)]">
                      by {entry.actor_name ?? entry.actor_user_id}
                    </span>
                    {entry.note && (
                      <div className="text-[color:var(--color-on-surface-muted)] mt-0.5 italic">
                        "{entry.note}"
                      </div>
                    )}
                    <div className="text-[color:var(--color-on-surface-muted)] mt-0.5">
                      {formatRelativeTime(entry.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Broadcast approval card ───────────────────────────────────────────────────

function BroadcastApprovalCard({
  broadcast,
  auditLog,
  onApprove,
  onReject,
  onSend,
  approving,
  rejecting,
}: {
  broadcast: Broadcast;
  auditLog: AuditEntry[];
  onApprove: (b: Broadcast) => void;
  onReject:  (b: Broadcast) => void;
  onSend:    (b: Broadcast) => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const { t } = useTranslation();
  const expiry = formatExpiryCountdown(broadcast.expires_at);
  const isPending = broadcast.status === 'pending_approval';
  const isApproved = broadcast.status === 'approved';

  return (
    <motion.div variants={rise}>
      <div className="rounded-xl border bg-[color:var(--color-surface)] overflow-hidden shadow-sm">
        {/* Header */}
        <div className="p-5 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base">{broadcast.name}</h3>
              {broadcast.description && (
                <p className="text-sm text-[color:var(--color-on-surface-muted)] mt-1">{broadcast.description}</p>
              )}
            </div>
            {!expiry.expired ? (
              <span
                className="text-xs font-semibold px-2 py-1 rounded-lg shrink-0"
                style={{ background: `${expiry.color}15`, color: expiry.color }}
              >
                {expiry.label}
              </span>
            ) : (
              <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-600 shrink-0">
                {t('broadcasts.detail.expired')}
              </span>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="p-5 space-y-4">
          {/* Recipients + channels */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm">
              <Icon name="group" size={16} className="text-[color:var(--color-on-surface-muted)]" />
              <span className="font-semibold">~{broadcast.estimated_count.toLocaleString()}</span>
              <span className="text-[color:var(--color-on-surface-muted)]">recipients</span>
            </div>
            {broadcast.segment_name && (
              <div className="flex items-center gap-1.5 text-sm text-[color:var(--color-on-surface-muted)]">
                <Icon name="segment" size={16} />
                {broadcast.segment_name}
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              {broadcast.channels.map((ch) => (
                <Badge key={ch} variant="outline" className="text-[10px] capitalize flex items-center gap-1">
                  <Icon name={CHANNEL_ICONS[ch] ?? 'send'} size={11} />
                  {ch.replace('_', ' ')}
                </Badge>
              ))}
            </div>
          </div>

          {/* Content preview */}
          {(broadcast.payload.subject || broadcast.payload.body) && (
            <div className="rounded-lg bg-[color:var(--color-surface-2)] p-3 space-y-1.5">
              {broadcast.payload.subject && (
                <div className="text-xs">
                  <span className="font-medium text-[color:var(--color-on-surface-muted)]">Subject: </span>
                  {broadcast.payload.subject}
                </div>
              )}
              {broadcast.payload.body && (
                <div className="text-xs text-[color:var(--color-on-surface-muted)] line-clamp-3">
                  {broadcast.payload.body}
                </div>
              )}
              {broadcast.payload.ctaLabel && (
                <div className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--color-primary)] border border-[color:var(--color-primary)] rounded-md px-2 py-0.5">
                  {broadcast.payload.ctaLabel}
                  <Icon name="arrow_forward" size={11} />
                </div>
              )}
            </div>
          )}

          {/* Requested by */}
          <div className="flex items-center gap-2 text-sm text-[color:var(--color-on-surface-muted)]">
            <div className="w-6 h-6 rounded-full bg-[color:var(--color-primary)] flex items-center justify-center text-white text-[10px] font-bold">
              {broadcast.created_by.charAt(0).toUpperCase()}
            </div>
            <span>{t('broadcasts.detail.requestedBy')}: {broadcast.created_by}</span>
            <span className="ml-1">&bull; {formatRelativeTime(broadcast.created_at)}</span>
          </div>

          {/* Audit trail */}
          {auditLog.length > 0 && <AuditTrail entries={auditLog} />}

          {/* Rejection reason (if rejected) */}
          {broadcast.status === 'rejected' && broadcast.rejection_reason && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <div className="text-xs font-semibold text-red-700 mb-1">Rejected by {broadcast.rejected_by}</div>
              <div className="text-xs text-red-600">{broadcast.rejection_reason}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        {(isPending || isApproved) && (
          <div className="px-5 pb-5 flex gap-2 justify-end">
            {isPending && (
              <>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => onReject(broadcast)}
                  disabled={rejecting || approving || expiry.expired}
                >
                  <Icon name="cancel" size={16} className="mr-1.5" />
                  {t('broadcasts.approval.reject')}
                </Button>
                <Button
                  onClick={() => onApprove(broadcast)}
                  disabled={approving || rejecting || expiry.expired}
                  style={{ background: 'var(--color-success, #059669)', color: '#fff' }}
                >
                  <Icon name="check_circle" size={16} className="mr-1.5" />
                  {approving ? t('broadcasts.approval.approving') : t('broadcasts.approval.approve')}
                </Button>
              </>
            )}
            {isApproved && (
              <Button
                onClick={() => onSend(broadcast)}
                style={{ background: 'var(--color-primary)' }}
              >
                <Icon name="send" size={16} className="mr-1.5" />
                Send Now
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'pending' | 'approved';

interface BroadcastWithAudit {
  broadcast: Broadcast;
  auditLog: AuditEntry[];
}

export function BroadcastApprovalPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('broadcasts.approval.title'), t('broadcasts.approval.subtitle'));
  const api = useApi();

  const [tab, setTab] = useState<Tab>('pending');
  const [pendingItems, setPendingItems] = useState<BroadcastWithAudit[]>([]);
  const [approvedItems, setApprovedItems] = useState<BroadcastWithAudit[]>([]);
  const [loading, setLoading] = useState(true);

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<Broadcast | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Broadcast | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const loadBroadcasts = useCallback(async () => {
    setLoading(true);
    try {
      const http = api as unknown as { get: (url: string) => Promise<{ data: unknown }> };

      const [pendingRes, approvedRes] = await Promise.all([
        http.get('/api/outreach/broadcasts?status=pending_approval&limit=50'),
        http.get('/api/outreach/broadcasts?status=approved&limit=50'),
      ]);

      const pendingBroadcasts = ((pendingRes.data as { broadcasts: Broadcast[] }).broadcasts) ?? [];
      const approvedBroadcasts = ((approvedRes.data as { broadcasts: Broadcast[] }).broadcasts) ?? [];

      // Fetch audit logs for each broadcast
      async function withAudit(broadcasts: Broadcast[]): Promise<BroadcastWithAudit[]> {
        return Promise.all(
          broadcasts.map(async (b) => {
            try {
              const res = await http.get(`/api/outreach/broadcasts/${b.id}`);
              const data = res.data as { broadcast: Broadcast; auditLog: AuditEntry[] };
              return { broadcast: data.broadcast, auditLog: data.auditLog ?? [] };
            } catch {
              return { broadcast: b, auditLog: [] };
            }
          })
        );
      }

      const [pending, approved] = await Promise.all([
        withAudit(pendingBroadcasts),
        withAudit(approvedBroadcasts),
      ]);

      setPendingItems(pending);
      setApprovedItems(approved);
    } catch {
      // graceful degradation
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void loadBroadcasts(); }, [loadBroadcasts]);

  async function handleApprove(broadcast: Broadcast) {
    setApprovingId(broadcast.id);
    try {
      const http = api as unknown as { post: (url: string, data: unknown) => Promise<unknown> };
      await http.post(`/api/outreach/broadcasts/${broadcast.id}/approve`, {});
      showToast(t('broadcasts.approval.approved'), 'success');
      setApproveTarget(null);
      await loadBroadcasts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Approval failed', 'error');
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(broadcast: Broadcast, reason: string) {
    setRejectingId(broadcast.id);
    try {
      const http = api as unknown as { post: (url: string, data: unknown) => Promise<unknown> };
      await http.post(`/api/outreach/broadcasts/${broadcast.id}/reject`, { reason });
      showToast(t('broadcasts.approval.rejected'), 'success');
      setRejectTarget(null);
      await loadBroadcasts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Rejection failed', 'error');
    } finally {
      setRejectingId(null);
    }
  }

  async function handleSend(broadcast: Broadcast) {
    try {
      const http = api as unknown as { post: (url: string, data: unknown) => Promise<unknown> };
      await http.post(`/api/outreach/broadcasts/${broadcast.id}/send`, {});
      showToast('Broadcast queued for sending', 'success');
      await loadBroadcasts();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Send failed', 'error');
    }
  }

  const displayItems = tab === 'pending' ? pendingItems : approvedItems;

  return (
    <div className="max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[
          { label: t('broadcasts.title'), path: ROUTES.BROADCASTS },
          { label: t('broadcasts.approval.title') },
        ]}
        title={t('broadcasts.approval.title')}
        subtitle={t('broadcasts.approval.subtitle')}
      />

      {/* Tab strip */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg bg-[color:var(--color-surface-2)] w-fit">
        {([
          { key: 'pending' as const,  label: `Pending (${pendingItems.length})` },
          { key: 'approved' as const, label: `Approved (${approvedItems.length})` },
        ]).map((t_) => (
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

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-48 rounded-xl" />
          ))}
        </div>
      ) : displayItems.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 text-center"
        >
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'rgba(5,150,105,0.1)' }}
          >
            <Icon name="check_circle" size={40} style={{ color: '#059669' }} />
          </div>
          <div className="font-bold text-xl mb-2">
            {tab === 'pending' ? t('broadcasts.approval.noPending') : 'No approved broadcasts'}
          </div>
          <div className="text-sm text-[color:var(--color-on-surface-muted)] max-w-sm">
            {tab === 'pending' ? t('broadcasts.approval.noPendingDescription') : 'Approved broadcasts ready to send will appear here.'}
          </div>
        </motion.div>
      ) : (
        <motion.div
          className="space-y-5"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          {displayItems.map(({ broadcast, auditLog }) => (
            <BroadcastApprovalCard
              key={broadcast.id}
              broadcast={broadcast}
              auditLog={auditLog}
              onApprove={(b) => setApproveTarget(b)}
              onReject={(b) => setRejectTarget(b)}
              onSend={handleSend}
              approving={approvingId === broadcast.id}
              rejecting={rejectingId === broadcast.id}
            />
          ))}
        </motion.div>
      )}

      {/* Approve dialog */}
      <ApproveDialog
        open={approveTarget !== null}
        broadcast={approveTarget}
        onClose={() => setApproveTarget(null)}
        onConfirm={() => approveTarget && void handleApprove(approveTarget)}
        approving={approvingId !== null}
      />

      {/* Reject dialog */}
      <RejectDialog
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) => rejectTarget && void handleReject(rejectTarget, reason)}
        rejecting={rejectingId !== null}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-xl text-sm font-medium text-white"
            style={{ background: toast.type === 'success' ? '#059669' : '#dc2626' }}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
