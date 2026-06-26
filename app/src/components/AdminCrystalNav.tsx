import { NavLink } from 'react-router-dom';
import { useTranslation } from '../lib/i18n';
import { ROUTES } from '../constants/routes';
import { cn } from '@/lib/utils';

// Horizontal sub-nav for the Admin Crystal section.
// Mirrors the same visual pattern as SettingsUsersNav.
const TABS = [
  { key: 'admin.crystal.nav.skills',  to: ROUTES.ADMIN_CRYSTAL_SKILLS },
  { key: 'admin.crystal.nav.quality', to: ROUTES.ADMIN_CRYSTAL_QUALITY },
  { key: 'admin.crystal.nav.signals', to: ROUTES.ADMIN_CRYSTAL_SIGNALS },
  { key: 'admin.crystal.nav.gaps',    to: ROUTES.ADMIN_CRYSTAL_GAPS },
  { key: 'admin.crystal.nav.dlq',     to: ROUTES.ADMIN_CRYSTAL_DLQ },
] as const;

export function AdminCrystalNav() {
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
