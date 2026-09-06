import type { TextareaRenderable } from '@opentui/core'
import { useEffect, useRef } from 'react'

import type { Theme } from '@/theme/utils/theme'
import { useJsonHighlights } from '@/theme/hooks/use-json-highlights'

export function TextPrompt({
  id,
  value,
  onChange,
  onSubmit,
  theme,
  focused = true,
  disabled = false,
  height = 8,
  language,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
  theme: Theme
  focused?: boolean
  disabled?: boolean
  height?: number
  language?: 'json'
}) {
  const input = useRef<TextareaRenderable>(null)
  useEffect(() => {
    if (!input.current || input.current.plainText === value) return
    input.current.setText(value)
  }, [value])
  useJsonHighlights(input, theme, language === 'json', value)
  return (
    <textarea
      id={id}
      ref={input}
      initialValue={value}
      onSubmit={disabled ? undefined : () => onSubmit(input.current?.plainText ?? value)}
      onContentChange={() => onChange(input.current?.plainText ?? value)}
      focused={focused && !disabled}
      textColor={theme.foreground}
      backgroundColor={theme.card}
      focusedBackgroundColor={theme.card}
      focusedTextColor={theme.foreground}
      height={height}
      width='100%'
    />
  )
}
