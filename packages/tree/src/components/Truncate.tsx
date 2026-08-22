/** @jsxImportSource react */

import type { JSX } from 'react'

import { OverflowText, type OverflowTextProps } from './OverflowText'

export function Truncate({ children, ...props }: Omit<OverflowTextProps, 'mode'>): JSX.Element {
  return (
    <OverflowText mode='truncate' {...props}>
      {children}
    </OverflowText>
  )
}
