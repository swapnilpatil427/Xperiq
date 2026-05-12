import { useState, useRef, useEffect } from 'react';
import { Icon } from '../components/Icon';
import { useApi } from '../hooks/useApi';
import { pageStore } from '../lib/pageStore';
import { ROUTES } from '../constants/routes';
import { BADGES } from '../constants/colors';
import { useTranslation } from '../lib/i18n';

const TYPE_COLORS = {
  nps:             BADGES.primary,
  rating:          BADGES.success,
  multiple_choice: BADGES.warning,
  open_text:       BADGES.purple,
};

export function SurveyCreationPage({ onNavigate }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1); // 1=input, 2=generating, 3=review
  const [intent, setIntent] = useState('');
  const [questions, setQuestions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const textareaRef = useRef(null);
  const api = useApi();

  const SUGGESTIONS = t('create.suggestions');
  const STEP_LABELS = [
    t('create.steps.describeGoal'),
    t('create.steps.aiGenerating'),
    t('create.steps.review'),
  ];
  const GENERATING_STEPS = t('create.generating.steps');

  useEffect(() => {
    if (step === 1) textareaRef.current?.focus();
  }, [step]);

  async function handleGenerate() {
    if (!intent.trim()) return;
    setStep(2);
    try {
      const result = await api.generateSurvey(intent);
      setQuestions(result.questions || []);
      setStep(3);
    } catch {
      setStep(3);
      setQuestions([]);
    }
  }

  function removeQuestion(id) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function updateQuestion(id, patch) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-surface">
      {/* Mesh grid background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="mesh-grid absolute inset-0 opacity-50" />
        <div className="absolute top-[-15%] left-[-10%] w-[45%] h-[45%] rounded-full"
          style={{ background: 'rgba(42,75,217,0.08)', filter: 'blur(120px)' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full"
          style={{ background: 'rgba(131,41,200,0.08)', filter: 'blur(150px)' }} />
      </div>

      {/* Top nav */}
      <nav className="fixed top-0 w-full z-50 glass-nav flex items-center justify-between h-16 px-6"
        style={{ boxShadow: '0 8px 32px rgba(31,38,135,0.07)' }}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => onNavigate(ROUTES.SURVEYS)}
            className="flex items-center gap-2 text-sm font-semibold transition-colors text-on-surface-variant"
            onMouseEnter={(e) => (e.currentTarget.style.color = '#2a4bd9')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#595c5e')}
          >
            <Icon name="arrow_back" size={18} />
            {t('create.backToSurveys')}
          </button>
          <div className="w-px h-6" style={{ background: '#dfe3e6' }} />
          <span className="text-sm font-bold font-headline text-on-surface">
            {t('create.pageTitle')}
          </span>
        </div>
        {step === 3 && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-bold px-3 py-1 rounded-full bg-success-container text-success">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#10b981' }} />
              {t('create.questionsGeneratedBadge', { n: questions.length })}
            </div>
          </div>
        )}
      </nav>

      <main className="relative z-10 flex items-start justify-center pt-24 pb-20 px-6 min-h-screen">
        {/* ── Step 1: Input ── */}
        {step === 1 && (
          <div className="w-full max-w-2xl">
            <div className="flex items-center justify-center gap-2 mb-10">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                      style={{
                        background: i === 0 ? '#2a4bd9' : '#dfe3e6',
                        color: i === 0 ? '#ffffff' : '#9a9d9f',
                      }}>
                      {i + 1}
                    </div>
                    <span className={`text-xs font-bold ${i === 0 ? 'text-primary' : 'text-inverse-on-surface'}`}>
                      {label}
                    </span>
                  </div>
                  {i < 2 && <div className="w-8 h-px" style={{ background: '#dfe3e6' }} />}
                </div>
              ))}
            </div>

            <div className="glass-card p-10 rounded-2xl"
              style={{ boxShadow: '0 40px 100px -20px rgba(42,75,217,0.12)', border: '1px solid rgba(255,255,255,0.3)' }}>
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg bg-gradient-primary"
                  style={{ transform: 'rotate(-3deg)' }}>
                  <Icon name="psychology" fill={1} size={32} className="text-white" />
                </div>
                <h1 className="text-3xl font-extrabold tracking-tighter mb-2 font-headline text-on-surface">
                  {t('create.input.heading')}
                </h1>
                <p className="text-sm text-on-surface-variant">
                  {t('create.input.description')}
                </p>
              </div>

              <textarea
                ref={textareaRef}
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                placeholder={t('create.input.placeholder')}
                rows={5}
                className="w-full resize-none text-sm leading-relaxed outline-none bg-surface-container-low font-body text-on-surface"
                style={{
                  borderRadius: '1rem',
                  padding: '1.25rem',
                  border: 'none',
                  marginBottom: '1rem',
                }}
              />

              <button
                onClick={handleGenerate}
                disabled={!intent.trim()}
                className="w-full py-4 text-white font-bold text-base transition-all active:scale-95 cta-glow font-headline"
                style={{
                  background: intent.trim() ? 'linear-gradient(135deg, #2a4bd9, #8329c8)' : '#dfe3e6',
                  borderRadius: '1rem',
                  color: intent.trim() ? '#ffffff' : '#9a9d9f',
                  cursor: intent.trim() ? 'pointer' : 'not-allowed',
                  boxShadow: intent.trim() ? '0 20px 40px -10px rgba(42,75,217,0.35)' : 'none',
                  marginBottom: '1.5rem',
                }}
              >
                <span className="flex items-center justify-center gap-2">
                  <Icon name="auto_awesome" size={20} />
                  {t('create.input.generateButton')}
                  <span className="text-xs opacity-70 font-normal">{t('create.input.keyboardHint')}</span>
                </span>
              </button>

              <div>
                <p className="text-xs font-bold tracking-widest uppercase mb-3 text-inverse-on-surface">
                  {t('create.input.suggestionsLabel')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setIntent(s)}
                      className="px-3 py-1.5 text-xs font-semibold transition-all rounded-full"
                      style={{
                        background: intent === s ? '#2a4bd9' : '#e5e9eb',
                        color: intent === s ? '#ffffff' : '#595c5e',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Generating ── */}
        {step === 2 && (
          <div className="flex flex-col items-center justify-center gap-8 pt-20">
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 rounded-full animate-ping"
                style={{ background: 'rgba(42,75,217,0.15)', animationDuration: '1.5s' }} />
              <div className="absolute inset-4 rounded-full animate-pulse"
                style={{ background: 'rgba(42,75,217,0.25)' }} />
              <div className="absolute inset-8 rounded-full flex items-center justify-center bg-gradient-primary">
                <Icon name="psychology" fill={1} size={28} className="text-white" />
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-extrabold tracking-tighter mb-2 font-headline text-on-surface">
                {t('create.generating.heading')}
              </h2>
              <p className="text-sm text-on-surface-variant">
                {t('create.generating.description')}
              </p>
            </div>
            <div className="flex gap-2">
              {GENERATING_STEPS.map((label, i) => (
                <div key={label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-primary bg-white"
                  style={{
                    boxShadow: '0 4px 12px rgba(42,75,217,0.12)',
                    animation: `fadeIn 0.5s ${i * 0.3}s both`,
                  }}>
                  <Icon name="check_circle" fill={1} size={12} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Review ── */}
        {step === 3 && (
          <div className="w-full max-w-2xl">
            <div className="flex items-center justify-center gap-2 mb-10">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                      style={{ background: i === 2 ? '#2a4bd9' : '#10b981', color: '#ffffff' }}>
                      {i < 2 ? <Icon name="check" size={14} /> : 3}
                    </div>
                    <span className={`text-xs font-bold ${i === 2 ? 'text-primary' : 'text-success'}`}>
                      {label}
                    </span>
                  </div>
                  {i < 2 && <div className="w-8 h-px" style={{ background: '#10b981' }} />}
                </div>
              ))}
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-extrabold tracking-tighter font-headline text-on-surface">
                  {t('create.review.heading')}
                </h2>
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all bg-surface-container text-on-surface-variant"
                >
                  <Icon name="refresh" size={14} />
                  {t('create.review.regenerate')}
                </button>
              </div>

              <div className="text-xs font-medium px-3 py-2 rounded-full inline-block text-primary"
                style={{ background: '#e0e7ff' }}>
                {t('create.review.intentLabel')} &ldquo;{intent.slice(0, 60)}{intent.length > 60 ? '…' : ''}&rdquo;
              </div>
            </div>

            <div className="space-y-4">
              {questions.map((q, idx) => {
                const typeStyle = TYPE_COLORS[q.type] || { bg: '#e5e9eb', color: '#595c5e' };
                const isEditing = editingId === q.id;
                const typeLabel = t(`create.questionTypes.${q.type}`) || q.type;
                return (
                  <div key={q.id}
                    className="card-tilt p-6 rounded-2xl transition-all bg-white"
                    style={{
                      boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
                      border: '1px solid rgba(171,173,175,0.1)',
                    }}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-extrabold tracking-widest uppercase px-2 py-1 rounded-full"
                          style={{ background: typeStyle.bg, color: typeStyle.color }}>
                          Q{idx + 1} · {typeLabel}
                        </span>
                        {q.required && (
                          <span className="text-[10px] font-bold uppercase text-error">
                            {t('create.review.requiredLabel')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingId(isEditing ? null : q.id)}
                          className="p-1.5 rounded-lg transition-all text-on-surface-variant"
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#eef1f3'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          <Icon name={isEditing ? 'check' : 'edit'} size={16} />
                        </button>
                        <button onClick={() => removeQuestion(q.id)}
                          className="p-1.5 rounded-lg transition-all text-error"
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#fff0f0'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                          <Icon name="delete" size={16} />
                        </button>
                      </div>
                    </div>

                    {isEditing ? (
                      <input
                        value={q.question}
                        onChange={(e) => updateQuestion(q.id, { question: e.target.value })}
                        className="w-full text-base font-semibold outline-none px-3 py-2 rounded-lg font-headline text-on-surface bg-surface-container-low"
                        style={{ border: 'none' }}
                        autoFocus
                      />
                    ) : (
                      <p className="text-base font-semibold font-headline text-on-surface">
                        {q.question}
                      </p>
                    )}

                    {q.type === 'multiple_choice' && q.options && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {q.options.map((opt) => (
                          <span key={opt} className="px-3 py-1 text-xs font-semibold rounded-full bg-surface-container-low text-on-surface-variant">
                            {opt}
                          </span>
                        ))}
                      </div>
                    )}

                    {q.type === 'nps' && (
                      <div className="mt-3 flex gap-1">
                        {Array.from({ length: 11 }, (_, i) => (
                          <div key={i} className="flex-1 h-8 rounded flex items-center justify-center text-xs font-bold"
                            style={{
                              background: i <= 6 ? '#fff0f0' : i <= 8 ? '#fef3c7' : '#d1fae5',
                              color: i <= 6 ? '#b41340' : i <= 8 ? '#d97706' : '#059669',
                            }}>
                            {i}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {questions.length > 0 && (
              <div className="mt-8 flex gap-4">
                <button
                  onClick={() => {
                    pageStore.setPendingBuilderData({ title: intent, questions });
                    onNavigate(ROUTES.BUILDER);
                  }}
                  className="flex-1 py-4 text-white font-bold text-base transition-all active:scale-95 cta-glow bg-gradient-primary-light font-headline"
                  style={{
                    borderRadius: '1rem',
                    boxShadow: '0 20px 40px -10px rgba(42,75,217,0.35)',
                  }}>
                  <span className="flex items-center justify-center gap-2">
                    <Icon name="rocket_launch" size={20} />
                    {t('create.review.launchButton')}
                  </span>
                </button>
                <button
                  onClick={() => {
                    pageStore.setPendingBuilderData({ title: intent, questions });
                    onNavigate(ROUTES.BUILDER);
                  }}
                  className="px-6 py-4 font-bold text-sm transition-all font-headline bg-surface-container text-on-surface"
                  style={{ borderRadius: '1rem' }}>
                  {t('create.review.editInBuilder')}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
