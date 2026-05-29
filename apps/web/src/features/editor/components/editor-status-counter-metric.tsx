import type { ReactNode } from 'react'

type EditorStatusCounterMetricProps = {
  children: ReactNode
  label: string
  labelPosition?: 'before' | 'after'
}

export function EditorStatusCounterMetric({
  children,
  label,
  labelPosition = 'before',
}: EditorStatusCounterMetricProps) {
  return (
    <div className='inline-flex items-center gap-1'>
      {labelPosition === 'before' && <span>{label}</span>}
      {children}
      {labelPosition === 'after' && <span>{label}</span>}
    </div>
  )
}
