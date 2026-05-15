import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { SurveyTypeGallery } from '../components/SurveyTypeGallery';
import { useApi } from '../hooks/useApi';
import { ROUTES, toPath } from '../constants/routes';
import { useTranslation } from '../lib/i18n';
import { useSetPageTitle } from '../contexts/pageTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Template } from '../types';

// ── Helper: build a starter prompt when a category chip is clicked on empty textarea ──
function buildStarterPrompt(tmpl: Template): string {
  if (tmpl.description) return tmpl.description;
  return `Collect ${tmpl.label} feedback from my audience`;
}

// ── Category chip ──────────────────────────────────────────────────────────────
interface CategoryChipProps {
  tmpl:       Template;
  selected:   boolean;
  onSelect:   (tmpl: Template) => void;
}
function CategoryChip({ tmpl, selected, onSelect }: CategoryChipProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tmpl)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border"
      style={{
        background:   selected ? tmpl.color : tmpl.bg,
        color:        selected ? '#ffffff' : tmpl.color,
        borderColor:  tmpl.color + '55',
        boxShadow:    selected ? `0 4px 12px ${tmpl.color}44` : 'none',
        transform:    selected ? 'translateY(-1px)' : 'none',
      }}
    >
      <Icon name={tmpl.icon || 'quiz'} fill={1} size={11} />
      {tmpl.shortLabel || tmpl.label}
    </button>
  );
}

// ── Skeleton chips while templates load ───────────────────────────────────────
function ChipSkeleton() {
  return (
    <div className="flex gap-2 flex-wrap">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="h-7 rounded-full animate-pulse bg-surface-container-low"
          style={{ width: 72 + (i % 3) * 20 }}
        />
      ))}
    </div>
  );
}

export function SurveyCreationPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('create.pageTitle'));
  const navigate    = useNavigate();
  const location    = useLocation();

  const isManual       = location.state?.mode === 'manual';
  const preselectedId  = (location.state?.preselectedTemplateId || null) as string | null;
  const fromTemplate   = (location.state?.fromTemplate || null) as Template | null;

  // step: 'gallery' (manual only) | 'manual-name' | 'intent' | 'generating'
  const [step, setStep] = useState<'gallery' | 'manual-name' | 'intent' | 'generating'>(
    isManual ? 'gallery' : 'intent'
  );
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(fromTemplate?.id || preselectedId);
  const [surveyName,     setSurveyName]     = useState<string>('');
  const [intent,         setIntent]         = useState<string>('');
  const [helpOpen,       setHelpOpen]       = useState<boolean>(false);
  const [copilotRunId,   setCopilotRunId]   = useState<string | null>(null);
  const [agentsDone,     setAgentsDone]     = useState<string[]>([]);

  const nameInputRef    = useRef<HTMLInputElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const api         = useApi();

  const [templates,        setTemplates]        = useState<Template[]>([]);
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

  // Top 8 system templates sorted: recommended first, then by label
  const recommendedChips = useMemo<Template[]>(() => {
    return templates
      .filter((t) => t.isSystem)
      .sort((a, b) => ((b.recommended ? 1 : 0) - (a.recommended ? 1 : 0)) || a.label.localeCompare(b.label))
      .slice(0, 8);
  }, [templates]);

  const selectedType: Template | null = selectedTypeId
    ? (templateMap[selectedTypeId] || (fromTemplate?.id === selectedTypeId ? fromTemplate : null))
    : null;

  const rawSuggestions    = t('create.suggestions');
  const SUGGESTIONS: string[] = Array.isArray(rawSuggestions) ? rawSuggestions as string[] : [];

  const rawHelptips  = t('create.input.helpTips');
  const HELP_TIPS = Array.isArray(rawHelptips)
    ? (rawHelptips as Array<{ icon: string; title: string; body: string }>)
    : [];

  const rawGeneratingSteps = t('create.generating.steps');
  const GENERATING_STEPS: string[] = Array.isArray(rawGeneratingSteps) ? rawGeneratingSteps as string[] : [];

  useEffect(() => {
    if (step === 'intent') textareaRef.current?.focus();
    if (step === 'manual-name') {
      const type = selectedTypeId ? templateMap[selectedTypeId] : null;
      if (!surveyName) setSurveyName(type?.label || '');
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [step]);  // eslint-disable-line react-hooks/exhaustive-deps

  function handleManualStart(typeId: string | null) {
    const type = typeId ? templateMap[typeId] : null;
    const resolvedName = surveyName.trim() || type?.label || 'New Survey';
    navigate(toPath(ROUTES.BUILDER, { surveyId: 'new' }), {
      state: {
        title:        resolvedName,
        questions:    type?.questions || [],
        surveyTypeId: typeId || null,
        fromTemplate: type || null,
        templateId:   typeId || null,
      },
    });
  }

  function handleChipSelect(tmpl: Template) {
    if (selectedTypeId === tmpl.id) {
      setSelectedTypeId(null);
    } else {
      setSelectedTypeId(tmpl.id);
      if (!intent.trim()) {
        setIntent(buildStarterPrompt(tmpl));
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    }
  }

  async function handleGenerate() {
    if (!intent.trim()) return;
    setStep('generating');
    setAgentsDone([]);
    setCopilotRunId(null);

    // Try agents pipeline first; fall back to legacy if unavailable
    try {
      const { run_id } = await api.startRun({
        intent:       intent.trim(),
        surveyTypeId: selectedTypeId ?? undefined,
      });
      setCopilotRunId(run_id);

      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await api.getRunStatus(run_id);

        const done = (status.stream_events as Array<{ event: string; agent?: string }>)
          .filter((e) => e.event === 'agent_complete' && e.agent)
          .map((e) => e.agent as string);
        setAgentsDone(done);

        if (status.status === 'completed' || status.status === 'failed') {
          const resolvedTitle = surveyName.trim() || intent.slice(0, 80);
          navigate(toPath(ROUTES.BUILDER, { surveyId: 'new' }), {
            state: {
              title:           resolvedTitle,
              questions:       status.questions || [],
              surveyTypeId:    selectedTypeId,
              intent,
              fromTemplate:    selectedType,
              templateId:      selectedTypeId,
              runId:           run_id,
              recommendations: status.recommendations || [],
              openCrystal:     true,
            },
          });
          return;
        }
      }
      // Timed out
      const resolvedTitleTimeout = surveyName.trim() || intent.slice(0, 80);
      navigate(toPath(ROUTES.BUILDER, { surveyId: 'new' }), {
        state: { title: resolvedTitleTimeout, questions: [], surveyTypeId: selectedTypeId, intent, runId: copilotRunId, openCrystal: true },
      });
    } catch {
      // Agents service unavailable — fall back to legacy endpoint
      const resolvedTitleFallback = surveyName.trim() || intent.slice(0, 80);
      try {
        const result = await api.generateSurvey(intent, selectedTypeId ?? undefined) as { questions: unknown[] };
        navigate(toPath(ROUTES.BUILDER, { surveyId: 'new' }), {
          state: { title: resolvedTitleFallback, questions: result.questions || [], surveyTypeId: selectedTypeId, intent, openCrystal: true },
        });
      } catch {
        navigate(toPath(ROUTES.BUILDER, { surveyId: 'new' }), {
          state: { title: resolvedTitleFallback, questions: [], surveyTypeId: selectedTypeId, intent, openCrystal: true },
        });
      }
    }
  }

  return (
    <div className="w-full flex flex-col">
      <div className="flex justify-center">
        <div className={`w-full ${step === 'gallery' ? 'max-w-5xl' : step === 'manual-name' ? 'max-w-md' : 'max-w-2xl'}`}>
          <PageHeader
            crumbs={[
              { label: t('nav.surveys'), path: ROUTES.SURVEYS },
              { label: t('create.pageTitle') },
            ]}
            title={step !== 'gallery' ? t('create.pageTitle') : undefined}
          />
        </div>
      </div>

      <main className="flex flex-1 items-start justify-center pb-16">

        {/* ── Manual mode: template gallery ── */}
        {step === 'gallery' && (
          <SurveyTypeGallery
            templates={templates}
            isLoading={templatesLoading}
            selectedTypeId={selectedTypeId}
            onSelect={setSelectedTypeId}
            onContinue={() => {
              if (selectedTypeId) {
                setSurveyName('');  // reset so the effect can pre-fill from template label
                setStep('manual-name');
              } else {
                handleManualStart(null);
              }
            }}
            onSkip={() => handleManualStart(null)}
            continueLabel={t('create.typeGallery.startBuildingButton')}
          />
        )}

        {/* ── Step: Manual name entry ── */}
        {step === 'manual-name' && (() => {
          const type = selectedTypeId ? templateMap[selectedTypeId] : null;
          return (
            <div className="w-full max-w-md">
              <div
                className="glass-card rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 40px 100px -20px rgba(42,75,217,0.10)', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                {/* Template context header */}
                {type && (
                  <div
                    className="px-8 py-4 flex items-center gap-3"
                    style={{ background: type.bg, borderBottom: `1px solid ${type.color}22` }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: type.color + '22', color: type.color }}
                    >
                      <Icon name={type.icon || 'quiz'} fill={1} size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold font-headline text-on-surface">{type.label}</p>
                      <p className="text-xs text-on-surface-variant">{type.estimatedMinutes}m · {type.questionCount} questions</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep('gallery')}
                      className="ml-auto text-xs font-bold rounded-full px-3 py-1 transition-colors"
                      style={{ background: type.color + '18', color: type.color }}
                    >
                      Change
                    </button>
                  </div>
                )}

                <div className="px-8 py-8 space-y-6">
                  <div>
                    <h2 className="text-xl font-extrabold tracking-tight font-headline text-on-surface mb-1">
                      Name your survey
                    </h2>
                    <p className="text-sm text-on-surface-variant">
                      Give it a clear internal name — you can rename it later.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                      Survey name
                    </label>
                    <Input
                      ref={nameInputRef}
                      value={surveyName}
                      onChange={(e) => setSurveyName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleManualStart(selectedTypeId); }}
                      placeholder={type ? `e.g., ${type.label} — Q3 2025` : 'e.g., Customer Satisfaction Q3 2025'}
                      className="w-full text-sm font-semibold bg-surface-container-low border-0 rounded-xl px-4 py-3 h-auto focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0"
                    />
                  </div>

                  <Button
                    onClick={() => handleManualStart(selectedTypeId)}
                    className="w-full py-3 h-auto font-bold font-headline text-white rounded-xl"
                    style={{ background: type ? `linear-gradient(135deg, ${type.color}, #2a4bd9)` : 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
                  >
                    <span className="flex items-center justify-center gap-2">
                      <Icon name="edit_note" size={18} />
                      Start Building
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Step: Intent input ── */}
        {step === 'intent' && (
          <div className="w-full max-w-2xl">
            <div
              className="glass-card rounded-2xl overflow-hidden"
              style={{ boxShadow: '0 40px 100px -20px rgba(42,75,217,0.12)', border: '1px solid rgba(255,255,255,0.3)' }}
            >
              {/* Header */}
              <div className="px-10 pt-10 pb-6 text-center">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)', transform: 'rotate(-3deg)' }}
                >
                  <Icon name="diamond" fill={1} size={28} className="text-white" />
                </div>
                <h1 className="text-3xl font-extrabold tracking-tighter mb-2 font-headline text-on-surface">
                  {t('create.input.heading')}
                </h1>
                <p className="text-sm text-on-surface-variant">
                  {t('create.input.description')}
                </p>
              </div>

              <div className="px-10 pb-10 space-y-5">
                {/* Survey name input — prominent, first field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black tracking-[0.2em] uppercase text-on-surface-variant">
                    Survey name <span className="text-on-surface-variant/50 font-normal normal-case tracking-normal">(optional)</span>
                  </label>
                  <Input
                    ref={nameInputRef}
                    value={surveyName}
                    onChange={(e) => setSurveyName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Tab') { e.preventDefault(); textareaRef.current?.focus(); } }}
                    placeholder="e.g., Customer Onboarding NPS — Q3 2025"
                    className="w-full text-sm font-semibold bg-surface-container-low border-0 rounded-xl px-4 py-3 h-auto focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0"
                  />
                </div>

                {/* Textarea */}
                <div className="relative">
                  <Textarea
                    ref={textareaRef}
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                    placeholder={t('create.input.placeholder') as string}
                    rows={4}
                    className="w-full resize-none text-sm leading-relaxed bg-surface-container-low font-body text-on-surface rounded-xl p-4 border-0 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0 outline-none"
                  />
                  {intent.length > 0 && (
                    <span className="absolute bottom-3 right-3 text-[10px] text-on-surface-variant/50 font-mono">
                      {intent.length}
                    </span>
                  )}
                </div>

                {/* Category recommendation chips */}
                <div>
                  <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2.5 text-on-surface-variant">
                    {t('create.input.categoryLabel')}
                  </p>
                  {templatesLoading ? (
                    <ChipSkeleton />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {recommendedChips.map((tmpl) => (
                        <CategoryChip
                          key={tmpl.id}
                          tmpl={tmpl}
                          selected={selectedTypeId === tmpl.id}
                          onSelect={handleChipSelect}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Help accordion */}
                <div className="rounded-xl overflow-hidden border border-border/40">
                  <button
                    type="button"
                    onClick={() => setHelpOpen((o) => !o)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-xs font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    <Icon name="lightbulb" fill={helpOpen ? 1 : 0} size={14} className={helpOpen ? 'text-primary' : ''} />
                    <span>{t('create.input.helpTitle')}</span>
                    <Icon name={helpOpen ? 'expand_less' : 'expand_more'} size={14} className="ml-auto" />
                  </button>
                  <AnimatePresence initial={false}>
                    {helpOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-1 bg-surface-container-low/50 space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            {HELP_TIPS.map((tip) => (
                              <div key={tip.title} className="flex items-start gap-2">
                                <div
                                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                                  style={{ background: 'rgba(42,75,217,0.08)', color: '#2a4bd9' }}
                                >
                                  <Icon name={tip.icon} fill={1} size={12} />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-on-surface">{tip.title}</p>
                                  <p className="text-[11px] text-on-surface-variant leading-tight">{tip.body}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div
                            className="rounded-xl p-3 border border-border/40"
                            style={{ background: 'rgba(42,75,217,0.03)' }}
                          >
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 mb-1.5">Example prompt</p>
                            <p className="text-xs text-on-surface italic leading-relaxed">
                              &ldquo;{t('create.input.helpExample')}&rdquo;
                            </p>
                            <button
                              type="button"
                              onClick={() => { setIntent(t('create.input.helpExample') as string); textareaRef.current?.focus(); }}
                              className="mt-2 text-[10px] font-bold text-primary hover:text-primary/70 flex items-center gap-1 transition-colors"
                            >
                              <Icon name="arrow_upward" size={11} />
                              Use this example
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Generate button */}
                <Button
                  onClick={handleGenerate}
                  disabled={!intent.trim()}
                  className="w-full py-4 h-auto text-white font-bold text-base font-headline rounded-xl"
                  style={{
                    background: intent.trim()
                      ? selectedType
                        ? `linear-gradient(135deg, ${selectedType.color}, #8329c8)`
                        : 'linear-gradient(135deg, #2a4bd9, #8329c8)'
                      : '#dfe3e6',
                    color:     intent.trim() ? '#ffffff' : '#9a9d9f',
                    cursor:    intent.trim() ? 'pointer' : 'not-allowed',
                    boxShadow: intent.trim() ? '0 16px 40px -10px rgba(42,75,217,0.35)' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  <span className="flex items-center justify-center gap-2">
                    <Icon name="diamond" fill={1} size={18} />
                    {selectedType
                      ? t('create.input.generateButtonTyped', { type: selectedType.shortLabel })
                      : t('create.input.generateButton')}
                    <span className="text-xs opacity-60 font-normal ml-1">{t('create.input.keyboardHint')}</span>
                  </span>
                </Button>

                {/* Quick suggestion prompts */}
                <div>
                  <p className="text-[10px] font-black tracking-[0.2em] uppercase mb-2.5 text-on-surface-variant">
                    {t('create.input.suggestionsLabel')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setIntent(s); textareaRef.current?.focus(); }}
                        className="px-3 py-1.5 text-xs font-semibold transition-all rounded-full"
                        style={{
                          background: intent === s ? '#2a4bd9' : '#eef1f3',
                          color:      intent === s ? '#ffffff' : '#595c5e',
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step: Generating ── */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center gap-8 pt-20">
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 rounded-full animate-ping"
                style={{ background: 'rgba(42,75,217,0.15)', animationDuration: '1.5s' }} />
              <div className="absolute inset-4 rounded-full animate-pulse"
                style={{ background: 'rgba(42,75,217,0.25)' }} />
              <div className="absolute inset-8 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
                <Icon name="diamond" fill={1} size={28} className="text-white" />
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
            {/* Agent pipeline progress — shown when using agents service */}
            {copilotRunId ? (
              <div className="flex flex-wrap justify-center gap-2 max-w-sm">
                {[
                  { name: 'creator',     label: 'Survey Creator',  icon: 'edit_note' },
                  { name: 'qc',          label: 'Quality Check',   icon: 'fact_check' },
                  { name: 'compliance',  label: 'Compliance',      icon: 'shield' },
                  { name: 'recommender', label: 'Recommendations', icon: 'auto_awesome' },
                ].map(({ name, label, icon }) => {
                  const done    = agentsDone.includes(name);
                  const running = !done && agentsDone.length === ['creator', 'qc', 'compliance', 'recommender'].indexOf(name);
                  return (
                    <div key={name} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                      style={{
                        background: done ? '#f0fdf4' : running ? '#eff2ff' : '#f3f4f6',
                        color:      done ? '#16a34a' : running ? '#4f6ef7' : '#9ca3af',
                        border: `1px solid ${done ? '#bbf7d0' : running ? '#c7d2fe' : '#e5e7eb'}`,
                        boxShadow:  running ? '0 4px 12px rgba(42,75,217,0.12)' : 'none',
                        transition: 'all 0.3s ease',
                      }}>
                      {done
                        ? <Icon name="check_circle" fill={1} size={12} />
                        : running
                        ? <span className="w-3 h-3 rounded-full border-2 border-[#4f6ef7] border-t-transparent animate-spin inline-block" />
                        : <Icon name={icon} size={12} />
                      }
                      {label}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap justify-center">
                {GENERATING_STEPS.map((label, i) => (
                  <div key={label}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-primary bg-white"
                    style={{ boxShadow: '0 4px 12px rgba(42,75,217,0.12)', animation: `fadeIn 0.5s ${i * 0.3}s both` }}>
                    <Icon name="check_circle" fill={1} size={12} />
                    {label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
