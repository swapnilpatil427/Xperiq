import { UserButton } from '@clerk/react';
import { Icon } from './Icon';
import { LogoFull } from './Logo';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';

export function TopBar({ title, subtitle, onNavigate }) {
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  return (
    <header className="topbar-fixed fixed top-0 z-50 glass-nav flex justify-between items-center h-16 px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-bold tracking-tight font-headline text-on-surface">
          {title}
        </h2>
        {subtitle && (
          <>
            <div className="h-6 w-px bg-slate-200/50" />
            <div className="topbar-subtitle-pill">
              <Icon name="calendar_today" size={16} className="text-primary" />
              <span className="text-xs font-semibold text-on-surface-variant">{subtitle}</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button className="btn-ghost w-10 h-10 rounded-full">
          <Icon name="notifications" size={20} />
        </button>
        <button className="btn-ghost w-10 h-10 rounded-full">
          <Icon name="help" size={20} />
        </button>
        {clerkKey ? (
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: 'w-10 h-10',
              },
            }}
          />
        ) : (
          <div className="topbar-avatar">AR</div>
        )}
      </div>
    </header>
  );
}

export function TopBarPublic({ currentPage, onNavigate }) {
  const { t } = useTranslation();

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
          <button onClick={() => onNavigate(ROUTES.LANDING)}>
            <LogoFull height={28} />
          </button>
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <button
                key={link.page}
                onClick={() => onNavigate(link.page)}
                className={`nav-link${currentPage === link.page ? ' active' : ''}`}
              >
                {t(link.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button className="btn-ghost p-2 rounded-lg">
            <Icon name="notifications" size={20} />
          </button>
          <button className="btn-ghost p-2 rounded-lg">
            <Icon name="settings" size={20} />
          </button>
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs bg-gradient-primary text-white font-headline">
            AR
          </div>
        </div>
      </div>
      <div className="topbar-divider" />
    </nav>
  );
}
