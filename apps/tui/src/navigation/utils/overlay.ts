import type { FocusToken } from '@/commands/state/focus'
import type { Location } from '@/navigation/state/history'

export type DialogKind = 'commands' | 'address' | 'copy-address' | 'help'
export type Overlay =
  | {
      readonly kind: 'files'
      readonly origin: FocusToken | null
      readonly path?: string
      readonly query?: string
    }
  | {
      readonly kind: DialogKind
      readonly origin: FocusToken | null
      readonly query?: string
      readonly returnTo?: Extract<Location, { kind: 'files' }>
    }
