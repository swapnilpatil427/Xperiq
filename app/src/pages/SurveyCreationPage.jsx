import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { SurveyTypeGallery } from '../components/SurveyTypeGallery';
import { AiChatPanel } from '../components/AiChatPanel';
import { useApi } from '../hooks/useApi';
import { ROUTES, toPath } from '../constants/routes';
import { BADGES } from '../constants/colors';
import { useTranslation } from '../lib/i18n';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

const QUESTION_TYPE_COLORS = {
  nps:             BADGES.primary,
  rating:          BADGES.success,
  multiple_choice: BADGES.warning,
  open_text:       BADGES.purple,
};

// Step indicator node — used in steps 1 and 3
function StepNode({ index, label, state }) {
  // state: 'active' | 'done' | 'upcoming'
  const bg    = state === 'active' ? '#2a4bd9' : state === 'done' ? '#10b981' : '#dfe3e6';
  const color = state === 'upcoming' ? '#9a9d9f' : '#ffffff';
  const textColor = state === 'active' ? 'text-primary' : state === 'done' ? 'text-success' : 'text-inverse-on-surface';
  return (
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
        style={{ background: bg, color }}>
        {state === 'done' ? <Icon name="check" size={14} /> : index + 1}
      </div>
      <span className={`text-xs font-bold ${textColor}`}>{label}</span>
    </div>
  );
}

function StepIndicator({ currentStep, stepLabels }) {
  // currentStep: 0-indexed logical step (0=type,1=input,2=generating,3=review)
  // stepLabels: array [chooseType, describeGoal, aiGenerating, review]
  // We show only the visible steps: chooseType + describeGoal + review (skip generating node)
  const visibleSteps = [0, 1, 3]; // indices in stepLabels
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {visibleSteps.map((stepIdx, i) => {
        let state;
        if (currentStep > stepIdx) state = 'done';
        else if (currentStep === stepIdx) state = 'active';
        else state = 'upcoming';
        return (
          <div key={stepIdx} className="flex items-center gap-2">
            <StepNode index={i} label={stepLabels[stepIdx]} state={state} />
            {i < visibleSteps.length - 1 && (
              <div className="w-8 h-px"
                style={{ background: currentStep > stepIdx ? '#10b981' : '#dfe3e6' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SurveyCreationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isManual = location.state?.mode === 'manual';
  const preselectedId = location.state?.preselectedTemplateId || null;
  const fromTemplate = location.state?.fromTemplate || null;
  const skipTypeSelection = location.state?.skipTypeSelection || false;
  // step: 0=chooseType, 1=input, 2=generating, 3=review
  const [step, setStep] = useState(skipTypeSelection ? 1 : 0);
  const [selectedTypeId, setSelectedTypeId] = useState(fromTemplate?.id || preselectedId);
  const [intent, setIntent] = useState('');
  const [questions, setQuestions] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const textareaRef = useRef(null);
  const api = useApi();

  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  useEffect(() => {
    api.listTemplates()
      .then((data) => setTemplates(data.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [api]);

  const templateMap = useMemo(
    () => Object.fromEntries(templates.map((t) => [t.id, t])),
    [templates],
  );

  const selectedType = selectedTypeId
    ? (templateMap[selectedTypeId] || (fromTemplate?.id === selectedTypeId ? fromTemplate : null))
    : null;

  const STEP_LABELS = [
    t('create.steps.chooseType'),
    t('create.steps.describeGoal'),
    t('create.steps.aiGenerating'),
    t('create.steps.review'),
  ];
  const SUGGESTIONS = selectedType?.suggestions ?? t('create.suggestions');
  const PLACEHOLDER  = selectedType?.intentPlaceholder ?? t('create.input.placeholder');
  const GENERATING_STEPS = t('create.generating.steps');

  useEffect(() => {
    if (step === 1) textareaRef.current?.focus();
  }, [step]);

  function handleManualStart(typeId) {
    const type = typeId ? templateMap[typeId] : null;
    navigate(toPath(ROUTES.BUILDER, { surveyId: 'new' }), {
      state: {
        title:        type?.label || 'New Survey',
        questions:    type?.questions || [],
        surveyTypeId: typeId || null,
      },
    });
  }

  async function handleGenerate() {
    if (!intent.trim()) return;
    setStep(2);
    try {
      const result = await api.generateSurvey(intent, selectedTypeId);
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
          <Button
            variant="ghost"
            onClick={() => navigate(ROUTES.SURVEYS)}
            className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant hover:text-[var(--color-primary)] px-0"
          >
            <Icon name="arrow_back" size={18} />
            {t('create.backToSurveys')}
          </Button>
          <Separator orientation="vertical" className="h-6" />
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

        {/* ── Step 0: Type Gallery ── */}
        {step === 0 && (
          <SurveyTypeGallery
            templates={templates}
            isLoading={templatesLoading}
            selectedTypeId={selectedTypeId}
            onSelect={setSelectedTypeId}
            onContinue={() => isManual ? handleManualStart(selectedTypeId) : setStep(1)}
            onSkip={() => isManual ? handleManualStart(null) : (setSelectedTypeId(null), setStep(1))}
            continueLabel={isManual ? t('create.typeGallery.startBuildingButton') : undefined}
          />
        )}

        {/* ── Step 1: Input ── */}
        {step === 1 && (
          <div className="w-full max-w-2xl">
            <StepIndicator currentStep={1} stepLabels={STEP_LABELS} />

            {/* Type context banner */}
            {selectedType && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-6"
                style={{ background: selectedType.bg, border: `1.5px solid ${selectedType.color}33` }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: selectedType.color + '22', color: selectedType.color }}>
                  <Icon name={selectedType.icon} fill={1} size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold font-headline text-on-surface">
                      {selectedType.label}
                    </span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: selectedType.color + '22', color: selectedType.color }}>
                      {selectedType.shortLabel}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    {selectedType.estimatedMinutes}m · {selectedType.questionCount} questions
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(0)}
                  className="text-xs font-bold rounded-full flex-shrink-0"
                  style={{ background: selectedType.color + '18', color: selectedType.color }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  {t('create.input.changeType')}
                </Button>
              </div>
            )}

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

              <Textarea
                ref={textareaRef}
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                placeholder={PLACEHOLDER}
                rows={5}
                className="w-full resize-none text-sm leading-relaxed bg-surface-container-low font-body text-on-surface rounded-2xl p-5 border-0 mb-4 focus-visible:ring-0 focus-visible:ring-offset-0 outline-none"
              />

              <Button
                onClick={handleGenerate}
                disabled={!intent.trim()}
                className="w-full py-4 h-auto text-white font-bold text-base cta-glow font-headline rounded-2xl mb-6"
                style={{
                  background: intent.trim()
                    ? selectedType
                      ? `linear-gradient(135deg, ${selectedType.color}, #8329c8)`
                      : 'linear-gradient(135deg, #2a4bd9, #8329c8)'
                    : '#dfe3e6',
                  color: intent.trim() ? '#ffffff' : '#9a9d9f',
                  cursor: intent.trim() ? 'pointer' : 'not-allowed',
                  boxShadow: intent.trim() ? '0 20px 40px -10px rgba(42,75,217,0.35)' : 'none',
                }}
              >
                <span className="flex items-center justify-center gap-2">
                  <Icon name="auto_awesome" size={20} />
                  {selectedType
                    ? t('create.input.generateButtonTyped', { type: selectedType.shortLabel })
                    : t('create.input.generateButton')}
                  <span className="text-xs opacity-70 font-normal">{t('create.input.keyboardHint')}</span>
                </span>
              </Button>

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
                        background: intent === s
                          ? (selectedType?.color ?? '#2a4bd9')
                          : '#e5e9eb',
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

        {/* ── Step 3: Review + AI Agent ── */}
        {step === 3 && (
          <div className="w-full max-w-6xl">
            <StepIndicator currentStep={3} stepLabels={STEP_LABELS} />

            <div className="flex gap-6 items-start">
              {/* Left: question review */}
              <div className="flex-1 min-w-0">
                <div className="space-y-4 mb-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-extrabold tracking-tighter font-headline text-on-surface">
                      {t('create.review.heading')}
                    </h2>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setStep(1)}
                      className="flex items-center gap-1.5 text-xs font-bold rounded-full"
                    >
                      <Icon name="refresh" size={14} />
                      {t('create.review.regenerate')}
                    </Button>
                  </div>

                  {selectedType && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                        style={{ background: selectedType.bg, color: selectedType.color }}>
                        <Icon name={selectedType.icon} fill={1} size={14} />
                        <span className="text-xs font-black" style={{ color: selectedType.color }}>{selectedType.label}</span>
                      </div>
                      {selectedType.metrics.slice(0, 3).map((m) => (
                        <span key={m} className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#eef1f3] text-[#595c5e]">{m}</span>
                      ))}
                    </div>
                  )}

                  <div className="text-xs font-medium px-3 py-2 rounded-full inline-block text-primary bg-[#e0e7ff]">
                    {t('create.review.intentLabel')} &ldquo;{intent.slice(0, 60)}{intent.length > 60 ? '…' : ''}&rdquo;
                  </div>
                </div>

                <div className="space-y-4">
                  {questions.map((q, idx) => {
                    const typeStyle = QUESTION_TYPE_COLORS[q.type] || { bg: '#e5e9eb', color: '#595c5e' };
                    const isEditing = editingId === q.id;
                    const typeLabel = t(`create.questionTypes.${q.type}`) || q.type;
                    return (
                      <div key={q.id}
                        className="card-tilt p-6 rounded-2xl transition-all bg-white"
                        style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.04)', border: '1px solid rgba(171,173,175,0.1)' }}>
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-extrabold tracking-widest uppercase px-2 py-1 rounded-full"
                              style={{ background: typeStyle.bg, color: typeStyle.color }}>
                              Q{idx + 1} · {typeLabel}
                            </span>
                            {q.required && (
                              <span className="text-[10px] font-bold uppercase text-error">{t('create.review.requiredLabel')}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingId(isEditing ? null : q.id)}
                              className="w-8 h-8 rounded-lg text-on-surface-variant"
                            >
                              <Icon name={isEditing ? 'check' : 'edit'} size={16} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeQuestion(q.id)}
                              className="w-8 h-8 rounded-lg text-error hover:bg-[#fff0f0]"
                            >
                              <Icon name="delete" size={16} />
                            </Button>
                          </div>
                        </div>

                        {isEditing ? (
                          <Input
                            value={q.question}
                            onChange={(e) => updateQuestion(q.id, { question: e.target.value })}
                            className="w-full text-base font-semibold font-headline text-on-surface bg-surface-container-low border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-lg"
                            autoFocus
                          />
                        ) : (
                          <p className="text-base font-semibold font-headline text-on-surface">{q.question}</p>
                        )}

                        {(q.type === 'multiple_choice' || q.type === 'checkbox') && q.options && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {q.options.map((opt) => (
                              <span key={opt} className="px-3 py-1 text-xs font-semibold rounded-full bg-surface-container-low text-on-surface-variant">{opt}</span>
                            ))}
                          </div>
                        )}

                        {q.type === 'nps' && (
                          <div className="mt-3 flex gap-1">
                            {Array.from({ length: 11 }, (_, i) => (
                              <div key={i} className="flex-1 h-7 rounded flex items-center justify-center text-xs font-bold"
                                style={{
                                  background: i <= 6 ? '#fff0f0' : i <= 8 ? '#fef3c7' : '#d1fae5',
                                  color:      i <= 6 ? '#b41340' : i <= 8 ? '#d97706' : '#059669',
                                }}>
                                {i}
                              </div>
                            ))}
                          </div>
                        )}

                        {q.type === 'rating' && (
                          <div className="mt-3 flex gap-1.5">
                            {Array.from({ length: q.scaleMax || 5 }, (_, i) => (
                              <Icon key={i} name="star" fill={1} size={20} style={{ color: '#d97706' }} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {questions.length > 0 && (
                  <div className="mt-8 space-y-3">
                    <div className="flex gap-4">
                      <Button
                        onClick={() => {
                          navigate(toPath(ROUTES.BUILDER, { surveyId: 'new' }), {
                            state: { title: intent, questions, surveyTypeId: selectedTypeId },
                          });
                        }}
                        className="flex-1 py-4 h-auto text-white font-bold text-base cta-glow font-headline rounded-2xl"
                        style={{ background: 'linear-gradient(135deg, #2a4bd9, #879aff)', boxShadow: '0 20px 40px -10px rgba(42,75,217,0.35)' }}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <Icon name="edit_note" size={20} />
                          {t('create.review.editInBuilder')}
                        </span>
                      </Button>
                      <Button
                        onClick={() => {
                          navigate(toPath(ROUTES.BUILDER, { surveyId: 'new' }), {
                            state: { title: intent, questions, surveyTypeId: selectedTypeId },
                          });
                        }}
                        className="px-6 py-4 h-auto font-bold text-sm font-headline text-white rounded-2xl"
                        style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                      >
                        <span className="flex items-center gap-2">
                          <Icon name="rocket_launch" size={18} />
                          {t('create.review.launchButton')}
                        </span>
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => navigate(ROUTES.TEMPLATE_EDITOR, {
                        state: { fromSurvey: { title: intent, questions, surveyTypeId: selectedTypeId } },
                      })}
                      className="w-full rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                      style={{ color: '#595c5e', background: '#f5f6f7' }}
                    >
                      <Icon name="bookmark_add" size={16} />
                      {t('create.review.saveAsTemplate')}
                    </Button>
                  </div>
                )}
              </div>

              {/* Right: AI Agent chat */}
              <div className="w-96 shrink-0 sticky top-24">
                <AiChatPanel
                  questionCount={questions.length}
                  surveyTypeLabel={selectedType?.label}
                  onRefine={async (message) => {
                    const result = await api.refineSurvey(questions, message, {
                      surveyTypeId: selectedTypeId,
                      intent,
                    });
                    setQuestions(result.questions || questions);
                    return result;
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
