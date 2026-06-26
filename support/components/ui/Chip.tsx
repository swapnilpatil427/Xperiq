'use client'
import { cn } from '@/lib/cn'

interface ChipProps {
  children: React.ReactNode
  selected?: boolean
  onClick?: () => void
  className?: string
  icon?: string
}

export function Chip({ children, selected, onClick, className, icon }: ChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-label text-sm font-medium transition-all duration-200',
        selected
          ? 'bg-primary text-on-primary shadow-glow'
          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high',
        className
      )}
    >
      {icon && <span className="material-symbols-outlined text-[16px]">{icon}</span>}
      {children}
    </button>
  )
}
