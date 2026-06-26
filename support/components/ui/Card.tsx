import { cn } from '@/lib/cn'

interface CardProps {
  children: React.ReactNode
  className?: string
  interactive?: boolean
  elevated?: boolean
  gradient?: boolean
}

export function Card({ children, className, interactive, elevated, gradient }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg bg-surface-container-lowest p-6',
        elevated ? 'shadow-ambient' : 'shadow-card',
        'ghost-border',
        interactive && 'interactive-card cursor-pointer',
        gradient && 'relative overflow-hidden',
        className
      )}
    >
      {gradient && (
        <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent pointer-events-none rounded-lg" />
      )}
      <div className={cn(gradient && 'relative')}>{children}</div>
    </div>
  )
}
