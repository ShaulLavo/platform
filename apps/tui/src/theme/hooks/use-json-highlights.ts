import type { SyntaxStyle, TextareaRenderable } from '@opentui/core'
import { loadVscodeThemeRegistration } from '@workspace/client-core/themes/registration'
import { recordObservabilityError } from '@workspace/observability'
import { useEffect, useRef, type RefObject } from 'react'

import { applyJsonHighlights, createSyntaxStyle } from '@/theme/utils/syntax'
import type { Theme } from '@/theme/utils/theme'

export function useJsonHighlights(
  input: RefObject<TextareaRenderable | null>,
  theme: Theme,
  enabled: boolean,
  value: string,
) {
  const style = useRef<SyntaxStyle | null>(null)
  const { appearance, colorMode, terminalColors } = theme
  useEffect(() => {
    const target = input.current
    if (!enabled || !target) return
    let active = true
    let owned: SyntaxStyle | null = null
    void loadVscodeThemeRegistration(`${appearance}-plus`)
      .then((registration) => {
        if (!active || target.isDestroyed) return
        owned = createSyntaxStyle(registration, { colorMode, terminalColors })
        style.current = owned
        applyJsonHighlights(target, owned)
      })
      .catch((error) => recordObservabilityError('tui.syntax_theme', { error, appearance }))
    return () => {
      active = false
      if (!target.isDestroyed && target.syntaxStyle === owned) target.syntaxStyle = null
      if (style.current === owned) style.current = null
      owned?.destroy()
    }
  }, [appearance, colorMode, terminalColors, enabled, input])
  useEffect(() => {
    if (!input.current || !style.current) return
    applyJsonHighlights(input.current, style.current)
  }, [input, value])
}
