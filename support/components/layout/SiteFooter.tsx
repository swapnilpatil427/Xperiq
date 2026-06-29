import Link from 'next/link'

const footerLinks = {
  Product: [
    { href: 'https://xperiq.ai', label: 'Platform' },
    { href: 'https://xperiq.ai/pricing', label: 'Pricing' },
    { href: '/changelog', label: 'Changelog' },
    { href: '/roadmap', label: 'Roadmap' },
  ],
  Support: [
    { href: '/guides', label: 'Documentation' },
    { href: '/guides?category=getting-started', label: 'Getting Started' },
    { href: '/guides?category=api-integrations', label: 'API Reference' },
    { href: '/status', label: 'System Status' },
    { href: '/contact', label: 'Contact Us' },
  ],
  Legal: [
    { href: '/legal/privacy', label: 'Privacy Policy' },
    { href: '/legal/terms', label: 'Terms of Service' },
    { href: '/legal/security', label: 'Security' },
  ],
}

const trustBadges = [
  { label: 'SOC 2 Type II', icon: 'verified_user' },
  { label: 'GDPR Compliant', icon: 'gpp_good' },
  { label: 'ISO 27001', icon: 'security' },
  { label: '99.9% Uptime SLA', icon: 'bolt' },
]

export function SiteFooter() {
  return (
    <footer className="bg-surface-container-low border-t border-outline-variant/10 mt-auto">
      {/* Trust badges bar */}
      <div className="border-b border-outline-variant/10 py-4">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap items-center justify-center gap-6">
          {trustBadges.map(({ label, icon }) => (
            <div
              key={label}
              className="flex items-center gap-2 text-xs text-on-surface-variant font-label"
            >
              <span
                className="material-symbols-outlined text-[16px] text-secondary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {icon}
              </span>
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Main footer */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary-container flex items-center justify-center shadow-glow">
                <span
                  className="material-symbols-outlined text-on-primary text-base"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  dataset
                </span>
              </div>
              <span className="font-headline font-extrabold text-on-background tracking-tight">
                Xperiq
              </span>
            </div>
            <p className="text-sm text-on-surface-variant font-body leading-relaxed max-w-xs">
              The AI-aware experience management platform. Understand your customers at depth.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="font-label text-xs font-bold uppercase tracking-wider text-on-surface mb-4">
                {category}
              </h3>
              <ul className="space-y-3">
                {links.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm text-on-surface-variant hover:text-primary transition-colors font-body"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="tonal-separator mb-6" />
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-on-surface-variant font-label">
            © 2026 Xperiq, Inc. The experience layer that learns.
          </p>
          <p className="text-xs text-on-surface-variant/50 font-label">
            AI-generated content is reviewed by our team before publication.
          </p>
        </div>
      </div>
    </footer>
  )
}
