import { SiteHeader } from './SiteHeader'
import { SiteFooter } from './SiteFooter'

interface PageShellProps {
  children: React.ReactNode
  className?: string
}

export function PageShell({ children, className }: PageShellProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className={`flex-1 pt-16 ${className || ''}`}>{children}</main>
      <SiteFooter />
    </div>
  )
}
