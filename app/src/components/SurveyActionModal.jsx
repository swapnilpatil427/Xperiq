import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from './Icon';

// ── shared overlay wrapper ────────────────────────────────────────────────────
function Modal({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          style={{ background: 'rgba(10,12,18,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-lg rounded-3xl overflow-hidden"
            style={{ background: 'white', boxShadow: '0 40px 100px rgba(0,0,0,0.22)' }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── row helper ────────────────────────────────────────────────────────────────
function CheckRow({ icon, color, bg, text, sub }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: bg }}>
        <Icon name={icon} size={16} style={{ color }} />
      </div>
      <div>
        <div className="text-sm font-semibold" style={{ color: '#2c2f31' }}>{text}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: '#9a9d9f' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── PUBLISH MODAL ─────────────────────────────────────────────────────────────
export function PublishModal({ open, onClose, onConfirm, busy, surveyTitle }) {
  return (
    <Modal open={open} onClose={onClose}>
      {/* Header */}
      <div className="px-7 pt-7 pb-5">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 8px 24px rgba(5,150,105,0.3)' }}>
            <Icon name="rocket_launch" size={22} style={{ color: 'white' }} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold font-headline" style={{ color: '#2c2f31' }}>
              Publish Survey
            </h2>
            <p className="text-sm mt-0.5" style={{ color: '#9a9d9f' }}>
              {surveyTitle ? `"${surveyTitle}"` : 'This survey'} will go live immediately
            </p>
          </div>
        </div>

        {/* What happens */}
        <div className="rounded-2xl p-4 mb-4 space-y-3"
          style={{ background: '#f5f7f9', border: '1px solid rgba(171,173,175,0.15)' }}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: '#abadaf' }}>
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
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: '#2a4bd9' }}>
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
                <Icon name={icon} size={18} style={{ color: '#2a4bd9' }} />
                <span className="text-xs font-bold" style={{ color: '#2c2f31' }}>{label}</span>
                <span className="text-[10px]" style={{ color: '#9a9d9f' }}>{sub}</span>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3" style={{ color: '#595c5e' }}>
            After publishing, open <strong>Distribute</strong> in the survey menu to copy your link, download a QR code, or get an email template.
          </p>
        </div>

        {/* Insights note */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(131,41,200,0.06)', border: '1px solid rgba(131,41,200,0.1)' }}>
          <Icon name="insights" size={16} style={{ color: '#8329c8' }} />
          <p className="text-xs" style={{ color: '#595c5e' }}>
            <strong style={{ color: '#8329c8' }}>Insights</strong> — available in the left nav once responses start coming in. AI analysis runs every time you visit.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-7 py-5" style={{ borderTop: '1px solid rgba(171,173,175,0.12)' }}>
        <button onClick={onClose} disabled={busy}
          className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
          style={{ background: '#eef1f3', color: '#595c5e' }}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={busy}
          className="flex-[2] py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-95 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 8px 24px rgba(5,150,105,0.3)' }}>
          {busy
            ? <><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'white', borderTopColor: 'transparent' }} />Publishing…</>
            : <><Icon name="rocket_launch" size={16} />Publish Now</>
          }
        </button>
      </div>
    </Modal>
  );
}

// ── PAUSE MODAL ───────────────────────────────────────────────────────────────
export function PauseModal({ open, onClose, onConfirm, busy, surveyTitle, responseCount }) {
  return (
    <Modal open={open} onClose={onClose}>
      {/* Header */}
      <div className="px-7 pt-7 pb-5">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.2)' }}>
            <Icon name="pause_circle" size={24} style={{ color: '#d97706' }} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold font-headline" style={{ color: '#2c2f31' }}>
              Pause Survey
            </h2>
            <p className="text-sm mt-0.5" style={{ color: '#9a9d9f' }}>
              {surveyTitle ? `"${surveyTitle}"` : 'This survey'} will stop accepting new responses
            </p>
          </div>
        </div>

        {/* Response count pill */}
        {responseCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl mb-4"
            style={{ background: 'rgba(42,75,217,0.05)', border: '1px solid rgba(42,75,217,0.12)' }}>
            <Icon name="bar_chart" size={16} style={{ color: '#2a4bd9' }} />
            <span className="text-sm font-semibold" style={{ color: '#2c2f31' }}>
              <strong style={{ color: '#2a4bd9' }}>{responseCount.toLocaleString()}</strong> response{responseCount !== 1 ? 's' : ''} collected so far
            </span>
          </div>
        )}

        {/* What happens */}
        <div className="rounded-2xl p-4 mb-4 space-y-3"
          style={{ background: '#f5f7f9', border: '1px solid rgba(171,173,175,0.15)' }}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: '#abadaf' }}>
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
          <Icon name="verified_user" size={16} style={{ color: '#059669' }} />
          <p className="text-xs" style={{ color: '#595c5e' }}>
            <strong style={{ color: '#059669' }}>Your data is safe.</strong> Pausing is reversible — no responses or settings are lost.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-7 py-5" style={{ borderTop: '1px solid rgba(171,173,175,0.12)' }}>
        <button onClick={onClose} disabled={busy}
          className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
          style={{ background: '#eef1f3', color: '#595c5e' }}>
          Keep Live
        </button>
        <button onClick={onConfirm} disabled={busy}
          className="flex-[2] py-3 rounded-xl text-sm font-bold transition-all active:scale-95 flex items-center justify-center gap-2"
          style={{ background: 'rgba(217,119,6,0.1)', color: '#d97706', border: '1px solid rgba(217,119,6,0.25)' }}>
          {busy
            ? <><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: '#d97706', borderTopColor: 'transparent' }} />Pausing…</>
            : <><Icon name="pause" size={16} />Pause Survey</>
          }
        </button>
      </div>
    </Modal>
  );
}

// ── RESUME MODAL ──────────────────────────────────────────────────────────────
export function ResumeModal({ open, onClose, onConfirm, busy, surveyTitle, responseCount }) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="px-7 pt-7 pb-5">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)', boxShadow: '0 8px 24px rgba(42,75,217,0.25)' }}>
            <Icon name="play_circle" size={24} style={{ color: 'white' }} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold font-headline" style={{ color: '#2c2f31' }}>
              Resume Survey
            </h2>
            <p className="text-sm mt-0.5" style={{ color: '#9a9d9f' }}>
              {surveyTitle ? `"${surveyTitle}"` : 'This survey'} will go live again immediately
            </p>
          </div>
        </div>

        {responseCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl mb-4"
            style={{ background: 'rgba(42,75,217,0.05)', border: '1px solid rgba(42,75,217,0.12)' }}>
            <Icon name="bar_chart" size={16} style={{ color: '#2a4bd9' }} />
            <span className="text-sm font-semibold" style={{ color: '#2c2f31' }}>
              <strong style={{ color: '#2a4bd9' }}>{responseCount.toLocaleString()}</strong> response{responseCount !== 1 ? 's' : ''} already collected
            </span>
          </div>
        )}

        <div className="rounded-2xl p-4 mb-4 space-y-3"
          style={{ background: '#f5f7f9', border: '1px solid rgba(171,173,175,0.15)' }}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: '#abadaf' }}>
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

      <div className="flex items-center gap-3 px-7 py-5" style={{ borderTop: '1px solid rgba(171,173,175,0.12)' }}>
        <button onClick={onClose} disabled={busy}
          className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
          style={{ background: '#eef1f3', color: '#595c5e' }}>
          Cancel
        </button>
        <button onClick={onConfirm} disabled={busy}
          className="flex-[2] py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-95 flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 8px 24px rgba(5,150,105,0.25)' }}>
          {busy
            ? <><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'white', borderTopColor: 'transparent' }} />Resuming…</>
            : <><Icon name="play_arrow" size={16} />Resume Survey</>
          }
        </button>
      </div>
    </Modal>
  );
}
