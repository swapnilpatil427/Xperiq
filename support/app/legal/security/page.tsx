import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = {
  title: 'Security',
  description: "Xperiq's security posture, certifications, and vulnerability disclosure policy.",
  alternates: { canonical: '/legal/security' },
}

const CERTS = [
  { name: 'SOC 2 Type II', icon: 'verified_user', desc: 'Annual third-party audit of security, availability, and confidentiality controls.' },
  { name: 'ISO 27001', icon: 'security', desc: 'International standard for information security management systems.' },
  { name: 'GDPR Compliant', icon: 'gpp_good', desc: 'Full compliance with EU General Data Protection Regulation requirements.' },
  { name: 'CCPA Compliant', icon: 'privacy_tip', desc: 'Compliant with California Consumer Privacy Act requirements.' },
]

export default function SecurityPage() {
  return (
    <PageShell>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 bg-surface-container text-on-surface-variant text-xs font-label font-bold rounded-full uppercase tracking-wider">Security</span>
          </div>
          <h1 className="font-display text-4xl font-extrabold text-on-background tracking-tight mb-4">Security at Xperiq</h1>
          <p className="font-body text-lg text-on-surface-variant">
            Enterprise-grade security is foundational to how we build. Here&apos;s what we do to protect your data.
          </p>
        </div>

        {/* Certifications */}
        <section className="mb-12">
          <h2 className="font-headline text-xl font-bold text-on-surface mb-6">Certifications &amp; Compliance</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CERTS.map(cert => (
              <div key={cert.name} className="p-5 rounded-DEFAULT bg-surface-container-lowest ghost-border shadow-ambient">
                <div className="flex items-center gap-3 mb-3">
                  <span className="material-symbols-outlined text-secondary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{cert.icon}</span>
                  <h3 className="font-headline text-base font-semibold text-on-surface">{cert.name}</h3>
                </div>
                <p className="font-body text-sm text-on-surface-variant">{cert.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Technical controls */}
        <section className="mb-12 space-y-8">
          <h2 className="font-headline text-xl font-bold text-on-surface">Technical Controls</h2>

          {[
            {
              title: 'Encryption',
              items: [
                'AES-256 encryption for all data at rest',
                'TLS 1.3 for all data in transit',
                'Key management via AWS KMS with automatic rotation',
                'Database field-level encryption for sensitive PII',
              ],
            },
            {
              title: 'Access Control',
              items: [
                'Role-based access control (RBAC) with principle of least privilege',
                'Multi-factor authentication required for all employees',
                'SSO integration via SAML 2.0 and OIDC for enterprise customers',
                'Hardware security keys required for privileged access',
              ],
            },
            {
              title: 'Infrastructure',
              items: [
                'Hosted on AWS with multi-region redundancy',
                'Network segmentation with VPC isolation',
                'DDoS protection via AWS Shield Advanced',
                'Regular penetration testing by third-party security firms',
              ],
            },
          ].map(section => (
            <div key={section.title}>
              <h3 className="font-headline text-base font-semibold text-on-surface mb-3">{section.title}</h3>
              <ul className="space-y-2">
                {section.items.map(item => (
                  <li key={item} className="flex items-start gap-2 font-body text-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[16px] text-secondary mt-0.5 flex-shrink-0">check_circle</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* Vulnerability disclosure */}
        <section className="p-6 bg-surface-container-low rounded-lg ghost-border">
          <h2 className="font-headline text-xl font-bold text-on-surface mb-3">Responsible Disclosure</h2>
          <p className="font-body text-on-surface-variant mb-4">
            We welcome responsible disclosure of security vulnerabilities. If you discover a security issue, please report it to us before making it public.
          </p>
          <div className="font-mono text-sm bg-surface-container px-4 py-3 rounded">
            security@xperiq.ai (PGP key available on request)
          </div>
          <p className="font-body text-sm text-on-surface-variant mt-3">
            We commit to: acknowledging reports within 48 hours, providing updates within 7 days, and not pursuing legal action against good-faith reporters.
          </p>
        </section>
      </div>
    </PageShell>
  )
}
