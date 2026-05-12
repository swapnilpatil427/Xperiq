import { useState, useCallback, useMemo } from 'react';
import { SideNav } from '../components/SideNav';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { useSurveys } from '../hooks/useSurveys';
import { pageStore } from '../lib/pageStore';
import { ROUTES } from '../constants/routes';
import { GRADIENTS } from '../constants/colors';
import { useTranslation } from '../lib/i18n';

const initialQuestions = [
  {
    id: 1,
    type: 'Rating',
    typeColor: '#2a4bd9',
    typeBg: 'rgba(42,75,217,0.05)',
    title: 'How likely are you to recommend our AI insights to a colleague?',
    scale: '0-10 NPS',
    required: true,
  },
  {
    id: 2,
    type: 'Open Text',
    typeColor: '#00647c',
    typeBg: 'rgba(0,100,124,0.05)',
    title: '',
    scale: null,
    required: false,
  },
];

function QuestionCard({ q, index, onDelete }) {
  const [title, setTitle] = useState(q.title);
  const { t } = useTranslation();

  return (
    <div
      className="card-tilt group relative p-8 transition-all duration-300 bg-white rounded-2xl"
      style={{
        border: '1px solid rgba(171,173,175,0.1)',
        boxShadow: '0 10px 40px rgba(0,0,0,0.04)',
      }}
    >
      {/* Drag handle */}
      <div className="absolute -left-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity">
        {[0,1,2,3].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: '#747779' }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <span
          className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full"
          style={{ color: q.typeColor, background: q.typeBg }}
        >
          {t('builder.questionLabel', { num: String(index + 1).padStart(2, '0'), type: q.type })}
        </span>
        <div className="flex gap-2">
          <button
            className="p-2 rounded-lg transition-colors text-on-surface-variant"
            onMouseEnter={(e) => (e.currentTarget.style.background = '#e5e9eb')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon name="content_copy" size={18} />
          </button>
          <button
            className="p-2 rounded-lg transition-colors text-error"
            onClick={() => onDelete(q.id)}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(180,19,64,0.05)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon name="delete" size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-4">
        <input
          className="w-full text-xl font-bold bg-transparent border-none outline-none p-0 placeholder:text-[rgba(89,92,94,0.4)] font-headline text-on-surface"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('builder.questionTitlePlaceholder')}
        />

        {q.type === 'Rating' && (
          <div className="flex gap-4 p-4 rounded-xl bg-surface-container-low">
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-bold uppercase text-on-surface-variant">
                {t('builder.scaleType')}
              </label>
              <div className="flex gap-2">
                <div className="px-4 py-2 text-xs font-bold rounded-full bg-primary text-white">
                  {t('builder.scaleLabels.nps')}
                </div>
                <div className="px-4 py-2 text-xs font-bold rounded-full text-on-surface-variant"
                  style={{ background: '#dfe3e6' }}>
                  {t('builder.scaleLabels.stars')}
                </div>
              </div>
            </div>
            <div className="w-px" style={{ background: 'rgba(171,173,175,0.2)' }} />
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-bold uppercase text-on-surface-variant">
                {t('builder.required')}
              </label>
              <div className="w-12 h-6 rounded-full relative bg-primary">
                <div className="absolute right-1 top-1 w-4 h-4 rounded-full bg-white" />
              </div>
            </div>
          </div>
        )}

        {q.type === 'Open Text' && (
          <div
            className="h-32 w-full rounded-xl border flex items-center justify-center text-sm italic bg-surface-container-low"
            style={{
              borderStyle: 'dashed',
              borderColor: 'rgba(171,173,175,0.3)',
              color: 'rgba(89,92,94,0.4)',
            }}
          >
            {t('builder.openTextPlaceholder')}
          </div>
        )}
      </div>

      {/* AI Footer */}
      <div className="mt-8 flex justify-between items-center">
        <button
          className="ai-glow flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-full hover:scale-105 transition-transform"
          style={{
            background: q.type === 'Open Text'
              ? 'linear-gradient(135deg, #2a4bd9, #8329c8)'
              : '#8329c8',
          }}
        >
          <Icon name={q.type === 'Open Text' ? 'magic_button' : 'psychology'} fill={1} size={18} />
          {q.type === 'Open Text' ? t('builder.aiGenerateOptions') : t('builder.aiSuggestionRating')}
        </button>
        {q.type === 'Rating' && (
          <Icon name="more_horiz" size={22} style={{ color: '#abadaf' }} />
        )}
      </div>
    </div>
  );
}

export function SurveyBuilderPage({ onNavigate }) {
  const { t } = useTranslation();
  const pending = useMemo(() => pageStore.consumePendingBuilderData(), []);

  const mapAiQuestion = (q) => ({
    id: q.id || Date.now(),
    type: q.type === 'nps' || q.type === 'rating' ? 'Rating' : 'Open Text',
    typeColor: q.type === 'nps' || q.type === 'rating' ? '#2a4bd9' : '#00647c',
    typeBg: q.type === 'nps' || q.type === 'rating' ? 'rgba(42,75,217,0.05)' : 'rgba(0,100,124,0.05)',
    title: q.question || '',
    scale: q.type === 'nps' ? '0-10 NPS' : null,
    required: q.required ?? false,
  });

  const [questions, setQuestions] = useState(
    pending?.questions ? pending.questions.map(mapAiQuestion) : initialQuestions
  );
  const [surveyTitle, setSurveyTitle] = useState(
    pending?.title ? (pending.title.slice(0, 80)) : t('builder.defaultSurveyTitle')
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const { createSurvey, publishSurvey } = useSurveys();

  const handleDelete = (id) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleAdd = () => {
    setQuestions((prev) => [
      ...prev,
      {
        id: Date.now(),
        type: 'Open Text',
        typeColor: '#00647c',
        typeBg: 'rgba(0,100,124,0.05)',
        title: '',
        scale: null,
        required: false,
      },
    ]);
  };

  const doSave = async () => {
    const payload = {
      title: surveyTitle,
      questions: questions.map((q) => ({
        id: String(q.id),
        type: q.type === 'Rating' ? 'nps' : 'open_text',
        question: q.title || '',
        required: q.required ?? false,
      })),
    };
    const result = await createSurvey(payload);
    setSavedId(result?.id ?? null);
    return result;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await doSave();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleLaunch = async () => {
    setLaunching(true);
    try {
      let id = savedId;
      if (!id) {
        const result = await doSave();
        id = result?.id;
      }
      if (id) await publishSurvey(id);
      onNavigate(ROUTES.COLLECTION);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-surface font-body">
      <SideNav currentPage={ROUTES.SURVEYS} onNavigate={onNavigate} />

      {/* Sidebar */}
      <aside
        className="fixed left-64 h-[calc(100vh-0px)] w-80 flex flex-col py-8 px-6 gap-y-6 overflow-y-auto z-30"
        style={{ background: 'linear-gradient(to bottom, #f5f7f9, #eef1f3)' }}
      >
        {/* AI Copilot */}
        <div>
          <h3 className="font-bold text-sm tracking-widest uppercase mb-4 font-headline text-on-surface-variant">
            {t('builder.aiCopilot.heading')}
          </h3>
          <div
            className="p-5 rounded-xl space-y-4 bg-white"
            style={{
              boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
              border: '1px solid rgba(171,173,175,0.1)',
            }}
          >
            <p className="text-xs leading-relaxed text-on-surface-variant">
              {t('builder.aiCopilot.suggestion')}
            </p>
            <div className="flex flex-col gap-2">
              <button
                className="w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold group transition-colors text-primary"
                style={{ background: 'rgba(42,75,217,0.05)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(42,75,217,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(42,75,217,0.05)')}
              >
                <span>{t('builder.aiCopilot.improveWording')}</span>
                <Icon name="auto_fix_high" size={16} />
              </button>
              <button
                className="w-full flex items-center justify-between p-3 rounded-xl text-xs font-bold group transition-colors text-tertiary"
                style={{ background: 'rgba(131,41,200,0.05)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(131,41,200,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(131,41,200,0.05)')}
              >
                <span>{t('builder.aiCopilot.addFollowupLogic')}</span>
                <Icon name="schema" size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Question Library */}
        <div className="flex-1">
          <h3 className="font-bold text-sm tracking-widest uppercase mb-4 font-headline text-on-surface-variant">
            {t('builder.questionLibrary.heading')}
          </h3>
          <div className="space-y-3">
            {[
              { icon: 'short_text', label: t('builder.questionTypes.shortAnswer') },
              { icon: 'checklist', label: t('builder.questionTypes.multipleChoice') },
              { icon: 'star', label: t('builder.questionTypes.ratingScale') },
              { icon: 'upload_file', label: t('builder.questionTypes.fileUpload') },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 p-3 rounded-xl cursor-grab active:scale-95 transition-all hover:translate-x-1 bg-surface-container"
              >
                <Icon name={item.icon} size={20} className="text-on-surface-variant" />
                <span className="text-sm font-semibold text-on-surface">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          className="mt-auto py-4 w-full font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 text-surface font-headline rounded-xl"
          style={{
            background: '#2c2f31',
          }}
        >
          <Icon name="add" size={20} />
          {t('builder.createNewSurvey')}
        </button>
      </aside>

      {/* Top Nav */}
      <nav
        className="fixed top-0 w-full z-50 glass-nav flex justify-between items-center h-16 px-6"
        style={{ boxShadow: '0 8px 32px 0 rgba(31,38,135,0.07)' }}
      >
        <div className="flex items-center gap-4">
          <span className="text-2xl font-extrabold tracking-tighter drop-shadow-sm text-primary font-headline">
            {t('brand.name')}
          </span>
          <div className="h-6 w-px" style={{ background: 'rgba(203,213,225,0.5)' }} />
          <input
            value={surveyTitle}
            onChange={(e) => setSurveyTitle(e.target.value)}
            className="text-sm font-medium bg-transparent border-none outline-none text-on-surface-variant"
            style={{ minWidth: 200 }}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-full transition-all text-on-surface-variant"
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(203,213,225,0.5)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Icon name="visibility" size={20} />
            {t('builder.preview')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || launching}
            className="px-6 py-2 text-sm font-bold rounded-full transition-all active:scale-95 flex items-center gap-2 font-headline"
            style={{
              background: saved ? '#059669' : 'linear-gradient(135deg, #2a4bd9, #879aff)',
              color: '#f2f1ff',
              boxShadow: '0 10px 20px -5px rgba(42,75,217,0.3)',
            }}
          >
            {saving ? (
              <div className="w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: '#ffffff', borderTopColor: 'transparent' }} />
            ) : (
              <Icon name={saved ? 'check' : 'save'} size={16} />
            )}
            {saving ? t('builder.savingButton') : saved ? t('builder.savedButton') : t('builder.saveButton')}
          </button>
          <button
            onClick={handleLaunch}
            disabled={saving || launching}
            className="px-6 py-2 text-sm font-bold rounded-full transition-all active:scale-95 flex items-center gap-2 font-headline"
            style={{
              background: GRADIENTS.success,
              color: '#f0fdf4',
              boxShadow: '0 10px 20px -5px rgba(5,150,105,0.3)',
            }}
          >
            {launching ? (
              <div className="w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: '#f0fdf4', borderTopColor: 'transparent' }} />
            ) : (
              <Icon name="rocket_launch" size={16} />
            )}
            {launching ? t('builder.launchingButton') : t('builder.launchButton')}
          </button>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white font-headline bg-gradient-primary"
            style={{ border: '2px solid rgba(42,75,217,0.2)' }}
          >
            AR
          </div>
        </div>
      </nav>

      {/* Main Editor */}
      <main
        className="flex-1 px-12 py-10 bg-surface"
        style={{ marginLeft: 'calc(16rem + 20rem)', paddingTop: '5rem' }}
      >
        <div className="max-w-3xl mx-auto space-y-10 pb-32">
          {/* Header */}
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight font-headline text-on-surface">
                {t('builder.pageTitle')}
              </h1>
              <p className="mt-2 text-on-surface-variant">
                {t('builder.pageDescription')}
              </p>
            </div>
            <button
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: '#dfe3e6' }}
            >
              <Icon name="tune" size={20} className="text-on-surface-variant" />
            </button>
          </div>

          {/* Questions */}
          {questions.map((q, i) => (
            <QuestionCard key={q.id} q={q} index={i} onDelete={handleDelete} />
          ))}

          {/* Add Button */}
          <div className="flex justify-center py-6">
            <button className="group flex flex-col items-center gap-3" onClick={handleAdd}>
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 group-hover:text-white text-on-surface"
                style={{ background: '#d9dde0' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#2a4bd9';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#d9dde0';
                  e.currentTarget.style.color = '#2c2f31';
                }}
              >
                <Icon name="add" size={32} />
              </div>
              <span
                className="text-[10px] font-bold uppercase tracking-[0.2em] transition-colors group-hover:text-primary font-headline text-on-surface-variant"
              >
                {t('builder.addSection')}
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* Decorative BG */}
      <div
        className="fixed top-20 rounded-full -z-10"
        style={{
          right: '-10%',
          width: 500,
          height: 500,
          background: 'rgba(224,231,255,0.3)',
          filter: 'blur(120px)',
        }}
      />
      <div
        className="fixed rounded-full -z-10"
        style={{
          bottom: '-10%',
          left: '-5%',
          width: 400,
          height: 400,
          background: 'rgba(237,233,254,0.3)',
          filter: 'blur(100px)',
        }}
      />

      <BottomNav currentPage={ROUTES.SURVEYS} onNavigate={onNavigate} />
    </div>
  );
}
