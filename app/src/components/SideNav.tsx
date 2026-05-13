import { useNavigate, useLocation } from 'react-router-dom';
import { OrganizationSwitcher } from '@clerk/react';
import { Icon } from './Icon';
import { LogoFull, LogoMark } from './Logo';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const NAV_ITEMS = [
  { key: 'nav.surveys',     icon: 'poll',         path: ROUTES.SURVEYS },
  { key: 'nav.data',        icon: 'dataset',      path: '/app/data' },
  { key: 'nav.insights',    icon: 'psychology',   path: ROUTES.INSIGHTS, fill: 1 },
  { key: 'nav.respondents', icon: 'groups',       path: ROUTES.RESPONDENTS },
  { key: 'nav.workflows',   icon: 'account_tree', path: ROUTES.WORKFLOWS },
  { key: 'nav.templates',   icon: 'auto_awesome',  path: ROUTES.TEMPLATES },
];
const SETTINGS_ITEM = { key: 'nav.settings', icon: 'settings', path: ROUTES.SETTINGS };

interface SideNavProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export function SideNav({ isExpanded, onToggle }: SideNavProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  function isActive(path: string) {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  const allItems = [...NAV_ITEMS, SETTINGS_ITEM];

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className="sidenav fixed left-0 top-0 z-40 h-screen flex flex-col overflow-hidden transition-all duration-[250ms] ease-out"
        style={{ width: isExpanded ? '16rem' : '3.5rem' }}
      >
        {/* Logo + toggle */}
        <div className={`flex items-center h-16 flex-shrink-0 px-3 ${isExpanded ? 'justify-between' : 'justify-center'}`}>
          {isExpanded ? (
            <div className="pl-1">
              <LogoFull height={28} />
            </div>
          ) : (
            <LogoMark size={28} />
          )}
          {isExpanded && (
            <button
              onClick={onToggle}
              className="p-1.5 rounded-lg text-on-surface-variant hover:bg-primary/5 hover:text-primary transition-colors flex-shrink-0"
              aria-label="Collapse sidebar"
            >
              <Icon name="menu_open" size={18} />
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="mx-3 mb-1 divider-gradient flex-shrink-0" />

        {/* Nav items */}
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto overflow-x-hidden py-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            if (!isExpanded) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navigate(item.path)}
                      className={`sidenav-item-collapsed${active ? ' active' : ''}`}
                      aria-label={t(item.key)}
                    >
                      <Icon name={item.icon} fill={active ? (item.fill || 1) : 0} size={20} />
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-3/5 rounded-r-full bg-gradient-to-b from-primary to-tertiary" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-semibold text-xs">
                    {t(item.key)}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`sidenav-item${active ? ' active active-bar' : ''}`}
              >
                <Icon name={item.icon} fill={active ? (item.fill || 1) : 0} size={20} />
                <span className="truncate">{t(item.key)}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
              </button>
            );
          })}

          {/* Divider before Settings */}
          <div className={`my-2 ${isExpanded ? 'mx-2' : 'mx-1'} divider-gradient`} />

          {/* Settings */}
          {(() => {
            const item = SETTINGS_ITEM;
            const active = isActive(item.path);
            if (!isExpanded) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => navigate(item.path)}
                      className={`sidenav-item-collapsed${active ? ' active' : ''}`}
                      aria-label={t(item.key)}
                    >
                      <Icon name={item.icon} fill={active ? 1 : 0} size={20} />
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-3/5 rounded-r-full bg-gradient-to-b from-primary to-tertiary" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-semibold text-xs">
                    {t(item.key)}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return (
              <button
                onClick={() => navigate(item.path)}
                className={`sidenav-item${active ? ' active active-bar' : ''}`}
              >
                <Icon name={item.icon} fill={active ? 1 : 0} size={20} />
                <span className="truncate">{t(item.key)}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
              </button>
            );
          })()}
        </nav>

        {/* Bottom section */}
        <div className={`flex-shrink-0 px-2 pb-4 space-y-2 ${!isExpanded && 'flex flex-col items-center'}`}>
          {/* Org switcher */}
          {clerkKey && isExpanded && (
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

          {/* Collapse toggle (when expanded show it in header; when collapsed show at bottom) */}
          {!isExpanded && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggle}
                  className="sidenav-item-collapsed"
                  aria-label="Expand sidebar"
                >
                  <Icon name="menu" size={20} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-semibold text-xs">
                Expand
              </TooltipContent>
            </Tooltip>
          )}

          {/* Create CTA */}
          {isExpanded ? (
            <Button
              onClick={() => navigate(ROUTES.CREATE)}
              variant="gradient"
              className="sidenav-cta w-full relative overflow-hidden font-bold py-3 px-4 text-sm group font-headline rounded-xl"
            >
              <span className="shimmer absolute inset-0 rounded-[0.75rem] opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative flex items-center justify-center gap-2">
                <Icon name="add_circle" size={18} />
                {t('nav.createNewSurvey')}
              </span>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate(ROUTES.CREATE)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold transition-transform hover:scale-105 active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)', boxShadow: '0 6px 20px rgba(42,75,217,0.4)' }}
                  aria-label={t('nav.createNewSurvey')}
                >
                  <Icon name="add" size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-semibold text-xs">
                {t('nav.createNewSurvey')}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
