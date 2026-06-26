'use client'
import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

const STEPS = [
  {
    icon: 'search',
    iconColor: 'text-secondary',
    iconBg: 'bg-secondary-container',
    step: '01',
    title: 'Ask anything',
    description:
      'Type your question in plain English. Crystal understands context, intent, and the full Experient platform.',
  },
  {
    icon: 'psychology',
    iconColor: 'text-primary',
    iconBg: 'bg-primary-container/30',
    step: '02',
    title: 'Crystal reasons',
    description:
      'Our AI analyzes your question, searches the knowledge base, and cross-references live platform data.',
  },
  {
    icon: 'auto_awesome',
    iconColor: 'text-tertiary',
    iconBg: 'bg-tertiary-container/40',
    step: '03',
    title: 'Instant intelligence',
    description:
      'Get a precise, cited answer with supporting documentation, or escalate to a specialist in one click.',
  },
] as const

export function HowCrystalWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section className="py-20 px-6 bg-surface-container-low/50">
      <div className="max-w-7xl mx-auto" ref={ref}>
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container ghost-border text-sm font-label text-on-surface-variant mb-6">
            <span
              className="material-symbols-outlined text-[16px] text-tertiary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              psychology
            </span>
            How Crystal AI Works
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-extrabold text-on-background tracking-tight">
            Enterprise support,{' '}
            <span className="gradient-text">reimagined</span>
          </h2>
          <p className="mt-4 text-on-surface-variant font-body text-lg max-w-2xl mx-auto">
            Crystal doesn&apos;t just search docs — it reasons about your question with full
            platform context.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line (desktop) */}
          <div className="absolute top-8 left-1/6 right-1/6 h-px bg-gradient-to-r from-secondary-container via-primary-container to-tertiary-container hidden md:block" />

          {STEPS.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.15, duration: 0.5, ease: 'easeOut' }}
              className="relative"
            >
              <div className="bg-surface-container-lowest rounded-lg p-8 ghost-border shadow-ambient text-center group hover:shadow-glow transition-shadow duration-300">
                {/* Step number */}
                <div className="font-mono text-xs font-bold text-on-surface-variant mb-4">
                  {step.step}
                </div>

                {/* Icon */}
                <div
                  className={`w-16 h-16 rounded-full ${step.iconBg} flex items-center justify-center mx-auto mb-6`}
                >
                  <span
                    className={`material-symbols-outlined text-2xl ${step.iconColor}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {step.icon}
                  </span>
                </div>

                <h3 className="font-headline text-xl font-bold text-on-surface mb-3">
                  {step.title}
                </h3>
                <p className="font-body text-on-surface-variant text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
