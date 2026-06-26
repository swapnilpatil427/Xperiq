import { NavLink } from 'react-router-dom';
import { useTranslation } from '../lib/i18n';
import { ROUTES } from '../constants/routes';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'admin.support.nav.pipeline', to: ROUTES.ADMIN_SUPPORT_PIPELINE },
  { key: 'admin.support.nav.gaps',     to: ROUTES.ADMIN_SUPPORT_GAPS },
  { key: 'admin.support.nav.stats',    to: ROUTES.ADMIN_SUPPORT_STATS },
] as const;

export function AdminSupportNav() {
  const { t } = useTranslation();
  return (
    <nav className="flex flex-wrap gap-1.5 mb-6 border-b border-border pb-3">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }: { isActive: boolean }) => cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary/10 text-primary'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-muted/60',
          )}
        >
          {t(tab.key)}
        </NavLink>
      ))}
    </nav>
  );
}
