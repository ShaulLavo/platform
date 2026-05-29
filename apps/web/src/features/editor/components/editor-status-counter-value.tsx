import { AnimatedCounter } from 'react-animated-counter'

const STATUS_COUNTER_CONTAINER_STYLES = {
  display: 'inline-flex',
  margin: 0,
} as const

const STATUS_COUNTER_DIGIT_STYLES = {
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 500,
} as const

type EditorStatusCounterValueProps = {
  includeCommas?: boolean
  value: number
}

export function EditorStatusCounterValue({
  includeCommas = false,
  value,
}: EditorStatusCounterValueProps) {
  return (
    <span aria-label={value.toLocaleString()}>
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
    </span>
  )
}
