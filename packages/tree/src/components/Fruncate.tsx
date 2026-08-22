/** @jsxImportSource react */

import type { JSX } from 'react'

import { OverflowText, type OverflowTextProps } from '@workspace/tree/components/OverflowText'

export function Fruncate({ children, ...props }: Omit<OverflowTextProps, 'mode'>): JSX.Element {
  return (
    <OverflowText mode='fruncate' {...props}>
      {children}
    </OverflowText>
  )
}
