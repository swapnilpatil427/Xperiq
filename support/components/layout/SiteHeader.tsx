'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs'
import { cn } from '@/lib/cn'

// Build-time flag — Next.js replaces NEXT_PUBLIC_* at compile time.
// When the key is absent the auth UI renders nothing (see AuthBar below).
const CLERK_ENABLED = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

const navLinks = [
  { href: '/guides',     label: 'Guides' },
  { href: '/roadmap',    label: 'Roadmap' },
  { href: '/changelog',  label: 'Changelog' },
  { href: '/status',     label: 'Status' },
  { href: '/my-tickets', label: 'My Tickets', authOnly: true },
]

/** Auth controls — renders nothing when Clerk is not configured. */
function AuthBar() {
  if (!CLERK_ENABLED) return null
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button className="font-label text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors px-3 py-2 rounded-DEFAULT hover:bg-surface-container">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </>
  )
}

/** Mobile auth controls */
function MobileAuthBar({ onClose }: { onClose: () => void }) {
  if (!CLERK_ENABLED) return null
  return (
    <>
      <SignedOut>
        <SignInButton mode="modal">
          <button
            onClick={onClose}
            className="font-label text-sm font-medium text-on-surface-variant hover:text-on-surface px-3 py-2 rounded-DEFAULT hover:bg-surface-container transition-colors"
          >
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </>
  )
}

export function SiteHeader() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    let rafId: number
    const onScroll = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => setScrolled(window.scrollY > 10))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'glass-panel shadow-card' : 'bg-transparent'
      )}
    >
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 shrink-0 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-container flex items-center justify-center shadow-glow">
            <span
              className="material-symbols-outlined text-on-primary text-lg"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              dataset
            </span>
          </div>
          <div>
            <span className="font-headline font-extrabold text-on-background text-lg tracking-tight group-hover:text-primary transition-colors">
              Experient
            </span>
            <span className="hidden sm:block text-xs text-on-surface-variant font-label">
              Support
            </span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(({ href, label, authOnly }) => {
            const link = (
              <Link
                key={href}
                href={href}
                className={cn(
                  'px-3 py-2 rounded-DEFAULT font-label text-sm font-medium transition-all duration-200',
                  pathname?.startsWith(href)
                    ? 'bg-surface-container-lowest text-primary shadow-card'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                )}
              >
                {label}
              </Link>
            )
            if (authOnly && !CLERK_ENABLED) return null
            return authOnly ? <SignedIn key={href}>{link}</SignedIn> : link
          })}
        </div>

        {/* CTA + Auth */}
        <div className="hidden md:flex items-center gap-3">
          <AuthBar />
          <Link
            href="/contact"
            className="btn-gradient text-on-primary text-sm font-semibold px-5 py-2 rounded-xl inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">support_agent</span>
            Contact Support
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-DEFAULT text-on-surface-variant hover:bg-surface-container transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className="material-symbols-outlined">{menuOpen ? 'close' : 'menu'}</span>
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden glass-panel border-t border-outline-variant/15 px-6 py-4 space-y-1">
          {navLinks.map(({ href, label, authOnly }) => {
            if (authOnly && !CLERK_ENABLED) return null
            const link = (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-DEFAULT font-label text-sm font-medium transition-colors',
                  pathname?.startsWith(href)
                    ? 'bg-surface-container-lowest text-primary'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                )}
              >
                {label}
              </Link>
            )
            return authOnly ? <SignedIn key={href}>{link}</SignedIn> : link
          })}
          <div className="pt-3 border-t border-outline-variant/15 flex items-center gap-3">
            <Link
              href="/contact"
              onClick={() => setMenuOpen(false)}
              className="flex-1 btn-gradient text-on-primary text-sm font-semibold px-5 py-2 rounded-xl flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">support_agent</span>
              Contact Support
            </Link>
            <MobileAuthBar onClose={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Bottom separator (no-line rule: use gradient not solid border) */}
      {scrolled && <div className="tonal-separator" />}
    </header>
  )
}
