import { motion, useSpring, useTransform, type MotionValue } from "motion/react"
import type { CSSProperties } from "react"
import { useEffect } from "react"

import "./counter.css"

type CounterPlace = number | "."

type CounterProps = {
  value: number
  fontSize?: number
  padding?: number
  places?: CounterPlace[]
  gap?: number
  borderRadius?: number
  horizontalPadding?: number
  textColor?: string
  fontWeight?: CSSProperties["fontWeight"]
  containerStyle?: CSSProperties
  counterStyle?: CSSProperties
  digitStyle?: CSSProperties
  gradientHeight?: number
  gradientFrom?: string
  gradientTo?: string
  topGradientStyle?: CSSProperties
  bottomGradientStyle?: CSSProperties
  digitPlaceHolders?: boolean
}

type NumberProps = {
  mv: MotionValue<number>
  number: number
  height: number
}

function Number({ mv, number, height }: NumberProps) {
  const y = useTransform(mv, (latest) => {
    const placeValue = latest % 10
    const offset = (10 + number - placeValue) % 10
    const memo = offset * height

    if (offset <= 5) return memo

    return memo - 10 * height
  })

  return (
    <motion.span className="counter-number" style={{ y }}>
      {number}
    </motion.span>
  )
}

function normalizeNearInteger(num: number) {
  const nearest = Math.round(num)
  const tolerance = 1e-9 * Math.max(1, Math.abs(num))

  return Math.abs(num - nearest) < tolerance ? nearest : num
}

function getValueRoundedToPlace(value: number, place: number) {
  const scaled = value / place

  return Math.floor(normalizeNearInteger(scaled))
}

function getPlaces(value: number): CounterPlace[] {
  const characters = [...value.toString()]
  const decimalIndex = characters.indexOf(".")

  return characters.map((character, index) => {
    if (character === ".") return "."

    if (decimalIndex === -1) {
      return 10 ** (characters.length - index - 1)
    }

    if (index < decimalIndex) {
      return 10 ** (decimalIndex - index - 1)
    }

    return 10 ** -(index - decimalIndex)
  })
}

function getVisiblePlaces({
  digitPlaceHolders,
  places,
  value,
}: {
  digitPlaceHolders: boolean
  places: CounterPlace[]
  value: number
}) {
  if (digitPlaceHolders) return places

  return places.filter((place) => {
    if (place === ".") return true
    if (place <= 1) return true

    return Math.abs(value) >= place
  })
}

function Digit({
  digitStyle,
  height,
  place,
  value,
}: {
  digitStyle?: CSSProperties
  height: number
  place: CounterPlace
  value: number
}) {
  const isDecimal = place === "."
  const valueRoundedToPlace = isDecimal ? 0 : getValueRoundedToPlace(value, place)
  const animatedValue = useSpring(valueRoundedToPlace)

  useEffect(() => {
    if (isDecimal) return

    animatedValue.set(valueRoundedToPlace)
  }, [animatedValue, valueRoundedToPlace, isDecimal])

  if (isDecimal) {
    return (
      <span
        className="counter-digit counter-decimal"
        style={{ height, width: "fit-content", ...digitStyle }}
      >
        .
      </span>
    )
  }

  return (
    <span className="counter-digit" style={{ height, ...digitStyle }}>
      {Array.from({ length: 10 }, (_, index) => (
        <Number
          key={index}
          height={height}
          mv={animatedValue}
          number={index}
        />
      ))}
    </span>
  )
}

export default function Counter({
  value,
  fontSize = 100,
  padding = 0,
  places = getPlaces(value),
  gap = 8,
  borderRadius = 4,
  horizontalPadding = 8,
  textColor = "inherit",
  fontWeight = "inherit",
  containerStyle,
  counterStyle,
  digitStyle,
  gradientHeight = 16,
  gradientFrom = "black",
  gradientTo = "transparent",
  topGradientStyle,
  bottomGradientStyle,
  digitPlaceHolders = true,
}: CounterProps) {
  const height = fontSize + padding
  const visiblePlaces = getVisiblePlaces({ digitPlaceHolders, places, value })
  const defaultCounterStyle = {
    fontSize,
    gap,
    borderRadius,
    paddingLeft: horizontalPadding,
    paddingRight: horizontalPadding,
    color: textColor,
    fontWeight,
    direction: "ltr",
  } satisfies CSSProperties
  const defaultTopGradientStyle = {
    height: gradientHeight,
    background: `linear-gradient(to bottom, ${gradientFrom}, ${gradientTo})`,
  } satisfies CSSProperties
  const defaultBottomGradientStyle = {
    height: gradientHeight,
    background: `linear-gradient(to top, ${gradientFrom}, ${gradientTo})`,
  } satisfies CSSProperties

  return (
    <span className="counter-container" style={containerStyle}>
      <span
        className="counter-counter"
        style={{ ...defaultCounterStyle, ...counterStyle }}
      >
        {visiblePlaces.map((place, index) => (
          <Digit
            key={`${place}-${index}`}
            digitStyle={digitStyle}
            height={height}
            place={place}
            value={value}
          />
        ))}
      </span>
      <span className="gradient-container">
        <span
          className="top-gradient"
          style={topGradientStyle ?? defaultTopGradientStyle}
        />
        <span
          className="bottom-gradient"
          style={bottomGradientStyle ?? defaultBottomGradientStyle}
        />
      </span>
    </span>
  )
}
