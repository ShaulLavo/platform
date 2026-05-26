import { AnimatedCounter } from 'react-animated-counter'

const STATUS_COUNTER_CONTAINER_STYLES = {
  display: 'inline-flex',
  margin: 0,
} as const

const STATUS_COUNTER_DIGIT_STYLES = {
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500,
} as const

type EditorStatusCounterMetricProps = {
  includeCommas?: boolean
  label: string
  labelPosition?: 'before' | 'after'
  value: number
}

export function EditorStatusCounterMetric({
  includeCommas = false,
  label,
  labelPosition = 'before',
  value,
}: EditorStatusCounterMetricProps) {
  return (
    <div
      className='inline-flex items-center gap-1'
      aria-label={`${value.toLocaleString()} ${label}`}
    >
      {labelPosition === 'before' && <span>{label}</span>}
      <AnimatedCounter
        color='currentColor'
        containerStyles={STATUS_COUNTER_CONTAINER_STYLES}
        decrementColor='currentColor'
        digitStyles={STATUS_COUNTER_DIGIT_STYLES}
        fontSize='11px'
        includeCommas={includeCommas}
        includeDecimals={false}
        incrementColor='currentColor'
        value={value}
      />
      {labelPosition === 'after' && <span>{label}</span>}
    </div>
  )
}
