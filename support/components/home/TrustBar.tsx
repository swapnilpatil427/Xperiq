import Link from 'next/link'

const TRUST_ITEMS = [
  { icon: 'verified_user', label: 'SOC 2 Type II', color: 'text-secondary' },
  { icon: 'gpp_good', label: 'GDPR Compliant', color: 'text-secondary' },
  { icon: 'security', label: 'ISO 27001', color: 'text-primary' },
  { icon: 'bolt', label: '99.9% Uptime SLA', color: 'text-tertiary' },
  { icon: 'lock', label: 'AES-256 Encryption', color: 'text-primary' },
] as const

export function TrustBar() {
  return (
    <div className="py-8 px-6 border-y border-outline-variant/10">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
          {TRUST_ITEMS.map(({ icon, label, color }) => (
            <div
              key={label}
              className="flex items-center gap-2 text-sm text-on-surface-variant font-label"
            >
              <span
                className={`material-symbols-outlined text-[18px] ${color}`}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {icon}
              </span>
              {label}
            </div>
          ))}

          {/* Live status */}
          <Link
            href="/status"
            className="flex items-center gap-2 text-sm font-label text-on-surface-variant hover:text-secondary transition-colors"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary" />
            </span>
            All systems operational
          </Link>
        </div>
      </div>
    </div>
  )
}
