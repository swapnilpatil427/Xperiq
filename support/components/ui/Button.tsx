'use client'
import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'primary', size = 'md', loading, children, disabled, ...props },
    ref
  ) => {
    const base =
      'inline-flex items-center justify-center gap-2 font-label font-semibold transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none'

    const variants = {
      primary: 'btn-gradient text-on-primary rounded-xl shadow-glow',
      secondary:
        'bg-surface-container text-on-surface hover:bg-surface-container-high rounded-xl ghost-border',
      ghost: 'text-primary hover:bg-primary/5 rounded-xl',
      outline:
        'border border-outline-variant text-on-surface hover:bg-surface-container rounded-xl',
    }

    const sizes = {
      sm: 'h-8 px-4 text-sm',
      md: 'h-10 px-6 text-sm',
      lg: 'h-12 px-8 text-base',
    }

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {loading && (
          <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
