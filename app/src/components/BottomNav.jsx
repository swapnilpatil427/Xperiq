import { Icon } from './Icon';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';

export function BottomNav({ currentPage, onNavigate }) {
  const { t } = useTranslation();

  const items = [
    { labelKey: 'nav.surveys',     icon: 'poll',       page: ROUTES.SURVEYS },
    { labelKey: 'nav.insights',    icon: 'psychology',  page: ROUTES.INSIGHTS },
    { labelKey: 'nav.respondents', icon: 'groups',     page: ROUTES.RESPONDENTS },
    { labelKey: 'nav.settings',    icon: 'settings',   page: ROUTES.SETTINGS },
  ];

  return (
    <nav className="bottomnav md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-6 pb-8 pt-4">
      {items.map((item, i) => {
        const isActive = currentPage === item.page;
        const isMid = i === 1;

        if (isMid) {
          return (
            <button
              key={item.page}
              onClick={() => onNavigate(item.page)}
              className="bottomnav-fab"
            >
              <Icon name={item.icon} fill={1} size={22} />
            </button>
          );
        }

        return (
          <button
            key={item.page}
            onClick={() => onNavigate(item.page)}
            className={`flex flex-col items-center justify-center transition-colors ${isActive ? 'text-primary' : 'text-inverse-on-surface'}`}
          >
            <Icon name={item.icon} fill={isActive ? 1 : 0} size={22} />
            <span className="text-[10px] font-bold uppercase tracking-widest mt-1 font-headline">
              {t(item.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
