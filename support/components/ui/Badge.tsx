import { cn } from '@/lib/cn'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'outline' | 'beta'
  size?: 'sm' | 'md'
  className?: string
}

export function Badge({ children, variant = 'outline', size = 'sm', className }: BadgeProps) {
  const variants = {
    primary: 'bg-primary-container text-on-primary-container',
    secondary: 'bg-secondary-container text-on-secondary-container',
    tertiary: 'bg-tertiary-container text-on-tertiary-container',
    success: 'bg-secondary-container text-on-secondary-container',
    warning: 'bg-[#fef3c7] text-[#92400e]',
    error: 'bg-error-container/10 text-error',
    outline: 'ghost-border text-on-surface-variant',
    beta: 'bg-tertiary-container text-on-tertiary-container',
  }

  const sizes = {
    sm: 'px-2.5 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center font-label font-bold uppercase tracking-wider rounded-full',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  )
}
