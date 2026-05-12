import { Suspense } from 'react';
import { motion } from 'framer-motion';
import { TopBarPublic } from '../components/TopBar';
import { Icon } from '../components/Icon';
import { LogoMark } from '../components/Logo';
import { HeroCanvas } from '../components/three/HeroCanvas';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';

// Animation variants
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.65, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.88 },
  visible: (i = 0) => ({
    opacity: 1, scale: 1,
    transition: { duration: 0.55, delay: i * 0.08, ease: [0.34, 1.56, 0.64, 1] },
  }),
};

export function LandingPage({ onNavigate }) {
  const { t } = useTranslation();

  const featureCards = [
    { icon: 'analytics',     ...t('landing.cards')[0] },
    { icon: 'auto_awesome',  ...t('landing.cards')[1] },
    { icon: 'bolt',          ...t('landing.cards')[2] },
  ];

  return (
    <div className="min-h-screen font-body">
      <TopBarPublic currentPage={ROUTES.LANDING} onNavigate={onNavigate} />

      {/* ── Hero ────────────────────────────────────────────── */}
      <main
        className="relative pt-24 min-h-screen overflow-hidden"
        style={{ background: 'radial-gradient(ellipse 90% 70% at 50% -10%, #d8d4ff 0%, #eae8ff 30%, #f5f7f9 70%)' }}
      >
        {/* Animated aurora blob */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/4 rounded-full aurora-bg animate-pulse-slow pointer-events-none"
          style={{ width: 800, height: 500, filter: 'blur(80px)', zIndex: 0 }}
        />

        {/* 3D background canvas */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
          <Suspense fallback={null}>
            <HeroCanvas />
          </Suspense>
        </div>

        {/* Hero content */}
        <section className="relative z-10 max-w-screen-2xl mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

          {/* ── Left Copy ── */}
          <motion.div
            className="lg:col-span-7 space-y-10"
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            {/* Badge */}
            <motion.div variants={fadeUp} custom={0}>
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-widest uppercase text-primary"
                style={{
                  background: 'rgba(42,75,217,0.08)',
                  border: '1px solid rgba(42,75,217,0.2)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {t('landing.intelligenceLayer')}
              </div>
            </motion.div>

            {/* Headline */}
            <div className="space-y-4">
              <motion.h1
                className="text-5xl lg:text-[4rem] xl:text-[4.5rem] font-extrabold tracking-tighter leading-[1.05] font-headline text-on-surface"
                variants={fadeUp}
                custom={1}
              >
                {t('landing.heroHeadingStart')}
                <span className="text-gradient"> {t('brand.aiAware')} </span>
                {t('landing.heroHeadingMiddle')}
              </motion.h1>
              <motion.p
                className="text-xl leading-relaxed max-w-xl"
                style={{ color: '#47527a' }}
                variants={fadeUp}
                custom={2}
              >
                {t('landing.heroDescription')}
              </motion.p>
            </div>

            {/* CTAs */}
            <motion.div className="flex flex-wrap gap-4" variants={fadeUp} custom={3}>
              <button
                onClick={() => onNavigate(ROUTES.ONBOARDING)}
                className="cta-glow relative overflow-hidden px-8 py-4 text-white font-bold active:scale-95 transition-all font-headline rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, #2a4bd9, #6d28d9)',
                  boxShadow: '0 20px 40px -10px rgba(42,75,217,0.4)',
                }}
              >
                {/* Shimmer overlay */}
                <span className="shimmer absolute inset-0 rounded-[0.75rem]" />
                <span className="relative flex items-center gap-2">
                  {t('landing.ctaButton')}
                  <Icon name="arrow_forward" size={18} />
                </span>
              </button>
              <button
                className="px-8 py-4 font-semibold transition-all card-3d font-headline text-on-surface rounded-xl"
                style={{
                  background: 'rgba(255,255,255,0.8)',
                  border: '1px solid rgba(42,75,217,0.2)',
                  backdropFilter: 'blur(8px)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.95)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.8)')}
              >
                {t('landing.secondaryButton')}
              </button>
            </motion.div>

            {/* Feature list */}
            <motion.div className="pt-2 space-y-3 text-on-surface-variant" variants={stagger}>
              {t('landing.features').map((text, i) => (
                <motion.div
                  key={text}
                  className="flex items-center gap-3"
                  variants={fadeUp}
                  custom={4 + i}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(42,75,217,0.1)' }}
                  >
                    <Icon name="check" size={14} className="text-primary" />
                  </div>
                  <span className="font-medium">{text}</span>
                </motion.div>
              ))}
            </motion.div>

            {/* Social proof */}
            <motion.div className="flex items-center gap-4 pt-2" variants={fadeUp} custom={7}>
              <div className="flex -space-x-2">
                {['#879aff', '#d299ff', '#82deff', '#f9a8d4'].map((bg, i) => (
                  <div
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: bg }}
                  >
                    {['E', 'S', 'M', 'A'][i]}
                  </div>
                ))}
              </div>
              <p className="text-sm text-on-surface-variant">
                <strong className="text-on-surface">2,400+</strong> teams building on Experient
              </p>
            </motion.div>
          </motion.div>

          {/* ── Right Visual ── */}
          <div className="lg:col-span-5 relative">
            <div className="relative w-full max-w-md mx-auto" style={{ aspectRatio: '1/1' }}>

              {/* Glow blob behind cards */}
              <div
                className="absolute inset-0 -z-10 animate-pulse-slow"
                style={{
                  background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.25) 0%, transparent 70%)',
                  filter: 'blur(40px)',
                }}
              />

              {/* Sentiment Drift card */}
              <motion.div
                className="absolute top-0 right-0 w-64 p-6 z-20 float-card glass-card-premium"
                style={{
                  borderRadius: '1rem',
                  boxShadow: '0 32px 64px -12px rgba(42,75,217,0.2)',
                  transform: 'translate(16px, -16px)',
                }}
                initial={{ opacity: 0, x: 40, y: -20 }}
                animate={{ opacity: 1, x: 16, y: -16 }}
                transition={{ duration: 0.7, delay: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold tracking-widest uppercase text-primary">
                    {t('landing.sentimentCard.title')}
                  </span>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(42,75,217,0.1)' }}>
                    <Icon name="trending_up" size={14} className="text-primary" />
                  </div>
                </div>
                <div className="text-3xl font-black mb-1 text-gradient font-headline">
                  {t('landing.sentimentCard.metric')}
                </div>
                <div className="text-xs mb-4 text-secondary">{t('landing.sentimentCard.description')}</div>
                <div className="h-1.5 w-full rounded-full overflow-hidden bg-surface-container-low">
                  <div
                    className="h-full rounded-full"
                    style={{ width: '75%', background: 'linear-gradient(to right, #2a4bd9, #879aff)' }}
                  />
                </div>
              </motion.div>

              {/* AI Observation card */}
              <motion.div
                className="absolute bottom-10 left-0 w-72 p-6 z-30 float-card-slow"
                style={{
                  background: 'rgba(255,255,255,0.95)',
                  borderRadius: '1rem',
                  boxShadow: '0 40px 64px -10px rgba(0,0,0,0.14)',
                  border: '1px solid rgba(165,180,252,0.3)',
                  animationDelay: '2s',
                }}
                initial={{ opacity: 0, x: -40, y: 20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.7, delay: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #879aff, #8329c8)' }}
                  >
                    <Icon name="psychology" fill={1} size={18} className="text-white" />
                  </div>
                  <span className="text-sm font-bold font-headline text-on-surface">
                    {t('landing.aiObservation.heading')}
                  </span>
                  <span className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                </div>
                <p className="text-xs leading-relaxed mb-4 italic text-on-surface-variant">
                  &ldquo;{t('landing.aiObservation.quote')}&rdquo;
                </p>
                <div className="flex gap-2">
                  {t('landing.aiObservation.tags').map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 text-[10px] font-bold uppercase rounded-md text-primary"
                      style={{ background: 'rgba(42,75,217,0.08)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.div>

              {/* Center hero visual */}
              <motion.div
                className="w-full h-full rounded-3xl overflow-hidden relative"
                style={{ border: '1px solid rgba(165,180,252,0.3)' }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
              >
                {/* Background gradient */}
                <div className="absolute inset-0 aurora-bg" style={{ opacity: 0.7 }} />
                {/* Glass overlay */}
                <div className="absolute inset-0" style={{ backdropFilter: 'blur(2px)' }} />

                {/* Rotating ring decoration */}
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ zIndex: 1 }}
                >
                  <div
                    className="animate-spin-slow rounded-full"
                    style={{
                      width: 200,
                      height: 200,
                      border: '1px solid rgba(42,75,217,0.2)',
                      borderTopColor: 'rgba(131,41,200,0.6)',
                    }}
                  />
                </div>
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  style={{ zIndex: 1 }}
                >
                  <div
                    style={{
                      width: 140,
                      height: 140,
                      border: '1px solid rgba(87,210,249,0.3)',
                      borderBottomColor: 'rgba(42,75,217,0.5)',
                      borderRadius: '50%',
                      animation: 'spin-slow 8s linear infinite reverse',
                    }}
                  />
                </div>

                {/* Center logo mark */}
                <div className="relative z-10 w-full h-full flex items-center justify-center">
                  <div className="text-center space-y-5">
                    <motion.div
                      className="flex items-center justify-center"
                      animate={{ y: [0, -8, 0], rotateZ: [0, 2, 0] }}
                      transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <div
                        className="p-5 rounded-3xl glow-blue"
                        style={{
                          background: 'rgba(255,255,255,0.85)',
                          backdropFilter: 'blur(16px)',
                          border: '1px solid rgba(165,180,252,0.4)',
                        }}
                      >
                        <LogoMark size={64} />
                      </div>
                    </motion.div>
                    <div>
                      <p className="text-sm font-black tracking-widest uppercase text-gradient font-headline">
                        {t('landing.intelligenceLayer')}
                      </p>
                      <p className="text-xs mt-1 text-on-surface-variant">
                        {t('landing.layerDescription')}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Metrics bar ──────────────────────────────────── */}
        <motion.div
          className="relative z-10 max-w-screen-xl mx-auto px-6 pb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
        >
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden"
            style={{ background: 'rgba(171,173,175,0.15)', border: '1px solid rgba(171,173,175,0.15)' }}
          >
            {[
              { value: '12.4M', label: 'Responses analyzed' },
              { value: '99.9%', label: 'Uptime SLA' },
              { value: '< 50ms', label: 'AI response time' },
              { value: 'SOC 2', label: 'Type II certified' },
            ].map((m) => (
              <div
                key={m.label}
                className="px-8 py-6 text-center glass-card-premium"
              >
                <div className="text-2xl font-black text-gradient font-headline">
                  {m.value}
                </div>
                <div className="text-xs mt-1 font-medium text-on-surface-variant">{m.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Features ─────────────────────────────────────── */}
        <section className="relative z-10 max-w-screen-2xl mx-auto px-6 py-20">
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span
              className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase px-4 py-2 rounded-full text-primary"
              style={{ background: 'rgba(42,75,217,0.06)', border: '1px solid rgba(42,75,217,0.15)' }}
            >
              <LogoMark size={16} />
              {t('landing.sectionTag')}
            </span>
            <h2 className="text-4xl font-bold mt-5 font-headline text-on-surface">
              {t('landing.sectionHeading')}
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {featureCards.map((f, i) => (
              <motion.div
                key={f.title}
                className="group relative p-8 rounded-2xl cursor-pointer overflow-hidden bg-white"
                style={{ border: '1px solid rgba(171,173,175,0.1)' }}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: i * 0.12, ease: [0.25, 0.46, 0.45, 0.94] }}
                whileHover={{ y: -6, boxShadow: '0 32px 64px -12px rgba(42,75,217,0.18)' }}
              >
                {/* Holographic hover overlay */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 holographic" />

                <div
                  className="relative z-10 w-12 h-12 flex items-center justify-center mb-6 rounded-xl transition-transform group-hover:scale-110 group-hover:rotate-3"
                  style={{ background: 'linear-gradient(135deg, rgba(42,75,217,0.1), rgba(131,41,200,0.08))' }}
                >
                  <Icon name={f.icon} size={22} className="text-primary" />
                </div>
                <h3 className="relative z-10 text-xl font-bold mb-3 font-headline text-on-surface">
                  {f.title}
                </h3>
                <p className="relative z-10 text-sm leading-relaxed" style={{ color: '#47527a' }}>
                  {f.desc}
                </p>
                <div
                  className="relative z-10 mt-6 flex items-center gap-1 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity text-primary"
                >
                  Learn more <Icon name="arrow_forward" size={14} />
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer
        className="w-full border-t font-body"
        style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}
      >
        <div className="flex flex-col md:flex-row justify-between items-center px-8 py-12 gap-6 max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-3">
            <LogoMark size={28} />
            <span className="text-xs tracking-wide text-inverse-on-surface">
              {t('brand.footerAlt')}
            </span>
          </div>
          <div className="flex gap-8">
            {[
              t('landing.footerLinks.privacy'),
              t('landing.footerLinks.terms'),
              t('landing.footerLinks.apiDocs'),
            ].map((l) => (
              <a
                key={l}
                href="#"
                className="text-xs tracking-wide uppercase transition-colors text-inverse-on-surface"
                onMouseEnter={(e) => (e.target.style.color = '#2a4bd9')}
                onMouseLeave={(e) => (e.target.style.color = '#9a9d9f')}
              >
                {l}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
