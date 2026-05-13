import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { SurveyTypeGallery } from '../components/SurveyTypeGallery';
import { ExperientCopilot } from '../components/ExperientCopilot';
import { useApi } from '../hooks/useApi';
import { ROUTES, toPath } from '../constants/routes';
import { BADGES } from '../constants/colors';
import { useTranslation } from '../lib/i18n';
import { useSetPageTitle } from '../contexts/pageTitle';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { Question, Template } from '../types';

const QUESTION_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  nps:             BADGES.primary,
  rating:          BADGES.success,
  multiple_choice: BADGES.warning,
  open_text:       BADGES.purple,
};

// ── Prop interfaces ────────────────────────────────────────────────────────────

type StepState = 'active' | 'done' | 'upcoming';

interface StepNodeProps {
  index: number;
  label: string;
  state: StepState;
}

interface StepIndicatorProps {
  currentStep: number;
  stepLabels: string[];
}

interface LaunchResult {
  surveyId: string;
  shareUrl: string;
}

// Step indicator node — used in steps 1 and 3
function StepNode({ index, label, state }: StepNodeProps) {
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

function StepIndicator({ currentStep, stepLabels }: StepIndicatorProps) {
  // currentStep: 0-indexed logical step (0=type,1=input,2=generating,3=review)
  // stepLabels: array [chooseType, describeGoal, aiGenerating, review]
  // We show only the visible steps: chooseType + describeGoal + review (skip generating node)
  const visibleSteps = [0, 1, 3]; // indices in stepLabels
  return (
    <div className="flex items-center justify-center gap-2 mb-10">
      {visibleSteps.map((stepIdx, i) => {
        let state: StepState;
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
  useSetPageTitle(t('create.pageTitle'));
  const navigate = useNavigate();
  const location = useLocation();
  const isManual = location.state?.mode === 'manual';
  const preselectedId = (location.state?.preselectedTemplateId || null) as string | null;
  const fromTemplate = (location.state?.fromTemplate || null) as Template | null;
  const skipTypeSelection = location.state?.skipTypeSelection || false;
  // step: 0=chooseType, 1=input, 2=generating, 3=review
  const [step, setStep] = useState<number>(skipTypeSelection ? 1 : 0);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(fromTemplate?.id || preselectedId);
  const [intent, setIntent] = useState<string>('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [launching, setLaunching] = useState<boolean>(false);
  const [launchResult, setLaunchResult] = useState<LaunchResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const api = useApi();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  useEffect(() => {
    api.listTemplates()
      .then((data) => setTemplates(data.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setTemplatesLoading(false));
  }, [api]);

  const templateMap = useMemo<Record<string, Template>>(
    () => Object.fromEntries(templates.map((tmpl) => [tmpl.id, tmpl])),
    [templates],
  );

  const selectedType: Template | null = selectedTypeId
    ? (templateMap[selectedTypeId] || (fromTemplate?.id === selectedTypeId ? fromTemplate : null))
    : null;

  const STEP_LABELS: string[] = [
    t('create.steps.chooseType'),
    t('create.steps.describeGoal'),
    t('create.steps.aiGenerating'),
    t('create.steps.review'),
  ];
  const rawSuggestions = t('create.suggestions');
  const SUGGESTIONS: string[] = Array.isArray(rawSuggestions) ? rawSuggestions as string[] : [];
  const PLACEHOLDER: string = t('create.input.placeholder');
  const rawGeneratingSteps = t('create.generating.steps');
  const GENERATING_STEPS: string[] = Array.isArray(rawGeneratingSteps) ? rawGeneratingSteps as string[] : [];

  useEffect(() => {
    if (step === 1) textareaRef.current?.focus();
  }, [step]);

  function handleManualStart(typeId: string | null) {
    const type = typeId ? templateMap[typeId] : null;
    navigate(toPath(ROUTES.BUILDER, { surveyId: 'new' }), {
      state: {
        title:        type?.label || 'New Survey',
        questions:    type?.questions || [],
        surveyTypeId: typeId || null,
        fromTemplate: type || null,
        templateId:   typeId || null,
      },
    });
  }

  async function handleGenerate() {
    if (!intent.trim()) return;
    setStep(2);
    try {
      const result = await api.generateSurvey(intent, selectedTypeId ?? undefined) as { questions: Question[] };
      setQuestions(result.questions || []);
      setStep(3);
    } catch {
      setStep(3);
      setQuestions([]);
    }
  }

  async function handleLaunch() {
    if (launching) return;
    setLaunching(true);
    try {
      const { survey } = await api.createSurvey({
        title: intent.slice(0, 200) || 'New Survey',
        questions,
        survey_type_id: selectedTypeId || null,
        template_id: selectedTypeId || null,
        intent,
      }) as { survey: { id: string } };
      const { publishToken } = await api.publishSurvey(survey.id) as { publishToken: string };
      const shareUrl = `${window.location.origin}/s/${publishToken}`;
      setLaunchResult({ surveyId: survey.id, shareUrl });
    } catch {
      setLaunching(false);
    }
  }

  function handleCopyLink(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function updateQuestion(id: string, patch: Partial<Question>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } as Question : q)));
  }

  return (
    <div className="bg-surface">
      {/* Page header — step 0 shows breadcrumb only (gallery owns its heading),
          steps 1+ show full title+breadcrumb centered to match wizard width */}
      <div className="flex justify-center">
        <div className={`w-full ${step === 0 ? 'max-w-5xl' : 'max-w-2xl'}`}>
          <PageHeader
            crumbs={[
              { label: t('nav.surveys'), path: ROUTES.SURVEYS },
              { label: t('create.pageTitle') },
            ]}
            title={step > 0 ? t('create.pageTitle') : undefined}
          />
        </div>
      </div>

      <main className="flex items-start justify-center pb-12 min-h-[calc(100vh-8rem)]">

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
                  <Icon name={selectedType.icon || 'quiz'} fill={1} size={18} />
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
                className="w-full resize-none text-sm leading-relaxed bg-surface-container-low font-body text-on-surface rounded-[10px] p-5 border-0 mb-4 focus-visible:ring-0 focus-visible:ring-offset-0 outline-none"
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

        {/* ── Step 3: Review ── */}
        {step === 3 && (
          <div className="w-full max-w-2xl">
            <StepIndicator currentStep={3} stepLabels={STEP_LABELS} />

            <div>
              {/* Question review */}
              <div className="w-full">
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
                        <Icon name={selectedType.icon || 'quiz'} fill={1} size={14} />
                        <span className="text-xs font-black" style={{ color: selectedType.color }}>{selectedType.label}</span>
                      </div>
                      {(selectedType.metrics || []).slice(0, 3).map((m) => (
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
                    const qAsAny = q as unknown as Record<string, unknown>;
                    const qOptions = Array.isArray(qAsAny.options) ? (qAsAny.options as string[]) : null;
                    const qScaleMax = typeof qAsAny.scaleMax === 'number' ? qAsAny.scaleMax : null;
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
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateQuestion(q.id, { question: e.target.value })}
                            className="w-full text-base font-semibold font-headline text-on-surface bg-surface-container-low border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-lg"
                            autoFocus
                          />
                        ) : (
                          <p className="text-base font-semibold font-headline text-on-surface">{q.question}</p>
                        )}

                        {(q.type === 'multiple_choice' || q.type === 'checkbox') && qOptions && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {qOptions.map((opt) => (
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
                            {Array.from({ length: qScaleMax || 5 }, (_, i) => (
                              <Icon key={i} name="star" fill={1} size={20} style={{ color: '#d97706' }} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {questions.length > 0 && !launchResult && (
                  <div className="mt-8 space-y-3">
                    <div className="flex gap-4">
                      <Button
                        onClick={() => {
                          navigate(toPath(ROUTES.BUILDER, { surveyId: 'new' }), {
                            state: {
                              title: intent,
                              questions,
                              surveyTypeId: selectedTypeId,
                              intent,
                              fromTemplate: selectedType,
                              templateId: selectedTypeId,
                            },
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
                        onClick={handleLaunch}
                        disabled={launching}
                        className="px-6 py-4 h-auto font-bold text-sm font-headline text-white rounded-2xl"
                        style={{ background: 'linear-gradient(135deg, #059669, #047857)', opacity: launching ? 0.7 : 1 }}
                      >
                        <span className="flex items-center gap-2">
                          <Icon name={launching ? 'progress_activity' : 'rocket_launch'} size={18}
                            className={launching ? 'animate-spin' : ''} />
                          {launching ? t('create.review.launchingButton') : t('create.review.launchButton')}
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

                {launchResult && (
                  <div className="mt-8 glass-card rounded-2xl p-8 text-center"
                    style={{ boxShadow: '0 40px 80px -20px rgba(5,150,105,0.2)', border: '1px solid rgba(16,185,129,0.2)' }}>
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                      style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}>
                      <Icon name="rocket_launch" fill={1} size={28} className="text-white" />
                    </div>
                    <h3 className="text-2xl font-extrabold tracking-tighter font-headline text-on-surface mb-2">
                      {t('create.review.launchSuccessHeading')}
                    </h3>
                    <p className="text-sm text-on-surface-variant mb-6">
                      {t('create.review.launchSuccessMessage')}
                    </p>
                    <div className="flex items-center gap-2 p-3 rounded-xl mb-5"
                      style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                      <Icon name="link" size={16} className="text-success flex-shrink-0" />
                      <span className="flex-1 text-xs font-mono text-on-surface truncate text-left">{launchResult.shareUrl}</span>
                      <Button
                        size="sm"
                        onClick={() => handleCopyLink(launchResult.shareUrl)}
                        className="rounded-lg text-xs font-bold px-3 h-7 flex-shrink-0"
                        style={{ background: copied ? '#059669' : '#2a4bd9', color: '#fff' }}
                      >
                        <Icon name={copied ? 'check' : 'content_copy'} size={14} className="mr-1" />
                        {copied ? t('create.review.launchSuccessCopiedButton') : t('create.review.launchSuccessCopyButton')}
                      </Button>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => window.open(launchResult.shareUrl, '_blank')}
                        className="flex-1 font-bold rounded-xl text-white"
                        style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                      >
                        <Icon name="open_in_new" size={16} className="mr-2" />
                        {t('create.review.launchSuccessViewButton')}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => navigate(ROUTES.SURVEYS)}
                        className="flex-1 font-bold rounded-xl"
                      >
                        <Icon name="arrow_back" size={16} className="mr-2" />
                        {t('create.review.launchSuccessGoToList')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

            </div>

            <ExperientCopilot
              context={{ surveyTitle: intent.slice(0, 60) || selectedType?.label, questionCount: questions.length, surveyType: selectedType?.label, isBuilder: false }}
              onRefine={async (message: string) => {
                const result = await api.refineSurvey(questions, message, {
                  surveyTypeId: selectedTypeId,
                  intent,
                }) as { questions?: Question[] };
                setQuestions(result.questions || questions);
                return result;
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
