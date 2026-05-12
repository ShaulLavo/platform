import type {
  ChangeEvent,
  ComponentProps,
  FocusEvent,
  KeyboardEvent,
  ReactNode,
} from "react"
import { useState } from "react"

import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

type SearchHistoryInputProps = Omit<
  ComponentProps<"input">,
  | "aria-label"
  | "className"
  | "onBlur"
  | "onChange"
  | "onFocus"
  | "placeholder"
  | "value"
> & {
  "aria-label"?: string
  className?: string
  inputClassName?: string
  label: string
  leftAdornment?: ReactNode
  rightAdornment?: ReactNode
  value: string
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  onSelectNextHistory: () => void
  onSelectPreviousHistory: () => void
  onValueChange: (value: string) => void
}

export function SearchHistoryInput({
  autoCapitalize = "off",
  autoCorrect = "off",
  className,
  inputClassName,
  label,
  leftAdornment,
  rightAdornment,
  spellCheck = false,
  type = "text",
  value,
  onBlur,
  onFocus,
  onKeyDown,
  onSelectNextHistory,
  onSelectPreviousHistory,
  onValueChange,
  ...inputProps
}: SearchHistoryInputProps) {
  const [focused, setFocused] = useState(false)
  const placeholder = focused ? `${label} (↑↓ for history)` : label

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setFocused(false)
    onBlur?.(event)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onValueChange(event.target.value)
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    setFocused(true)
    onFocus?.(event)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (handleHistoryKeyDown(event)) return

    onKeyDown?.(event)
  }

  function handleHistoryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (searchInputHistoryModifier(event)) return false
    if (event.key === "ArrowUp") {
      event.preventDefault()
      onSelectPreviousHistory()
      return true
    }
    if (event.key !== "ArrowDown") return false

    event.preventDefault()
    onSelectNextHistory()
    return true
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      {leftAdornment}
      <Input
        aria-label={inputProps["aria-label"] ?? label}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        className={inputClassName}
        placeholder={placeholder}
        spellCheck={spellCheck}
        type={type}
        value={value}
        onBlur={handleBlur}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        {...inputProps}
      />
      {rightAdornment}
    </div>
  )
}

function searchInputHistoryModifier(event: KeyboardEvent<HTMLInputElement>) {
  return event.altKey || event.ctrlKey || event.metaKey
}
