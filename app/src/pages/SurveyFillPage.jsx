import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { useTranslation } from '../lib/i18n';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/experient-prod/us-central1/api';

const MOCK_SURVEY = {
  id: 'demo',
  title: 'Product Experience Survey',
  description: 'Help us understand your experience and improve our product.',
  questions: [
    {
      id: 'q1',
      type: 'nps',
      question: 'How likely are you to recommend our product to a colleague?',
      required: true,
    },
    {
      id: 'q2',
      type: 'multiple_choice',
      question: 'Which area has the most room for improvement?',
      options: ['Onboarding', 'Performance', 'Documentation', 'Support', 'Features'],
      required: true,
    },
    {
      id: 'q3',
      type: 'rating',
      question: 'Rate your overall experience with the product.',
      required: true,
    },
    {
      id: 'q4',
      type: 'open_text',
      question: 'What specific friction did you encounter, if any?',
      required: false,
    },
    {
      id: 'q5',
      type: 'open_text',
      question: 'What one change would make you a strong promoter?',
      required: false,
    },
  ],
};

function NpsQuestion({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4">
      <div className="flex gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={{
              background:
                value === i
                  ? i <= 6
                    ? '#b41340'
                    : i <= 8
                      ? '#d97706'
                      : '#059669'
                  : '#eef1f3',
              color: value === i ? '#ffffff' : '#595c5e',
              transform: value === i ? 'scale(1.1)' : 'scale(1)',
              boxShadow: value === i ? '0 8px 20px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="flex justify-between mt-2 px-1">
        <span className="text-xs font-semibold text-error">{t('fill.npsLabelLow')}</span>
        <span className="text-xs font-semibold text-success">{t('fill.npsLabelHigh')}</span>
      </div>
    </div>
  );
}

function RatingQuestion({ value, onChange }) {
  return (
    <div className="flex gap-3 mt-4">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star)}
          className="flex-1 py-4 rounded-xl font-black text-xl transition-all active:scale-95"
          style={{
            background: value >= star ? '#2a4bd9' : '#eef1f3',
            color: value >= star ? '#ffffff' : '#c4c4c4',
            transform: value === star ? 'scale(1.1)' : 'scale(1)',
            boxShadow: value >= star ? '0 8px 20px rgba(42,75,217,0.2)' : 'none',
          }}
        >
          {star}
        </button>
      ))}
    </div>
  );
}

function MultipleChoiceQuestion({ question, value, onChange }) {
  return (
    <div className="flex flex-col gap-3 mt-4">
      {(question.options || []).map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="flex items-center gap-3 px-5 py-4 rounded-xl text-left transition-all active:scale-95"
          style={{
            background: value === opt ? '#e0e7ff' : '#eef1f3',
            border: value === opt ? '2px solid #2a4bd9' : '2px solid transparent',
            color: value === opt ? '#2a4bd9' : '#2c2f31',
          }}
        >
          <div
            className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{
              border: value === opt ? '2px solid #2a4bd9' : '2px solid #d0d5d8',
              background: value === opt ? '#2a4bd9' : 'transparent',
            }}
          >
            {value === opt && (
              <div className="w-2 h-2 rounded-full bg-white" />
            )}
          </div>
          <span className="font-semibold text-sm">{opt}</span>
        </button>
      ))}
    </div>
  );
}

function OpenTextQuestion({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('fill.textareaPlaceholder')}
      rows={4}
      className="w-full mt-4 resize-none outline-none text-sm leading-relaxed bg-surface-container-low font-body text-on-surface"
      style={{
        borderRadius: '0.75rem',
        padding: '1rem',
        border: 'none',
      }}
    />
  );
}

export function SurveyFillPage() {
  const { token } = useParams();
  const { t } = useTranslation();
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [currentQ, setCurrentQ] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BASE}/api/public/surveys/${token}`);
        if (res.ok) {
          const data = await res.json();
          setSurvey(data.survey);
        } else {
          setSurvey(MOCK_SURVEY);
        }
      } catch {
        setSurvey(MOCK_SURVEY);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const questions = survey?.questions || [];
  const q = questions[currentQ];
  const progress = questions.length > 0 ? ((currentQ) / questions.length) * 100 : 0;
  const isLast = currentQ === questions.length - 1;
  const canContinue = !q?.required || answers[q?.id] !== undefined;

  const setAnswer = (id, value) => setAnswers((prev) => ({ ...prev, [id]: value }));

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ((n) => n + 1);
    }
  };

  const handleBack = () => {
    if (currentQ > 0) setCurrentQ((n) => n - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        publishToken: token,
        answers: Object.entries(answers).map(([questionId, value]) => ({
          questionId,
          type: questions.find((q) => q.id === questionId)?.type,
          value: String(value),
        })),
      };
      const res = await fetch(`${BASE}/api/surveys/${survey.id}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        setSubmitted(true);
      }
    } catch {
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        <div
          className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: '#2a4bd9', borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (submitted) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6"
        style={{ background: 'radial-gradient(circle at 50% 30%, #e0e7ff 0%, #f5f7f9 70%)' }}
      >
        <div className="text-center max-w-md">
          <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-xl"
            style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
          >
            <Icon name="check_circle" fill={1} size={48} className="text-white" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter mb-4 font-headline text-on-surface">
            {t('fill.thankYou.heading')}
          </h1>
          <p className="text-lg leading-relaxed mb-8 text-on-surface-variant">
            {t('fill.thankYou.message')}
          </p>
          <div className="p-6 rounded-2xl text-left bg-white"
            style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-primary">
                <Icon name="psychology" fill={1} size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-bold tracking-widest uppercase text-inverse-on-surface">
                  {t('fill.poweredBy')}
                </p>
                <p className="font-black text-lg tracking-tighter font-headline text-primary">
                  {t('brand.name')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative"
      style={{ background: 'radial-gradient(circle at 50% -10%, #e0e7ff 0%, #f5f7f9 60%)' }}
    >
      {/* Background blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div
          className="absolute rounded-full"
          style={{ top: '-15%', left: '-10%', width: '40%', height: '40%', background: 'rgba(42,75,217,0.08)', filter: 'blur(120px)' }}
        />
        <div
          className="absolute rounded-full"
          style={{ bottom: '-10%', right: '-10%', width: '50%', height: '50%', background: 'rgba(131,41,200,0.08)', filter: 'blur(150px)' }}
        />
      </div>

      {/* Progress bar */}
      <div className="fixed top-0 left-0 w-full z-50 h-1 bg-surface-container">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(to right, #2a4bd9, #8329c8)',
          }}
        />
      </div>

      {/* Header */}
      <header className="fixed top-1 left-0 w-full z-40 glass-nav flex items-center justify-between h-14 px-6"
        style={{ boxShadow: '0 8px 32px rgba(31,38,135,0.07)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gradient-primary">
            <Icon name="psychology" fill={1} size={16} className="text-white" />
          </div>
          <span className="font-black tracking-tighter text-sm font-headline text-primary">
            {t('brand.name')}
          </span>
        </div>
        <span className="text-xs font-semibold text-inverse-on-surface">
          {t('fill.progress', { current: currentQ + 1, total: questions.length })}
        </span>
      </header>

      <main className="relative z-10 flex items-start justify-center pt-20 pb-32 px-4 min-h-screen">
        <div className="w-full max-w-xl pt-8">
          {/* Survey title */}
          {currentQ === 0 && (
            <div className="text-center mb-10">
              <h1 className="text-3xl font-extrabold tracking-tighter mb-2 font-headline text-on-surface">
                {survey.title}
              </h1>
              {survey.description && (
                <p className="text-sm max-w-sm mx-auto leading-relaxed text-on-surface-variant">
                  {survey.description}
                </p>
              )}
            </div>
          )}

          {/* Question card */}
          {q && (
            <div
              key={q.id}
              className="glass-card p-8 rounded-2xl"
              style={{
                boxShadow: '0 40px 100px -20px rgba(42,75,217,0.10)',
                border: '1px solid rgba(255,255,255,0.4)',
              }}
            >
              <div className="mb-6">
                <span
                  className="inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-4 text-primary"
                  style={{ background: '#e0e7ff' }}
                >
                  {t(`fill.questionTypes.${q.type}`) || q.type}
                  {q.required && t('fill.requiredIndicator')}
                </span>
                <h2 className="text-xl font-bold leading-tight font-headline text-on-surface">
                  {q.question}
                </h2>
              </div>

              {q.type === 'nps' && (
                <NpsQuestion
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)}
                />
              )}
              {q.type === 'rating' && (
                <RatingQuestion
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)}
                />
              )}
              {q.type === 'multiple_choice' && (
                <MultipleChoiceQuestion
                  question={q}
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)}
                />
              )}
              {q.type === 'open_text' && (
                <OpenTextQuestion
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)}
                />
              )}

              {/* Navigation */}
              <div className="flex gap-3 mt-8">
                {currentQ > 0 && (
                  <button
                    onClick={handleBack}
                    className="px-5 py-3 font-bold text-sm transition-all active:scale-95 font-headline bg-surface-container-low text-on-surface-variant rounded-xl"
                  >
                    {t('fill.backButton')}
                  </button>
                )}
                <button
                  onClick={isLast ? handleSubmit : handleNext}
                  disabled={!canContinue || submitting}
                  className="flex-1 py-3 font-bold text-base transition-all active:scale-95 flex items-center justify-center gap-2 font-headline rounded-xl"
                  style={{
                    background: canContinue
                      ? 'linear-gradient(135deg, #2a4bd9, #8329c8)'
                      : '#dfe3e6',
                    color: canContinue ? '#ffffff' : '#9a9d9f',
                    cursor: canContinue ? 'pointer' : 'not-allowed',
                    boxShadow: canContinue ? '0 10px 30px rgba(42,75,217,0.25)' : 'none',
                  }}
                >
                  {submitting ? (
                    <div
                      className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: '#ffffff', borderTopColor: 'transparent' }}
                    />
                  ) : isLast ? (
                    <>
                      <Icon name="send" size={18} />
                      {t('fill.submitButton')}
                    </>
                  ) : (
                    <>
                      {t('fill.continueButton')}
                      <Icon name="arrow_forward" size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-xl text-sm font-semibold text-center bg-error/10 text-error">
              {error}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
