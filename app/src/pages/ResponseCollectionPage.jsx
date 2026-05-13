import { useState } from 'react';
import { Icon } from '../components/Icon';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useSurveys } from '../hooks/useSurveys';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';
import { PageHeader } from '../components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const DEMO_TOKEN = 'demo-survey-2024';

export function ResponseCollectionPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('collection.pageTitle'), t('collection.pageSubtitle'));
  const { surveys } = useSurveys();
  const [copied, setCopied] = useState(false);
  const [selectedSurveyId, setSelectedSurveyId] = useState(null);

  const activeSurveys = surveys.filter((s) => s.status === 'active');
  const survey = selectedSurveyId
    ? surveys.find((s) => s.id === selectedSurveyId)
    : activeSurveys[0];

  const token = survey?.publishToken || DEMO_TOKEN;
  const surveyUrl = `${window.location.origin}/s/${token}`;
  const totalResponses = survey?.responseCount ?? 2482;

  const copyLink = () => {
    navigator.clipboard.writeText(surveyUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const cards = [
    {
      icon: 'mark_email_read',
      iconBg: 'rgba(0,100,124,0.1)',
      iconColor: '#00647c',
      title: t('collection.cards.emailTitle'),
      desc: t('collection.cards.emailDesc'),
    },
    {
      icon: 'spatial_tracking',
      iconBg: 'rgba(131,41,200,0.1)',
      iconColor: '#8329c8',
      title: t('collection.cards.kioskTitle'),
      desc: t('collection.cards.kioskDesc'),
    },
  ];

  return (
        <div className="max-w-6xl mx-auto w-full">

          <PageHeader
            crumbs={[{ label: t('nav.respondents'), icon: 'groups', path: ROUTES.RESPONDENTS }]}
            title={t('collection.pageTitle')}
            subtitle={t('collection.shareDescription')}
          />

          <div className="flex flex-col items-center">

          {/* Survey selector */}
          {activeSurveys.length > 1 && (
            <div className="w-full max-w-4xl mb-6">
              <Select
                value={selectedSurveyId ?? '__all__'}
                onValueChange={(val) => setSelectedSurveyId(val === '__all__' ? null : val)}
              >
                <SelectTrigger className="w-full px-4 py-2.5 text-sm font-semibold rounded-[10px] bg-white text-on-surface border-border">
                  <SelectValue placeholder="Select a survey…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All active surveys</SelectItem>
                  {activeSurveys.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Hero Stat */}
          <div className="mb-12 text-center">
            <div
              className="inline-flex items-center gap-4 px-8 py-4 rounded-full bg-white"
              style={{
                boxShadow: '0 20px 40px -10px rgba(42,75,217,0.15)',
                border: '1px solid rgba(255,255,255,0.4)',
                transform: 'rotate(-1deg)',
              }}
            >
              <Icon name="analytics" fill={1} size={32} className="text-primary" />
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline">
                  {t('collection.responsesCollected')}
                </span>
                <span
                  className="text-4xl font-black font-headline text-primary"
                  style={{ textShadow: '0 0 20px rgba(42,75,217,0.3)' }}
                >
                  {totalResponses.toLocaleString()}
                </span>
              </div>
              <div className="ml-4 w-12 h-12 rounded-full flex items-center justify-center bg-primary/10">
                <Icon name="trending_up" size={24} className="text-primary" />
              </div>
            </div>
          </div>

          {/* Central Share Card */}
          <Card
            className="w-full max-w-4xl glass-card p-8 md:p-12 relative overflow-hidden border-white/60"
            style={{
              borderRadius: '1rem',
              boxShadow: '0 40px 100px -20px rgba(0,0,0,0.05)',
            }}
          >
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full"
              style={{ background: 'rgba(42,75,217,0.05)', filter: 'blur(48px)' }} />

            <header className="relative z-10 mb-10 text-center md:text-left">
              <h1 className="text-4xl md:text-5xl font-black tracking-tighter mb-2 font-headline text-on-surface">
                {t('collection.shareHeading')}
              </h1>
              {survey && (
                <p className="text-sm font-semibold mb-2 text-primary">
                  {survey.title}
                </p>
              )}
              <p className="max-w-lg font-medium text-on-surface-variant">
                {t('collection.shareDescription')}
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
              {/* Survey Link */}
              <div className="lg:col-span-2 flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-bold ml-2 uppercase tracking-wider text-on-surface-variant font-headline">
                    {t('collection.surveyLinkLabel')}
                  </Label>
                  <div className="flex flex-col md:flex-row gap-4">
                    <div
                      className="flex-grow px-5 py-4 flex items-center rounded-xl overflow-hidden bg-surface-container-low border border-muted/10"
                      style={{ boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.05)' }}
                    >
                      <span className="font-semibold text-sm shrink-0 mr-1 text-primary">
                        {window.location.origin}/s/
                      </span>
                      <span className="font-medium text-sm truncate text-on-surface">
                        {token}
                      </span>
                    </div>
                    <Button
                      onClick={copyLink}
                      className="flex items-center justify-center gap-2 font-bold px-8 py-4 transition-all duration-300 hover:-translate-y-1 active:scale-95 shrink-0 font-headline rounded-xl"
                      style={{
                        background: copied ? '#059669' : 'linear-gradient(135deg, #2a4bd9, #879aff)',
                        color: '#f2f1ff',
                        boxShadow: '0 10px 20px -5px rgba(42,75,217,0.4)',
                      }}
                    >
                      <Icon name={copied ? 'check' : 'content_copy'} size={18} />
                      {copied ? t('collection.copiedButton') : t('collection.copyButton')}
                    </Button>
                  </div>
                </div>

                {/* Preview button */}
                <a
                  href={`/s/${token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 font-bold text-sm px-5 py-3 rounded-xl transition-all hover:-translate-y-1 active:scale-95 w-fit text-primary font-headline bg-[#e0e7ff]"
                >
                  <Icon name="open_in_new" size={16} />
                  {t('collection.previewButton')}
                </a>

                {/* Embed Code */}
                <div className="p-6 relative rounded-xl bg-surface-container border border-white/20">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-on-surface-variant font-headline">
                      <Icon name="code" size={18} />
                      {t('collection.embedLabel')}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-bold px-2 py-1 text-primary bg-primary/10">
                      {t('collection.embedType')}
                    </Badge>
                  </div>
                  <div
                    className="p-4 font-mono text-xs leading-relaxed overflow-x-auto whitespace-nowrap rounded-md select-all text-on-surface-variant bg-[var(--color-surface-container-highest)]"
                    style={{ boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.05)' }}
                  >
                    {`<iframe src="${surveyUrl}" width="100%" height="700px" frameborder="0"></iframe>`}
                  </div>
                </div>
              </div>

              {/* QR Column */}
              <div className="flex flex-col gap-6">
                <Card
                  className="p-6 flex flex-col items-center rounded-xl bg-white border-muted/10"
                  style={{ boxShadow: '0 20px 40px -10px rgba(0,0,0,0.05)' }}
                >
                  <span className="text-xs font-bold uppercase tracking-widest mb-4 text-on-surface-variant font-headline">
                    {t('collection.qrLabel')}
                  </span>
                  <div
                    className="w-full aspect-square rounded-xl flex items-center justify-center relative overflow-hidden bg-surface-container-low"
                    style={{ border: '2px dashed rgba(171,173,175,0.3)' }}
                  >
                    <div className="w-36 h-36 p-3 rounded-lg bg-[var(--color-on-surface)]">
                      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(5,1fr)', gridTemplateRows: 'repeat(5,1fr)', display: 'grid', height: '100%' }}>
                        {[
                          1,1,1,0,1,
                          1,0,1,0,0,
                          1,1,1,1,0,
                          0,0,0,1,1,
                          1,0,1,0,1,
                        ].map((v, i) => (
                          <div key={i} className="rounded-sm" style={{ background: v ? '#879aff' : '#2c2f31' }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="mt-6 w-full py-4 font-bold flex items-center justify-center gap-2 active:scale-95 transition-all rounded-full text-primary font-headline border-2 border-primary hover:bg-primary/5"
                  >
                    <Icon name="download" size={20} />
                    {t('collection.downloadQR')}
                  </Button>
                </Card>

                <div className="p-6 rounded-xl bg-tertiary/5 border border-tertiary/10">
                  <span className="text-xs font-bold uppercase tracking-widest mb-3 block text-tertiary font-headline">
                    {t('collection.integrationsLabel')}
                  </span>
                  <div className="flex gap-3">
                    {[
                      { label: 'Slack', icon: 'chat' },
                      { label: 'Email', icon: 'mail' },
                      { label: 'API', icon: 'api' },
                    ].map((s) => (
                      <Button
                        key={s.label}
                        variant="outline"
                        size="icon"
                        title={s.label}
                        className="w-10 h-10 rounded-full cursor-pointer transition-transform hover:scale-110 text-on-surface-variant bg-white border-muted/20 shadow-sm"
                      >
                        <Icon name={s.icon} size={18} />
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Secondary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mt-6">
            {cards.map((card) => (
              <Card
                key={card.title}
                className="p-8 flex items-center gap-6 group cursor-pointer transition-all duration-500 rounded-2xl bg-surface-container-low border-white/40 hover:bg-white hover:shadow-xl"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}
              >
                <div
                  className="h-16 w-16 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 rounded-2xl"
                  style={{ background: card.iconBg, color: card.iconColor }}
                >
                  <Icon name={card.icon} size={32} />
                </div>
                <div>
                  <h3 className="font-bold text-lg font-headline text-on-surface">
                    {card.title}
                  </h3>
                  <p className="text-sm mt-1 text-on-surface-variant">{card.desc}</p>
                </div>
              </Card>
            ))}
          </div>
          </div>{/* end items-center wrapper */}
        </div>
  );
}
