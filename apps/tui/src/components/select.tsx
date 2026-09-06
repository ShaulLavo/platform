import type { SelectRenderable } from '@opentui/core'
import { useKeyboard, type SelectProps } from '@opentui/react'
import { useRef } from 'react'

type Props = Omit<SelectProps, 'ref' | 'style' | 'wrapSelection' | 'options'> & {
  options: NonNullable<SelectProps['options']>
  navigateFromInput?: boolean
}

export function Select({ options, focused, navigateFromInput = false, ...props }: Props) {
  const renderable = useRef<SelectRenderable>(null)

  useKeyboard((event) => {
    if (!navigateFromInput || event.defaultPrevented || options.length === 0) return
    if (event.name !== 'up' && event.name !== 'down') return
    if (!renderable.current?.handleKeyPress(event)) return
    event.preventDefault()
  })

  return (
    <select
      backgroundColor='transparent'
      focusedBackgroundColor={props.backgroundColor ?? 'transparent'}
      focusedTextColor={props.textColor}
      descriptionColor={props.textColor}
      selectedDescriptionColor={props.selectedTextColor}
      {...props}
      ref={renderable}
      options={options}
      focused={focused && options.length > 0}
      wrapSelection
    />
  )
}
