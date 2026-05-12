import { Icon } from './Icon';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// ── row helper ────────────────────────────────────────────────────────────────
function CheckRow({ icon, color, bg, text, sub }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: bg }}>
        <Icon name={icon} size={16} style={{ color }} />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{text}</div>
        {sub && <div className="text-xs mt-0.5 text-muted-foreground">{sub}</div>}
      </div>
    </div>
  );
}

// ── PUBLISH MODAL ─────────────────────────────────────────────────────────────
export function PublishModal({ open, onClose, onConfirm, busy, surveyTitle }) {
  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="max-w-lg rounded-3xl p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="px-7 pt-7 pb-5">
          <DialogHeader className="mb-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 8px 24px rgba(5,150,105,0.3)' }}>
                <Icon name="rocket_launch" size={22} style={{ color: 'white' }} />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold font-headline text-foreground">
                  Publish Survey
                </DialogTitle>
                <p className="text-sm mt-0.5 text-muted-foreground">
                  {surveyTitle ? `"${surveyTitle}"` : 'This survey'} will go live immediately
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* What happens */}
          <div className="rounded-2xl p-4 mb-4 space-y-3 bg-muted"
            style={{ border: '1px solid rgba(171,173,175,0.15)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-muted-foreground">
              What happens when you publish
            </p>
            <CheckRow icon="public" color="#059669" bg="rgba(5,150,105,0.1)"
              text="Survey goes live instantly"
              sub="Respondents can access it via the shareable link" />
            <CheckRow icon="bar_chart" color="#2a4bd9" bg="rgba(42,75,217,0.1)"
              text="Responses collected in real-time"
              sub="Every submission is stored and available immediately" />
            <CheckRow icon="auto_awesome" color="#8329c8" bg="rgba(131,41,200,0.1)"
              text="AI Insights unlock after first responses"
              sub="Head to the Insights tab — analysis runs automatically" />
          </div>

          {/* Distribution */}
          <div className="rounded-2xl p-4 mb-4"
            style={{ background: 'rgba(42,75,217,0.04)', border: '1px solid rgba(42,75,217,0.12)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--color-primary)' }}>
              How to distribute
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: 'link', label: 'Shareable link', sub: 'Copy & paste anywhere' },
                { icon: 'qr_code_2', label: 'QR code', sub: 'Print or display on screen' },
                { icon: 'mail', label: 'Email embed', sub: 'Send via your email tool' },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="flex flex-col items-center text-center gap-1.5 p-2.5 rounded-xl"
                  style={{ background: 'rgba(42,75,217,0.06)' }}>
                  <Icon name={icon} size={18} style={{ color: 'var(--color-primary)' }} />
                  <span className="text-xs font-bold text-foreground">{label}</span>
                  <span className="text-[10px] text-muted-foreground">{sub}</span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-3 text-muted-foreground">
              After publishing, open <strong>Distribute</strong> in the survey menu to copy your link, download a QR code, or get an email template.
            </p>
          </div>

          {/* Insights note */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(131,41,200,0.06)', border: '1px solid rgba(131,41,200,0.1)' }}>
            <Icon name="insights" size={16} style={{ color: 'var(--color-tertiary)' }} />
            <p className="text-xs text-muted-foreground">
              <strong style={{ color: 'var(--color-tertiary)' }}>Insights</strong> — available in the left nav once responses start coming in. AI analysis runs every time you visit.
            </p>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex items-center gap-3 px-7 py-5 border-t border-border sm:justify-start">
          <Button
            onClick={onClose}
            disabled={busy}
            variant="ghost"
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-[#e8eeff] text-[#2a4bd9] hover:bg-[#dce4ff] hover:text-[#173dcd]"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className="flex-[2] py-3 rounded-xl text-sm font-bold text-white active:scale-95 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 8px 24px rgba(5,150,105,0.3)' }}
          >
            {busy
              ? <><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'white', borderTopColor: 'transparent' }} />Publishing…</>
              : <><Icon name="rocket_launch" size={16} />Publish Now</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── PAUSE MODAL ───────────────────────────────────────────────────────────────
export function PauseModal({ open, onClose, onConfirm, busy, surveyTitle, responseCount }) {
  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="max-w-lg rounded-3xl p-0 overflow-hidden gap-0">
        {/* Header */}
        <div className="px-7 pt-7 pb-5">
          <DialogHeader className="mb-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.2)' }}>
                <Icon name="pause_circle" size={24} style={{ color: '#d97706' }} />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold font-headline text-foreground">
                  Pause Survey
                </DialogTitle>
                <p className="text-sm mt-0.5 text-muted-foreground">
                  {surveyTitle ? `"${surveyTitle}"` : 'This survey'} will stop accepting new responses
                </p>
              </div>
            </div>
          </DialogHeader>

          {/* Response count pill */}
          {responseCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl mb-4"
              style={{ background: 'rgba(42,75,217,0.05)', border: '1px solid rgba(42,75,217,0.12)' }}>
              <Icon name="bar_chart" size={16} style={{ color: 'var(--color-primary)' }} />
              <span className="text-sm font-semibold text-foreground">
                <strong style={{ color: 'var(--color-primary)' }}>{responseCount.toLocaleString()}</strong> response{responseCount !== 1 ? 's' : ''} collected so far
              </span>
            </div>
          )}

          {/* What happens */}
          <div className="rounded-2xl p-4 mb-4 space-y-3 bg-muted"
            style={{ border: '1px solid rgba(171,173,175,0.15)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-muted-foreground">
              What happens when you pause
            </p>
            <CheckRow icon="block" color="#d97706" bg="rgba(217,119,6,0.1)"
              text="New responses blocked"
              sub="Anyone visiting your survey link will see a 'closed' message" />
            <CheckRow icon="shield" color="#059669" bg="rgba(5,150,105,0.1)"
              text="All existing responses preserved"
              sub="No data is deleted — everything stays safe" />
            <CheckRow icon="insights" color="#8329c8" bg="rgba(131,41,200,0.1)"
              text="Insights remain fully accessible"
              sub="You can still view and export all analysis" />
            <CheckRow icon="play_circle" color="#2a4bd9" bg="rgba(42,75,217,0.1)"
              text="Resume anytime"
              sub="Click Resume in the survey list to go live again instantly" />
          </div>

          {/* Safety note */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(5,150,105,0.05)', border: '1px solid rgba(5,150,105,0.12)' }}>
            <Icon name="verified_user" size={16} style={{ color: 'var(--color-success)' }} />
            <p className="text-xs text-muted-foreground">
              <strong style={{ color: 'var(--color-success)' }}>Your data is safe.</strong> Pausing is reversible — no responses or settings are lost.
            </p>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex items-center gap-3 px-7 py-5 border-t border-border sm:justify-start">
          <Button
            onClick={onClose}
            disabled={busy}
            variant="secondary"
            className="flex-1 py-3 rounded-xl text-sm font-bold"
          >
            Keep Live
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            variant="warning"
            className="flex-[2] py-3 rounded-xl text-sm font-bold active:scale-95 flex items-center justify-center gap-2"
          >
            {busy
              ? <><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: '#d97706', borderTopColor: 'transparent' }} />Pausing…</>
              : <><Icon name="pause" size={16} />Pause Survey</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── RESUME MODAL ──────────────────────────────────────────────────────────────
export function ResumeModal({ open, onClose, onConfirm, busy, surveyTitle, responseCount }) {
  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose(); }}>
      <DialogContent className="max-w-lg rounded-3xl p-0 overflow-hidden gap-0">
        <div className="px-7 pt-7 pb-5">
          <DialogHeader className="mb-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)', boxShadow: '0 8px 24px rgba(42,75,217,0.25)' }}>
                <Icon name="play_circle" size={24} style={{ color: 'white' }} />
              </div>
              <div>
                <DialogTitle className="text-xl font-extrabold font-headline text-foreground">
                  Resume Survey
                </DialogTitle>
                <p className="text-sm mt-0.5 text-muted-foreground">
                  {surveyTitle ? `"${surveyTitle}"` : 'This survey'} will go live again immediately
                </p>
              </div>
            </div>
          </DialogHeader>

          {responseCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-2xl mb-4"
              style={{ background: 'rgba(42,75,217,0.05)', border: '1px solid rgba(42,75,217,0.12)' }}>
              <Icon name="bar_chart" size={16} style={{ color: 'var(--color-primary)' }} />
              <span className="text-sm font-semibold text-foreground">
                <strong style={{ color: 'var(--color-primary)' }}>{responseCount.toLocaleString()}</strong> response{responseCount !== 1 ? 's' : ''} already collected
              </span>
            </div>
          )}

          <div className="rounded-2xl p-4 mb-4 space-y-3 bg-muted"
            style={{ border: '1px solid rgba(171,173,175,0.15)' }}>
            <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-muted-foreground">
              What happens when you resume
            </p>
            <CheckRow icon="public" color="#059669" bg="rgba(5,150,105,0.1)"
              text="Survey link becomes active again"
              sub="Your existing link still works — no need to redistribute" />
            <CheckRow icon="add_circle" color="#2a4bd9" bg="rgba(42,75,217,0.1)"
              text="New responses accepted immediately"
              sub="Appended to your existing response dataset" />
            <CheckRow icon="auto_awesome" color="#8329c8" bg="rgba(131,41,200,0.1)"
              text="Insights refresh with new data"
              sub="AI analysis updates automatically as responses come in" />
          </div>
        </div>

        <DialogFooter className="flex items-center gap-3 px-7 py-5 border-t border-border sm:justify-start">
          <Button
            onClick={onClose}
            disabled={busy}
            variant="ghost"
            className="flex-1 py-3 rounded-xl text-sm font-bold bg-[#e8eeff] text-[#2a4bd9] hover:bg-[#dce4ff] hover:text-[#173dcd]"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={busy}
            className="flex-[2] py-3 rounded-xl text-sm font-bold text-white active:scale-95 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 8px 24px rgba(5,150,105,0.25)' }}
          >
            {busy
              ? <><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'white', borderTopColor: 'transparent' }} />Resuming…</>
              : <><Icon name="play_arrow" size={16} />Resume Survey</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
