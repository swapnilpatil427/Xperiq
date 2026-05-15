import { UserButton } from '@clerk/react';
import { useState } from 'react';
import { Icon } from './Icon';
import { Button } from '@/components/ui/button';
import { useTranslation } from '../lib/i18n';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useNotifications } from '../hooks/useNotifications';
import type { Notification } from '../lib/api';

const CREDITS_TOTAL = 1000;
const CREDITS_REMAINING = 680;

interface CreditsChipProps {
  onClick: () => void;
}

function CreditsChip({ onClick }: CreditsChipProps) {
  const { t } = useTranslation();
  const pct = (CREDITS_REMAINING / CREDITS_TOTAL) * 100;
  const chipClass = pct > 30 ? 'credits-chip' : pct > 10 ? 'credits-chip warn' : 'credits-chip critical';
  return (
    <button className={chipClass} onClick={onClick} aria-label={t('credits.sheetTitle')}>
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 14, fontVariationSettings: "'FILL' 1, 'wght' 600" }}
      >
        auto_awesome
      </span>
      {t('credits.remaining', { n: CREDITS_REMAINING })}
    </button>
  );
}

interface TopBarProps {
  onMenuToggle: () => void;
}

function NotificationItem({ n, onRead }: { n: Notification; onRead: (id: string) => void }) {
  const icons: Record<string, string> = {
    survey_complete: 'check_circle',
    qc_warning:      'warning',
    compliance_risk: 'shield',
    run_failed:      'error',
  };
  const colors: Record<string, string> = {
    survey_complete: '#10b981',
    qc_warning:      '#f59e0b',
    compliance_risk: '#ef4444',
    run_failed:      '#ef4444',
  };
  const iconName  = icons[n.type]  || 'notifications';
  const iconColor = colors[n.type] || '#6b7280';
  const ts = new Date(n.created_at);
  const age = Date.now() - ts.getTime();
  const label = age < 60_000 ? 'just now'
    : age < 3_600_000 ? `${Math.floor(age / 60_000)}m ago`
    : age < 86_400_000 ? `${Math.floor(age / 3_600_000)}h ago`
    : ts.toLocaleDateString();

  return (
    <button
      onClick={() => !n.read && onRead(n.id)}
      className={`w-full text-left flex gap-3 px-4 py-3 transition-colors ${n.read ? '' : 'bg-[#f0f5ff]'}`}
      style={{ cursor: n.read ? 'default' : 'pointer' }}
      onMouseEnter={(e) => { if (!n.read) e.currentTarget.style.background = '#e0e7ff'; }}
      onMouseLeave={(e) => { if (!n.read) e.currentTarget.style.background = '#f0f5ff'; }}
    >
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
        style={{ background: `${iconColor}18` }}>
        <Icon name={iconName} size={16} style={{ color: iconColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${n.read ? 'text-[#6b7280]' : 'text-[#111827] font-semibold'}`}>{n.title}</p>
        {n.body && <p className="text-xs text-[#9ca3af] mt-0.5 line-clamp-2">{n.body}</p>}
        <p className="text-[10px] text-[#d1d5db] mt-1">{label}</p>
      </div>
      {!n.read && (
        <div className="w-2 h-2 rounded-full bg-[#4f6ef7] flex-shrink-0 mt-2" />
      )}
    </button>
  );
}

export function TopBar({ onMenuToggle }: TopBarProps) {
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  const { t } = useTranslation();
  const [creditsOpen, setCreditsOpen]  = useState(false);
  const [notifOpen,   setNotifOpen]    = useState(false);
  const { unreadCount, notifications, loading, loadNotifications, markRead, markAllRead } = useNotifications();

  function handleNotifOpen(open: boolean) {
    setNotifOpen(open);
    if (open) loadNotifications();
  }

  return (
    <>
      <header className="topbar-fixed fixed top-0 z-50 glass-nav flex items-center justify-between h-16 px-4 md:px-6">
        {/* Left: sidebar toggle (tablet/desktop) */}
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuToggle}
            className="hidden md:flex w-9 h-9 rounded-xl text-on-surface-variant hover:text-primary hover:bg-primary/5"
            aria-label="Toggle sidebar"
          >
            <Icon name="menu" size={20} />
          </Button>
        </div>

        {/* Right: global controls */}
        <div className="flex items-center gap-2 md:gap-3">
          <CreditsChip onClick={() => setCreditsOpen(true)} />
          <button
            onClick={() => handleNotifOpen(true)}
            className="relative w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors"
            aria-label="Notifications"
          >
            <Icon name="notifications" size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-[#ef4444] text-white text-[10px] font-black flex items-center justify-center px-0.5">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <Button variant="ghost" size="icon" className="w-9 h-9 rounded-xl text-on-surface-variant">
            <Icon name="help" size={20} />
          </Button>
          {clerkKey ? (
            <UserButton
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
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontSize: 20, fontVariationSettings: "'FILL' 1" }}
              >
                auto_awesome
              </span>
              {t('credits.sheetTitle')}
            </SheetTitle>
            <SheetDescription>{t('credits.sheetDescription')}</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            <div>
              <div className="flex justify-between text-sm font-semibold mb-2">
                <span className="text-on-surface">{t('credits.remaining', { n: CREDITS_REMAINING })}</span>
                <span className="text-on-surface-variant text-xs">
                  {t('credits.used', { used: CREDITS_TOTAL - CREDITS_REMAINING, total: CREDITS_TOTAL })}
                </span>
              </div>
              <Progress value={(CREDITS_REMAINING / CREDITS_TOTAL) * 100} className="h-2" />
            </div>
            <div
              className="rounded-xl p-4 text-sm space-y-2"
              style={{ background: 'rgba(42,75,217,0.04)', border: '1px solid rgba(42,75,217,0.1)' }}
            >
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

      {/* Notifications Sheet */}
      <Sheet open={notifOpen} onOpenChange={handleNotifOpen}>
        <SheetContent side="right" className="w-96 p-0 flex flex-col">
          <SheetHeader className="px-5 py-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(42,75,217,0.08)' }}>
            <div className="flex items-center justify-between">
              <SheetTitle className="font-headline text-base">Notifications</SheetTitle>
              {notifications.some((n) => !n.read) && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-[#4f6ef7] font-semibold hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <SheetDescription className="sr-only">Crystal and survey activity notifications</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-2 h-2 rounded-full animate-bounce bg-[#a5b4fc]"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
                <div className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #eef2ff, #f3e8ff)' }}>
                  <Icon name="notifications" size={22}
                    style={{ backgroundImage: 'linear-gradient(135deg, #4f6ef7, #9b51e0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                </div>
                <p className="text-sm text-[#6b7280]">No notifications yet</p>
                <p className="text-xs text-[#d1d5db]">Crystal activity will appear here</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'rgba(42,75,217,0.05)' }}>
                {notifications.map((n) => (
                  <NotificationItem key={n.id} n={n} onRead={markRead} />
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}

// Keep TopBarPublic for public/landing pages
import { useNavigate, useLocation } from 'react-router-dom';
import { LogoFull } from './Logo';
import { ROUTES } from '../constants/routes';
import { Separator } from '@/components/ui/separator';

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
