import { NavLink } from 'react-router-dom';
import { useTranslation } from '../lib/i18n';
import { ROUTES } from '../constants/routes';
import { cn } from '@/lib/utils';

// Horizontal sub-nav for the User Directory admin section.
const TABS = [
  { key: 'settings.userDirectory.pageTitle', to: ROUTES.SETTINGS_USERS },
  { key: 'settings.roles.pageTitle',         to: ROUTES.SETTINGS_ROLES },
  { key: 'settings.departments.pageTitle',   to: ROUTES.SETTINGS_DEPARTMENTS },
  { key: 'settings.groups.pageTitle',        to: ROUTES.SETTINGS_GROUPS },
  { key: 'settings.provisioning.pageTitle',  to: ROUTES.SETTINGS_PROVISIONING },
  { key: 'settings.seats.pageTitle',         to: ROUTES.SETTINGS_SEATS },
  { key: 'settings.audit.pageTitle',         to: ROUTES.SETTINGS_AUDIT },
  { key: 'groups.settingsTitle',             to: ROUTES.SETTINGS_TAGS },
];

export function SettingsUsersNav() {
  const { t } = useTranslation();
  return (
    <nav className="flex flex-wrap gap-1.5 mb-6 border-b border-border pb-3">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) => cn(
            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
            isActive
              ? 'bg-primary/10 text-primary'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-muted/60'
          )}
        >
          {t(tab.key)}
        </NavLink>
      ))}
    </nav>
  );
}
