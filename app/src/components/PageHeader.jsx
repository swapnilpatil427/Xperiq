import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

/**
 * Shared page header component for all authenticated pages.
 * Renders a breadcrumb trail, H1 title, optional subtitle, and action buttons.
 *
 * Usage:
 *   <PageHeader
 *     crumbs={[{ label: 'Templates', icon: 'auto_awesome', path: '/app/templates' }]}
 *     title="Template Library"
 *     subtitle="Browse and manage survey templates"
 *     actions={<Button>+ New</Button>}
 *   />
 *
 * Props:
 *   crumbs    — array of { label, icon?, path? }. Last item = current page (no path).
 *   title     — H1 text (required)
 *   subtitle  — optional body text below title
 *   actions   — ReactNode rendered top-right
 *   className — extra classes on the wrapper div
 */
export function PageHeader({ crumbs = [], title, subtitle, actions, className = '' }) {
  return (
    <div className={`pt-8 md:pt-10 pb-6 ${className}`}>
      {/* Breadcrumb trail */}
      {crumbs.length > 0 && (
        <nav aria-label="breadcrumb" className="flex items-center gap-1 mb-4 flex-wrap">
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <Fragment key={i}>
                {i > 0 && (
                  <Icon
                    name="chevron_right"
                    size={14}
                    className="text-on-surface-variant opacity-35 flex-shrink-0"
                  />
                )}
                {crumb.path && !isLast ? (
                  <Link
                    to={crumb.path}
                    className="flex items-center gap-1 text-[11px] font-bold text-on-surface-variant hover:text-primary transition-colors tracking-wide uppercase"
                  >
                    {crumb.icon && <Icon name={crumb.icon} size={13} />}
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={`flex items-center gap-1 text-[11px] font-bold tracking-wide uppercase ${
                      isLast ? 'text-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {crumb.icon && <Icon name={crumb.icon} size={13} />}
                    {crumb.label}
                  </span>
                )}
              </Fragment>
            );
          })}
        </nav>
      )}

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-[1.75rem] font-extrabold tracking-tight font-headline text-on-surface leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-on-surface-variant mt-1.5 leading-relaxed max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-3 flex-shrink-0 pt-0.5">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
