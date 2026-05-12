import { useNavigate, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';
import { Button } from '@/components/ui/button';

export function BottomNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const items = [
    { labelKey: 'nav.surveys',     icon: 'poll',       path: ROUTES.SURVEYS },
    { labelKey: 'nav.insights',    icon: 'psychology',  path: ROUTES.INSIGHTS },
    { labelKey: 'nav.respondents', icon: 'groups',     path: ROUTES.RESPONDENTS },
    { labelKey: 'nav.settings',    icon: 'settings',   path: ROUTES.SETTINGS },
  ];

  return (
    <nav className="bottomnav md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-6 pb-8 pt-4">
      {items.map((item, i) => {
        const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
        const isMid = i === 1;

        if (isMid) {
          return (
            <Button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="bottomnav-fab"
              variant="ghost"
              size="icon"
            >
              <Icon name={item.icon} fill={1} size={22} />
            </Button>
          );
        }

        return (
          <Button
            key={item.path}
            variant="ghost"
            onClick={() => navigate(item.path)}
            className={`flex flex-col h-auto gap-0 px-3 py-1 rounded-xl hover:bg-transparent ${isActive ? 'text-primary' : 'text-inverse-on-surface'}`}
          >
            <Icon name={item.icon} fill={isActive ? 1 : 0} size={22} />
            <span className="text-[10px] font-bold uppercase tracking-widest mt-1 font-headline">
              {t(item.labelKey)}
            </span>
          </Button>
        );
      })}
    </nav>
  );
}
