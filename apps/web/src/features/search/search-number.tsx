import { memo } from 'react'
import { AnimatedCounter } from 'react-animated-counter'

const SEARCH_COUNTER_CONTAINER_STYLES = {
  display: 'inline-flex',
  margin: 0,
} as const

const SEARCH_COUNTER_DIGIT_STYLES = {
  fontVariantNumeric: 'tabular-nums',
} as const

type SearchNumberProps = {
  fontSize?: string
  value: number
}

export const SearchNumber = memo((props: SearchNumberProps) => {
  return <SearchAnimatedCounterValue {...props} />
}, searchNumberPropsEqual)

const SearchAnimatedCounterValue = memo(({ fontSize = '11px', value }) => {
  return (
    <span aria-label={value.toLocaleString()}>
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
  )
})

function searchNumberPropsEqual(previous: SearchNumberProps, next: SearchNumberProps) {
  return previous.value === next.value && previous.fontSize === next.fontSize
}
