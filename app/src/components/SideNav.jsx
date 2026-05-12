import { OrganizationSwitcher } from '@clerk/react';
import { Icon } from './Icon';
import { LogoFull } from './Logo';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';

export function SideNav({ currentPage, onNavigate }) {
  const { t } = useTranslation();
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  const navItems = [
    { label: t('nav.surveys'),     icon: 'poll',         page: ROUTES.SURVEYS },
    { label: t('nav.insights'),    icon: 'psychology',   page: ROUTES.INSIGHTS,    fill: 1 },
    { label: t('nav.respondents'), icon: 'groups',       page: ROUTES.RESPONDENTS },
    { label: t('nav.workflows'),   icon: 'account_tree', page: ROUTES.WORKFLOWS },
    { label: t('nav.settings'),    icon: 'settings',     page: ROUTES.SETTINGS },
  ];

  return (
    <aside className="sidenav hidden md:flex h-screen w-64 flex-col py-8 px-4 gap-y-3 fixed left-0 top-0 z-40">
      {/* Brand / Logo */}
      <div className="px-3 mb-6">
        <LogoFull height={30} showTagline />
      </div>

      {/* Divider */}
      <div className="mx-3 mb-2 divider-gradient" />

      {/* Nav Items */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive = currentPage === item.page;
          return (
            <button
              key={item.page}
              onClick={() => onNavigate(item.page)}
              className={`sidenav-item${isActive ? ' active active-bar' : ''}`}
            >
              <Icon name={item.icon} fill={isActive ? (item.fill || 1) : 0} size={20} />
              {item.label}
              {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="space-y-3 mx-1">
        {/* Organization switcher */}
        {clerkKey && (
          <div className="px-1">
            <OrganizationSwitcher
              hidePersonal
              afterSelectOrganizationUrl="/"
              afterCreateOrganizationUrl="/"
              afterLeaveOrganizationUrl="/"
              appearance={{
                elements: {
                  rootBox: 'w-full',
                  organizationSwitcherTrigger:
                    'w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-primary/5 transition-colors',
                  organizationSwitcherTriggerIcon: 'ml-auto',
                },
              }}
            />
          </div>
        )}

        {/* AI Credits */}
        <div className="sidenav-credit-widget">
          <p className="font-bold mb-0.5 text-on-surface">AI Credits</p>
          <div className="flex items-center justify-between mt-2">
            <div className="sidenav-progress-track">
              <div className="sidenav-progress-fill" style={{ width: '68%' }} />
            </div>
            <span className="text-[10px] font-bold text-primary">680 / 1k</span>
          </div>
        </div>

        <button
          onClick={() => onNavigate(ROUTES.BUILDER)}
          className="sidenav-cta w-full relative overflow-hidden text-white font-bold py-3.5 px-4 text-sm transition-all active:scale-95 group bg-gradient-primary font-headline rounded-xl"
        >
          <span className="shimmer absolute inset-0 rounded-[0.75rem] opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="relative flex items-center justify-center gap-2">
            <Icon name="add_circle" size={18} />
            {t('nav.createNewSurvey')}
          </span>
        </button>
      </div>
    </aside>
  );
}
