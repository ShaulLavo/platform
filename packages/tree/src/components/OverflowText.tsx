/** @jsxImportSource react */

import type { CSSProperties, JSX, ReactNode } from 'react'

import { OverflowContent } from '@workspace/tree/components/OverflowContent'
import { OverflowMarker } from '@workspace/tree/components/OverflowMarker'

type PropsWithChildren<T = object> = T & {
  children?: ReactNode
}

export type CSSPropertiesWithVars = CSSProperties & {
  [key: `--${string}`]: string | number | undefined
}

export interface MarkerProps extends PropsWithChildren {}

export type TruncateMode = 'truncate' | 'fruncate'

export interface OverflowTextProps extends PropsWithChildren {
  mode?: TruncateMode
  style?: Omit<CSSPropertiesWithVars, 'height' | 'overflow'>
  className?: string
  marker?: ReactNode | ((props: MarkerProps) => ReactNode)
  variant?: 'default' | 'fade' | 'native'
}

export function OverflowText({
  children,
  mode = 'truncate',
  marker = '…',
  variant = 'default',
  ...props
}: OverflowTextProps): JSX.Element {
  const contentNode = (
    <OverflowContent key='content' mode={mode}>
      {children}
    </OverflowContent>
  )
  const markerNode = <OverflowMarker key='marker' marker={marker} variant={variant} />
  const fillNode = <div key='fill' data-truncate-fill></div>
  const gridChildren =
    mode === 'truncate' ? [contentNode, markerNode] : [markerNode, contentNode, fillNode]

  return (
    <div data-truncate-container={mode} data-truncate-variant={variant} {...props}>
      <div data-truncate-grid>{gridChildren}</div>
    </div>
  )
}
