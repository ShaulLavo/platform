import type { InputRenderable } from '@opentui/core'
import { useRef } from 'react'

import type { Theme } from '@/theme/utils/theme'

export function Prompt({
  id,
  value,
  onChange,
  onSubmit,
  theme,
  focused = true,
  placeholder,
  disabled = false,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  theme: Theme
  focused?: boolean
  placeholder?: string
  disabled?: boolean
}) {
  const input = useRef<InputRenderable>(null)
  return (
    <input
      id={id}
      ref={input}
      value={value}
      onInput={onChange}
      onSubmit={disabled ? undefined : () => onSubmit(input.current?.value ?? value)}
      focused={focused && !disabled}
      placeholder={placeholder}
      textColor={theme.foreground}
      backgroundColor={theme.card}
      focusedBackgroundColor={theme.card}
      focusedTextColor={theme.foreground}
      placeholderColor={theme.mutedForeground}
      flexShrink={0}
      width='100%'
    />
  )
}
