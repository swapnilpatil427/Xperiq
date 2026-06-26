import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: "Experient's Terms of Service governing use of the platform and support services.",
  alternates: { canonical: '/legal/terms' },
}

const LAST_UPDATED = 'June 1, 2026'

export default function TermsPage() {
  return (
    <PageShell>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 bg-surface-container text-on-surface-variant text-xs font-label font-bold rounded-full uppercase tracking-wider">Legal</span>
            <span className="text-sm text-outline font-label">Last updated: {LAST_UPDATED}</span>
          </div>
          <h1 className="font-display text-4xl font-extrabold text-on-background tracking-tight mb-4">Terms of Service</h1>
        </div>

        <div className="space-y-10 font-body text-on-surface-variant leading-relaxed">
          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">1. Acceptance of Terms</h2>
            <p>By accessing or using Experient services (&quot;Services&quot;), you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you are using the Services on behalf of an organization, you represent that you have authority to bind that organization to these Terms.</p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">2. Use of Services</h2>
            <p>You may use the Services only in compliance with these Terms and all applicable laws. You must not:</p>
            <ul className="mt-3 space-y-2">
              {[
                'Use the Services to collect data about minors without proper parental consent',
                'Attempt to reverse-engineer, scrape, or bypass rate limits',
                "Use Crystal AI outputs as the sole basis for decisions affecting individuals' legal rights",
                "Transmit malicious code or interfere with the Services' integrity",
                'Resell access to the Services without written authorization',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-error mt-0.5 flex-shrink-0">block</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">3. AI-Generated Content</h2>
            <p>Crystal AI features generate automated content and recommendations. You acknowledge that:</p>
            <ul className="mt-3 space-y-2">
              {[
                'AI outputs may be inaccurate, incomplete, or outdated',
                'You are responsible for reviewing AI-generated insights before acting on them',
                'Experient does not warrant the accuracy of Crystal AI outputs',
                'AI recommendations should be one input among many in your decision-making process',
              ].map(item => (
                <li key={item} className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-primary mt-0.5 flex-shrink-0">info</span>
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">4. Intellectual Property</h2>
            <p>Experient retains all intellectual property rights in the Services, including Crystal AI models and algorithms. You retain ownership of your data and survey content. By using the Services, you grant Experient a limited license to process your data to provide the Services.</p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">5. Service Level Agreement</h2>
            <p>Enterprise customers are subject to the Service Level Agreement (&quot;SLA&quot;) specified in their subscription agreement. The SLA defines uptime commitments, support response times, and remedies for service failures. The general SLA target is 99.9% monthly uptime, excluding scheduled maintenance.</p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">6. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, Experient&apos;s liability for any claim arising from the Services is limited to the amount you paid in the 12 months preceding the claim. Experient is not liable for indirect, incidental, special, or consequential damages.</p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">7. Governing Law</h2>
            <p>These Terms are governed by the laws of the State of California, without regard to conflict-of-law principles. Disputes are subject to binding arbitration under AAA Commercial Arbitration Rules, with proceedings in San Francisco, California.</p>
          </section>

          <section>
            <h2 className="font-headline text-xl font-bold text-on-surface mb-4">8. Contact</h2>
            <p>For legal notices: legal@experient.ai</p>
          </section>
        </div>
      </div>
    </PageShell>
  )
}
