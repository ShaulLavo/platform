import { createContext } from 'react'

export type EditTextRequest = {
  readonly text: string
  readonly executable: string
  readonly signal: AbortSignal
}
export type HostActions = {
  readonly quit: () => void
  readonly suspend?: () => void
  readonly editText?: (request: EditTextRequest) => Promise<string>
}
export const HostActionsContext = createContext<HostActions | null>(null)
