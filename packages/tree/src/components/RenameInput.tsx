/** @jsxImportSource preact */
import type { JSX } from 'preact'

export interface RenameInputProps {
  ariaLabel: string
  isFlattened?: boolean
  onBlur: () => void
  onInput: (event: Event) => void
  ref: (element: HTMLInputElement | null) => void
  value: string
}

export function RenameInput({
  ariaLabel,
  isFlattened = false,
  ref,
  value,
  onBlur,
  onInput,
}: RenameInputProps): JSX.Element {
  // Preact renders this, but the app's Vite pipeline runs the React Compiler
  // over every file it serves. Compiled output calls React's `useMemoCache`,
  // which throws "Invalid hook call" under Preact's dispatcher — same opt-out
  // as Icon, OverflowText, and FileTreeView.
  'use no memo'

  return (
    <input
      ref={ref}
      data-item-rename-input
      {...(isFlattened ? { 'data-item-flattened-rename-input': true } : {})}
      aria-label={ariaLabel}
      value={value}
      onBlur={onBlur}
      onInput={onInput}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    />
  )
}
