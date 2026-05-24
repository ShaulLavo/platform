import { AnimatedCounter } from 'react-animated-counter'

const SEARCH_COUNTER_CONTAINER_STYLES = {
  display: 'inline-flex',
  margin: 0,
} as const

const SEARCH_COUNTER_DIGIT_STYLES = {
  fontVariantNumeric: 'tabular-nums',
} as const

export function SearchAnimatedNumber({
  fontSize = '11px',
  value,
}: {
  fontSize?: string
  value: number
}) {
  return (
    <span aria-label={value.toLocaleString()}>
      <span aria-hidden='true'>
        <AnimatedCounter
          color='currentColor'
          containerStyles={SEARCH_COUNTER_CONTAINER_STYLES}
          decrementColor='currentColor'
          digitStyles={SEARCH_COUNTER_DIGIT_STYLES}
          fontSize={fontSize}
          includeCommas
          includeDecimals={false}
          incrementColor='currentColor'
          value={value}
        />
      </span>
    </span>
  )
}
