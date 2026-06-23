import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../../lib/i18n';
import { Icon } from '../../Icon';
import { ROUTES } from '../../../constants/routes';
import type { DashboardOperations } from '../../../lib/api';

interface AlertFeedWidgetProps {
  operations: DashboardOperations | null;
}

const SEVERITY_CONFIG = {
  critical: { icon: 'error',    color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: 'Critical' },
  warning:  { icon: 'warning',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  label: 'Warning'  },
  info:     { icon: 'info',     color: '#6366f1', bg: 'rgba(99,102,241,0.1)',  label: 'Info'     },
  success:  { icon: 'check_circle', color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Resolved' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AlertFeedWidget({ operations }: AlertFeedWidgetProps) {
  const { t } = useTranslation();

  if (!operations) {
    return <div className="skeleton h-28 rounded-xl" />;
  }

  const alerts = operations.anomalies;

  if (alerts.length === 0) {
    return (
      <div className="py-8 flex flex-col items-center gap-2 text-center">
        <Icon name="check_circle" size={28} className="text-emerald-400/60" />
        <p className="text-sm text-on-surface-variant/60">{t('dashboard.widget.alertFeedEmpty')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-2">
        {alerts.slice(0, 5).map((alert, idx) => {
          const cfg = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info;

          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-start gap-2.5 px-2 py-2 rounded-lg hover:bg-black/[0.03] transition-colors"
            >
              {/* Severity icon */}
              <span
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: cfg.bg }}
              >
                <Icon name={cfg.icon} size={13} style={{ color: cfg.color }} fill={1} />
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-on-surface leading-snug truncate">{alert.title}</p>
                <p className="text-[10px] text-on-surface-variant/60 mt-0.5 flex items-center gap-1.5">
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    {cfg.label}
                  </span>
                  <span>{timeAgo(alert.triggeredAt)}</span>
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Footer link */}
      <div className="mt-3 pt-2.5 border-t border-black/[0.05] flex justify-end">
        <Link
          to={ROUTES.ALERTS}
          className="text-xs font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
          style={{ color: 'var(--color-primary)' }}
        >
          {t('dashboard.widget.alertFeedViewAll')}
          <Icon name="arrow_forward" size={12} />
        </Link>
      </div>
    </div>
  );
}
