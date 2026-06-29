import type { Metadata, Viewport } from 'next'
import { Manrope, Inter, JetBrains_Mono } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
  weight: ['400', '600', '700', '800'],
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
  weight: ['400', '500'],
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://support.xperiq.ai'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Xperiq Support — AI-Powered Help Center',
    template: '%s | Xperiq Support',
  },
  description:
    'Get answers instantly with Crystal AI, browse documentation, track known issues, and connect with the Xperiq enterprise support team.',
  keywords: [
    'experience management',
    'XM platform',
    'enterprise survey',
    'NPS automation',
    'AI insights',
    'Xperiq support',
    'CX analytics',
    'customer experience platform',
  ],
  authors: [{ name: 'Xperiq' }],
  creator: 'Xperiq',
  publisher: 'Xperiq, Inc.',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Xperiq Support',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Xperiq Support' }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@xperiq',
    creator: '@xperiq',
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#2a4bd9',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        {/* Preconnect eliminates a round-trip before the font stylesheet resolves */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* display=block ensures icons never flash as raw text — the font is small (<50 KB)
            so blocking briefly is the right tradeoff for an icon-font ligature system */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen bg-background text-on-background font-body">
        {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
          <ClerkProvider>{children}</ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  )
}
