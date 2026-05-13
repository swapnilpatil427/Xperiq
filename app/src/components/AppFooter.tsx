import { useTranslation } from '../lib/i18n';

const FOOTER_LINKS = [
  { key: 'support', href: 'mailto:support@experient.ai' },
  { key: 'contact', href: 'mailto:hello@experient.ai' },
  { key: 'privacy', href: '#' },
  { key: 'terms', href: '#' },
  { key: 'status', href: '#' },
];

export function AppFooter() {
  const { t } = useTranslation();

  return (
    <footer className="w-full border-t mt-auto" style={{ borderColor: 'rgba(171,173,175,0.15)' }}>
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-xs text-on-surface-variant opacity-60 font-medium">
          {t('brand.footer')}
        </span>
        <nav className="flex items-center gap-4 flex-wrap justify-center">
          {FOOTER_LINKS.map(({ key, href }) => (
            <a
              key={key}
              href={href}
              className="text-xs font-medium text-on-surface-variant opacity-50 hover:opacity-100 hover:text-primary transition-all"
            >
              {t(`brand.footerLinks.${key}`)}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
