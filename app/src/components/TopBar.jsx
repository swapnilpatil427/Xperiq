import { UserButton } from '@clerk/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { LogoFull } from './Logo';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { usePageTitle } from '../contexts/pageTitle';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Progress } from '@/components/ui/progress';
import { useState } from 'react';

const CREDITS_TOTAL = 1000;
const CREDITS_REMAINING = 680;

function CreditsChip({ onClick }) {
  const { t } = useTranslation();
  const pct = (CREDITS_REMAINING / CREDITS_TOTAL) * 100;
  const chipClass = pct > 30 ? 'credits-chip' : pct > 10 ? 'credits-chip warn' : 'credits-chip critical';
  return (
    <button className={chipClass} onClick={onClick} aria-label={t('credits.sheetTitle')}>
      <span className="material-symbols-outlined" style={{ fontSize: 14, fontVariationSettings: "'FILL' 1, 'wght' 600" }}>
        auto_awesome
      </span>
      {t('credits.remaining', { n: CREDITS_REMAINING })}
    </button>
  );
}

export function TopBar() {
  const { title, subtitle } = usePageTitle();
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const { t } = useTranslation();
  const [creditsOpen, setCreditsOpen] = useState(false);

  return (
    <>
      <header className="topbar-fixed fixed top-0 z-50 glass-nav flex justify-between items-center h-16 px-6">
        <div className="flex items-center gap-4 min-w-0">
          {title && (
            <h2 className="text-xl font-bold tracking-tight font-headline text-on-surface truncate">
              {title}
            </h2>
          )}
          {title && subtitle && (
            <>
              <Separator orientation="vertical" className="h-5 opacity-40 flex-shrink-0" />
              <div className="topbar-subtitle-pill flex-shrink-0">
                <Icon name="calendar_today" size={14} className="text-primary" />
                <span className="text-xs font-semibold text-on-surface-variant">{subtitle}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <CreditsChip onClick={() => setCreditsOpen(true)} />
          <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full">
            <Icon name="notifications" size={20} />
          </Button>
          <Button variant="ghost" size="icon" className="w-9 h-9 rounded-full">
            <Icon name="help" size={20} />
          </Button>
          {clerkKey ? (
            <UserButton
              afterSignOutUrl="/"
              appearance={{ elements: { avatarBox: 'w-9 h-9' } }}
            />
          ) : (
            <div className="topbar-avatar">AR</div>
          )}
        </div>
      </header>

      {/* Credits Sheet */}
      <Sheet open={creditsOpen} onOpenChange={setCreditsOpen}>
        <SheetContent side="right" className="w-80">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 font-headline">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
              {t('credits.sheetTitle')}
            </SheetTitle>
            <SheetDescription>{t('credits.sheetDescription')}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div>
              <div className="flex justify-between text-sm font-semibold mb-2">
                <span className="text-on-surface">{t('credits.remaining', { n: CREDITS_REMAINING })}</span>
                <span className="text-on-surface-variant text-xs">{t('credits.used', { used: CREDITS_TOTAL - CREDITS_REMAINING, total: CREDITS_TOTAL })}</span>
              </div>
              <Progress value={(CREDITS_REMAINING / CREDITS_TOTAL) * 100} className="h-2" />
            </div>
            <div className="rounded-xl p-4 text-sm space-y-2" style={{ background: 'rgba(42,75,217,0.04)', border: '1px solid rgba(42,75,217,0.1)' }}>
              {[
                ['Survey generation', '~10 credits'],
                ['Insights analysis', '~25 credits'],
                ['Smart suggestions', '~2 credits'],
              ].map(([feat, cost]) => (
                <div key={feat} className="flex justify-between">
                  <span className="text-on-surface-variant">{feat}</span>
                  <span className="font-semibold text-primary">{cost}</span>
                </div>
              ))}
            </div>
            <Button
              variant="gradient"
              className="w-full font-bold rounded-xl py-3"
              onClick={() => setCreditsOpen(false)}
            >
              {t('credits.upgradeButton')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function TopBarPublic() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const navLinks = [
    { labelKey: 'nav.surveys',     page: ROUTES.SURVEYS },
    { labelKey: 'nav.insights',    page: ROUTES.INSIGHTS },
    { labelKey: 'nav.respondents', page: ROUTES.RESPONDENTS },
    { labelKey: 'nav.workflows',   page: ROUTES.WORKFLOWS },
  ];

  return (
    <nav className="fixed top-0 w-full z-50 glass-nav flex flex-col">
      <div className="flex justify-between items-center h-16 px-6 max-w-screen-2xl mx-auto w-full">
        <div className="flex items-center gap-8">
          <Button variant="ghost" onClick={() => navigate(ROUTES.LANDING)} className="p-0 h-auto hover:bg-transparent">
            <LogoFull height={28} />
          </Button>
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.page}
                onClick={() => navigate(link.page)}
                className={`nav-link${location.pathname === link.page ? ' active' : ''}`}
              >
                {t(link.labelKey)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="p-2 rounded-lg">
            <Icon name="notifications" size={20} />
          </Button>
          <Button variant="ghost" size="icon" className="p-2 rounded-lg">
            <Icon name="settings" size={20} />
          </Button>
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-gradient-primary text-white font-headline">
            AR
          </div>
        </div>
      </div>
      <div className="topbar-divider" />
    </nav>
  );
}
