import { usePermissions } from '../lib/permissions';
import { useTranslation } from '../lib/i18n';
import { Icon } from './Icon';

interface PermissionGateProps {
  role: 'admin' | 'analyst' | 'viewer';
  children: React.ReactNode;
  /** When true, renders a visible "Ask your admin" banner instead of null */
  showDenied?: boolean;
}

export function PermissionGate({ role, children, showDenied = false }: PermissionGateProps) {
  const { can } = usePermissions();
  if (can(role)) return <>{children}</>;
  if (showDenied) return <PermissionDeniedBanner />;
  return null;
}

export function PermissionDeniedBanner() {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
      style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
    >
      <Icon name="lock" size={18} style={{ color: '#d97706' }} />
      <span className="text-[#92400e] font-medium">{t('permissions.deniedBanner')}</span>
    </div>
  );
}
