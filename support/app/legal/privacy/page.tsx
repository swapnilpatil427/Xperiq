import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: "Xperiq's Privacy Policy — how we collect, use, and protect your personal data.",
  alternates: { canonical: '/legal/privacy' },
}

const LAST_UPDATED = 'June 1, 2026'
const EFFECTIVE_DATE = 'June 1, 2026'

export default function PrivacyPage() {
  return (
    <PageShell>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 bg-surface-container text-on-surface-variant text-xs font-label font-bold rounded-full uppercase tracking-wider">Legal</span>
            <span className="text-sm text-outline font-label">Last updated: {LAST_UPDATED}</span>
          </div>
          <h1 className="font-display text-4xl font-extrabold text-on-background tracking-tight mb-4">Privacy Policy</h1>
          <p className="font-body text-on-surface-variant">Effective date: {EFFECTIVE_DATE}</p>
        </div>

        <div className="prose-legal space-y-10 font-body text-on-surface-variant leading-relaxed">
          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">1. Introduction</h2>
            <p>
              Xperiq, Inc. (&quot;Xperiq,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your personal data. This Privacy Policy describes how we collect, use, store, and share information when you use the Xperiq platform, support site, or any related services.
            </p>
            <p className="mt-3">
              By using our services, you agree to the collection and use of information in accordance with this policy. If you do not agree, please do not use our services.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">2. Information We Collect</h2>
            <h3 className="font-headline text-base font-semibold text-on-surface mb-2">Account Information</h3>
            <p>When you create an account, we collect your name, email address, company name, and job title.</p>
            <h3 className="font-headline text-base font-semibold text-on-surface mt-4 mb-2">Usage Data</h3>
            <p>We collect information about how you interact with our platform, including survey creation activity, feature usage patterns, and support ticket contents.</p>
            <h3 className="font-headline text-base font-semibold text-on-surface mt-4 mb-2">Survey Response Data</h3>
            <p>Survey responses you collect through Xperiq are processed on your behalf. You are the data controller for this information. We act as a data processor subject to your instructions and our Data Processing Agreement.</p>
            <h3 className="font-headline text-base font-semibold text-on-surface mt-4 mb-2">Technical Data</h3>
            <p>We collect IP addresses, browser type, operating system, referring URLs, and device identifiers for security and performance purposes.</p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">3. How We Use Your Information</h2>
            <ul className="space-y-2">
              {[
                'To provide, operate, and improve the Xperiq platform',
                'To respond to support requests and communicate with you',
                'To analyze usage patterns and optimize the Crystal AI experience',
                'To comply with legal obligations and enforce our terms',
                'To detect fraud and maintain platform security',
                'To send product updates and relevant notifications (with your consent)',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-primary mt-0.5 flex-shrink-0">check</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">4. AI and Crystal Intelligence</h2>
            <p>
              Xperiq&apos;s Crystal AI processes data you provide within the platform context to generate insights and recommendations. Crystal does not use your data to train general-purpose AI models. AI-generated content displayed in the support site is clearly labeled and has been reviewed by human editors.
            </p>
            <p className="mt-3">
              You may opt out of AI-powered features at the organization level by contacting your account manager.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">5. Data Sharing and Disclosure</h2>
            <p>We do not sell, rent, or trade your personal data. We share data only:</p>
            <ul className="mt-3 space-y-2">
              {[
                'With service providers under strict data processing agreements (hosting, analytics, payment processing)',
                'When required by law, court order, or governmental authority',
                'To protect the safety and security of our users and platform',
                'In connection with a merger, acquisition, or sale of assets (with prior notice)',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-secondary mt-0.5 flex-shrink-0">chevron_right</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">6. Data Retention</h2>
            <p>We retain personal data for as long as your account is active or as needed to provide services. Survey response data is retained per your configured retention policy. You may request deletion of your data at any time by contacting us at privacy@xperiq.ai.</p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">7. Your Rights (GDPR and CCPA)</h2>
            <p>Depending on your jurisdiction, you have the right to:</p>
            <ul className="mt-3 space-y-2">
              {[
                'Access the personal data we hold about you',
                'Correct inaccurate or incomplete data',
                'Request erasure of your personal data',
                'Object to or restrict processing of your data',
                'Data portability — receive your data in a structured, machine-readable format',
                'Lodge a complaint with your local data protection authority',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-primary mt-0.5 flex-shrink-0">person</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4">To exercise these rights, contact privacy@xperiq.ai. We respond within 30 days.</p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">8. Security</h2>
            <p>
              Xperiq is SOC 2 Type II certified and ISO 27001 compliant. We implement industry-standard security measures including AES-256 encryption at rest, TLS 1.3 in transit, multi-factor authentication, and regular penetration testing. See our <a href="/legal/security" className="text-primary hover:underline">Security page</a> for details.
            </p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">9. Cookies</h2>
            <p>We use essential cookies for authentication and session management. Analytics cookies are only set with your explicit consent. You can manage cookie preferences in your browser settings.</p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">10. International Transfers</h2>
            <p>Xperiq processes data in the United States and European Union. For EEA users, we comply with GDPR data transfer requirements through Standard Contractual Clauses. Contact us for a copy of our Data Processing Agreement.</p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">11. Contact Us</h2>
            <p>For privacy inquiries, contact our Data Protection Officer at:</p>
            <div className="mt-3 p-4 bg-surface-container rounded-DEFAULT ghost-border font-mono text-sm">
              <p>Xperiq, Inc. — Privacy Team</p>
              <p>Email: privacy@xperiq.ai</p>
              <p>Mailing: 340 Pine St, Suite 800, San Francisco, CA 94104</p>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  )
}
