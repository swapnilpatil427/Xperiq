import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';
import { Button } from '@/components/ui/button';

export function BottomNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // 5 items: Surveys | Data | FAB(Create) | Insights | Settings
  const items = [
    { labelKey: 'nav.surveys',  icon: 'poll',      path: ROUTES.SURVEYS  },
    { labelKey: 'nav.data',     icon: 'dataset',   path: '/app/data'     },
    { isFab: true,               icon: 'add',       path: ROUTES.CREATE   },
    { labelKey: 'nav.insights', icon: 'psychology', path: ROUTES.INSIGHTS },
    { labelKey: 'nav.settings', icon: 'settings',  path: ROUTES.SETTINGS },
  ];

  return (
    <nav
      className="bottomnav fixed bottom-0 left-0 w-full z-50 flex justify-around items-end px-2"
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 1.5rem))', paddingTop: '0.75rem' }}
    >
      {items.map((item, i) => {
        if (item.isFab) {
          return (
            <button
              key="fab"
              onClick={() => navigate(item.path)}
              className="bottomnav-fab mb-1 flex items-center justify-center"
              aria-label={t('nav.createNewSurvey')}
            >
              <Icon name={item.icon} fill={1} size={24} />
            </button>
          );
        }

        const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
        return (
          <Button
            key={item.path}
            variant="ghost"
            onClick={() => navigate(item.path)}
            className={`flex flex-col h-auto gap-0.5 px-3 py-1 rounded-xl hover:bg-transparent min-w-0 ${
              isActive ? 'text-primary' : 'text-inverse-on-surface'
            }`}
          >
            <Icon name={item.icon} fill={isActive ? 1 : 0} size={22} />
            <span className="text-[9px] font-bold uppercase tracking-widest font-headline truncate">
              {t(item.labelKey)}
            </span>
          </Button>
        );
      })}
    </nav>
  );
}
